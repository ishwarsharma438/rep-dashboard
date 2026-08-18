import { getAnnouncements, getCourses, getDiscussions, getFiles } from './canvasData.js'

const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS) || 30_000

/** Socket.io room carrying one Canvas user's updates. */
export const userRoom = (userId) => `user:${userId}`

/**
 * Per-user polling registry.
 *
 * userId -> { timer, sockets:Set<socketId>, courses, files, discussions }
 *
 * One loop per *user*, not per socket: two tabs open for the same person share
 * a single timer and a single set of Canvas requests, and the loop only stops
 * once the last of their sockets goes away.
 */
const subscriptions = new Map()

// Announcements are account-wide — getAnnouncements() takes no user and returns
// the same payload for everyone — so they stay on one global loop broadcast to
// all sockets. Polling them per user would multiply the Canvas calls by the
// number of connected users for identical data.
let announcementsTimer = null
let lastKnownAnnouncements = null

const stamp = () => new Date().toISOString()

/** True when a course's progressPercent or status differs from last known. */
function coursesDiffer(previous, next) {
  if (!previous) return false
  if (previous.length !== next.length) return true

  const byId = new Map(previous.map((c) => [c.courseId, c]))
  return next.some((course) => {
    const before = byId.get(course.courseId)
    if (!before) return true
    return (
      before.progressPercent !== course.progressPercent || before.status !== course.status
    )
  })
}

/**
 * A Canvas outage surfaces as every course flipping to status "error" (getCourses
 * catches per course rather than throwing). Treat any course newly going to error
 * as transient so a blip doesn't emit a false "changed" event.
 */
function hasNewErrors(previous, next) {
  if (!previous) return next.every((c) => c.error === true)
  const byId = new Map(previous.map((c) => [c.courseId, c]))
  return next.some((c) => c.error === true && byId.get(c.courseId)?.error !== true)
}

/**
 * Generic change check for list payloads: different length, different membership,
 * or a changed value on any of the `fields` for a matching id.
 */
function listDiffers(previous, next, fields = []) {
  if (!previous) return false
  if (previous.length !== next.length) return true

  const byId = new Map(previous.map((item) => [item.id, item]))
  return next.some((item) => {
    const before = byId.get(item.id)
    if (!before) return true
    return fields.some((f) => before[f] !== item[f])
  })
}

/** Announcements present in `next` but not in `previous`, matched by id. */
function newAnnouncements(previous, next) {
  if (!previous) return []
  if (next.length <= previous.length) return []
  const seen = new Set(previous.map((a) => a.id))
  return next.filter((a) => !seen.has(a.id))
}

/**
 * One poll cycle for a single user. Emits only into that user's room, so a
 * launch by one teacher can never push another teacher's progress.
 */
async function pollUser(io, userId) {
  const entry = subscriptions.get(userId)
  if (!entry) return // unsubscribed while the previous cycle was in flight

  const room = userRoom(userId)
  let coursesChanged = false
  let filesChanged = false
  let discussionsChanged = false
  const notes = []

  // --- Courses ---
  try {
    const courses = await getCourses(userId)

    if (hasNewErrors(entry.courses, courses)) {
      // Canvas unreachable or refusing — hold last-known and stay quiet.
      notes.push('canvas errors this cycle, keeping last-known courses')
    } else {
      coursesChanged = coursesDiffer(entry.courses, courses)
      if (coursesChanged) io.to(room).emit('coursesUpdate', courses)
      entry.courses = courses
    }
  } catch (err) {
    notes.push(`courses poll failed: ${err.message}`)
  }

  // --- Files ---
  try {
    const files = await getFiles(userId)
    filesChanged = listDiffers(entry.files, files, ['filename', 'size'])
    if (filesChanged) io.to(room).emit('filesUpdate', files)
    entry.files = files
  } catch (err) {
    notes.push(`files poll failed: ${err.message}`)
  }

  // --- Discussions ---
  try {
    const discussions = await getDiscussions(userId)
    discussionsChanged = listDiffers(entry.discussions, discussions, ['title', 'replyCount'])
    if (discussionsChanged) io.to(room).emit('discussionsUpdate', discussions)
    entry.discussions = discussions
  } catch (err) {
    notes.push(`discussions poll failed: ${err.message}`)
  }

  console.log(
    `[poll ${stamp()}] user=${userId} coursesChanged=${coursesChanged}` +
      ` filesChanged=${filesChanged} discussionsChanged=${discussionsChanged}` +
      (notes.length ? ` — ${notes.join('; ')}` : '')
  )
}

