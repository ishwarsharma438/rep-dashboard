import { useEffect, useMemo, useState } from 'react'
import {
  EVENT_TYPE_META,
  EVENT_TYPE_ORDER,
  ROADMAP_EVENTS,
} from '../data/roadmapEvents.js'
import {
  extractZoomUrl,
  mapCanvasEvent,
  mergeCanvasEvents,
  monthRange,
  sanitizeDescriptionHtml,
} from '../lib/canvasEvents.js'
import {
  CalendarIcon,
  CalendarPlusIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MapPinIcon,
  VideoIcon,
} from '../components/icons.jsx'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/* ---------- date helpers ----------
 * Roadmap dates are calendar days, not instants. new Date('2026-10-12') parses
 * as UTC midnight, which lands on the 11th for anyone west of Greenwich — so
 * dates are always split into parts and rebuilt in local time instead.
 */

const pad = (n) => String(n).padStart(2, '0')

/** Date -> 'YYYY-MM-DD' in local time. */
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** 'YYYY-MM-DD' -> local midnight Date. */
export function fromISO(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Every calendar day an event covers, so a 2-day MHFA shows on both. */
export function eventDateKeys(event) {
  const start = fromISO(event.startDate)
  const end = event.endDate ? fromISO(event.endDate) : start
  const keys = []
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) keys.push(toISO(d))
  return keys
}

/** '17:00' -> '5:00pm'. Left as-is if absent. */
function formatTime(hhmm) {
  if (!hhmm) return null
  const [h, m] = hhmm.split(':').map(Number)
  const suffix = h >= 12 ? 'pm' : 'am'
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}:${pad(m)}${suffix}`
}

export function formatTimeRange(event) {
  const start = formatTime(event.startTime)
  if (!start) return 'All day'
  const end = formatTime(event.endTime)
  return end ? `${start} – ${end}` : start
}

function formatLongDate(iso) {
  const d = fromISO(iso)
  return `${WEEKDAYS[(d.getDay() + 6) % 7]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/** Human span for the detail panel: single day, or 'x – y' across days. */
function formatDateSpan(event) {
  if (!event.endDate || event.endDate === event.startDate) return formatLongDate(event.startDate)
  return `${formatLongDate(event.startDate)} – ${formatLongDate(event.endDate)}`
}

/**
 * The Monday-first grid for a month, trimmed to the weeks it actually needs
 * (a 5-week month shouldn't render a trailing empty row).
 */
export function monthGrid(year, month) {
  const first = new Date(year, month, 1)
  const offset = (first.getDay() + 6) % 7 // Monday = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = Math.ceil((offset + daysInMonth) / 7) * 7

  return Array.from({ length: cells }, (_, i) => {
    const d = new Date(year, month, 1 - offset + i)
    return { date: d, iso: toISO(d), inMonth: d.getMonth() === month }
  })
}

/* ---------- .ics export ---------- */

/** RFC 5545 escaping for text values. */
const icsEscape = (s = '') =>
  String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')

/** Folds lines to 75 octets as the spec requires; long descriptions need it. */
function fold(line) {
  if (line.length <= 75) return line
  const parts = [line.slice(0, 75)]
  let rest = line.slice(75)
  while (rest.length > 74) {
    parts.push(` ${rest.slice(0, 74)}`)
    rest = rest.slice(74)
  }
  if (rest) parts.push(` ${rest}`)
  return parts.join('\r\n')
}

/**
 * Builds a single-event VCALENDAR.
 *
 * Timed events are written as floating local time (no TZID, no Z): the program
 * runs in one Australian timezone and a floating time shows as the stated clock
 * time in every client, which is what a teacher reading "5:00pm" expects.
 * All-day events use VALUE=DATE with an exclusive DTEND, per the spec.
 */
export function buildIcs(event) {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')

  const compact = (iso) => iso.replace(/-/g, '')
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Replenish//REP Dashboard//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${event.id}@rep-dashboard`,
    `DTSTAMP:${stamp}`,
  ]

  if (event.startTime) {
    const endDay = event.endDate ?? event.startDate
    lines.push(`DTSTART:${compact(event.startDate)}T${event.startTime.replace(':', '')}00`)
    if (event.endTime) lines.push(`DTEND:${compact(endDay)}T${event.endTime.replace(':', '')}00`)
  } else {
    // DTEND is exclusive for all-day events, so add a day to the last one.
    const lastDay = fromISO(event.endDate ?? event.startDate)
    lastDay.setDate(lastDay.getDate() + 1)
    lines.push(`DTSTART;VALUE=DATE:${compact(event.startDate)}`)
    lines.push(`DTEND;VALUE=DATE:${compact(toISO(lastDay))}`)
  }

  const details = [event.description, event.group ? `Group: ${event.group}` : null]
    .filter(Boolean)
    .join(' ')

  lines.push(fold(`SUMMARY:${icsEscape(event.title)}`))
  lines.push(fold(`DESCRIPTION:${icsEscape(details)}`))
  lines.push(fold(`LOCATION:${icsEscape(event.location === 'online' ? 'Online' : 'In person')}`))
  lines.push('END:VEVENT', 'END:VCALENDAR')

  return lines.join('\r\n')
}

