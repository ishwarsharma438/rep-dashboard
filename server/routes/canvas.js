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
import { emit } from '../services/realtime.js'
import { setLastKnown } from '../services/pollingService.js'

const router = Router()

// Wired to a fixed user until Canvas LTI identity lands in a later milestone.
const CURRENT_USER_ID = 2619

/**
 * Re-reads discussions straight after a write and broadcasts them, so the
 * poster sees the change immediately rather than waiting up to 30s, and every
 * other open dashboard updates over the existing 'discussionsUpdate' event.
 *
 * Seeding the poller's baseline stops the next cycle re-reporting it as a change.
 */
async function refreshDiscussions() {
  const discussions = await getDiscussions(CURRENT_USER_ID)
  setLastKnown({ discussions })
  emit('discussionsUpdate', discussions)
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
    res.json(await getUserProfile(req.params.userId))
  })
)

/**
 * GET /api/courses/:userId
 */
router.get(
  '/courses/:userId',
  asyncHandler(async (req, res) => {
    res.json(await getCourses(req.params.userId))
  })
)

/**
 * GET /api/files/:userId
 */
router.get(
  '/files/:userId',
  asyncHandler(async (req, res) => {
    res.json(await getFiles(req.params.userId))
  })
)

/**
 * GET /api/discussions/:userId
 */
router.get(
  '/discussions/:userId',
  asyncHandler(async (req, res) => {
    res.json(await getDiscussions(req.params.userId))
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

    const topic = await createDiscussion(CURRENT_USER_ID, req.params.courseId, {
      title: title.trim(),
      message: message.trim(),
    })

    await refreshDiscussions()
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
      CURRENT_USER_ID,
      req.params.courseId,
      req.params.topicId,
      { message: message.trim() }
    )

    await refreshDiscussions()
    res.status(201).json(entry)
  })
)

/**
 * GET /api/groups/:userId
 */
router.get(
  '/groups/:userId',
  asyncHandler(async (req, res) => {
    res.json(await getGroups(req.params.userId))
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
