// Three kinds of card, distinguished by which field a session carries:
//   `to`    — schedule is already published; links into the calendar.
//   `books` — booked externally on Calendly; opens BookingModal in that mode.
//   neither — nothing to do yet; stays disabled with a "Coming soon" hint.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import BookingModal from './BookingModal.jsx'
import { useProfile } from '../context/ProfileContext.jsx'
import {
  CalendarPlusIcon,
  CheckIcon,
  MapPinIcon,
  PeopleIcon,
  PersonIcon,
  VideoIcon,
} from './icons.jsx'

// `total` is the program allowance from the roadmap and never changes.
// `booked` comes from /api/bookings/summary; these values are the fallback used
// while it loads, and when there is no LTI session to count bookings for.
const SESSIONS = [
  {
    key: 'mhfa',
    // One booking covers the 2-day certification.
    title: 'Mental Health First Aid Sessions',
    summaryKey: 'mhfa',
    total: 1,
    unit: 'booked',
    cta: 'Book your sessions',
    books: 'mhfa',
    Icon: CalendarPlusIcon,
  },
  {
    key: 'coaching',
    title: 'One-on-One Coaching Sessions',
    summaryKey: 'coaching_1on1',
    total: 2,
    unit: 'booked',
    cta: 'Book your sessions',
    books: 'coaching',
    Icon: PersonIcon,
  },
  {
    key: 'workshops',
    title: 'Group Coaching Sessions',
    summaryKey: 'group_coaching',
    total: 3,
    unit: 'included',
    cta: 'See schedule',
    to: '/calendar',
    Icon: PeopleIcon,
  },
  {
    key: 'webinars',
    title: 'Webinars',
    summaryKey: 'webinars',
    total: 4,
    unit: 'attended',
    cta: 'View schedule',
    to: '/calendar',
    Icon: VideoIcon,
  },
  {
    key: 'f2f',
    title: 'Face-to-Face Workshops',
    summaryKey: 'f2f',
    total: 2,
    unit: 'attended',
    cta: 'View schedule',
    to: '/calendar',
    Icon: MapPinIcon,
  },
]

function SessionCard({ session, summary, loading, onBook }) {
  const { title, summaryKey, total, unit, cta, to, books, Icon } = session

  // Live count when we have it; the roadmap total is authoritative either way.
  const booked = summary?.[summaryKey]?.booked ?? 0
  const shownTotal = summary?.[summaryKey]?.total ?? total

  // Soft limit: only the externally-booked cards (1:1 and MHFA) have an
  // allowance to use up. The schedule cards link to the calendar instead and
  // have nothing to disable. Left enabled while counting, so the common case —
  // a teacher with sessions left — never flickers into a disabled state.
  const atLimit = Boolean(books) && !loading && booked >= shownTotal

  return (
    <div className="flex flex-col rounded-2xl bg-white p-5 shadow-md">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-rep-orange/15 text-rep-orange">
        <Icon className="h-5 w-5" />
      </div>

      <h3 className="mt-3 font-heading text-sm font-bold leading-snug text-rep-navy">{title}</h3>

      {/* A skeleton while counting, so the card never shows 0 and then jumps. */}
      {loading ? (
        <span
          className="mt-1.5 block h-3 w-24 animate-pulse rounded bg-gray-100"
          aria-label={`Counting ${title}`}
        />
      ) : (
        <p className="mt-1 font-body text-xs text-gray-500">
          {booked} of {shownTotal} {unit}
        </p>
      )}

      {to ? (
        <Link
          to={to}
          className="mt-4 block rounded-lg bg-rep-orange px-4 py-2 text-center font-body text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          {cta}
        </Link>
      ) : books ? (
        atLimit ? (
          <button
            type="button"
            disabled
            title={`You have booked all ${shownTotal} of your sessions`}
            className="mt-4 flex w-full cursor-not-allowed items-center justify-center gap-1.5 rounded-lg bg-green-50 px-4 py-2 font-body text-sm font-semibold text-green-700"
          >
            <CheckIcon className="h-4 w-4" />
            All sessions booked
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onBook(books)}
            className="mt-4 w-full rounded-lg bg-rep-orange px-4 py-2 font-body text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            {cta}
          </button>
        )
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
  // null, or the BookingModal mode currently open ('coaching' | 'mhfa').
  const [booking, setBooking] = useState(null)

  // The Canvas id travels to Calendly as utm_content so n8n can tie a booking
  // back to this teacher. It lives on the profile, not the dashboard data
  // context — same source as the "Welcome, <name>" heading.
  const { user } = useProfile()

  // Booked counts from the teacher's Canvas Calendar. null = not loaded, in
  // which case the cards fall back to the roadmap totals with zero booked.
  const [summary, setSummary] = useState(null)
  const [counting, setCounting] = useState(true)

  useEffect(() => {
    const controller = new AbortController()

    fetch('/api/bookings/summary', { credentials: 'include', signal: controller.signal })
      .then((res) => {
        // 401 = standalone mode, no session to count bookings against.
        if (res.status === 401) return null
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => {
        if (data) setSummary(data)
        setCounting(false)
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        // The cards still render their roadmap totals, so this is not fatal.
        console.warn(`[sessions] booking counts unavailable: ${err.message}`)
        setCounting(false)
      })

    return () => controller.abort()
  }, [])

  return (
    <section>
      <h2 className="mb-3 font-heading text-lg font-semibold text-rep-navy">
        Your Included Sessions
      </h2>
      {/* Five cards: 1 col on mobile, 2 on tablet, 3 on desktop (3 + 2 rows). */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SESSIONS.map((s) => (
          <SessionCard
            key={s.key}
            session={s}
            summary={summary}
            loading={counting}
            onBook={setBooking}
          />
        ))}
      </div>

      {booking && (
        <BookingModal
          mode={booking}
          canvasUserId={user?.id}
          onClose={() => setBooking(null)}
        />
      )}
    </section>
  )
}
