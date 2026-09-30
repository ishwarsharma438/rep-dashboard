/**
 * Cohort-level aggregation for the admin analytics view.
 *
 * Entirely read-only, and entirely separate from the single-user paths in
 * canvasData.js: nothing here is called by the teacher or student dashboard, and
 * nothing here changes what those return. It reuses the same enrolment-type
 * rules (so it can't drift from them) but issues its own cohort-wide queries.
 *
 * Costs are deliberate. One enrolment page-set and one analytics call per
 * course, then one modules call per student per course — that last one is the
 * expensive part, so it runs with bounded concurrency behind a longer cache than
 * the dashboard's 20s.
 */
import CANVAS_CONFIG from '../config/canvasConfig.js'
import canvasApi, { getAllPages, mapWithConcurrency } from './canvasApi.js'
import { BOOKING_TOTALS, classifyBooking, isActiveEvent } from './bookings.js'

/** Admin aggregates are expensive and rarely need to be second-fresh. */
const ADMIN_CACHE_TTL_MS = Number(process.env.ADMIN_CACHE_TTL_MS) || 5 * 60 * 1000

/** Canvas calls in flight at once while walking the cohort. */
const CONCURRENCY = Number(process.env.ADMIN_CONCURRENCY) || 6

const ENROLLMENT_STATES = ['active', 'invited', 'completed']

const courses = () => Object.values(CANVAS_CONFIG.courses)

/* ---------- cache ---------- */

const cache = new Map()

async function cached(key, build) {
  const hit = cache.get(key)
  if (hit && hit.expiresAt > Date.now()) return hit.promise

  const promise = build().catch((err) => {
    cache.delete(key)
    throw err
  })

  cache.set(key, { promise, expiresAt: Date.now() + ADMIN_CACHE_TTL_MS })
  return promise
}

export function clearAdminCache() {
  cache.clear()
}

/* ---------- shared reads ---------- */

const errorOf = (err) => ({
  status: err.response?.status ?? null,
  message: err.response?.data?.errors?.[0]?.message ?? err.message,
})

/**
 * Every enrolment in one course, across all pages.
 *
 * Deliberately unfiltered by type: the caller decides. This is the cohort-wide
 * counterpart to canvasData's per-user courseEnrollments, not a replacement.
 */
async function allEnrollments(courseId) {
  return getAllPages(`/courses/${courseId}/enrollments`, {
    params: { state: ENROLLMENT_STATES, per_page: 100 },
  })
}

/**
 * Per-student page views and participations for a course.
 *
 * One request for the whole cohort, which is why this is the engagement source
 * rather than /users/:id/page_views. Canvas returns null for a student it has no
 * analytics rollup for yet, which is not the same as zero.
 */
async function studentSummaries(courseId) {
  try {
    const rows = await getAllPages(`/courses/${courseId}/analytics/student_summaries`, {
      params: { per_page: 100 },
    })
    return { available: true, rows }
  } catch (err) {
    // The Analytics API can be disabled per account. That costs us engagement
    // numbers, not completion, so it must not fail the whole page.
    return { available: false, rows: [], error: errorOf(err) }
  }
}

/* ---------- completion ---------- */

const bucketOf = (percent) => {
  if (percent === 0) return 'notStarted'
  if (percent === 100) return 'completed'
  return 'inProgress'
}

/**
 * Module completion for every student in one course.
 *
 * Only StudentEnrollment carries module state — the same rule the single-user
 * dashboard now uses. Teachers, TAs and designers are counted as staff and
 * excluded from completion averages rather than dragging them to 0%: they are
 * enrolled (which the dashboard bug used to deny) but Canvas tracks no
 * progression for them.
 */
