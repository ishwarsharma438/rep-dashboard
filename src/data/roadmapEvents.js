/**
 * Static program schedule from the ISV REP Program Roadmap.
 *
 * Hand-maintained, not fetched: Canvas holds course content, not the program
 * calendar. Nothing here talks to the API. Dates are plain 'YYYY-MM-DD' local
 * dates with no timezone attached — they are the same calendar day for every
 * teacher, so they must not be run through UTC parsing (see fromISO in
 * CalendarPage).
 *
 * Every event:
 *   { id, title, type, startDate, endDate?, startTime?, endTime?,
 *     description, cohort, capacity?, location, group? }
 */

/**
 * Presentation metadata per session type.
 *
 * Tailwind scans source for complete class strings, so every class here is
 * written out in full — building them by interpolation would purge them.
 */
export const EVENT_TYPE_META = {
  webinar: {
    label: 'Webinars',
    short: 'Webinar',
    dot: 'bg-rep-orange',
    pill: 'bg-rep-orange/12 text-rep-orange',
    chipOn: 'bg-rep-orange text-white border-rep-orange',
    chipOff: 'bg-white text-rep-orange border-rep-orange/30 hover:border-rep-orange',
    accent: 'border-l-rep-orange',
  },
  group_coaching: {
    label: 'Group Coaching',
    short: 'Group Coaching',
    dot: 'bg-rep-navy',
    pill: 'bg-rep-navy/12 text-rep-navy',
    chipOn: 'bg-rep-navy text-white border-rep-navy',
    chipOff: 'bg-white text-rep-navy border-rep-navy/30 hover:border-rep-navy',
    accent: 'border-l-rep-navy',
  },
  mhfa: {
    label: 'MHFA Workshops',
    short: 'MHFA',
    dot: 'bg-teal-600',
    pill: 'bg-teal-600/12 text-teal-700',
    chipOn: 'bg-teal-600 text-white border-teal-600',
    chipOff: 'bg-white text-teal-700 border-teal-600/30 hover:border-teal-600',
    accent: 'border-l-teal-600',
  },
  coaching_1on1: {
    label: 'One-on-One Coaching',
    short: '1:1 Coaching',
    dot: 'bg-purple-600',
    pill: 'bg-purple-600/12 text-purple-700',
    chipOn: 'bg-purple-600 text-white border-purple-600',
    chipOff: 'bg-white text-purple-700 border-purple-600/30 hover:border-purple-600',
    accent: 'border-l-purple-600',
  },
  f2f: {
    label: 'Face-to-Face Workshops',
    short: 'F2F Workshop',
    dot: 'bg-rep-red',
    pill: 'bg-rep-red/12 text-rep-red',
    chipOn: 'bg-rep-red text-white border-rep-red',
    chipOff: 'bg-white text-rep-red border-rep-red/30 hover:border-rep-red',
    accent: 'border-l-rep-red',
  },
}

/** Legend / filter order — deliberate, not object key order. */
export const EVENT_TYPE_ORDER = ['webinar', 'group_coaching', 'mhfa', 'coaching_1on1', 'f2f']

const WEBINARS = [
  {
    id: 'webinar-1',
    title: 'Kickoff Webinar #1',
    type: 'webinar',
    startDate: '2026-10-12',
    description: 'Program kickoff — introduction to the Resilient Educators Partnership.',
    cohort: 'all',
    location: 'online',
  },
  {
    id: 'webinar-2',
    title: 'Kickoff Webinar #2',
    type: 'webinar',
    startDate: '2027-02-15',
    description: 'Cohort 2 kickoff — introduction for teachers joining in Term 1, 2027.',
    cohort: 'cohort2',
    location: 'online',
  },
  {
    id: 'webinar-3',
    title: 'Webinar #3',
    type: 'webinar',
    startDate: '2027-04-19',
    startTime: '17:00',
    endTime: '18:00',
    description: 'Whole-program webinar.',
    cohort: 'all',
    location: 'online',
  },
  {
    id: 'webinar-4',
    title: 'Webinar #4',
    type: 'webinar',
    startDate: '2027-07-19',
    startTime: '17:00',
    endTime: '18:00',
    description: 'Whole-program webinar.',
    cohort: 'all',
    location: 'online',
  },
]

