/**
 * Calendly booking links.
 *
 * No API involved — these open in a new tab and the booking happens entirely on
 * Calendly. Nothing here is fetched, and the dashboard learns nothing about a
 * booking until n8n writes it into the Canvas Calendar (read back by
 * GET /api/calendar).
 */
export const COACHES = [
  {
    id: 'coach-1',
    name: 'Coach #1 — Johanna Crichton',
    calendlyUrl: 'https://calendly.com/johanna-crichton/coaching',
  },
  {
    id: 'coach-2',
    name: 'Coach #2 — TBA',
    calendlyUrl: 'https://calendly.com/johanna-crichton/rep-1-1-coach-1-clone',
  },
  {
    id: 'coach-3',
    name: 'Coach #3 — TBA',
    calendlyUrl: 'https://calendly.com/johanna-crichton/rep-1-1-coach-2-clone',
  },
  {
    id: 'coach-4',
    name: 'Coach #4 — TBA',
    calendlyUrl: 'https://calendly.com/johanna-crichton/rep-1-1-coach-3-clone',
  },
]

/** MHFA link — placeholder until the client provides it. */
export const MHFA_BOOKING_URL = null
