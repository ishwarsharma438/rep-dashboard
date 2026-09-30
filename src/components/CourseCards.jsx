import { useEffect, useState } from 'react'
import { useDashboardData } from '../context/DashboardDataContext.jsx'
import { BrainIcon, LotusIcon, PeopleIcon, SproutIcon } from './icons.jsx'

// Fixed display order, independent of whatever order the API returns.
const COURSE_ORDER = [575, 574, 456, 578]

const COURSE_ICONS = {
  575: SproutIcon, // The Resilient Educator
  574: PeopleIcon, // Coaching and Leadership Certification
  456: BrainIcon, // AI Essentials for Educators
  578: LotusIcon, // The Reset
}

const inDisplayOrder = (list) =>
  [...list].sort((a, b) => COURSE_ORDER.indexOf(a.courseId) - COURSE_ORDER.indexOf(b.courseId))

function ProgressBar({ percent }) {
  // Start at 0 and widen on the next paint so the transition actually runs.
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const id = requestAnimationFrame(() => setWidth(percent))
    return () => cancelAnimationFrame(id)
  }, [percent])

  return (
    <div className="flex items-center gap-3">
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-rep-orange transition-[width] duration-[600ms] ease-out"
          style={{ width: `${width}%` }}
        />
      </div>
      <span className="w-10 shrink-0 text-right font-body text-xs font-semibold text-rep-navy">
        {percent}%
      </span>
    </div>
  )
}

function SkeletonRow() {
  return (
    <div className="flex animate-pulse items-center gap-4 rounded-2xl bg-white p-5 shadow-md">
      <div className="h-12 w-12 shrink-0 rounded-full bg-gray-200" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-56 rounded bg-gray-200" />
        <div className="h-3 w-36 rounded bg-gray-200" />
        <div className="h-1.5 w-full rounded-full bg-gray-200" />
      </div>
      <div className="h-9 w-28 shrink-0 rounded-lg bg-gray-200" />
    </div>
  )
}

/**
 * The course's Modules page.
 *
 * The API hands back the course home URL, and the dashboard now sits at the top
 * of that page's navigation — so "Continue" goes straight to the module list
 * rather than bouncing a teacher through the home page. Derived here rather
 * than in canvasData.js so the API keeps returning the canonical course URL.
 */
export function modulesUrl(canvasUrl) {
  if (!canvasUrl) return null
  const base = canvasUrl.replace(/\/+$/, '')
  return `${base}/modules`
}

function CourseRow({ course }) {
  const {
    courseId,
    courseName,
    canvasUrl,
    completedModules,
    totalModules,
    progressPercent,
    progressTracked,
    role,
    status,
  } = course

  const Icon = COURSE_ICONS[courseId] ?? SproutIcon
  const notEnrolled = status === 'not_enrolled'
  const errored = status === 'error'

  // Canvas only tracks module completion for student enrollments, so a teacher,
  // TA or designer has no percentage to show. Older payloads have no
  // progressTracked field at all, so treat its absence as "tracked".
  const tracked = progressTracked !== false

  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-md sm:flex-row sm:items-center">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-rep-orange/15 text-rep-orange">
        <Icon className="h-6 w-6" />
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="font-heading text-base font-bold leading-snug text-rep-navy">
          {courseName}
        </h3>

        {notEnrolled ? (
          <p className="mt-1 font-body text-sm italic text-gray-500">
            You'll be enrolled in this course as the program progresses
          </p>
        ) : errored ? (
          <p className="mt-1 font-body text-sm text-gray-500">
            Couldn't load this course — try refreshing
          </p>
        ) : tracked ? (
          <>
            <p className="mt-0.5 font-body text-xs text-gray-500">
              {completedModules} of {totalModules} modules completed
            </p>
            <div className="mt-2.5">
              <ProgressBar percent={progressPercent} />
            </div>
          </>
        ) : (
          /* Enrolled, but not as a student — so the course size is all Canvas
             can tell us. Saying "0 of 10 completed" here would be a claim about
             this teacher's work that Canvas never made. */
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="font-body text-xs text-gray-500">
              {totalModules} {totalModules === 1 ? 'module' : 'modules'}
            </p>
            {role && (
              <span className="rounded-full bg-rep-navy/10 px-2 py-0.5 font-body text-[10px] font-semibold uppercase tracking-wide text-rep-navy">
                {role}
              </span>
            )}
            <span
              className="font-body text-[11px] text-gray-400"
              title="Canvas only records module completion for student enrolments"
            >
              Progress not tracked for this role
            </span>
          </div>
        )}
      </div>

      <div className="shrink-0 sm:pl-2">
        {notEnrolled || errored ? (
          <button
            type="button"
            disabled
            className="w-full cursor-not-allowed rounded-lg border border-gray-200 px-4 py-2 font-body text-sm text-gray-400 sm:w-auto"
          >
            {errored ? 'Unavailable' : 'Not enrolled yet'}
          </button>
        ) : (
          <a
            href={modulesUrl(canvasUrl)}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full rounded-lg border border-rep-orange px-4 py-2 text-center font-body text-sm font-semibold text-rep-orange transition-colors hover:bg-rep-orange hover:text-white sm:w-auto"
          >
            Continue →
          </a>
        )}
      </div>
    </div>
  )
}

/**
 * The four course rows. Rendered identically on the Dashboard and on
 * /courses — both read from DashboardDataContext, so live updates land on
 * whichever route is open.
 */
export default function CourseCards() {
  const { courses, loading, failed } = useDashboardData()

  if (loading.courses) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    )
  }

  if (failed.courses) {
    return (
      <div className="rounded-2xl bg-white p-5 font-body text-sm text-gray-500 shadow-md">
        Couldn't load your courses. Try refreshing.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {inDisplayOrder(courses).map((course) => (
        <CourseRow key={course.courseId} course={course} />
      ))}
    </div>
  )
}
