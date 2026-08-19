import { useEffect, useState } from 'react'
import { COACHES, MHFA_BOOKING_URL } from '../data/coachingLinks.js'
import { CalendarPlusIcon, CloseIcon, PersonIcon } from './icons.jsx'

/**
 * Booking modal for the two session types that are booked externally.
 *
 * mode 'coaching' — pick one of four coaches, opens their Calendly page.
 * mode 'mhfa'     — single MHFA booking link, or a not-yet-available notice.
 *
 * Calendly is opened in a new tab rather than embedded: inside the Canvas
 * iframe the dashboard is already a nested browsing context, and Calendly's
 * frame-ancestors policy would refuse a second level of nesting.
 */

/**
 * Opens an external booking page. Returns false if the browser blocked it.
 *
 * 'noopener,noreferrer' matters here — without noopener the opened page gets a
 * window.opener handle back into the dashboard and can navigate this tab away.
 *
 * Popup blockers usually allow a window opened from a click, but not always
 * inside an iframe. window.open returns null when blocked, and the caller shows
 * a real link instead of claiming a tab opened that never did.
 */
function openBooking(url) {
  const win = window.open(url, '_blank', 'noopener,noreferrer')
  return Boolean(win)
}

function CoachCard({ coach, onOpen }) {
  return (
    <li className="rounded-xl border border-gray-200 p-3 transition-colors hover:border-rep-orange">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rep-orange/15 text-rep-orange">
          <PersonIcon className="h-4 w-4" />
        </span>
        <p className="min-w-0 font-body text-sm font-semibold text-rep-navy">{coach.name}</p>
      </div>

      <button
        type="button"
        onClick={() => onOpen(coach)}
        className="mt-3 w-full rounded-lg bg-rep-orange px-3 py-2 font-body text-xs font-semibold text-white transition-opacity hover:opacity-90"
      >
        Book with this coach
      </button>
    </li>
  )
}

export default function BookingModal({ mode, onClose }) {
  // { name, url, blocked } once a booking has been attempted, so the teacher is
  // told what happened — including when the browser blocked the new tab.
  const [attempt, setAttempt] = useState(null)

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const isCoaching = mode === 'coaching'

  const handleCoach = (coach) => {
    const ok = openBooking(coach.calendlyUrl)
    setAttempt({ name: coach.name, url: coach.calendlyUrl, blocked: !ok })
  }

  const handleMhfa = () => {
    const ok = openBooking(MHFA_BOOKING_URL)
    setAttempt({ name: 'MHFA workshop', url: MHFA_BOOKING_URL, blocked: !ok })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-title"
        className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 rounded-md p-1 text-gray-400 transition-colors hover:bg-black/5 hover:text-rep-navy"
        >
          <CloseIcon className="h-4 w-4" />
        </button>

        <h2 id="booking-title" className="pr-8 font-heading text-base font-bold text-rep-navy">
          {isCoaching ? 'Book a 1:1 Coaching Session' : 'Book MHFA Workshop'}
        </h2>
        <p className="mt-1 font-body text-sm text-gray-500">
          {isCoaching
            ? 'Choose your coach to book one of your 2 sessions'
            : '2-day Mental Health First Aid certification — limited to 24 per session'}
        </p>

        {isCoaching ? (
          <ul className="mt-4 space-y-2">
            {COACHES.map((coach) => (
              <CoachCard key={coach.id} coach={coach} onOpen={handleCoach} />
            ))}
          </ul>
        ) : (
          <div className="mt-4">
            {MHFA_BOOKING_URL ? (
              <button
                type="button"
                onClick={handleMhfa}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-rep-orange px-4 py-2.5 font-body text-sm font-semibold text-white transition-opacity hover:opacity-90"
              >
                <CalendarPlusIcon className="h-4 w-4" />
                Book your MHFA session
              </button>
            ) : (
              <div className="rounded-xl bg-rep-bg p-6 text-center">
                <CalendarPlusIcon className="mx-auto h-8 w-8 text-gray-300" />
                <p className="mt-2 font-body text-sm text-gray-500">
                  MHFA booking will be available soon
                </p>
              </div>
            )}
          </div>
        )}

        {attempt &&
          (attempt.blocked ? (
            <p className="mt-4 rounded-lg bg-rep-red/10 px-3 py-2.5 font-body text-xs leading-relaxed text-rep-navy">
              Your browser blocked the new tab.{' '}
              <a
                href={attempt.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-rep-orange underline"
              >
                Open the booking page
              </a>{' '}
              to continue.
            </p>
          ) : (
            <p className="mt-4 rounded-lg bg-rep-orange/10 px-3 py-2.5 font-body text-xs leading-relaxed text-rep-navy">
              Booking opened in a new tab. You'll receive a confirmation email from Calendly once
              your booking is confirmed.
            </p>
          ))}
      </div>
    </div>
  )
}
