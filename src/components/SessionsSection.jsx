// BOOKING FUNCTIONALITY — MILESTONE 2 SCOPE. Visual only, not wired to Calendly/Zoom yet.
//
// The "Book your sessions" buttons stay disabled until then. The schedule
// buttons are different: those dates are already published in the roadmap, so
// they link straight to the calendar.
import { Link } from 'react-router-dom'
import { CalendarPlusIcon, MapPinIcon, PeopleIcon, PersonIcon, VideoIcon } from './icons.jsx'

// Placeholder counts — no booking data source exists until Milestone 2.
// Totals track the program roadmap, not Canvas: nothing here is fetched.
const SESSIONS = [
  {
    key: 'mhfa',
    // One booking covers the 2-day certification.
    title: 'Mental Health First Aid Sessions',
    count: '0 of 1 booked',
    cta: 'Book your sessions',
    Icon: CalendarPlusIcon,
  },
  {
    key: 'coaching',
    title: 'One-on-One Coaching Sessions',
    count: '0 of 2 booked',
    cta: 'Book your sessions',
    Icon: PersonIcon,
  },
  {
    key: 'workshops',
    title: 'Group Coaching Sessions',
    count: '0 of 3 included',
    cta: 'See schedule',
    to: '/calendar',
    Icon: PeopleIcon,
  },
  {
    key: 'webinars',
    title: 'Webinars',
    count: '0 of 4 attended',
    cta: 'View schedule',
    to: '/calendar',
    Icon: VideoIcon,
  },
  {
    key: 'f2f',
    title: 'Face-to-Face Workshops',
    count: '0 of 2 attended',
    cta: 'View schedule',
    to: '/calendar',
    Icon: MapPinIcon,
  },
]

function SessionCard({ session }) {
  const { title, count, cta, to, Icon } = session

  return (
    <div className="flex flex-col rounded-2xl bg-white p-5 shadow-md">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-rep-orange/15 text-rep-orange">
        <Icon className="h-5 w-5" />
      </div>

      <h3 className="mt-3 font-heading text-sm font-bold leading-snug text-rep-navy">{title}</h3>
      <p className="mt-1 font-body text-xs text-gray-500">{count}</p>

      {to ? (
        <Link
          to={to}
          className="mt-4 block rounded-lg bg-rep-orange px-4 py-2 text-center font-body text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          {cta}
        </Link>
      ) : (
        <div className="group relative mt-4">
          <button
            type="button"
            disabled
            title="Coming soon"
            className="w-full cursor-not-allowed rounded-lg bg-rep-orange px-4 py-2 font-body text-sm font-semibold text-white opacity-40"
          >
            {cta}
          </button>
          <span className="pointer-events-none absolute -top-2 right-2 rounded-full bg-rep-navy px-2 py-0.5 font-body text-[10px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
            Coming soon
          </span>
        </div>
      )}
    </div>
  )
}

export default function SessionsSection() {
  return (
    <section>
      <h2 className="mb-3 font-heading text-lg font-semibold text-rep-navy">
        Your Included Sessions
      </h2>
      {/* Five cards: 1 col on mobile, 2 on tablet, 3 on desktop (3 + 2 rows). */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SESSIONS.map((s) => (
          <SessionCard key={s.key} session={s} />
        ))}
      </div>
    </section>
  )
}