async function courseCompletion(course) {
  const enrollments = await allEnrollments(course.id)

  const students = [
    ...new Map(
      enrollments
        .filter((e) => e.type === 'StudentEnrollment')
        .map((e) => [e.user_id, e])
    ).values(),
  ]

  const staffCount = new Set(
    enrollments
      .filter((e) => ['TeacherEnrollment', 'TaEnrollment', 'DesignerEnrollment'].includes(e.type))
      .map((e) => e.user_id)
  ).size

  const perStudent = await mapWithConcurrency(students, CONCURRENCY, async (enrollment) => {
    const userId = enrollment.user_id

    const identity = {
      userId,
      name: enrollment.user?.name ?? enrollment.user?.short_name ?? null,
      enrollmentState: enrollment.enrollment_state ?? null,
      // Free on this payload — the cheap engagement signal.
      lastActivityAt: enrollment.last_activity_at ?? null,
      totalActivitySeconds:
        typeof enrollment.total_activity_time === 'number' ? enrollment.total_activity_time : null,
    }

    try {
      const { data } = await canvasApi.get(`/courses/${course.id}/modules`, {
        params: { student_id: userId, per_page: 100 },
      })

      const modules = Array.isArray(data) ? data : []
      const totalModules = modules.length
      const completedModules = modules.filter((m) => m.state === 'completed').length
      const progressPercent =
        totalModules === 0 ? 0 : Math.round((completedModules / totalModules) * 100)

      return { ...identity, totalModules, completedModules, progressPercent, ok: true }
    } catch (err) {
      return {
        ...identity,
        totalModules: null,
        completedModules: null,
        progressPercent: null,
        ok: false,
        error: errorOf(err),
      }
    }
  })

  const counted = perStudent.filter((s) => s.ok)
  const buckets = { notStarted: 0, inProgress: 0, completed: 0 }
  for (const s of counted) buckets[bucketOf(s.progressPercent)] += 1

  const averagePercent =
    counted.length === 0
      ? null
      : Math.round(counted.reduce((n, s) => n + s.progressPercent, 0) / counted.length)

  return {
    courseId: course.id,
    courseName: course.name,
    studentCount: students.length,
    staffCount,
    countedStudents: counted.length,
    unreadableStudents: perStudent.length - counted.length,
    averagePercent,
    buckets,
    students: perStudent,
  }
}

/* ---------- engagement ---------- */

/**
 * Cohort engagement for one course: page views and participations from the
 * Analytics API, joined onto the activity fields already on each enrolment.
 */
function courseEngagement(course, completion, summaries) {
  const byId = new Map(summaries.rows.map((r) => [String(r.id), r]))

  const students = completion.students.map((s) => {
    const row = byId.get(String(s.userId))
    return {
      userId: s.userId,
      name: s.name,
      pageViews: typeof row?.page_views === 'number' ? row.page_views : null,
      participations: typeof row?.participations === 'number' ? row.participations : null,
      lastActivityAt: s.lastActivityAt,
      totalActivitySeconds: s.totalActivitySeconds,
    }
  })

  // Averaged over students Canvas actually has a number for. Treating null as
  // zero would report a quiet cohort as a disengaged one.
  const mean = (pick) => {
    const values = students.map(pick).filter((v) => typeof v === 'number')
    if (values.length === 0) return null
    return Math.round(values.reduce((a, b) => a + b, 0) / values.length)
  }

  const withActivity = students.filter((s) => s.lastActivityAt)

  return {
    courseId: course.id,
    courseName: course.name,
    analyticsAvailable: summaries.available,
    analyticsError: summaries.error ?? null,
    averagePageViews: mean((s) => s.pageViews),
    averageParticipations: mean((s) => s.participations),
    averageActivitySeconds: mean((s) => s.totalActivitySeconds),
    studentsWithPageViews: students.filter((s) => typeof s.pageViews === 'number').length,
    studentsSeen: withActivity.length,
    studentCount: students.length,
    lastActivityAt:
      withActivity.length === 0
        ? null
        : withActivity
            .map((s) => s.lastActivityAt)
            .sort()
            .at(-1),
    students,
  }
}

/* ---------- attendance ---------- */

const emptyAttendance = () =>
  Object.fromEntries(
    Object.entries(BOOKING_TOTALS).map(([type, allowance]) => [
      type,
      { booked: 0, held: 0, upcoming: 0, allowancePerPerson: allowance },
    ])
  )

/**
 * Bookings for one participant, from their personal Canvas calendar.
 *
 * This is where the current Canvas token runs out of road. A personal calendar
 * is private: the token reads its own and 403s on everyone else's, and
 * masquerading with as_user_id is refused too. So a participant who is not the
 * token owner comes back `readable: false` rather than as a silent zero — an
 * admin must not be shown "0 booked" for a cohort we simply cannot see.
 */
