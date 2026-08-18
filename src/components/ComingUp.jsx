import { useProfile } from '../context/ProfileContext.jsx'
import { VideoIcon } from './icons.jsx'

/**
 * Real coaching-session data source.
 *
 * This was specified to come from the `coachingGroupSchedule` object in
 * JourneyTimeline.jsx, but no such component or dataset exists in this project
 * yet — so there is nothing to read from. The shape below is the contract this
 * card consumes; drop the real per-group schedule in and the list renders.
 *
 *   { 'Banksia': [{ startsAt: ISO string, title, durationMins, mode }] }
 *
 * Until then every user falls through to the empty state, which is also the
 * correct result for anyone without a group assigned.
 */
const COACHING_GROUP_SCHEDULE = {}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

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

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function formatDayHeading(iso) {
  return new Date(iso).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' })
}

/** Sessions in the current week, grouped by day, earliest first. */
function groupByDay(sessions) {
  const byDay = new Map()
  for (const s of [...sessions].sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt))) {
    const key = new Date(s.startsAt).toDateString()
    if (!byDay.has(key)) byDay.set(key, [])
    byDay.get(key).push(s)
  }
  return [...byDay.entries()]
}

export default function ComingUp() {
  const { group } = useProfile()
  const days = weekStrip()

  const sessions = group?.hasGroup ? (COACHING_GROUP_SCHEDULE[group.groupName] ?? []) : []
  const grouped = groupByDay(sessions)

  return (
    <div className="rounded-2xl bg-white p-5 shadow-md">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="font-heading text-lg font-semibold text-rep-navy">Coming Up</h2>
        <button
          type="button"
          className="font-body text-xs font-semibold text-rep-orange hover:underline"
        >
          View full calendar
        </button>
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
        {grouped.length === 0 ? (
          <p className="py-4 text-center font-body text-sm text-gray-500">
            No sessions scheduled yet
          </p>
        ) : (
          <div className="space-y-4">
            {grouped.map(([day, items]) => (
              <div key={day}>
                <h3 className="font-heading text-xs font-bold uppercase tracking-wide text-rep-orange">
                  {formatDayHeading(day)}
                </h3>
                <ul className="mt-2 space-y-2">
                  {items.map((s, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <VideoIcon className="mt-0.5 h-4 w-4 shrink-0 text-rep-navy/50" />
                      <div className="min-w-0">
                        <p className="font-body text-sm font-semibold text-rep-navy">{s.title}</p>
                        <p className="font-body text-xs text-gray-500">
                          {formatTime(s.startsAt)}
                          {s.durationMins ? ` · ${s.durationMins} min` : ''}
                          {s.mode ? ` · ${s.mode}` : ''}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        className="mt-4 font-body text-xs font-semibold text-rep-orange hover:underline"
      >
        See all sessions →
      </button>
    </div>
  )
}
