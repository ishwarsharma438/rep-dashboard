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
/**
 * Enrollment types that mean "this course belongs on your dashboard".
 *
 * StudentViewEnrollment is deliberately absent: that's Canvas's "Student View"
 * test persona, not a real person's place in the course.
 */
const ENROLLED_TYPES = new Set([
  'StudentEnrollment',
  'TeacherEnrollment',
  'TaEnrollment',
  'DesignerEnrollment',
])

// 'invited' counts as enrolled — a teacher who hasn't clicked accept yet is
// still on the course. 'completed' keeps a finished course visible.
const ENROLLMENT_STATES = ['active', 'invited', 'completed']

/**
 * Enrollment types in the order the card should name them, most meaningful
 * first, with the label to show.
 *
 * Order matters: Canvas lists a user's enrollments alphabetically, so Johanna —
 * Teacher *and* Designer in three of the four courses — would be labelled
 * "Designer" if we just took the first one. Student leads because it's the only
 * role whose progress the dashboard can actually show.
 */
const ROLE_PRIORITY = [
  ['StudentEnrollment', 'Student'],
  ['TeacherEnrollment', 'Teacher'],
  ['TaEnrollment', 'TA'],
  ['DesignerEnrollment', 'Designer'],
]

function primaryRole(roles) {
  const match = ROLE_PRIORITY.find(([type]) => roles.includes(type))
  return match ? match[1] : null
}

/**
 * This user's enrollments in one course.
 *
 * Reads /courses/:id/enrollments rather than /users/:id/enrollments — the latter
 * returns 403 for the admin token even when asking about a student, while the
 * course-scoped form works for any user in the account.
 */
async function courseEnrollments(courseId, userId) {
  const { data } = await cachedGet(`/courses/${courseId}/enrollments`, {
    params: { user_id: userId, state: ENROLLMENT_STATES, per_page: 100 },
  })

  return (Array.isArray(data) ? data : []).filter((e) => ENROLLED_TYPES.has(e.type))
}

/**
 * Module progress across the four REP courses. One failing course does not
 * take down the other three.
 *
 * Enrollment is decided by the enrollments API, not by whether Canvas will
 * accept `student_id`. Those are different questions: `student_id` asks "does
 * this person have module progression here", which only a StudentEnrollment
 * does — so a teacher, TA or designer got a 403 and was mislabelled as not
 * enrolled, hiding their own courses from them.
 *
 * Canvas only tracks module completion for student enrollments. For everyone
 * else there is no percentage to report, so the course comes back with
 * progressTracked: false rather than a fabricated 0%.
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

      const empty = {
        ...base,
        totalModules: 0,
        completedModules: 0,
        progressPercent: 0,
        progressTracked: false,
        roles: [],
        role: null,
      }

      try {
        const enrollments = await courseEnrollments(course.id, userId)

        if (enrollments.length === 0) {
          return { ...empty, status: 'not_enrolled', notEnrolled: true }
        }

        const roles = [...new Set(enrollments.map((e) => e.type))]
        const enrolled = { ...base, roles, role: primaryRole(roles) }

        // Only a student enrollment carries module state. Asking for anyone
        // else's would 403, which is what caused this bug in the first place.
        if (roles.includes('StudentEnrollment')) {
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

          return {
            ...enrolled,
            totalModules,
            completedModules,
            progressPercent,
            progressTracked: true,
            status,
          }
        }

        // Teacher / TA / Designer: count the modules so the card can say how big
        // the course is, and deliberately ignore every module's `state`. An
        // unscoped modules call is answered as the *token owner*, so reading
        // state here would show one admin's progress to every teacher.
        const { data } = await cachedGet(`/courses/${course.id}/modules`, {
          params: { per_page: 100 },
        })

        return {
          ...enrolled,
          totalModules: Array.isArray(data) ? data.length : 0,
          completedModules: null,
          progressPercent: null,
          progressTracked: false,
          status: 'enrolled',
        }
      } catch (err) {
        const message = err.response?.data?.errors?.[0]?.message ?? err.message

        // Enrolment is answered by the enrollments call above, so a failure here
        // is a real one rather than the old "403 probably means not enrolled"
        // guess. Canvas returns the same opaque 404 for an unknown user and an
        // unknown course, so log which user we asked about — if all four courses
        // error at once it is almost always a bad user id, not four dead courses.
        if (err.response?.status === 404) {
          console.warn(
            `[courses] 404 for course ${course.id} / user ${userId} —` +
              ' check the user id exists in Canvas'
          )
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

/* ---------- the programme (Welcome) course ---------- */

