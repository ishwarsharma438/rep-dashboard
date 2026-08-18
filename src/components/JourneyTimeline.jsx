import { useProfile } from '../context/ProfileContext.jsx'
import { CheckIcon } from './icons.jsx'

// Fixed program schedule — not Canvas data, never fetched.
const termDates = {
  term4_2026: { start: '2026-10-12', end: '2026-12-19', label: 'Term 4, 2026' },
  term1_2027: { start: '2027-02-15', end: '2027-03-26', label: 'Term 1, 2027' },
  term2_2027: { start: '2027-04-19', end: '2027-06-16', label: 'Term 2, 2027' },
  term3_2027: { start: '2027-07-19', end: '2027-09-18', label: 'Term 3, 2027' },
}

const coachingGroupSchedule = {
  Acacia: { cohort: 1, sessions: ['2026-10-27', '2027-02-16', '2027-04-27'] },
  Banksia: { cohort: 1, sessions: ['2026-11-04', '2027-02-24', '2027-05-05'] },
  Coolibah: { cohort: 1, sessions: ['2026-11-10', '2027-03-02', '2027-05-11'] },
  'Desert Oak': { cohort: 1, sessions: ['2026-11-18', '2027-03-10', '2027-05-19'] },
  Eucalyptus: { cohort: 2, sessions: ['2027-02-16', '2027-04-27', '2027-07-27'] },
  Frangipani: { cohort: 2, sessions: ['2027-02-16', '2027-04-27', '2027-07-27'] },
  'Ghost Gum': { cohort: 2, sessions: ['2027-02-24', '2027-05-05', '2027-08-04'] },
  'Huon Pine': { cohort: 2, sessions: ['2027-02-24', '2027-05-05', '2027-08-04'] },
  'Illawarra Flame Tree': { cohort: 2, sessions: ['2027-03-02', '2027-05-11', '2027-08-10'] },
  Jarrah: { cohort: 2, sessions: ['2027-03-02', '2027-05-11', '2027-08-10'] },
  Kurrajong: { cohort: 2, sessions: ['2027-03-10', '2027-05-19', '2027-08-18'] },
  'Lilly Pilly': { cohort: 2, sessions: ['2027-03-10', '2027-05-19', '2027-08-18'] },
  Melaleuca: { cohort: 2, sessions: ['2027-03-16', '2027-05-25', '2027-08-24'] },
  'Norfolk Island Pine': { cohort: 2, sessions: ['2027-03-16', '2027-05-25', '2027-08-24'] },
  'Orange Thorn': { cohort: 2, sessions: ['2027-03-24', '2027-06-02', '2027-09-01'] },
  'Peppermint Gum': { cohort: 2, sessions: ['2027-03-24', '2027-06-02', '2027-09-01'] },
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Parse "2026-10-12" as a local midnight date — avoids UTC off-by-one shifts. */
function parseDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** "Wed 5 May" — built by hand so the format doesn't drift with locale. */
export function formatSessionDate(iso) {
  const d = parseDate(iso)
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

/** 'complete' | 'current' | 'upcoming', from today against the term range. */
export function termState(term, today = new Date()) {
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  if (parseDate(term.end) < now) return 'complete'
  if (parseDate(term.start) <= now) return 'current'
  return 'upcoming'
}

/** The group's session date falling inside this term, if any. */
function sessionForTerm(sessions, term) {
  const start = parseDate(term.start)
  const end = parseDate(term.end)
  return sessions.find((iso) => {
    const d = parseDate(iso)
    return d >= start && d <= end
  })
}

function StepCircle({ state }) {
  if (state === 'complete') {
    return (
      <span className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full bg-rep-orange text-white">
        <CheckIcon className="h-5 w-5" />
      </span>
    )
  }

  if (state === 'current') {
    return (
      <span className="relative z-10 flex h-10 w-10 items-center justify-center">
        {/* Pulsing ring — disabled under prefers-reduced-motion (see index.css) */}
        <span className="rep-pulse-ring absolute inset-0 rounded-full bg-rep-orange/40" />
        <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-rep-orange">
          <span className="h-2.5 w-2.5 rounded-full bg-white" />
        </span>
      </span>
    )
  }

  return (
    <span className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 border-gray-300 bg-rep-bg" />
  )
}

/** `today` is a test seam — omitted in the app, which uses the real date. */
export default function JourneyTimeline({ today }) {
  const { group } = useProfile()
  const groupName = group?.groupName ?? null
  const schedule = groupName ? coachingGroupSchedule[groupName] : undefined

  const terms = Object.entries(termDates).map(([key, term]) => {
    const sessionIso = schedule ? sessionForTerm(schedule.sessions, term) : undefined
    return {
      key,
      ...term,
      state: termState(term, today ?? new Date()),
      sessionLabel: sessionIso ? formatSessionDate(sessionIso) : 'Session date TBC',
      hasSession: Boolean(sessionIso),
    }
  })

  return (
    <section className="relative mt-6 overflow-hidden rounded-2xl bg-white p-6 shadow-md">
      {/* Group watermark — only when the teacher has a group */}
      {schedule && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex select-none items-center justify-center font-heading text-[clamp(3rem,13vw,9rem)] font-bold uppercase leading-none tracking-tight text-rep-navy opacity-[0.06]"
        >
          {groupName}
        </span>
      )}

      <div className="relative">
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-heading text-lg font-semibold text-rep-navy">Your REP Journey</h2>
          {schedule && (
            <span className="font-body text-xs text-gray-500">
              {groupName} · Cohort {schedule.cohort}
            </span>
          )}
        </div>

        <div className="relative">
          {/* Connector runs between the first and last circle centres */}
          <div
            aria-hidden="true"
            className="absolute left-[12.5%] right-[12.5%] top-7 hidden h-0.5 bg-gray-200 md:block"
          />

          <ol className="relative grid grid-cols-1 gap-6 md:grid-cols-4 md:gap-2">
            {terms.map((term) => (
              <li key={term.key} className="flex flex-col items-center pt-2 text-center">
                <StepCircle state={term.state} />

                <span
                  className={`mt-3 font-heading text-sm ${
                    term.state === 'current'
                      ? 'font-bold text-rep-navy'
                      : term.state === 'complete'
                        ? 'font-semibold text-rep-navy'
                        : 'font-medium text-gray-400'
                  }`}
                >
                  {term.label}
                </span>

                <span
                  className={`mt-1 font-body text-xs ${
                    term.hasSession ? 'text-rep-orange' : 'text-gray-400'
                  }`}
                >
                  {term.sessionLabel}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}