const F2F_WORKSHOPS = [
  {
    id: 'f2f-1',
    title: 'Face-to-Face Workshop #1',
    type: 'f2f',
    startDate: '2026-10-22',
    description: 'Full-day in-person workshop.',
    cohort: 'all',
    location: 'in-person',
  },
  {
    id: 'f2f-2',
    title: 'Face-to-Face Workshop #2',
    type: 'f2f',
    startDate: '2027-02-25',
    description: 'Full-day in-person workshop. Mandatory for Cohort 2, optional for Cohort 1.',
    cohort: 'all',
    location: 'in-person',
  },
  {
    id: 'f2f-3',
    title: 'Final Wrap-Up Workshop',
    type: 'f2f',
    startDate: '2027-09-09',
    description: 'Full-day in-person workshop closing the program.',
    cohort: 'all',
    location: 'in-person',
  },
]

/**
 * MHFA runs as a 2-day certification — one booking covering both days, which is
 * why the session cards count it as a single booking.
 */
const MHFA_SCHEDULE = [
  { n: 1, startDate: '2026-10-26', endDate: '2026-10-27', location: 'in-person', term: 'Term 4, 2026' },
  { n: 2, startDate: '2026-11-05', endDate: '2026-11-06', location: 'in-person', term: 'Term 4, 2026' },
  { n: 3, startDate: '2026-11-09', endDate: '2026-11-10', location: 'online', term: 'Term 4, 2026' },
  { n: 4, startDate: '2027-03-01', endDate: '2027-03-02', location: 'in-person', term: 'Term 1, 2027' },
  { n: 5, startDate: '2027-03-04', endDate: '2027-03-05', location: 'in-person', term: 'Term 1, 2027' },
  { n: 6, startDate: '2027-03-08', endDate: '2027-03-09', location: 'online', term: 'Term 1, 2027' },
  { n: 7, startDate: '2027-07-26', endDate: '2027-07-27', location: 'in-person', term: 'Term 3, 2027' },
  { n: 8, startDate: '2027-07-29', endDate: '2027-07-30', location: 'in-person', term: 'Term 3, 2027' },
  { n: 9, startDate: '2027-08-02', endDate: '2027-08-03', location: 'online', term: 'Term 3, 2027' },
  { n: 10, startDate: '2027-08-05', endDate: '2027-08-06', location: 'in-person', term: 'Term 3, 2027' },
  { n: 11, startDate: '2027-08-09', endDate: '2027-08-10', location: 'online', term: 'Term 3, 2027' },
  { n: 12, startDate: '2027-08-12', endDate: '2027-08-13', location: 'in-person', term: 'Term 3, 2027' },
]

const MHFA_WORKSHOPS = MHFA_SCHEDULE.map(({ n, startDate, endDate, location, term }) => ({
  id: `mhfa-${n}`,
  title: `MHFA Workshop #${n}`,
  type: 'mhfa',
  startDate,
  endDate,
  description: `Two-day Mental Health First Aid certification (${term}). One booking covers both days.`,
  cohort: 'all',
  capacity: 24,
  location,
}))

/**
 * Coaching groups. Each group meets three times across the program, always on
 * the same weekday at the same time — so the schedule is expressed once per
 * group and expanded below rather than written out 48 times.
 *
 * Exported: the sessions page renders these directly, and deriving both the
 * calendar events and the group cards from one list stops the two drifting.
 *
 * `meaning` is the tree's significance. The roadmap only supplies it for the
 * four Cohort 1 groups, so E–P carry none rather than invented copy.
 */
export const GROUP_CAPACITY = 12

