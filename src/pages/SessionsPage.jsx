import { useEffect, useMemo, useState } from 'react'
import {
  COACHING_GROUPS,
  EVENT_TYPE_META,
  GROUP_CAPACITY,
  ROADMAP_EVENTS,
} from '../data/roadmapEvents.js'
// Reuses the calendar's date/ICS helpers rather than a second copy of the same
// logic — that file is the single implementation of .ics generation.
import { buildIcs, formatTimeRange, fromISO } from './CalendarPage.jsx'
import useCoachingGroup from '../hooks/useCoachingGroup.js'
import {
  CalendarPlusIcon,
  CheckIcon,
  CloseIcon,
  PeopleIcon,
  SproutIcon,
} from '../components/icons.jsx'

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const pad = (n) => String(n).padStart(2, '0')
const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 'Tue 27 Oct 2026' */
function shortDate(iso) {
  const d = fromISO(iso)
  return `${WEEKDAY_NAMES[d.getDay()].slice(0, 3)} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`
}

/** '7:30am' */
function clock(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return `${h % 12 === 0 ? 12 : h % 12}:${pad(m)}${h >= 12 ? 'pm' : 'am'}`
}

/**
 * The weekday a group meets, derived from its dates rather than stored twice.
 * Every group's three sessions fall on the same weekday.
 */
function groupWeekday(group) {
  return WEEKDAY_NAMES[fromISO(group.dates[0]).getDay()]
}

const slotLabel = (group) =>
  `${groupWeekday(group)}s, ${clock(group.startTime)} – ${clock(group.endTime)}`

/** Morning sessions start before midday; the roadmap only uses 7:30 and 16:30. */
const isMorning = (group) => Number(group.startTime.split(':')[0]) < 12

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

/* ---------- confirmation modal ---------- */

function JoinModal({ group, onConfirm, onCancel }) {
  // Escape closes, matching what a keyboard user expects from a dialog.
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="join-title"
        className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
      >
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel"
          className="absolute right-3 top-3 rounded-md p-1 text-gray-400 hover:bg-black/5 hover:text-rep-navy"
        >
          <CloseIcon className="h-4 w-4" />
        </button>

        <h2 id="join-title" className="font-heading text-base font-bold text-rep-navy">
          Join Group {group.code} — {group.name}?
        </h2>

        <p className="mt-2 font-body text-sm leading-relaxed text-gray-600">
          You're joining <strong>Group {group.code} — {group.name}</strong>. You'll attend all 3
          sessions. This cannot be changed.
        </p>

        <ul className="mt-3 space-y-1 rounded-lg bg-rep-bg p-3">
          {group.dates.map((d) => (
            <li key={d} className="font-body text-xs text-rep-navy">
              {shortDate(d)} · {clock(group.startTime)} – {clock(group.endTime)}
            </li>
          ))}
        </ul>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-gray-200 px-4 py-2 font-body text-sm font-semibold text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(group)}
            className="flex-1 rounded-lg bg-rep-orange px-4 py-2 font-body text-sm font-semibold text-white hover:opacity-90"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}

/* ---------- group card ---------- */

