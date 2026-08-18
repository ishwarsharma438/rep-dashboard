import { getAnnouncements, getCourses, getDiscussions, getFiles } from './canvasData.js'

// Last-known results, kept in memory for this milestone (no database needed).
let lastKnownCourses = null
let lastKnownAnnouncements = null
let lastKnownFiles = null
let lastKnownDiscussions = null

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

async function pollOnce(io, userId) {
  let coursesChanged = false
  let announcementsChanged = false
  let filesChanged = false
  let discussionsChanged = false
  const notes = []

  // --- Courses ---
  try {
    const courses = await getCourses(userId)

    if (hasNewErrors(lastKnownCourses, courses)) {
      // Canvas unreachable or refusing — hold last-known and stay quiet.
      notes.push('canvas errors this cycle, keeping last-known courses')
    } else {
      coursesChanged = coursesDiffer(lastKnownCourses, courses)
      if (coursesChanged) io.emit('coursesUpdate', courses)
      lastKnownCourses = courses
    }
  } catch (err) {
    notes.push(`courses poll failed: ${err.message}`)
  }

  // --- Announcements ---
  try {
    const announcements = await getAnnouncements()
    const added = newAnnouncements(lastKnownAnnouncements, announcements)

    if (added.length > 0) {
      announcementsChanged = true
      io.emit('newAnnouncement', added)
    }
    lastKnownAnnouncements = announcements
  } catch (err) {
    notes.push(`announcements poll failed: ${err.message}`)
  }

  // --- Files ---
  try {
    const files = await getFiles(userId)
    filesChanged = listDiffers(lastKnownFiles, files, ['filename', 'size'])
    if (filesChanged) io.emit('filesUpdate', files)
    lastKnownFiles = files
  } catch (err) {
    notes.push(`files poll failed: ${err.message}`)
  }

  // --- Discussions ---
  try {
    const discussions = await getDiscussions(userId)
    discussionsChanged = listDiffers(lastKnownDiscussions, discussions, ['title', 'replyCount'])
    if (discussionsChanged) io.emit('discussionsUpdate', discussions)
    lastKnownDiscussions = discussions
  } catch (err) {
    notes.push(`discussions poll failed: ${err.message}`)
  }

  console.log(
    `[poll ${stamp()}] coursesChanged=${coursesChanged} announcementsChanged=${announcementsChanged}` +
      ` filesChanged=${filesChanged} discussionsChanged=${discussionsChanged}` +
      (notes.length ? ` — ${notes.join('; ')}` : '')
  )
}

/**
 * Starts the 30s Canvas poll. The first cycle only establishes the baseline,
 * so a fresh server never emits a spurious "everything changed".
 */
export function startPolling(
  io,
  { userId, intervalMs = Number(process.env.POLL_INTERVAL_MS) || 30_000 } = {}
) {
  console.log(`[poll] starting — every ${intervalMs / 1000}s for user ${userId}`)

  pollOnce(io, userId).then(() => {
    console.log('[poll] baseline established')
  })

  const timer = setInterval(() => {
    pollOnce(io, userId).catch((err) => console.error('[poll] unexpected failure:', err.message))
  }, intervalMs)

  timer.unref?.()
  return () => clearInterval(timer)
}

/** Test seam: current in-memory snapshot. */
export function getLastKnown() {
  return {
    courses: lastKnownCourses,
    announcements: lastKnownAnnouncements,
    files: lastKnownFiles,
    discussions: lastKnownDiscussions,
  }
}

/** Test seam: overwrite the in-memory baseline to simulate a change. */
export function setLastKnown({ courses, announcements, files, discussions }) {
  if (courses !== undefined) lastKnownCourses = courses
  if (announcements !== undefined) lastKnownAnnouncements = announcements
  if (files !== undefined) lastKnownFiles = files
  if (discussions !== undefined) lastKnownDiscussions = discussions
}
