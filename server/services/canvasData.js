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

/**
 * GET /api/files/:userId — files across the courses the user can access.
 */
export async function getFiles(userId) {
  return perEnrolledCourse(userId, async (course) => {
    const { data } = await cachedGet(`/courses/${course.courseId}/files`, {
      params: { per_page: 100 },
    })

    return (Array.isArray(data) ? data : []).map((f) => ({
      id: f.id,
      filename: f.display_name ?? f.filename,
      url: f.url ?? null,
      size: formatFileSize(f.size),
      contentType: f['content-type'] ?? null,
      courseId: course.courseId,
      courseName: course.courseName,
    }))
  })
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

/**
 * Announcements across all four REP courses.
 *
 * Canvas defaults this endpoint to the last 14 days only, which silently hides
 * older posts. Look back a year by default; the route can override.
 */
export async function getAnnouncements({ startDate, endDate } = {}) {
  const contextCodes = Object.values(CANVAS_CONFIG.courses).map((c) => `course_${c.id}`)

  // Day granularity keeps the cache key stable across polls within a day.
  const day = (ms) => new Date(ms).toISOString().slice(0, 10)
  const end = endDate ?? day(Date.now() + 24 * 60 * 60 * 1000)
  const start = startDate ?? day(Date.now() - 365 * 24 * 60 * 60 * 1000)

  const { data } = await cachedGet('/announcements', {
    // axios appends "[]" to keys with array values -> context_codes[]=course_456&...
    params: { context_codes: contextCodes, start_date: start, end_date: end, per_page: 50 },
  })

  const announcements = Array.isArray(data) ? data : []

  return announcements.map((a) => ({
    id: a.id,
    title: a.title,
    message: a.message,
    postedAt: a.posted_at ?? a.created_at ?? null,
    author: a.user_name ?? a.author?.display_name ?? null,
    courseId: a.context_code ? Number(a.context_code.replace('course_', '')) : null,
  }))
}
