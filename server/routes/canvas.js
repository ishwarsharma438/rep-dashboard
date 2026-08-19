import { Router } from 'express'
import {
  createDiscussion,
  createDiscussionEntry,
  getAnnouncements,
  getCourses,
  getDiscussions,
  getFiles,
  getGroups,
  getUserProfile,
} from '../services/canvasData.js'
import { cachedGet } from '../services/canvasApi.js'
import { emitToUser } from '../services/realtime.js'
import { setLastKnown } from '../services/pollingService.js'

const router = Router()

/**
 * Re-reads discussions straight after a write and pushes them into the poster's
 * own room, so every tab they have open updates immediately rather than waiting
 * up to 30s. Scoped to that user: discussion visibility follows enrolment, so
 * broadcasting to everyone could surface a course another teacher can't see.
 *
 * Seeding the poller's baseline stops the next cycle re-reporting it as a change.
 */
async function refreshDiscussions(userId) {
  const discussions = await getDiscussions(userId)
  setLastKnown(userId, { discussions })
  emitToUser(userId, 'discussionsUpdate', discussions)
  return discussions
}

// Express 4 doesn't forward rejected promises, so wrap async handlers.
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

/**
 * GET /api/user/:userId  (or /api/user/self)
 */
router.get(
  '/user/:userId',
  asyncHandler(async (req, res) => {
    res.json(await getUserProfile(req.canvasUserId))
  })
)

/**
 * GET /api/courses/:userId
 */
router.get(
  '/courses/:userId',
  asyncHandler(async (req, res) => {
    res.json(await getCourses(req.canvasUserId))
  })
)

/**
 * GET /api/files/:userId
 */
router.get(
  '/files/:userId',
  asyncHandler(async (req, res) => {
    res.json(await getFiles(req.canvasUserId))
  })
)

/**
 * GET /api/discussions/:userId
 */
router.get(
  '/discussions/:userId',
  asyncHandler(async (req, res) => {
    res.json(await getDiscussions(req.canvasUserId))
  })
)

/**
 * POST /api/discussions/:courseId — create a discussion topic.
 */
router.post(
  '/discussions/:courseId',
  asyncHandler(async (req, res) => {
    const { title, message } = req.body ?? {}

    if (!title?.trim() || !message?.trim()) {
      return res.status(400).json({ error: true, message: 'Title and message are both required' })
    }

    const topic = await createDiscussion(req.canvasUserId, req.params.courseId, {
      title: title.trim(),
      message: message.trim(),
    })

    await refreshDiscussions(req.canvasUserId)
    res.status(201).json(topic)
  })
)

/**
 * POST /api/discussions/:courseId/:topicId/entries — reply to a topic.
 */
router.post(
  '/discussions/:courseId/:topicId/entries',
  asyncHandler(async (req, res) => {
    const { message } = req.body ?? {}

    if (!message?.trim()) {
      return res.status(400).json({ error: true, message: 'A reply message is required' })
    }

    const entry = await createDiscussionEntry(
      req.canvasUserId,
      req.params.courseId,
      req.params.topicId,
      { message: message.trim() }
    )

    await refreshDiscussions(req.canvasUserId)
    res.status(201).json(entry)
  })
)

/**
 * GET /api/groups/:userId
 */
router.get(
  '/groups/:userId',
  asyncHandler(async (req, res) => {
    res.json(await getGroups(req.canvasUserId))
  })
)

/**
 * GET /api/calendar — Canvas calendar events for the current user.
 *
 * Read-only, like every other Canvas call here. Exists ahead of its consumer:
 * once n8n writes Calendly bookings into the Canvas Calendar, this is where the
 * dashboard reads them back. Until then it returns whatever the user already
 * has in Canvas, which is usually an empty list.
 *
 * Defaults to a 12-month window; Canvas otherwise applies its own narrow one.
 */
router.get(
  '/calendar',
  asyncHandler(async (req, res) => {
    const day = (ms) => new Date(ms).toISOString().slice(0, 10)
    const startDate = req.query.start_date ?? day(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const endDate = req.query.end_date ?? day(Date.now() + 365 * 24 * 60 * 60 * 1000)

    const { data } = await cachedGet(
      `/users/${encodeURIComponent(req.canvasUserId)}/calendar_events`,
      { params: { type: 'event', start_date: startDate, end_date: endDate, per_page: 50 } }
    )

    const events = Array.isArray(data) ? data : []

    res.json(
      events.map((e) => ({
        id: e.id,
        title: e.title,
        description: e.description ?? null,
        startAt: e.start_at ?? null,
        endAt: e.end_at ?? null,
        allDay: e.all_day ?? false,
        location: e.location_name ?? null,
        url: e.html_url ?? null,
        contextCode: e.context_code ?? null,
      }))
    )
  })
)

/**
 * GET /api/announcements
 */
router.get(
  '/announcements',
  asyncHandler(async (req, res) => {
    res.json(
      await getAnnouncements({
        startDate: req.query.start_date,
        endDate: req.query.end_date,
      })
    )
  })
)

export default router
