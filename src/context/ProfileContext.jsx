import { createContext, useContext, useEffect, useState } from 'react'

// Wired to a fixed user until Canvas LTI identity lands in a later milestone.
export const USER_ID = 2619

const ProfileContext = createContext({
  user: null,
  group: null,
  loading: true,
  failed: false,
})

/**
 * Fetches the profile + coaching group once and shares them, so the sidebar,
 * the welcome heading and the Coming Up card don't each hit the API separately.
 */
export function ProfileProvider({ children }) {
  const [state, setState] = useState({ user: null, group: null, loading: true, failed: false })

  useEffect(() => {
    let cancelled = false

    const json = (url) =>
      fetch(url).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })

    // The group is secondary — a failure there must not blank the profile.
    Promise.allSettled([json(`/api/user/${USER_ID}`), json(`/api/groups/${USER_ID}`)]).then(
      ([userRes, groupRes]) => {
        if (cancelled) return
        setState({
          user: userRes.status === 'fulfilled' ? userRes.value : null,
          group: groupRes.status === 'fulfilled' ? groupRes.value : null,
          loading: false,
          failed: userRes.status !== 'fulfilled',
        })
      }
    )

    return () => {
      cancelled = true
    }
  }, [])

  return <ProfileContext.Provider value={state}>{children}</ProfileContext.Provider>
}

export function useProfile() {
  return useContext(ProfileContext)
}
