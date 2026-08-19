import { Link } from 'react-router-dom'
import { COACHING_GROUPS, EVENT_TYPE_META, ROADMAP_EVENTS } from '../data/roadmapEvents.js'
import useCoachingGroup from '../hooks/useCoachingGroup.js'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Events shown at once in the widget. */
const PREVIEW_COUNT = 3

/** Types that apply to every teacher regardless of group membership. */
const UNIVERSAL_TYPES = new Set(['webinar', 'f2f'])

const pad = (n) => String(n).padStart(2, '0')
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

function fromISO(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** The seven dates of the Mon–Sun week containing `today`. */
export function weekStrip(today = new Date()) {
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  // getDay(): 0 = Sunday. Shift so Monday starts the week.
  const offsetToMonday = (base.getDay() + 6) % 7
  const monday = new Date(base)
  monday.setDate(base.getDate() - offsetToMonday)

  return DAY_LABELS.map((label, i) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + i)
    return {
      label,
      dayNumber: date.getDate(),
      iso: date.toDateString(),
      isToday: date.toDateString() === base.toDateString(),
    }
  })
}

/** '7:30am' */
function clock(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return `${h % 12 === 0 ? 12 : h % 12}:${pad(m)}${h >= 12 ? 'pm' : 'am'}`
}

function eventTime(event) {
  if (!event.startTime) return 'All day'
  return event.endTime
    ? `${clock(event.startTime)} – ${clock(event.endTime)}`
    : clock(event.startTime)
}

function eventDay(iso) {
  const d = fromISO(iso)
  return `${DAY_LABELS[(d.getDay() + 6) % 7]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`
}

/**
 * The next few events this teacher should care about.
 *
 * Without a group, only the whole-program events (webinars and F2F) are
 * certain to apply — showing all 48 coaching sessions would be noise, since
 * a teacher attends the three belonging to one group. Once they join, their
 * own sessions are merged in alongside MHFA.
 */
export function upcomingFor(groupCode, today = new Date(), limit = PREVIEW_COUNT) {
  const todayIso = toISO(today)
  const group = groupCode ? COACHING_GROUPS.find((g) => g.code === groupCode) : null
  const groupLabel = group ? `${group.code} - ${group.name}` : null

  return ROADMAP_EVENTS.filter((e) => {
    if ((e.endDate ?? e.startDate) < todayIso) return false
    if (UNIVERSAL_TYPES.has(e.type)) return true
    if (!groupLabel) return false
    if (e.type === 'mhfa') return true
    return e.type === 'group_coaching' && e.group === groupLabel
  })
    .sort(
      (a, b) =>
        a.startDate.localeCompare(b.startDate) ||
        (a.startTime ?? '').localeCompare(b.startTime ?? '')
    )
    .slice(0, limit)
}

export default function ComingUp() {
  // Membership now comes from /api/groups/my via the shared hook. While it is
  // in flight groupCode is null, which shows the universal events — the same
  // list a teacher without a group sees, so there is no misleading flash.
  const { groupCode, loading } = useCoachingGroup()
  const days = weekStrip()
  const upcoming = upcomingFor(groupCode)

  return (
    <div className="rounded-2xl bg-white p-5 shadow-md">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="font-heading text-lg font-semibold text-rep-navy">Coming Up</h2>
        <Link
          to="/calendar"
          className="font-body text-xs font-semibold text-rep-orange hover:underline"
        >
          View full calendar
        </Link>
      </div>

      {/* Week strip, Mon–Sun, today filled */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => (
          <div key={d.iso} className="flex flex-col items-center gap-1.5">
            <span className="font-body text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              {d.label}
            </span>
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full font-body text-xs ${
                d.isToday ? 'bg-rep-orange font-bold text-white' : 'text-rep-navy'
              }`}
            >
              {d.dayNumber}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-5 border-t border-gray-100 pt-4">
        {upcoming.length === 0 ? (
          <p className="py-4 text-center font-body text-sm text-gray-500">
            No sessions scheduled yet
          </p>
        ) : (
          <ul className="space-y-3">
            {upcoming.map((event) => (
              <li key={event.id} className="flex items-start gap-2.5">
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${EVENT_TYPE_META[event.type].dot}`}
                />
                <div className="min-w-0">
                  <p className="truncate font-body text-sm font-semibold text-rep-navy">
                    {event.title}
                  </p>
                  <p className="font-body text-xs text-gray-500">
                    {eventDay(event.startDate)} · {eventTime(event)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!groupCode && !loading && (
        <p className="mt-3 font-body text-xs text-gray-500">
          Join a coaching group to see your own sessions here.
        </p>
      )}

      <Link
        to="/sessions"
        className="mt-4 inline-block font-body text-xs font-semibold text-rep-orange hover:underline"
      >
        See all sessions →
      </Link>
    </div>
  )
}
