import CANVAS_CONFIG from '../config/canvasConfig.js'
import canvasApi, { cachedGet, invalidateCache } from './canvasApi.js'

// Canvas accepts the literal "self" in place of a numeric id for the token owner.
const userSegment = (userId) => (userId === 'self' ? 'self' : encodeURIComponent(userId))

/**
 * Profile for a user, shaped for the dashboard.
 */
export async function getUserProfile(userId) {
  const { data } = await cachedGet(`/users/${userSegment(userId)}/profile`)

  return {
    id: data.id,
    name: data.name,
    email: data.primary_email ?? data.login_id ?? null,
    avatarUrl: data.avatar_url ?? null,
    timezone: data.time_zone ?? null,
  }
}

/**
 * Module progress across the four REP courses. One failing course does not
 * take down the other three.
 *
 * Shared by GET /api/courses/:userId and the socket poller, so the polled
 * payload is byte-identical to what the route serves.
 */
export async function getCourses(userId) {
  const courses = Object.values(CANVAS_CONFIG.courses)

  return Promise.all(
    courses.map(async (course) => {
      const base = {
        courseId: course.id,
        courseName: course.name,
        sisId: course.sisId,
        canvasUrl: `${CANVAS_CONFIG.baseUrl}/courses/${course.id}`,
      }

      try {
        const { data } = await cachedGet(`/courses/${course.id}/modules`, {
          params: { student_id: userId, per_page: 100 },
        })

        const modules = Array.isArray(data) ? data : []
        const totalModules = modules.length
        const completedModules = modules.filter((m) => m.state === 'completed').length
        const progressPercent =
          totalModules === 0 ? 0 : Math.round((completedModules / totalModules) * 100)

        let status = 'in_progress'
        if (progressPercent === 0) status = 'not_started'
        else if (progressPercent === 100) status = 'completed'

        return { ...base, totalModules, completedModules, progressPercent, status }
      } catch (err) {
        const message = err.response?.data?.errors?.[0]?.message ?? err.message
        const empty = { ...base, totalModules: 0, completedModules: 0, progressPercent: 0 }

        // Canvas rejects student_id for a course the user isn't enrolled in with
        // 403 "user not authorised". That's an expected state, not a failure —
        // a bad course id 404s and an outage surfaces with no response at all.
        if (err.response?.status === 403 && /not authoris|not authoriz/i.test(message)) {
          return { ...empty, status: 'not_enrolled', notEnrolled: true }
        }

        return { ...empty, status: 'error', error: true, message }
      }
    })
  )
}