function downloadIcs(event) {
  const blob = new Blob([buildIcs(event)], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${event.id}.ics`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/* ---------- components ---------- */

function TypeChip({ type, active, onToggle }) {
  const meta = EVENT_TYPE_META[type]
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1 font-body text-xs font-semibold transition-colors ${
        active ? meta.chipOn : meta.chipOff
      }`}
    >
      {meta.label}
    </button>
  )
}

function EventDetail({ event }) {
  const meta = EVENT_TYPE_META[event.type]
  const zoomUrl = extractZoomUrl(event.descriptionHtml)
  const descriptionHtml = useMemo(
    () => sanitizeDescriptionHtml(event.descriptionHtml),
    [event.descriptionHtml]
  )

  return (
    <li className={`rounded-xl border border-l-4 border-gray-100 bg-white p-4 ${meta.accent}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 font-body text-[10px] font-bold ${meta.pill}`}>
          {meta.short}
        </span>
        {event.cohort !== 'all' && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 font-body text-[10px] font-semibold text-gray-600">
            {event.cohort === 'cohort1' ? 'Cohort 1' : 'Cohort 2'}
          </span>
        )}
        {event.capacity && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 font-body text-[10px] font-semibold text-gray-600">
            {event.capacity} places
          </span>
        )}
        {event.booked && (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 font-body text-[10px] font-bold text-green-700">
            <CheckIcon className="h-3 w-3" />
            Booked
          </span>
        )}
      </div>

      <h3 className="mt-2 font-heading text-sm font-bold text-rep-navy">{event.title}</h3>

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-body text-xs text-gray-500">
        <span>{formatDateSpan(event)}</span>
        <span>{formatTimeRange(event)}</span>
        <span className="inline-flex items-center gap-1">
          {event.location === 'online' ? (
            <VideoIcon className="h-3.5 w-3.5" />
          ) : (
            <MapPinIcon className="h-3.5 w-3.5" />
          )}
          {event.location === 'online' ? 'Online' : 'In person'}
        </span>
      </div>

      {event.description && (
        <p className="mt-2 font-body text-xs leading-relaxed text-gray-600">{event.description}</p>
      )}

      {descriptionHtml && (
        // Sanitised in canvasEvents.js: tags are allowlisted and every
        // attribute except a safe href is stripped, so the Zoom link stays
        // clickable without the description being an injection point.
        <div
          className="mt-2 font-body text-xs leading-relaxed text-gray-600 [&_a]:font-semibold [&_a]:text-rep-orange [&_a]:underline"
          dangerouslySetInnerHTML={{ __html: descriptionHtml }}
        />
      )}

      {zoomUrl && (
        <a
          href={zoomUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 flex items-center justify-center gap-1.5 rounded-lg bg-rep-navy px-3 py-2 font-body text-xs font-semibold text-white transition-opacity hover:opacity-90"
        >
          <VideoIcon className="h-3.5 w-3.5" />
          Join via Zoom
        </a>
      )}

      <button
        type="button"
        onClick={() => downloadIcs(event)}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-rep-orange/30 px-3 py-1.5 font-body text-xs font-semibold text-rep-orange transition-colors hover:bg-rep-orange hover:text-white"
      >
        <CalendarPlusIcon className="h-3.5 w-3.5" />
        Add to calendar
      </button>
    </li>
  )
}