/**
 * The "Welcome to REP" course, whose announcements, files and discussions go to
 * every teacher regardless of enrolment — or null while that course doesn't
 * exist yet.
 *
 * Read per call rather than at module load so the feature activates by setting
 * the variable and restarting, with no code change.
 */
const welcomeCourseId = () => process.env.WELCOME_COURSE_ID?.trim() || null

export const PROGRAMME_SOURCE = 'programme'
export const COURSE_SOURCE = 'course'

// Shown where a programme item needs a course label. The Welcome course's real
// Canvas name isn't known until it exists, and fetching it would cost a request
// per poll for a string every page already has a heading for.
const PROGRAMME_LABEL = 'Programme'

/** The Welcome course shaped like the `course` argument the shapers expect. */
function programmeCourse(courseId) {
  return { courseId: Number(courseId) || courseId, courseName: PROGRAMME_LABEL }
}

/**
 * Runs a Welcome-course read, or resolves empty.
 *
 * An unset WELCOME_COURSE_ID is the normal state until that course is created.
 * A *set but unreadable* id — a typo, or a course that is unpublished or
 * deleted — is treated the same way on purpose: the four courses' content must
 * still reach the page either way.
 */
async function fromWelcomeCourse(label, read) {
  const courseId = welcomeCourseId()
  if (!courseId) return []

  try {
    return await read(courseId)
  } catch (err) {
    const message = err.response?.data?.errors?.[0]?.message ?? err.message
    console.warn(`[${label}] WELCOME_COURSE_ID=${courseId} unreadable: ${message}`)
    return []
  }
}

/* ---------- files ---------- */

/** The curated Resource Hub folder, or null to fall back to all course files. */
const resourceFolderId = () => process.env.CANVAS_RESOURCE_FOLDER_ID?.trim() || null

/**
 * One Canvas file -> the shape the Resource Hub renders.
 *
 * `size` stays a formatted string because FileCard prints it directly; the raw
 * byte count is kept alongside as sizeBytes for anything that needs to sort.
 */