function GroupCard({ group, remote, joinedCode, onJoin, busy }) {
  const isMine = joinedCode === group.code
  const hasGroup = Boolean(joinedCode)

  // Live count from Canvas when groups are configured. In fallback mode the API
  // reports 0 for every group, so an unsaved in-memory pick shows as 1.
  const limit = remote?.max_membership ?? GROUP_CAPACITY
  const joined = remote ? remote.members_count + (isMine && remote.members_count === 0 ? 1 : 0) : 0
  const full = joined >= limit
  const pct = Math.min(100, Math.round((joined / limit) * 100))

  return (
    <div
      className={`flex flex-col rounded-2xl bg-white p-5 shadow-md transition-shadow ${
        isMine ? 'ring-2 ring-rep-orange' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rep-orange/15 text-rep-orange">
            <SproutIcon className="h-5 w-5" />
          </span>
          <h3 className="font-heading text-sm font-bold leading-tight text-rep-navy">
            {group.code} — {group.name}
          </h3>
        </div>

        <span
          className={`shrink-0 rounded-full px-2 py-0.5 font-body text-[10px] font-bold text-white ${
            group.cohort === 'cohort1' ? 'bg-rep-orange' : 'bg-rep-navy'
          }`}
        >
          {group.cohort === 'cohort1' ? 'Cohort 1' : 'Cohort 2'}
        </span>
      </div>

      {group.meaning && (
        <p className="mt-2 font-body text-xs italic text-gray-500">{group.meaning}</p>
      )}

      <p className="mt-2 font-body text-xs font-semibold text-rep-navy">{slotLabel(group)}</p>

      <ul className="mt-2 space-y-0.5">
        {group.dates.map((d) => (
          <li key={d} className="font-body text-xs text-gray-500">
            {shortDate(d)}
          </li>
        ))}
      </ul>

      <div className="mt-3">
        <div className="flex items-baseline justify-between">
          <span className="font-body text-[11px] text-gray-500">
            {joined} / {limit} joined
          </span>
          {isMine && (
            <span className="font-body text-[11px] font-semibold text-rep-orange">You're in</span>
          )}
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full rounded-full bg-rep-orange" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Cards are flex columns; mt-auto pins the button to the bottom edge. */}
      <div className="mt-4 pt-1">
        {isMine ? (
          <button
            type="button"
            disabled
            className="flex w-full cursor-default items-center justify-center gap-1.5 rounded-lg bg-rep-navy px-4 py-2 font-body text-sm font-semibold text-white"
          >
            <CheckIcon className="h-4 w-4" />
            Your Group
          </button>
        ) : (
          <button
            type="button"
            disabled={hasGroup || full || busy}
            onClick={() => onJoin(group)}
            title={
              hasGroup
                ? 'You have already joined a group'
                : full
                  ? 'This group is full'
                  : undefined
            }
            className={`w-full rounded-lg px-4 py-2 font-body text-sm font-semibold text-white ${
              hasGroup || full || busy
                ? 'cursor-not-allowed bg-rep-navy/30'
                : 'bg-rep-orange hover:opacity-90'
            }`}
          >
            {full ? 'Group full' : 'Join this group'}
          </button>
        )}
      </div>
    </div>
  )
}

/* ---------- my sessions ---------- */

function SessionRow({ event }) {
  const meta = EVENT_TYPE_META[event.type]
  const isPast = (event.endDate ?? event.startDate) < todayISO()

  return (
    <li className={`rounded-xl border border-l-4 border-gray-100 bg-white p-4 ${meta.accent}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 font-body text-[10px] font-bold ${meta.pill}`}>
          {meta.short}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 font-body text-[10px] font-semibold ${
            isPast ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'
          }`}
        >
          {isPast ? 'Past' : 'Upcoming'}
        </span>
      </div>

      <h3 className="mt-2 font-heading text-sm font-bold text-rep-navy">{event.title}</h3>
      {event.group && (
        <p className="font-body text-xs text-gray-500">Group {event.group}</p>
      )}

      <p className="mt-1 font-body text-xs text-gray-500">
        {shortDate(event.startDate)} · {formatTimeRange(event)}
      </p>

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

function MySessions({ groupCode, onBrowse }) {
  const sessions = useMemo(() => {
    if (!groupCode) return []
    const group = COACHING_GROUPS.find((g) => g.code === groupCode)
    if (!group) return []
    const label = `${group.code} - ${group.name}`
    return ROADMAP_EVENTS.filter((e) => e.type === 'group_coaching' && e.group === label).sort(
      (a, b) => a.startDate.localeCompare(b.startDate)
    )
  }, [groupCode])

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-white p-12 text-center shadow-sm">
        <PeopleIcon className="h-10 w-10 text-gray-300" />
        <p className="font-body text-sm text-gray-500">
          No sessions booked yet. Start by joining a coaching group!
        </p>
        <button
          type="button"
          onClick={onBrowse}
          className="rounded-lg bg-rep-orange px-4 py-2 font-body text-sm font-semibold text-white hover:opacity-90"
        >
          Browse coaching groups
        </button>
      </div>
    )
  }

  return (
    <ul className="space-y-2">
      {sessions.map((e) => (
        <SessionRow key={e.id} event={e} />
      ))}
    </ul>
  )
}

/* ---------- filters ---------- */

const FILTERS = {
  cohort: [
    { value: 'all', label: 'All' },
    { value: 'cohort1', label: 'Cohort 1' },
    { value: 'cohort2', label: 'Cohort 2' },
  ],
  day: [
    { value: 'all', label: 'All' },
    { value: 'Tuesday', label: 'Tuesdays' },
    { value: 'Wednesday', label: 'Wednesdays' },
  ],
  time: [
    { value: 'all', label: 'All' },
    { value: 'morning', label: 'Morning (7:30am)' },
    { value: 'afternoon', label: 'Afternoon (4:30pm)' },
  ],
}