async function participantBookings(userId) {
  try {
    const rows = await getAllPages('/calendar_events', {
      params: { type: 'event', all_events: 1, per_page: 100, as_user_id: userId },
    })

    const now = Date.now()
    const counts = emptyAttendance()
    let classified = 0

    for (const event of rows) {
      if (!isActiveEvent(event)) continue
      const type = classifyBooking(event.title ?? '')
      if (!type || !counts[type]) continue

      classified += 1
      counts[type].booked += 1

      // "Held" only means the slot has passed. Nothing in the Calendly -> n8n ->
      // Canvas pipeline records who actually turned up, so this is deliberately
      // not called "attended".
      const startsAt = event.start_at ? new Date(event.start_at).getTime() : null
      if (startsAt !== null && startsAt < now) counts[type].held += 1
      else counts[type].upcoming += 1
    }

    return { userId, readable: true, classified, unclassified: rows.length - classified, counts }
  } catch (err) {
    return { userId, readable: false, error: errorOf(err), counts: emptyAttendance() }
  }
}

/**
 * Booking roll-up across the cohort, by session type.
 *
 * `participants` is the distinct set of students across the four courses — the
 * people who hold a programme allowance.
 */
async function cohortAttendance(participants) {
  const perPerson = await mapWithConcurrency(participants, CONCURRENCY, (p) =>
    participantBookings(p.userId)
  )

  const readable = perPerson.filter((p) => p.readable)
  const totals = emptyAttendance()

  for (const person of readable) {
    for (const [type, counts] of Object.entries(person.counts)) {
      totals[type].booked += counts.booked
      totals[type].held += counts.held
      totals[type].upcoming += counts.upcoming
    }
  }

  // Allowance is per person, so the cohort ceiling scales with who we can see.
  for (const [type, counts] of Object.entries(totals)) {
    counts.allowanceTotal = counts.allowancePerPerson * readable.length
  }

  const byName = new Map(participants.map((p) => [p.userId, p.name]))

  return {
    participantCount: participants.length,
    readableCount: readable.length,
    unreadableCount: perPerson.length - readable.length,
    // The single most useful thing to show when most rows are unreadable.
    permissionBlocked: perPerson.some((p) => !p.readable && [401, 403].includes(p.error?.status)),
    byType: totals,
    participants: perPerson.map((p) => ({ ...p, name: byName.get(p.userId) ?? null })),
  }
}

/* ---------- overview ---------- */

/**
 * Everything the admin page renders, in one payload.
 *
 * Each section degrades on its own: a course that fails to read leaves the
 * other three intact, and unavailable analytics or unreadable calendars are
 * reported as such rather than as zeroes.
 */
export async function getAdminOverview() {
  return cached('overview', async () => {
    const perCourse = await Promise.all(
      courses().map(async (course) => {
        try {
          const [completion, summaries] = await Promise.all([
            courseCompletion(course),
            studentSummaries(course.id),
          ])
          return { ok: true, course, completion, engagement: courseEngagement(course, completion, summaries) }
        } catch (err) {
          return { ok: false, course, error: errorOf(err) }
        }
      })
    )

    const ok = perCourse.filter((c) => c.ok)

    // One person can be a student in several courses; the programme allowance
    // is per person, so attendance counts them once.
    const participants = [
      ...new Map(
        ok.flatMap((c) => c.completion.students.map((s) => [s.userId, { userId: s.userId, name: s.name }]))
      ).values(),
    ]

    const attendance = await cohortAttendance(participants)

    const totalStudents = participants.length
    const averages = ok.map((c) => c.completion.averagePercent).filter((n) => typeof n === 'number')

    return {
      generatedAt: new Date().toISOString(),
      cacheTtlMs: ADMIN_CACHE_TTL_MS,
      cohort: {
        participantCount: totalStudents,
        courseCount: courses().length,
        readableCourseCount: ok.length,
        averageCompletionPercent:
          averages.length === 0
            ? null
            : Math.round(averages.reduce((a, b) => a + b, 0) / averages.length),
      },
      courses: perCourse.map((c) =>
        c.ok
          ? { ok: true, ...c.completion, engagement: c.engagement }
          : {
              ok: false,
              courseId: c.course.id,
              courseName: c.course.name,
              error: c.error,
            }
      ),
      attendance,
    }
  })
}
