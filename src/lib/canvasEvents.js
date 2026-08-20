/**
 * Canvas Calendar events -> the shape the calendar page already renders.
 *
 * These are the teacher's personal bookings: n8n writes Calendly bookings into
 * the Canvas Calendar, and GET /api/calendar reads them back. That route
 * already normalises Canvas' snake_case into camelCase, so the field names
 * here are startAt/endAt/location, not start_at/location_name.
 */

/**
 * Session type inferred from the event title, since Canvas has no such field.
 * Order matters: a title could contain both words, and MHFA is the more
 * specific claim.
 */
export function canvasEventType(title = '') {
  if (/mhfa|mental health first aid/i.test(title)) return 'mhfa'
  // 'coach', not 'coaching': real bookings written by n8n are titled both
  // "REP 1:1 Coaching Session" and "REP 1:1 Coach #1", and the shorter form
  // would otherwise fall through and render as a webinar.
  if (/coach/i.test(title)) return 'coaching_1on1'
  return 'webinar'
}

/**
 * Canvas' location_name is free text. n8n writes "Zoom" for online bookings,
 * so a non-empty location does not by itself mean a physical venue.
 */
const ONLINE_LOCATION = /^\s*(zoom|online|virtual|teams|google meet|meet|webinar)\b/i

export function canvasLocationKind(locationName) {
  if (!locationName || !locationName.trim()) return 'online'
  return ONLINE_LOCATION.test(locationName) ? 'online' : 'in-person'
}

const pad = (n) => String(n).padStart(2, '0')

/**
 * ISO instant -> local 'YYYY-MM-DD' and 'HH:mm'.
 *
 * Canvas returns UTC instants ("2027-04-19T07:00:00Z"), unlike roadmap dates
 * which are bare calendar days. Converting through the local timezone is what
 * puts a booking on the day the teacher actually sees it in Canvas.
 */
export function splitInstant(iso) {
  if (!iso) return { date: null, time: null }
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { date: null, time: null }
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  }
}

/**
 * One /api/calendar row -> a calendar-page event, or null if it has no usable
 * start (an undated Canvas event cannot be placed on a grid).
 */
export function mapCanvasEvent(raw) {
  const start = splitInstant(raw?.startAt)
  if (!start.date) return null

  const end = splitInstant(raw?.endAt)
  const allDay = Boolean(raw.allDay)

  return {
    id: `canvas-${raw.id}`,
    title: raw.title ?? 'Untitled booking',
    type: canvasEventType(raw.title ?? ''),
    startDate: start.date,
    // Only span days when Canvas actually says so; a same-day end would
    // otherwise render the event twice on the grid.
    endDate: end.date && end.date !== start.date ? end.date : undefined,
    startTime: allDay ? undefined : (start.time ?? undefined),
    endTime: allDay ? undefined : (end.time ?? undefined),
    descriptionHtml: raw.description ?? null,
    location: canvasLocationKind(raw.location),
    locationName: raw.location ?? null,
    canvasUrl: raw.url ?? null,
    cohort: 'all',
    source: 'canvas',
  }
}

/* ---------- description HTML ---------- */

// Enough to render an n8n-authored booking note and its Zoom link, and nothing
// that can execute. Everything outside this list is unwrapped to its text.
const ALLOWED_TAGS = new Set(['a', 'b', 'strong', 'i', 'em', 'p', 'br', 'ul', 'ol', 'li', 'span', 'div'])

/** Only http(s) and mailto links survive; javascript: and data: are dropped. */
function safeHref(value = '') {
  return /^(https?:\/\/|mailto:)/i.test(value.trim()) ? value.trim() : null
}

/**
 * Conservative allowlist sanitiser for Canvas event descriptions.
 *
 * The description is rendered with dangerouslySetInnerHTML so the Zoom link
 * stays clickable. It is *expected* to come from our own n8n workflow, but it
 * arrives via a Canvas field that an account admin could also write, so it is
 * not treated as trusted markup. Every attribute is dropped except a safe href,
 * which removes on* handlers and javascript: URLs as a class of problem rather
 * than blocklisting them one by one.
 */