function shapeFile(f, course, source = COURSE_SOURCE) {
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
    source,
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
 * Programme-wide resources: everything in the Welcome course's files.
 *
 * Scoped by course rather than by folder. CANVAS_RESOURCE_FOLDER_ID names one
 * specific folder, and the Welcome course's folder ids can't be known until the
 * course exists — so reading the course's own file list keeps this to the single
 * WELCOME_COURSE_ID variable rather than needing a second one later.
 */
async function getProgrammeFiles() {
  return fromWelcomeCourse('resources', async (courseId) => {
    const { data } = await cachedGet(`/courses/${encodeURIComponent(courseId)}/files`, {
      params: { per_page: 100 },
    })

    const course = programmeCourse(courseId)
    return (Array.isArray(data) ? data : []).map((f) => shapeFile(f, course, PROGRAMME_SOURCE))
  })
}

/**
 * Every file a teacher should see — the programme resources plus their courses'.
 *
 * With CANVAS_RESOURCE_FOLDER_ID set, the course half is only what the client
 * has placed in that folder. Without it, every file across the user's enrolled
 * courses, exactly as before.
 *
 * Stays a flat array: the socket poller diffs it and the dashboard Resource Hub
 * renders it directly. Shared with the poller, so both paths must come through
 * here — a route that filtered while the poll did not would flip the list every
 * 30 seconds.
 */
export async function getFiles(userId) {
  const folderId = resourceFolderId()
  const welcomeId = welcomeCourseId()

  const [programme, courseFiles] = await Promise.all([
    getProgrammeFiles(),
    folderId ? getFolderFiles(folderId) : getAllCourseFiles(userId),
  ])

  // If WELCOME_COURSE_ID is ever pointed at a course whose files already arrive
  // down the course path, the programme feed wins so nothing doubles.
  const courseOnly = welcomeId
    ? courseFiles.filter((f) => String(f.courseId) !== String(welcomeId))
    : courseFiles

  return [...programme, ...courseOnly]
}

/** GET /api/files/:userId — the categorised Resource Hub payload. */
export async function getGroupedFiles(userId) {
  return groupByContext(await getFiles(userId), {
    programmeConfigured: Boolean(welcomeCourseId()),
    key: 'files',
  })
}

/* ---------- discussions ---------- */

function shapeDiscussion(d, course, source = COURSE_SOURCE) {
  return {
    id: d.id,
    title: d.title,
    author: d.author?.display_name ?? d.user_name ?? null,
    postedAt: d.posted_at ?? d.created_at ?? null,
    replyCount: d.discussion_subentry_count ?? 0,
    url: `${CANVAS_CONFIG.baseUrl}/courses/${course.courseId}/discussion_topics/${d.id}`,
    courseId: course.courseId,
    courseName: course.courseName,
    source,
  }
}

/** Programme-wide discussions: the Welcome course's topics. */
async function getProgrammeDiscussions() {
  return fromWelcomeCourse('discussions', async (courseId) => {
    const { data } = await cachedGet(
      `/courses/${encodeURIComponent(courseId)}/discussion_topics`,
      { params: { per_page: 50 } }
    )

    const course = programmeCourse(courseId)
    return (Array.isArray(data) ? data : []).map((d) =>
      shapeDiscussion(d, course, PROGRAMME_SOURCE)
    )
  })
}

/**
 * Every discussion a teacher should see — the programme topics plus their
 * courses'. Flat, because the socket broadcast and the post-write refresh both
 * carry this list as-is.
 */
export async function getDiscussions(userId) {
  const welcomeId = welcomeCourseId()

  const [programme, courseTopics] = await Promise.all([
    getProgrammeDiscussions(),
    perEnrolledCourse(userId, async (course) => {
      const { data } = await cachedGet(`/courses/${course.courseId}/discussion_topics`, {
        params: { per_page: 50 },
      })

      return (Array.isArray(data) ? data : []).map((d) => shapeDiscussion(d, course))
    }),
  ])

  const courseOnly = welcomeId
    ? courseTopics.filter((d) => String(d.courseId) !== String(welcomeId))
    : courseTopics

  return [...programme, ...courseOnly]
}

/** GET /api/discussions/:userId — the categorised Collaboration Space payload. */
export async function getGroupedDiscussions(userId) {
  return groupByContext(await getDiscussions(userId), {
    programmeConfigured: Boolean(welcomeCourseId()),
    key: 'discussions',
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
 * Splits a shaped list into the programme feed and per-course groups.
 *
 * Shared by announcements, files and discussions — `key` is what the per-course
 * array is called in each payload. Courses with nothing in them are omitted
 * rather than sent as empty sections, and groups keep the configured course
 * order so pages don't reshuffle between refreshes.
 *
 * `programmeConfigured` lets a page tell "the Welcome course doesn't exist yet"
 * apart from "it exists and has nothing in it".
 */
export function groupByContext(items, { programmeConfigured = false, key = 'items' } = {}) {
  const programme = []
  const byCourse = new Map()

  for (const item of items) {
    if (item.source === PROGRAMME_SOURCE) {
      programme.push(item)
      continue
    }

    const mapKey = String(item.courseId ?? 'unknown')
    if (!byCourse.has(mapKey)) {
      byCourse.set(mapKey, {
        courseId: item.courseId ?? null,
        courseName: item.courseName ?? null,
        [key]: [],
      })
    }
    byCourse.get(mapKey)[key].push(item)
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
    total: programme.length + courses.reduce((n, g) => n + g[key].length, 0),
  }
}

/** The announcements view of groupByContext. */
export function groupAnnouncements(announcements, programmeConfigured = false) {
  return groupByContext(announcements, { programmeConfigured, key: 'announcements' })
}

/** GET /api/announcements — the categorised payload the page renders. */
export async function getGroupedAnnouncements(options = {}) {
  const announcements = await getAnnouncements(options)
  return groupAnnouncements(announcements, Boolean(welcomeCourseId()))
}