/** One account-wide announcements cycle, broadcast to every connected socket. */
async function pollAnnouncements(io) {
  try {
    const announcements = await getAnnouncements()
    const added = newAnnouncements(lastKnownAnnouncements, announcements)

    if (added.length > 0) io.emit('newAnnouncement', added)
    lastKnownAnnouncements = announcements

    console.log(`[poll ${stamp()}] announcements new=${added.length}`)
  } catch (err) {
    console.log(`[poll ${stamp()}] announcements poll failed: ${err.message}`)
  }
}

/**
 * Registers `socketId` as a listener for `userId`, starting that user's poll
 * loop on the first subscriber. Returns the room the socket should join.
 *
 * The first cycle only establishes a baseline, so a newly connected client
 * never receives a spurious "everything changed" burst.
 */
export function subscribeUser(io, userId, socketId, { intervalMs = POLL_INTERVAL_MS } = {}) {
  const key = String(userId)
  const existing = subscriptions.get(key)

  if (existing) {
    existing.sockets.add(socketId)
    console.log(`[poll] user ${key} +socket ${socketId} (${existing.sockets.size} total)`)
    return userRoom(key)
  }

  const entry = {
    timer: null,
    sockets: new Set([socketId]),
    courses: null,
    files: null,
    discussions: null,
  }
  subscriptions.set(key, entry)

  console.log(`[poll] starting for user ${key} — every ${intervalMs / 1000}s`)

  pollUser(io, key).then(() => console.log(`[poll] baseline established for user ${key}`))

  entry.timer = setInterval(() => {
    pollUser(io, key).catch((err) =>
      console.error(`[poll] unexpected failure for user ${key}:`, err.message)
    )
  }, intervalMs)

  entry.timer.unref?.()
  return userRoom(key)
}

/**
 * Drops `socketId`; stops the user's loop once nobody is listening, so a
 * disconnected teacher stops costing Canvas requests.
 */
export function unsubscribeUser(userId, socketId) {
  const key = String(userId)
  const entry = subscriptions.get(key)
  if (!entry) return

  entry.sockets.delete(socketId)
  if (entry.sockets.size > 0) {
    console.log(`[poll] user ${key} -socket ${socketId} (${entry.sockets.size} left)`)
    return
  }

  clearInterval(entry.timer)
  subscriptions.delete(key)
  console.log(`[poll] stopped for user ${key} — no sockets left`)
}

/** Starts the single account-wide announcements loop. Returns a stop function. */
export function startAnnouncementPolling(io, { intervalMs = POLL_INTERVAL_MS } = {}) {
  console.log(`[poll] announcements — every ${intervalMs / 1000}s (account-wide)`)

  pollAnnouncements(io).then(() => console.log('[poll] announcements baseline established'))

  announcementsTimer = setInterval(() => {
    pollAnnouncements(io).catch((err) =>
      console.error('[poll] announcements unexpected failure:', err.message)
    )
  }, intervalMs)

  announcementsTimer.unref?.()
  return () => clearInterval(announcementsTimer)
}

/** Test seam: current in-memory snapshot for one user. */
export function getLastKnown(userId) {
  const entry = subscriptions.get(String(userId))
  return {
    courses: entry?.courses ?? null,
    files: entry?.files ?? null,
    discussions: entry?.discussions ?? null,
    announcements: lastKnownAnnouncements,
  }
}

/**
 * Seeds a user's baseline after a write, so the next cycle doesn't re-report
 * the caller's own change. A no-op when that user has no active subscription.
 */
export function setLastKnown(userId, { courses, files, discussions, announcements } = {}) {
  const entry = subscriptions.get(String(userId))

  if (entry) {
    if (courses !== undefined) entry.courses = courses
    if (files !== undefined) entry.files = files
    if (discussions !== undefined) entry.discussions = discussions
  }

  if (announcements !== undefined) lastKnownAnnouncements = announcements
}

/** Test seam: how many users are currently being polled. */
export function activeSubscriptions() {
  return [...subscriptions.entries()].map(([userId, e]) => ({
    userId,
    sockets: e.sockets.size,
  }))
}
