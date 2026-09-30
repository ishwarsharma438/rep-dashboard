/**
 * Session-type classification for Calendly bookings that n8n writes into the
 * Canvas Calendar.
 *
 * Extracted from routes/canvas.js unchanged so the admin aggregation can reuse
 * it without importing a route module. routes/canvas.js re-exports
 * classifyBooking, so its own behaviour and public surface are identical.
 */

/** The programme allowance per session type. */
export const BOOKING_TOTALS = {
  coaching_1on1: 2,
  mhfa: 1,
  group_coaching: 3,
  webinars: 4,
  f2f: 2,
}

/**
 * Title -> session type, most specific pattern first.
 *
 * Order carries the logic: "Group Coaching" also contains "Coaching", and
 * "MHFA Workshop" also contains "Workshop", so a flat set of rules would put
 * those events in two buckets at once. Each event is counted exactly once.
 */
const BOOKING_PATTERNS = [
  ['group_coaching', /group\s*coaching/i],
  ['mhfa', /\bmhfa\b|mental\s*health/i],
  ['coaching_1on1', /\bcoach|1:1|1-1\b/i],
  ['webinars', /webinar/i],
  ['f2f', /\bf2f\b|face[-\s]?to[-\s]?face|workshop/i],
]

export function classifyBooking(title = '') {
  for (const [type, pattern] of BOOKING_PATTERNS) {
    if (pattern.test(title)) return type
  }
  return null
}

/** An event Canvas still considers live — a deleted booking stops counting. */
export const isActiveEvent = (event) =>
  !event.workflow_state || event.workflow_state === 'active'
