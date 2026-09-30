import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import useAdminAccess from '../hooks/useAdminAccess.js'
import { formatRelativeTime } from '../lib/format.js'
import { ChevronDownIcon, PeopleIcon } from '../components/icons.jsx'

/**
 * Completion buckets are ordinal — not started, part way, done — so they take a
 * sequential single-hue ramp stepped light -> dark from rep-orange, not three
 * unrelated hues. Validated for monotonic lightness and colour-vision
 * separation (worst adjacent pair ΔE 20.0 protan, 22.9 normal).
 *
 * The lightest step sits under 3:1 against a white card, so every segment is
 * directly labelled and a per-student table is available beneath — identity is
 * never carried by colour alone.
 */
const BUCKETS = [
  { key: 'completed', label: 'Completed', fill: '#7e300b' },
  { key: 'inProgress', label: 'In progress', fill: '#de5f21' },
  { key: 'notStarted', label: 'Not started', fill: '#f6d5bd' },
]

const SESSION_LABELS = {
  coaching_1on1: '1:1 Coaching',
  group_coaching: 'Group Coaching',
  mhfa: 'MHFA',
  webinars: 'Webinars',
  f2f: 'Face-to-Face',
}

const pct = (n) => (typeof n === 'number' ? `${n}%` : '—')
const num = (n) => (typeof n === 'number' ? n.toLocaleString() : '—')

/** Seconds -> "3h 20m" / "12m" / "—". */
function duration(seconds) {
  if (typeof seconds !== 'number' || seconds <= 0) return '—'
  const mins = Math.round(seconds / 60)
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

/* ---------- pieces ---------- */

export function StatTile({ label, value, hint }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-md">
      <p className="font-body text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 font-heading text-3xl font-bold leading-none text-rep-navy">{value}</p>
      {hint && <p className="mt-1.5 font-body text-xs text-gray-400">{hint}</p>}
    </div>
  )
}

