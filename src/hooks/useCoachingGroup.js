import { useCallback, useEffect, useSyncExternalStore } from 'react'

/**
 * Coaching group membership, read from the Canvas Groups API.
 *
 * Backed by /api/groups (all groups + live member counts) and /api/groups/my
 * (this teacher's group). Both report a `configured` flag:
 *
 *   configured: true  — CANVAS_GROUP_CATEGORY_ID is set. Counts and membership
 *                       are real, and joining writes to Canvas.
 *   configured: false — fallback. The 16 groups come from static roadmap data
 *                       with zero members, and join returns 503.
 *
 * While unconfigured, a join is held in memory only so the teacher can see the
 * flow work. It is INTENTIONALLY lost on refresh — persisting it would imply a
 * membership Canvas has no record of. The previous localStorage store was
 * removed for exactly that reason.
 */
const state = {
  loading: true,
  configured: false,
  groups: [],
  groupCode: null,
  /** True when groupCode is an unsaved in-memory choice, not a Canvas membership. */
  pendingOnly: false,
  error: null,
}

const listeners = new Set()
let started = false

function notify() {
  for (const l of listeners) l()
}

function setState(patch) {
  Object.assign(state, patch)
  notify()
}

const json = async (url, options) => {
  const res = await fetch(url, options)
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const err = new Error(body?.message ?? body?.error ?? `HTTP ${res.status}`)
    err.status = res.status
    err.body = body
    throw err
  }
  return body
}

/** Loads groups + membership once per page load; safe to call repeatedly. */
async function load() {
  try {
    const [all, mine] = await Promise.all([json('/api/groups'), json('/api/groups/my')])
    const joined = mine?.groups?.[0] ?? null

    setState({
      loading: false,
      configured: Boolean(all?.configured),
      groups: all?.groups ?? [],
      // A real Canvas membership always wins over an in-memory choice.
      groupCode: joined?.code ?? (state.pendingOnly ? state.groupCode : null),
      pendingOnly: joined ? false : state.pendingOnly,
      error: null,
    })
  } catch (err) {
    setState({ loading: false, error: err.message })
  }
}

function subscribe(listener) {
  listeners.add(listener)
  if (!started) {
    started = true
    load()
  }
  return () => listeners.delete(listener)
}

const getSnapshot = () => state
const getServerSnapshot = () => state

/**
 * Returns the group state plus `join(group)`.
 *
 * join resolves to { ok, pending, message }:
 *   ok      — the membership was written to Canvas
 *   pending — accepted in memory only because groups are not configured yet
 */
export default function useCoachingGroup() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  // Covers the case where a component mounts after the first load settled.
  useEffect(() => {
    if (!started) {
      started = true
      load()
    }
  }, [])

  const join = useCallback(async (group) => {
    try {
      await json(`/api/groups/${encodeURIComponent(group.id)}/join`, { method: 'POST' })
      await load()
      return { ok: true, pending: false }
    } catch (err) {
      if (err.status === 503) {
        // Not wired to Canvas yet — hold the choice for this session only.
        setState({ groupCode: group.code, pendingOnly: true })
        return { ok: false, pending: true, message: 'Group selection will be available soon' }
      }
      return { ok: false, pending: false, message: err.message }
    }
  }, [])

  return { ...snapshot, join, refresh: load }
}
