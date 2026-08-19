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
import canvasApi, { cachedGet, invalidateCache } from '../services/canvasApi.js'
import { COACHING_GROUPS } from '../../src/data/roadmapEvents.js'
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

/* ---- Coaching group membership (Canvas Groups) ----
 *
 * Two modes, switched by CANVAS_GROUP_CATEGORY_ID:
 *
 *   unset  — fallback. Reads return the 16 static roadmap groups with zero
 *            members; writes refuse with 503. Nothing touches Canvas.
 *   set    — live. Reads come from the Canvas group category, and join/leave
 *            write real memberships.
 *
 * The gate is checked per request rather than at boot so the app can be
 * activated by setting the variable and restarting, with no code change.
 */

/** The configured category id, or null when group management is not set up. */
const groupCategoryId = () => process.env.CANVAS_GROUP_CATEGORY_ID?.trim() || null

/** Canvas caps each coaching group at this many teachers. */
const GROUP_MAX_MEMBERSHIP = 12

/** 'A - Acacia' -> 'A'. Canvas group names are created in that shape. */
function codeFromName(name = '') {
  const match = /^([A-P])\s*[-—]/.exec(name.trim())
  return match ? match[1] : null
}

/** The 16 roadmap groups shaped like the Canvas payload, with no members. */
function fallbackGroups() {
  return COACHING_GROUPS.map((g) => ({
    id: g.code,
    code: g.code,
    name: `${g.code} - ${g.name}`,
    members_count: 0,
    max_membership: GROUP_MAX_MEMBERSHIP,
    members: [],
  }))
}

const shapeCanvasGroup = (g) => ({
  id: g.id,
  code: codeFromName(g.name),
  name: g.name,
  members_count: g.members_count ?? 0,
  max_membership: g.max_membership ?? GROUP_MAX_MEMBERSHIP,
  members: (g.users ?? []).map((u) => ({ id: u.id, name: u.name ?? u.display_name ?? null })),
})

/**
 * GET /api/groups — every coaching group with its current membership count.
 *
 * `configured: false` tells the UI it is looking at static data, so it can
 * explain why joining is unavailable instead of silently failing.
 */
router.get(
  '/groups',
  asyncHandler(async (req, res) => {
    const categoryId = groupCategoryId()

    if (!categoryId) {
      return res.json({ configured: false, groups: fallbackGroups() })
    }

    const { data } = await cachedGet(
      `/group_categories/${encodeURIComponent(categoryId)}/groups`,
      { params: { include: ['users'], per_page: 50 } }
    )

    const groups = Array.isArray(data) ? data : []
    res.json({ configured: true, groups: groups.map(shapeCanvasGroup) })
  })
)

/**
 * GET /api/groups/my — the coaching group this teacher belongs to.
 *
 * Declared before '/groups/:userId' on purpose: Express matches in order, and
 * the parameterised route would otherwise capture 'my' as a user id.
 */
router.get(
  '/groups/my',
  asyncHandler(async (req, res) => {
    const categoryId = groupCategoryId()

    if (!categoryId) {
      return res.json({ configured: false, groups: [] })
    }

    const { data } = await cachedGet(
      `/users/${encodeURIComponent(req.canvasUserId)}/groups`,
      { params: { per_page: 100 } }
    )

    const mine = (Array.isArray(data) ? data : []).filter(
      (g) => String(g.group_category_id) === String(categoryId)
    )

    res.json({ configured: true, groups: mine.map(shapeCanvasGroup) })
  })
)

/**
 * POST /api/groups/:groupId/join — add this teacher to a coaching group.
 *
 * Inert until CANVAS_GROUP_CATEGORY_ID is set. This is the first Canvas write
 * outside the discussion routes, so it is deliberately gated and validates
 * capacity and single-membership before posting.
 */
router.post(
  '/groups/:groupId/join',
  asyncHandler(async (req, res) => {
    const categoryId = groupCategoryId()

    if (!categoryId) {
      return res.status(503).json({ error: 'Group management not configured yet', status: 503 })
    }

    const userId = req.canvasUserId
    const { groupId } = req.params

    // One group per teacher — the join is described as final in the UI.
    const { data: userGroups } = await cachedGet(
      `/users/${encodeURIComponent(userId)}/groups`,
      { params: { per_page: 100 } }
    )
    const existing = (Array.isArray(userGroups) ? userGroups : []).find(
      (g) => String(g.group_category_id) === String(categoryId)
    )

    if (existing) {
      return res.status(409).json({
        error: true,
        message: `You have already joined ${existing.name}`,
      })
    }

    // Capacity is enforced here as well as by Canvas, so a full group returns a
    // readable message rather than a raw Canvas validation error.
    const { data: group } = await cachedGet(`/groups/${encodeURIComponent(groupId)}`)
    const limit = group?.max_membership ?? GROUP_MAX_MEMBERSHIP
    if ((group?.members_count ?? 0) >= limit) {
      return res.status(409).json({ error: true, message: 'This group is already full' })
    }

    const { data: membership } = await canvasApi.post(
      `/groups/${encodeURIComponent(groupId)}/memberships`,
      { user_id: userId }
    )

    // The cached group lists now understate this membership.
    invalidateCache(`/group_categories/${categoryId}/groups`)
    invalidateCache(`/users/${userId}/groups`)
    invalidateCache(`/groups/${groupId}`)

    res.status(201).json({ ok: true, membership })
  })
)

/**
 * DELETE /api/groups/:groupId/leave — remove this teacher from a group.
 *
 * Also gated. Present so membership is reversible by an admin even though the
 * teacher-facing flow presents the choice as final.
 */
router.delete(
  '/groups/:groupId/leave',
  asyncHandler(async (req, res) => {
    const categoryId = groupCategoryId()

    if (!categoryId) {
      return res.status(503).json({ error: 'Group management not configured yet', status: 503 })
    }

    const userId = req.canvasUserId
    const { groupId } = req.params

    await canvasApi.delete(
      `/groups/${encodeURIComponent(groupId)}/users/${encodeURIComponent(userId)}`
    )

    invalidateCache(`/group_categories/${categoryId}/groups`)
    invalidateCache(`/users/${userId}/groups`)
    invalidateCache(`/groups/${groupId}`)

    res.json({ ok: true })
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