export const COACHING_GROUPS = [
  // --- Cohort 1: groups A–D ---
  { code: 'A', meaning: 'Resilience, adaptability, new beginnings', name: 'Acacia', cohort: 'cohort1', startTime: '07:30', endTime: '08:30', dates: ['2026-10-27', '2027-02-16', '2027-04-27'] },
  { code: 'B', meaning: 'Strength, regeneration, perseverance', name: 'Banksia', cohort: 'cohort1', startTime: '16:30', endTime: '17:30', dates: ['2026-11-04', '2027-02-24', '2027-05-05'] },
  { code: 'C', meaning: 'Endurance, shelter, community', name: 'Coolibah', cohort: 'cohort1', startTime: '07:30', endTime: '08:30', dates: ['2026-11-10', '2027-03-02', '2027-05-11'] },
  { code: 'D', meaning: 'Standing strong through adversity', name: 'Desert Oak', cohort: 'cohort1', startTime: '16:30', endTime: '17:30', dates: ['2026-11-18', '2027-03-10', '2027-05-19'] },

  // --- Cohort 2: groups E–P ---
  { code: 'E', name: 'Eucalyptus', cohort: 'cohort2', startTime: '07:30', endTime: '08:30', dates: ['2027-02-16', '2027-04-27', '2027-07-27'] },
  { code: 'F', name: 'Frangipani', cohort: 'cohort2', startTime: '16:30', endTime: '17:30', dates: ['2027-02-16', '2027-04-27', '2027-07-27'] },
  { code: 'G', name: 'Ghost Gum', cohort: 'cohort2', startTime: '07:30', endTime: '08:30', dates: ['2027-02-24', '2027-05-05', '2027-08-04'] },
  { code: 'H', name: 'Huon Pine', cohort: 'cohort2', startTime: '16:30', endTime: '17:30', dates: ['2027-02-24', '2027-05-05', '2027-08-04'] },
  { code: 'I', name: 'Illawarra Flame Tree', cohort: 'cohort2', startTime: '07:30', endTime: '08:30', dates: ['2027-03-02', '2027-05-11', '2027-08-10'] },
  { code: 'J', name: 'Jarrah', cohort: 'cohort2', startTime: '16:30', endTime: '17:30', dates: ['2027-03-02', '2027-05-11', '2027-08-10'] },
  { code: 'K', name: 'Kurrajong', cohort: 'cohort2', startTime: '07:30', endTime: '08:30', dates: ['2027-03-10', '2027-05-19', '2027-08-18'] },
  { code: 'L', name: 'Lilly Pilly', cohort: 'cohort2', startTime: '16:30', endTime: '17:30', dates: ['2027-03-10', '2027-05-19', '2027-08-18'] },
  { code: 'M', name: 'Melaleuca/Paperbark', cohort: 'cohort2', startTime: '07:30', endTime: '08:30', dates: ['2027-03-16', '2027-05-25', '2027-08-24'] },
  { code: 'N', name: 'Norfolk Island Pine', cohort: 'cohort2', startTime: '16:30', endTime: '17:30', dates: ['2027-03-16', '2027-05-25', '2027-08-24'] },
  { code: 'O', name: 'Orange Thorn', cohort: 'cohort2', startTime: '07:30', endTime: '08:30', dates: ['2027-03-24', '2027-06-02', '2027-09-01'] },
  { code: 'P', name: 'Peppermint Gum', cohort: 'cohort2', startTime: '16:30', endTime: '17:30', dates: ['2027-03-24', '2027-06-02', '2027-09-01'] },
]

const GROUP_COACHING = COACHING_GROUPS.flatMap((g) =>
  g.dates.map((date, i) => ({
    id: `gc-${g.code}-${i + 1}`,
    title: `Group Coaching — ${g.code} (${g.name})`,
    type: 'group_coaching',
    startDate: date,
    startTime: g.startTime,
    endTime: g.endTime,
    description: `Session ${i + 1} of 3 for coaching group ${g.code} — ${g.name}.`,
    cohort: g.cohort,
    location: 'online',
    group: `${g.code} - ${g.name}`,
  }))
)

/**
 * One-on-one coaching has no fixed roadmap dates — each teacher books their
 * own 2–3 sessions. The type still exists so booked sessions can be merged in
 * once booking lands, and so the legend explains the colour.
 */
const ONE_ON_ONE_COACHING = []

export const ROADMAP_EVENTS = [
  ...WEBINARS,
  ...F2F_WORKSHOPS,
  ...MHFA_WORKSHOPS,
  ...GROUP_COACHING,
  ...ONE_ON_ONE_COACHING,
]

export default ROADMAP_EVENTS