export default function CalendarPage() {
  const today = useMemo(() => new Date(), [])
  const todayIso = toISO(today)

  const [cursor, setCursor] = useState(() => ({
    year: today.getFullYear(),
    month: today.getMonth(),
  }))
  const [selected, setSelected] = useState(todayIso)
  // Empty set = no filter applied = show everything.
  const [hidden, setHidden] = useState(() => new Set())

  // Canvas bookings, keyed by event id and accumulated across the months the
  // teacher visits, so stepping back to an earlier month doesn't blank it.
  const [canvasEvents, setCanvasEvents] = useState(() => new Map())

  useEffect(() => {
    const controller = new AbortController()
    const { startDate, endDate } = monthRange(cursor.year, cursor.month)

    fetch(`/api/calendar?start_date=${startDate}&end_date=${endDate}`, {
      credentials: 'include',
      signal: controller.signal,
    })
      .then((res) => {
        // 401 = standalone mode with no LTI session. There are simply no
        // personal bookings to show, which is not an error worth surfacing.
        if (res.status === 401) return []
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((rows) => {
        const mapped = (Array.isArray(rows) ? rows : []).map(mapCanvasEvent).filter(Boolean)
        if (mapped.length === 0) return

        setCanvasEvents((current) => {
          const next = new Map(current)
          for (const e of mapped) next.set(e.id, e)
          return next
        })
      })
      .catch((err) => {
        // Never blocks the roadmap calendar — it renders without Canvas either way.
        if (err.name !== 'AbortError') console.warn(`[calendar] Canvas events unavailable: ${err.message}`)
      })

    return () => controller.abort()
  }, [cursor])

  const allEvents = useMemo(
    () => mergeCanvasEvents(ROADMAP_EVENTS, [...canvasEvents.values()]),
    [canvasEvents]
  )

  const visibleEvents = useMemo(
    () => allEvents.filter((e) => !hidden.has(e.type)),
    [allEvents, hidden]
  )

  /** 'YYYY-MM-DD' -> events on that day, multi-day events on each of their days. */
  const eventsByDate = useMemo(() => {
    const map = new Map()
    for (const event of visibleEvents) {
      for (const key of eventDateKeys(event)) {
        if (!map.has(key)) map.set(key, [])
        map.get(key).push(event)
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''))
    }
    return map
  }, [visibleEvents])

  const cells = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor])
  const selectedEvents = selected ? (eventsByDate.get(selected) ?? []) : []

  /** First event on or after today — used when the open month has nothing in it. */
  const nextEvent = useMemo(() => {
    const upcoming = visibleEvents
      .filter((e) => (e.endDate ?? e.startDate) >= todayIso)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
    return upcoming[0] ?? null
  }, [visibleEvents, todayIso])

  const monthHasEvents = cells.some((c) => c.inMonth && eventsByDate.has(c.iso))
  const bookedCount = visibleEvents.filter((e) => e.booked).length

  const step = (delta) =>
    setCursor(({ year, month }) => {
      const d = new Date(year, month + delta, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })

  const jumpTo = (iso) => {
    const d = fromISO(iso)
    setCursor({ year: d.getFullYear(), month: d.getMonth() })
    setSelected(iso)
  }

  const toggleType = (type) =>
    setHidden((current) => {
      const next = new Set(current)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold text-rep-navy sm:text-3xl">Calendar</h1>
        <span className="font-body text-sm text-gray-500">
          {visibleEvents.length} {visibleEvents.length === 1 ? 'event' : 'events'}
          {bookedCount > 0 ? ` · ${bookedCount} booked` : ''}
        </span>
      </div>

      {/* Filters */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setHidden(new Set())}
          aria-pressed={hidden.size === 0}
          className={`rounded-full border px-3 py-1 font-body text-xs font-semibold transition-colors ${
            hidden.size === 0
              ? 'border-rep-navy bg-rep-navy text-white'
              : 'border-gray-300 bg-white text-gray-600 hover:border-rep-navy'
          }`}
        >
          All
        </button>
        {EVENT_TYPE_ORDER.map((type) => (
          <TypeChip
            key={type}
            type={type}
            active={!hidden.has(type)}
            onToggle={() => toggleType(type)}
          />
        ))}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* ---- Month grid ---- */}
        <div className="rounded-2xl bg-white p-4 shadow-md sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-heading text-lg font-semibold text-rep-navy">
              {MONTHS[cursor.month]} {cursor.year}
            </h2>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label="Previous month"
                className="rounded-md p-1.5 text-rep-navy transition-colors hover:bg-black/5"
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => jumpTo(todayIso)}
                className="rounded-md px-2.5 py-1 font-body text-xs font-semibold text-rep-orange transition-colors hover:bg-rep-orange/10"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                aria-label="Next month"
                className="rounded-md p-1.5 text-rep-navy transition-colors hover:bg-black/5"
              >
                <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-7 gap-px">
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                className="pb-1.5 text-center font-body text-[10px] font-semibold uppercase tracking-wide text-gray-400"
              >
                {d}
              </div>
            ))}

            {cells.map(({ iso, date, inMonth }) => {
              const dayEvents = eventsByDate.get(iso) ?? []
              const isToday = iso === todayIso
              const isSelected = iso === selected

              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => setSelected(iso)}
                  aria-label={`${formatLongDate(iso)}, ${dayEvents.length} events`}
                  aria-pressed={isSelected}
                  className={`min-h-[4.25rem] rounded-lg border p-1 text-left align-top transition-colors sm:min-h-[5.5rem] ${
                    isSelected
                      ? 'border-rep-orange bg-rep-orange/5'
                      : 'border-gray-100 hover:border-rep-orange/40'
                  } ${inMonth ? '' : 'opacity-40'}`}
                >
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full font-body text-xs ${
                      isToday ? 'bg-rep-orange font-bold text-white' : 'text-rep-navy'
                    }`}
                  >
                    {date.getDate()}
                  </span>

                  {/* Pills on tablet and up; a dot row keeps mobile cells legible. */}
                  <span className="mt-1 hidden flex-col gap-0.5 sm:flex">
                    {dayEvents.slice(0, 2).map((e) => (
                      <span
                        key={e.id}
                        className={`flex items-center gap-0.5 truncate rounded px-1 py-0.5 font-body text-[9px] font-semibold leading-tight ${EVENT_TYPE_META[e.type].pill}`}
                      >
                        {e.booked && <CheckIcon className="h-2 w-2 shrink-0" />}
                        <span className="truncate">{e.title}</span>
                      </span>
                    ))}
                    {dayEvents.length > 2 && (
                      <span className="px-1 font-body text-[9px] font-semibold text-gray-400">
                        +{dayEvents.length - 2} more
                      </span>
                    )}
                  </span>

                  <span className="mt-1 flex flex-wrap gap-0.5 sm:hidden">
                    {dayEvents.slice(0, 4).map((e) => (
                      <span
                        key={e.id}
                        className={`h-1.5 w-1.5 rounded-full ${EVENT_TYPE_META[e.type].dot}`}
                      />
                    ))}
                  </span>
                </button>
              )
            })}
          </div>

          {!monthHasEvents && nextEvent && (
            <p className="mt-4 border-t border-gray-100 pt-3 font-body text-xs text-gray-500">
              Nothing scheduled this month.{' '}
              <button
                type="button"
                onClick={() => jumpTo(nextEvent.startDate)}
                className="font-semibold text-rep-orange hover:underline"
              >
                Jump to {nextEvent.title} on {formatLongDate(nextEvent.startDate)} →
              </button>
            </p>
          )}

          {/* Legend */}
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-gray-100 pt-3">
            {EVENT_TYPE_ORDER.map((type) => (
              <span key={type} className="inline-flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-full ${EVENT_TYPE_META[type].dot}`} />
                <span className="font-body text-[11px] text-gray-600">
                  {EVENT_TYPE_META[type].label}
                </span>
              </span>
            ))}
            {bookedCount > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <CheckIcon className="h-3 w-3 text-green-600" />
                <span className="font-body text-[11px] text-gray-600">Your booking</span>
              </span>
            )}
          </div>
        </div>

        {/* ---- Day detail ---- */}
        <aside className="rounded-2xl bg-white p-4 shadow-md sm:p-5">
          <h2 className="font-heading text-sm font-bold text-rep-navy">
            {selected ? formatLongDate(selected) : 'Select a date'}
          </h2>
          <p className="mt-0.5 font-body text-xs text-gray-500">
            {selectedEvents.length === 0
              ? 'No sessions on this day'
              : `${selectedEvents.length} ${selectedEvents.length === 1 ? 'session' : 'sessions'}`}
          </p>

          {selectedEvents.length === 0 ? (
            <div className="mt-6 flex flex-col items-center gap-2 text-center">
              <CalendarIcon className="h-8 w-8 text-gray-300" />
              <p className="font-body text-xs text-gray-500">
                Pick a highlighted date to see what's on.
              </p>
            </div>
          ) : (
            <ul className="mt-3 space-y-2">
              {selectedEvents.map((event) => (
                <EventDetail key={event.id} event={event} />
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  )
}