function Legend({ items }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {items.map((item) => (
        <li key={item.key ?? item.label} className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-sm"
            style={{ backgroundColor: item.fill }}
            aria-hidden="true"
          />
          <span className="font-body text-[11px] text-gray-500">{item.label}</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * Stacked composition bar. Segments are separated by a 2px surface gap and the
 * ends are rounded, so adjacent fills stay distinguishable without a border.
 */
export function StackedBar({ segments, total, ariaLabel }) {
  if (!total) {
    return <div className="h-2.5 w-full rounded-full bg-gray-100" aria-label={`${ariaLabel}: no data`} />
  }

  const visible = segments.filter((s) => s.value > 0)

  return (
    <div className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full" role="img" aria-label={ariaLabel}>
      {visible.map((s) => (
        <div
          key={s.key ?? s.label}
          className="h-full first:rounded-l-full last:rounded-r-full"
          style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.fill }}
          title={`${s.label}: ${s.value}`}
        />
      ))}
    </div>
  )
}

export function StudentTable({ students, engagement }) {
  const byId = new Map((engagement?.students ?? []).map((s) => [s.userId, s]))

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse">
        <thead>
          <tr className="border-b border-gray-200 text-left">
            {['Participant', 'Modules', 'Progress', 'Page views', 'Participations', 'Last seen', 'Time on course'].map(
              (h) => (
                <th key={h} className="py-2 pr-4 font-body text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  {h}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody>
          {students.map((s) => {
            const e = byId.get(s.userId)
            return (
              <tr key={s.userId} className="border-b border-gray-100 last:border-0">
                <td className="py-2 pr-4 font-body text-xs text-rep-navy">{s.name ?? `User ${s.userId}`}</td>
                <td className="py-2 pr-4 font-body text-xs text-gray-600">
                  {s.ok ? `${s.completedModules} / ${s.totalModules}` : '—'}
                </td>
                <td className="py-2 pr-4 font-body text-xs font-semibold text-rep-navy">
                  {s.ok ? pct(s.progressPercent) : <span className="text-gray-400">unreadable</span>}
                </td>
                <td className="py-2 pr-4 font-body text-xs text-gray-600">{num(e?.pageViews)}</td>
                <td className="py-2 pr-4 font-body text-xs text-gray-600">{num(e?.participations)}</td>
                <td className="py-2 pr-4 font-body text-xs text-gray-600">
                  {s.lastActivityAt ? formatRelativeTime(s.lastActivityAt) : '—'}
                </td>
                <td className="py-2 pr-4 font-body text-xs text-gray-600">{duration(s.totalActivitySeconds)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function CourseSection({ course }) {
  const [open, setOpen] = useState(false)

  if (!course.ok) {
    return (
      <div className="rounded-2xl bg-white p-5 shadow-md">
        <h3 className="font-heading text-sm font-bold text-rep-navy">{course.courseName}</h3>
        <p className="mt-1 font-body text-xs text-gray-500">
          Couldn't read this course — {course.error?.message ?? 'unknown error'}
        </p>
      </div>
    )
  }

  const segments = BUCKETS.map((b) => ({ ...b, value: course.buckets[b.key] ?? 0 }))
  const e = course.engagement

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-md">
      <div className="p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="min-w-0 font-heading text-sm font-bold leading-snug text-rep-navy">
            {course.courseName}
          </h3>
          <p className="shrink-0 font-body text-xs text-gray-500">
            {course.studentCount} {course.studentCount === 1 ? 'participant' : 'participants'} ·{' '}
            {course.staffCount} staff
          </p>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <StackedBar
            segments={segments}
            total={course.countedStudents}
            ariaLabel={`${course.courseName} completion`}
          />
          <span className="w-12 shrink-0 text-right font-heading text-sm font-bold text-rep-navy">
            {pct(course.averagePercent)}
          </span>
        </div>

        {/* Direct labels on every segment — the ramp's lightest step is low
            contrast, so the numbers, not the fill, carry the value. */}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          {segments.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: s.fill }} aria-hidden="true" />
              <span className="font-body text-[11px] text-gray-500">
                {s.label} <span className="font-semibold text-rep-navy">{s.value}</span>
              </span>
            </span>
          ))}
        </div>

        {course.unreadableStudents > 0 && (
          <p className="mt-2 font-body text-[11px] text-rep-red">
            {course.unreadableStudents} participant
            {course.unreadableStudents === 1 ? '' : 's'} could not be read and are excluded from the average
          </p>
        )}

        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-gray-100 pt-3 sm:grid-cols-4">
          {[
            ['Avg page views', num(e.averagePageViews)],
            ['Avg participations', num(e.averageParticipations)],
            ['Avg time on course', duration(e.averageActivitySeconds)],
            ['Seen in Canvas', `${e.studentsSeen} of ${e.studentCount}`],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="font-body text-[11px] uppercase tracking-wide text-gray-400">{label}</dt>
              <dd className="font-heading text-sm font-bold text-rep-navy">{value}</dd>
            </div>
          ))}
        </dl>

        {!e.analyticsAvailable && (
          <p className="mt-2 font-body text-[11px] text-gray-400">
            Canvas Analytics is unavailable for this course, so page views and participations are blank.
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 border-t border-gray-100 px-5 py-3 text-left transition-colors hover:bg-gray-50"
      >
        <ChevronDownIcon
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? '' : '-rotate-90'}`}
        />
        <span className="font-body text-xs font-semibold text-rep-navy">
          {open ? 'Hide' : 'Show'} per-participant breakdown
        </span>
      </button>

      {open && (
        <div className="border-t border-gray-100 px-5 py-4">
          <StudentTable students={course.students} engagement={e} />
        </div>
      )}
    </div>
  )
}

export function AttendanceSection({ attendance }) {
  const rows = Object.entries(attendance.byType)
  const legend = [
    { key: 'held', label: 'Held (date passed)', fill: '#de5f21' },
    { key: 'upcoming', label: 'Upcoming', fill: '#f6d5bd' },
  ]

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold text-rep-navy">Session bookings</h2>
        <Legend items={legend} />
      </div>

      {/* The pipeline records bookings, not turnout. Saying so here is the whole
          point — an admin reading "attendance" would otherwise assume no-shows
          are excluded, which nothing in Canvas can tell us. */}
      <p className="mb-3 font-body text-xs text-gray-500">
        Counted from Calendly bookings written into each participant's Canvas Calendar. "Held" means
        the session date has passed — no attendance is recorded anywhere in the pipeline, so this is
        not a turnout figure.
      </p>

      {attendance.permissionBlocked && (
        <div className="mb-3 rounded-2xl border-l-4 border-rep-red bg-white p-4 shadow-md">
          <p className="font-heading text-sm font-bold text-rep-navy">
            Bookings unreadable for {attendance.unreadableCount} of {attendance.participantCount}{' '}
            participants
          </p>
          <p className="mt-1 font-body text-xs text-gray-600">
            A Canvas personal calendar is private: the API token can read its own and is refused on
            everyone else's, and acting-as-user is not permitted for this token either. Until that
            permission is granted the figures below cover only the participants we can see, which is
            why they are not presented as a cohort total.
          </p>
        </div>
      )}

      <div className="rounded-2xl bg-white p-5 shadow-md">
        <div className="space-y-4">
          {rows.map(([type, counts]) => {
            const segments = [
              { key: 'held', label: 'Held', value: counts.held, fill: '#de5f21' },
              { key: 'upcoming', label: 'Upcoming', value: counts.upcoming, fill: '#f6d5bd' },
            ]
            const ceiling = Math.max(counts.booked, counts.allowanceTotal || 0, 1)

            return (
              <div key={type}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-body text-xs font-semibold text-rep-navy">
                    {SESSION_LABELS[type] ?? type}
                  </p>
                  <p className="font-body text-[11px] text-gray-500">
                    <span className="font-semibold text-rep-navy">{counts.booked}</span> booked
                    {counts.allowanceTotal > 0 && ` of ${counts.allowanceTotal} available`} ·{' '}
                    {counts.held} held · {counts.upcoming} upcoming
                  </p>
                </div>
                <div className="mt-1.5">
                  <StackedBar
                    segments={segments}
                    total={ceiling}
                    ariaLabel={`${SESSION_LABELS[type] ?? type}: ${counts.held} held, ${counts.upcoming} upcoming`}
                  />
                </div>
              </div>
            )
          })}
        </div>

        <p className="mt-4 border-t border-gray-100 pt-3 font-body text-[11px] text-gray-400">
          Allowance is per participant ({Object.values(attendance.byType)[0]?.allowancePerPerson ?? 0}{' '}
          for 1:1 coaching, and so on) multiplied by the {attendance.readableCount} participant
          {attendance.readableCount === 1 ? '' : 's'} whose calendar is readable.
        </p>
      </div>
    </section>
  )
}

/* ---------- page ---------- */

export default function AdminPage() {
  const { allowed, loading: checking } = useAdminAccess()
  const [data, setData] = useState(null)
  const [state, setState] = useState('loading')

  useEffect(() => {
    if (checking || !allowed) return
    const controller = new AbortController()

    fetch('/api/admin/overview', { credentials: 'include', signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? `HTTP ${res.status}`)
        return res.json()
      })
      .then((payload) => {
        setData(payload)
        setState('ready')
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        console.warn(`[admin] overview failed: ${err.message}`)
        setState('failed')
      })

    return () => controller.abort()
  }, [checking, allowed])

  if (checking) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="h-8 w-56 animate-pulse rounded bg-gray-200" />
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-white p-12 text-center shadow-md">
          <PeopleIcon className="h-10 w-10 text-gray-300" />
          <h1 className="font-heading text-lg font-bold text-rep-navy">Programme staff only</h1>
          <p className="max-w-md font-body text-sm text-gray-500">
            This view shows cohort-wide analytics and is limited to REP staff.
          </p>
          <Link
            to="/dashboard"
            className="mt-1 rounded-lg border border-rep-orange px-4 py-2 font-body text-sm font-semibold text-rep-orange transition-colors hover:bg-rep-orange hover:text-white"
          >
            Back to your dashboard
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-heading text-2xl font-bold text-rep-navy sm:text-3xl">
          Programme Analytics
        </h1>
        {data && (
          <p className="font-body text-xs text-gray-400">
            Updated {formatRelativeTime(data.generatedAt)} · cached for{' '}
            {Math.round(data.cacheTtlMs / 60000)} min
          </p>
        )}
      </div>

      {state === 'loading' && (
        <div className="mt-6 space-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-white shadow-md" />
          ))}
        </div>
      )}

      {state === 'failed' && (
        <p className="mt-6 rounded-2xl bg-white p-5 font-body text-sm text-gray-500 shadow-md">
          Couldn't load cohort analytics. Try refreshing.
        </p>
      )}

      {state === 'ready' && data && (
        <div className="mt-6 space-y-8">
          <section>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile
                label="Participants"
                value={data.cohort.participantCount}
                hint="Distinct student enrolments across all courses"
              />
              <StatTile
                label="Avg completion"
                value={pct(data.cohort.averageCompletionPercent)}
                hint="Mean of each course's average"
              />
              <StatTile
                label="Courses readable"
                value={`${data.cohort.readableCourseCount} of ${data.cohort.courseCount}`}
              />
              <StatTile
                label="Bookings readable"
                value={`${data.attendance.readableCount} of ${data.attendance.participantCount}`}
                hint="Limited by Canvas calendar permissions"
              />
            </div>
          </section>

          <section>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-heading text-lg font-semibold text-rep-navy">
                Completion &amp; engagement by course
              </h2>
              <Legend items={BUCKETS} />
            </div>
            <div className="space-y-3">
              {data.courses.map((course) => (
                <CourseSection key={course.courseId} course={course} />
              ))}
            </div>
          </section>

          <AttendanceSection attendance={data.attendance} />

          <p className="font-body text-xs text-gray-400">
            Staff enrolments are excluded from completion figures: Canvas records module progression
            only for student enrolments.
          </p>
        </div>
      )}
    </div>
  )
}