/** Bytes -> "876 KB" / "1.4 MB", formatted server-side. */
export function formatFileSize(bytes) {
  if (typeof bytes !== 'number' || Number.isNaN(bytes)) return null
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${Math.round(kb)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

/**
 * The configured courses this user can actually see content for.
 *
 * The admin token can read every course in the account, so /courses/:id/files
 * returns 200 even where the user isn't enrolled — the 403 that filters
 * /modules never fires here. Gate on the enrolment status the dashboard
 * already derives, so Resource Hub and Collaboration Space can't surface
 * content from courses the teacher is told they aren't enrolled in yet.
 */
async function enrolledCourses(userId) {
  const courses = await getCourses(userId)
  return courses.filter((c) => c.status !== 'not_enrolled' && c.status !== 'error')
}

/**
 * Runs `fn` per enrolled course, skipping any course Canvas refuses (403) and
 * flattening the results.
 */
async function perEnrolledCourse(userId, fn) {
  const courses = await enrolledCourses(userId)

  const results = await Promise.all(
    courses.map(async (course) => {
      try {
        return await fn(course)
      } catch (err) {
        const status = err.response?.status
        // Not enrolled / no permission / feature disabled -> silently contribute nothing.
        if (status === 403 || status === 401 || status === 404) return []
        throw err
      }
    })
  )

  return results.flat()
}

/** The curated Resource Hub folder, or null to fall back to all course files. */
const resourceFolderId = () => process.env.CANVAS_RESOURCE_FOLDER_ID?.trim() || null

/**
 * One Canvas file -> the shape the Resource Hub renders.
 *
 * `size` stays a formatted string because FileCard prints it directly; the raw
 * byte count is kept alongside as sizeBytes for anything that needs to sort.
 */
function shapeFile(f, course) {
  return {
    id: f.id,
    filename: f.display_name ?? f.filename,
    displayName: f.display_name ?? null,
    url: f.url ?? null,
    size: formatFileSize(f.size),
    sizeBytes: typeof f.size === 'number' ? f.size : null,
    contentType: f['content-type'] ?? f.content_type ?? null,
    createdAt: f.created_at ?? null,
    updatedAt: f.updated_at ?? null,
    thumbnailUrl: f.thumbnail_url ?? null,
    courseId: course?.courseId ?? null,
    courseName: course?.courseName ?? null,
  }
}

/**
 * The course a folder belongs to, so cards keep their subtitle.
 *
 * A folder knows its context ("course"/456); matching that against the
 * configured courses gives a display name without hardcoding one here.
 */
async function folderCourse(folderId) {
  try {
    const { data } = await cachedGet(`/folders/${encodeURIComponent(folderId)}`)
    if (data?.context_type !== 'Course') return null

    const match = Object.values(CANVAS_CONFIG.courses).find(
      (c) => String(c.id) === String(data.context_id)
    )
    return match ? { courseId: match.id, courseName: match.name } : null
  } catch {
    // The label is cosmetic — a failure here must not cost us the file list.
    return null
  }
}

/**
 * Files in the curated Resource Hub folder.
 *
 * Read with the admin token, so the folder's own permissions decide what the
 * client publishes rather than per-teacher enrolment.
 */
async function getFolderFiles(folderId) {
  const [course, { data }] = await Promise.all([
    folderCourse(folderId),
    cachedGet(`/folders/${encodeURIComponent(folderId)}/files`, { params: { per_page: 50 } }),
  ])

  return (Array.isArray(data) ? data : []).map((f) => shapeFile(f, course))
}

/** Files across every course the user can actually see — the pre-folder behaviour. */
async function getAllCourseFiles(userId) {
  return perEnrolledCourse(userId, async (course) => {
    const { data } = await cachedGet(`/courses/${course.courseId}/files`, {
      params: { per_page: 100 },
    })

    return (Array.isArray(data) ? data : []).map((f) => shapeFile(f, course))
  })
}

/**
 * GET /api/files/:userId — the Resource Hub file list.
 *
 * With CANVAS_RESOURCE_FOLDER_ID set, this is only what the client has placed
 * in that folder. Without it, every file across the user's enrolled courses,
 * exactly as before.
 *
 * Shared with the socket poller, so both paths must come through here — a route
 * that filtered while the poll did not would flip the list every 30 seconds.
 */
export async function getFiles(userId) {
  const folderId = resourceFolderId()
  return folderId ? getFolderFiles(folderId) : getAllCourseFiles(userId)
}

/**
 * GET /api/discussions/:userId — discussion topics across accessible courses.
 */
export async function getDiscussions(userId) {
  return perEnrolledCourse(userId, async (course) => {
    const { data } = await cachedGet(`/courses/${course.courseId}/discussion_topics`, {
      params: { per_page: 50 },
    })

    return (Array.isArray(data) ? data : []).map((d) => ({
      id: d.id,
      title: d.title,
      author: d.author?.display_name ?? d.user_name ?? null,
      postedAt: d.posted_at ?? d.created_at ?? null,
      replyCount: d.discussion_subentry_count ?? 0,
      url: `${CANVAS_CONFIG.baseUrl}/courses/${course.courseId}/discussion_topics/${d.id}`,
      courseId: course.courseId,
      courseName: course.courseName,
    }))
  })
}

/**
 * Throws a 403-shaped error unless the user is enrolled in `courseId`.
 *
 * The admin token could post into any course in the account, so writes are
 * gated on the same enrolment status the read paths use.
 */
async function assertEnrolled(userId, courseId) {
  const allowed = await enrolledCourses(userId)
  const course = allowed.find((c) => String(c.courseId) === String(courseId))

  if (!course) {
    const err = new Error('You can only post in courses you are enrolled in')
    err.status = 403
    throw err
  }

  return course
}

/**
 * POST /api/discussions/:courseId — creates a published discussion topic.
 */
export async function createDiscussion(userId, courseId, { title, message }) {
  await assertEnrolled(userId, courseId)

  const { data } = await canvasApi.post(`/courses/${courseId}/discussion_topics`, {
    title,
    message,
    published: true,
  })

  // The cached topic list is now stale — drop it so the re-read is fresh.
  invalidateCache(`/courses/${courseId}/discussion_topics`)
  return data
}

/**
 * POST /api/discussions/:courseId/:topicId/entries — replies to a topic.
 */
export async function createDiscussionEntry(userId, courseId, topicId, { message }) {
  await assertEnrolled(userId, courseId)

  const { data } = await canvasApi.post(
    `/courses/${courseId}/discussion_topics/${topicId}/entries`,
    { message }
  )

  invalidateCache(`/courses/${courseId}/discussion_topics`)
  return data
}

/**
 * Coaching group for a user, or an explicit "no group" result.
 */
export async function getGroups(userId) {
  let data

  try {
    data = (await cachedGet(`/users/${userSegment(userId)}/groups`, { params: { per_page: 100 } }))
      .data
  } catch (err) {
    // Canvas only implements /users/self/groups; a numeric id 404s. As an
    // account admin the token can read another user's groups by masquerading.
    const status = err.response?.status
    if (userId === 'self' || (status !== 404 && status !== 403)) throw err

    data = (
      await cachedGet('/users/self/groups', {
        params: { per_page: 100, as_user_id: userId },
      })
    ).data
  }

  const groups = Array.isArray(data) ? data : []

  if (groups.length === 0) {
    return {
      groupName: null,
      hasGroup: false,
      message: 'Not yet assigned to a coaching group',
    }
  }

  const [group] = groups
  return {
    groupName: group.name,
    hasGroup: true,
    memberCount: group.members_count ?? null,
  }
}

/* ---------- announcements ---------- */

/**
 * The "Welcome to REP" course, whose announcements go to every teacher
 * regardless of enrolment — or null while that course doesn't exist yet.
 *
 * Read per call rather than at module load so the feature activates by setting
 * the variable and restarting, with no code change.
 */
const welcomeCourseId = () => process.env.WELCOME_COURSE_ID?.trim() || null

export const PROGRAMME_SOURCE = 'programme'
export const COURSE_SOURCE = 'course'

// Shown where a programme announcement needs a label. The Welcome course's real
// Canvas name isn't known until it exists, and fetching it would cost a request
// per poll for a string the page already has a heading for.
const PROGRAMME_LABEL = 'Programme'

/** Configured name for a Canvas course id, or null if it isn't one of ours. */
function courseNameFor(courseId) {
  const match = Object.values(CANVAS_CONFIG.courses).find(
    (c) => String(c.id) === String(courseId)
  )
  return match ? match.name : null
}

/** 'course_456' -> 456. Anything else -> null. */
function courseIdFromContext(contextCode) {
  if (typeof contextCode !== 'string' || !contextCode.startsWith('course_')) return null
  const id = Number(contextCode.slice('course_'.length))
  return Number.isFinite(id) ? id : null
}

const newestFirst = (a, b) => new Date(b.postedAt ?? 0) - new Date(a.postedAt ?? 0)

/**
 * Canvas defaults /announcements to the last 14 days only, which silently hides
 * older posts. Look back a year by default; the route can override.
 *
 * Day granularity keeps the cache key stable across polls within a day.
 */
function announcementWindow(startDate, endDate) {
  const day = (ms) => new Date(ms).toISOString().slice(0, 10)
  return {
    start: startDate ?? day(Date.now() - 365 * 24 * 60 * 60 * 1000),
    end: endDate ?? day(Date.now() + 24 * 60 * 60 * 1000),
  }
}

function shapeAnnouncement(a, source) {
  const courseId = courseIdFromContext(a.context_code)

  return {
    id: a.id,
    title: a.title,
    message: a.message,
    postedAt: a.posted_at ?? a.created_at ?? null,
    author: a.user_name ?? a.author?.display_name ?? null,
    courseId,
    courseName: courseNameFor(courseId) ?? (source === PROGRAMME_SOURCE ? PROGRAMME_LABEL : null),
    source,
  }
}

/** One cached /announcements read. Both feeds share the 20s cache via cachedGet. */
async function fetchAnnouncements(contextCodes, start, end, source) {
  const { data } = await cachedGet('/announcements', {
    // axios appends "[]" to keys with array values -> context_codes[]=course_456&...
    params: { context_codes: contextCodes, start_date: start, end_date: end, per_page: 50 },
  })

  return (Array.isArray(data) ? data : []).map((a) => shapeAnnouncement(a, source))
}

/**
 * The programme-wide feed, from the Welcome course.
 *
 * An unset WELCOME_COURSE_ID is the normal state until that course is created,
 * so it resolves to an empty list. A *set but unreadable* id — a typo, or a
 * course that is unpublished or deleted — is treated the same way on purpose:
 * the four courses' announcements must still reach the page either way.
 */
async function getProgrammeAnnouncements(start, end) {
  const courseId = welcomeCourseId()
  if (!courseId) return []

  try {
    return await fetchAnnouncements([`course_${courseId}`], start, end, PROGRAMME_SOURCE)
  } catch (err) {
    const message = err.response?.data?.errors?.[0]?.message ?? err.message
    console.warn(`[announcements] WELCOME_COURSE_ID=${courseId} unreadable: ${message}`)
    return []
  }
}

/**
 * Every announcement a teacher should see, newest first — the programme feed
 * plus all four REP courses.
 *
 * Stays a flat array because the socket poller diffs it by id and the dashboard
 * preview renders it directly; getGroupedAnnouncements() is the categorised
 * view built on top.
 */
export async function getAnnouncements({ startDate, endDate } = {}) {
  const { start, end } = announcementWindow(startDate, endDate)
  const contextCodes = Object.values(CANVAS_CONFIG.courses).map((c) => `course_${c.id}`)
  const welcomeId = welcomeCourseId()

  // A failure of the course feed still throws — that's a real outage the route
  // should report. Only the Welcome course is allowed to fail quietly.
  const [programme, courses] = await Promise.all([
    getProgrammeAnnouncements(start, end),
    fetchAnnouncements(contextCodes, start, end, COURSE_SOURCE),
  ])

  // If WELCOME_COURSE_ID is ever pointed at one of the four REP courses, its
  // posts arrive down both paths. The programme feed wins, so nothing doubles.
  const courseOnly = welcomeId
    ? courses.filter((a) => String(a.courseId) !== String(welcomeId))
    : courses

  return [...programme, ...courseOnly].sort(newestFirst)
}

/**
 * The same announcements split into the programme feed and per-course groups.
 *
 * Courses with nothing posted are omitted rather than rendered as empty
 * sections, and groups keep the configured course order so the page doesn't
 * reshuffle between refreshes.
 *
 * `programmeConfigured` lets the page tell "the Welcome course doesn't exist
 * yet" apart from "it exists and has nothing in it".
 */
export function groupAnnouncements(announcements, programmeConfigured = false) {
  const programme = []
  const byCourse = new Map()

  for (const a of announcements) {
    if (a.source === PROGRAMME_SOURCE) {
      programme.push(a)
      continue
    }

    const key = String(a.courseId ?? 'unknown')
    if (!byCourse.has(key)) {
      byCourse.set(key, {
        courseId: a.courseId ?? null,
        courseName: a.courseName ?? null,
        announcements: [],
      })
    }
    byCourse.get(key).announcements.push(a)
  }

  const order = Object.values(CANVAS_CONFIG.courses).map((c) => String(c.id))
  const rank = (group) => {
    const index = order.indexOf(String(group.courseId))
    return index === -1 ? order.length : index
  }

  const courses = [...byCourse.values()].sort((x, y) => rank(x) - rank(y))

  return {
    programme,
    programmeConfigured,
    courses,
    total: programme.length + courses.reduce((n, g) => n + g.announcements.length, 0),
  }
}

/** GET /api/announcements — the categorised payload the page renders. */
export async function getGroupedAnnouncements(options = {}) {
  const announcements = await getAnnouncements(options)
  return groupAnnouncements(announcements, Boolean(welcomeCourseId()))
}