function FilterRow({ label, options, value, onChange }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-body text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        {label}
      </span>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`rounded-full border px-3 py-1 font-body text-xs font-semibold transition-colors ${
            value === o.value
              ? 'border-rep-navy bg-rep-navy text-white'
              : 'border-gray-300 bg-white text-gray-600 hover:border-rep-navy'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ---------- toast ---------- */

function Toast({ message, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 5000)
    return () => clearTimeout(t)
  }, [onDismiss])

  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-rep-navy px-4 py-2.5 shadow-lg"
    >
      <p className="font-body text-sm text-white">{message}</p>
    </div>
  )
}

/* ---------- page ---------- */

export default function SessionsPage() {
  const { groupCode, groups: remoteGroups, configured, loading, error, join } = useCoachingGroup()
  const [tab, setTab] = useState('mine')
  const [pending, setPending] = useState(null)
  const [toast, setToast] = useState(null)
  const [busy, setBusy] = useState(false)
  const [cohort, setCohort] = useState('all')
  const [day, setDay] = useState('all')
  const [time, setTime] = useState('all')

  // Canvas groups keyed by their letter, so a card can find its live counts.
  const remoteByCode = useMemo(() => {
    const map = new Map()
    for (const g of remoteGroups ?? []) if (g.code) map.set(g.code, g)
    return map
  }, [remoteGroups])

  const groups = useMemo(
    () =>
      COACHING_GROUPS.filter((g) => {
        if (cohort !== 'all' && g.cohort !== cohort) return false
        if (day !== 'all' && groupWeekday(g) !== day) return false
        if (time === 'morning' && !isMorning(g)) return false
        if (time === 'afternoon' && isMorning(g)) return false
        return true
      }),
    [cohort, day, time]
  )

  const confirmJoin = async (group) => {
    const remote = remoteByCode.get(group.code)
    setBusy(true)
    // Canvas needs the real group id; fall back to the letter in fallback mode.
    const result = await join({ ...group, id: remote?.id ?? group.code })
    setBusy(false)
    setPending(null)

    if (result.ok) {
      setTab('mine')
    } else if (result.pending) {
      setToast(result.message)
      setTab('mine')
    } else {
      setToast(result.message ?? 'Could not join that group')
    }
  }

  const TABS = [
    { key: 'mine', label: 'My Sessions' },
    { key: 'groups', label: 'Group Coaching' },
  ]

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="font-heading text-2xl font-bold text-rep-navy sm:text-3xl">Sessions</h1>

      <div className="mt-4 flex gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-current={tab === t.key ? 'page' : undefined}
            className={`-mb-px border-b-2 px-4 py-2 font-body text-sm font-semibold transition-colors ${
              tab === t.key
                ? 'border-rep-orange text-rep-orange'
                : 'border-transparent text-gray-500 hover:text-rep-navy'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'mine' ? (
        <div className="mt-5">
          <MySessions groupCode={groupCode} onBrowse={() => setTab('groups')} />
        </div>
      ) : (
        <div className="mt-5">
          <div className="space-y-2 rounded-2xl bg-white p-4 shadow-sm">
            <FilterRow label="Cohort" options={FILTERS.cohort} value={cohort} onChange={setCohort} />
            <FilterRow label="Day" options={FILTERS.day} value={day} onChange={setDay} />
            <FilterRow label="Time" options={FILTERS.time} value={time} onChange={setTime} />
          </div>

          <p className="mt-3 font-body text-xs text-gray-500">
            {groups.length} of {COACHING_GROUPS.length} groups
            {groupCode ? ' · you have already joined a group' : ''}
            {!loading && !configured
              ? ' · group selection opens once Canvas groups are set up'
              : ''}
          </p>

          {error && (
            <p className="mt-2 rounded-lg bg-rep-red/10 px-3 py-2 font-body text-xs text-rep-red">
              Couldn't load group membership: {error}
            </p>
          )}

          {groups.length === 0 ? (
            <p className="mt-3 rounded-xl bg-white p-8 text-center font-body text-sm text-gray-500 shadow-sm">
              No groups match these filters.
            </p>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {groups.map((g) => (
                <GroupCard
                  key={g.code}
                  group={g}
                  remote={remoteByCode.get(g.code)}
                  joinedCode={groupCode}
                  onJoin={setPending}
                  busy={busy}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {pending && (
        <JoinModal
          group={pending}
          onConfirm={confirmJoin}
          onCancel={() => setPending(null)}
        />
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  )
}
