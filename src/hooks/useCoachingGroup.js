import { useCallback, useSyncExternalStore } from 'react'

/**
 * The teacher's chosen coaching group, held in localStorage.
 *
 * INTERIM STORE — MILESTONE 2. Group membership belongs in Canvas Groups; this
 * keeps the join flow usable before that exists. Two consequences worth knowing:
 *
 *   - It is per-browser. A teacher who switches device or clears site data
 *     appears not to have joined, and nobody else can see their choice.
 *   - Inside the Canvas iframe this is third-party storage, which Safari and
 *     hardened Chrome/Firefox settings block outright. Every access is guarded
 *     so a blocked store degrades to "no group joined" instead of throwing.
 */
const STORAGE_KEY = 'rep.coachingGroup'

/** localStorage access that survives being blocked or unavailable. */
function safeRead() {
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function safeWrite(value) {
  try {
    window.localStorage.setItem(STORAGE_KEY, value)
    return true
  } catch {
    return false
  }
}

// useSyncExternalStore requires a cached snapshot: returning a fresh value each
// call would loop forever. The cache is refreshed only when the value changes.
let snapshot = typeof window === 'undefined' ? null : safeRead()
const listeners = new Set()

function emit() {
  const next = safeRead()
  if (next === snapshot) return
  snapshot = next
  for (const l of listeners) l()
}

function subscribe(listener) {
  listeners.add(listener)
  // Keeps a second tab in sync — 'storage' fires in other documents only.
  window.addEventListener('storage', emit)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) window.removeEventListener('storage', emit)
  }
}

const getSnapshot = () => snapshot
const getServerSnapshot = () => null

/**
 * Returns { groupCode, join, canPersist }.
 *
 * `join` is one-way by design: the confirmation copy tells the teacher the
 * choice cannot be changed, so there is deliberately no leave() here.
 */
export default function useCoachingGroup() {
  const groupCode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const join = useCallback((code) => {
    const stored = safeWrite(code)
    // Update in-process regardless: if storage is blocked the choice still
    // holds for this session rather than silently doing nothing.
    snapshot = stored ? safeRead() : code
    for (const l of listeners) l()
    return stored
  }, [])

  return { groupCode, join }
}

/** Non-hook read, for code outside a component. */
export function readCoachingGroup() {
  return safeRead()
}