export function sanitizeDescriptionHtml(html) {
  if (!html || typeof html !== 'string') return ''

  return (
    html
      // Script/style content must go entirely, not just its tags.
      .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, '')
      .replace(/<(script|style)\b[^>]*>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      // Rebuild every remaining tag from scratch, keeping only what is allowed.
      .replace(/<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (_all, slash, rawName, attrs) => {
        const name = rawName.toLowerCase()
        if (!ALLOWED_TAGS.has(name)) return '' // unwrap: tag dropped, text kept
        if (slash) return `</${name}>`
        if (name === 'br') return '<br />'

        if (name === 'a') {
          const match = /href\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(attrs)
          const href = safeHref(match?.[2] ?? match?.[3] ?? match?.[4] ?? '')
          return href
            ? `<a href="${href.replace(/"/g, '&quot;')}" target="_blank" rel="noopener noreferrer">`
            : '<a>'
        }

        return `<${name}>`
      })
  )
}

/**
 * The first zoom.us link in a description, or null.
 *
 * Entities are decoded: Canvas stores the href as "...?pwd=x&amp;omn=y", and
 * handing that to an href attribute would put a literal "&amp;" in the query
 * string and break the join link.
 */
export function decodeEntities(text = '') {
  return text
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
}

export function extractZoomUrl(html) {
  if (!html || typeof html !== 'string') return null
  const match = /https?:\/\/[a-z0-9.-]*zoom\.us\/[^\s"'<>]+/i.exec(html)
  if (!match) return null
  return decodeEntities(match[0]).replace(/[.,;)]+$/, '')
}

/* ---------- merge ---------- */

/** Same day + same title means the same session. */
const dedupeKey = (e) => `${e.startDate}|${(e.title ?? '').trim().toLowerCase()}`

/**
 * Roadmap events plus the teacher's Canvas bookings.
 *
 * A Canvas booking that matches a roadmap event is folded into it rather than
 * added alongside: the roadmap entry keeps its cohort and capacity metadata,
 * and gains the booking's description, Zoom link, and 'booked' marker. Only
 * bookings with no roadmap counterpart become new entries.
 */
export function mergeCanvasEvents(roadmapEvents, canvasEvents) {
  const byKey = new Map()
  for (const e of roadmapEvents) byKey.set(dedupeKey(e), e)

  const merged = [...roadmapEvents]

  for (const canvasEvent of canvasEvents) {
    const key = dedupeKey(canvasEvent)
    const existing = byKey.get(key)

    // Fold into a ROADMAP twin only. Two bookings can legitimately share a
    // title and a day at different times — n8n writes several "REP 1:1 Coach #1"
    // events — and collapsing those would hide a session the teacher booked.
    if (existing && existing.source !== 'canvas') {
      const enriched = {
        ...existing,
        source: 'canvas',
        booked: true,
        descriptionHtml: canvasEvent.descriptionHtml ?? existing.descriptionHtml ?? null,
        canvasUrl: canvasEvent.canvasUrl ?? null,
        // A booking's real time beats the roadmap's placeholder.
        startTime: canvasEvent.startTime ?? existing.startTime,
        endTime: canvasEvent.endTime ?? existing.endTime,
      }
      merged[merged.indexOf(existing)] = enriched
      byKey.set(key, enriched)
      continue
    }

    const fresh = { ...canvasEvent, booked: true }
    merged.push(fresh)
    byKey.set(key, fresh)
  }

  return merged
}

/** First and last day of a month as 'YYYY-MM-DD', for the API date range. */
export function monthRange(year, month) {
  const last = new Date(year, month + 1, 0).getDate()
  return {
    startDate: `${year}-${pad(month + 1)}-01`,
    endDate: `${year}-${pad(month + 1)}-${pad(last)}`,
  }
}
