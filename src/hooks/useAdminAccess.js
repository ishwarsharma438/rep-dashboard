import { useEffect, useState } from 'react'

/**
 * Whether the current user may see the admin analytics view.
 *
 * The server is the only authority — this hook just mirrors its answer so the
 * nav item and the route can hide themselves. A client that lies about this
 * still gets a 403 from /api/admin/overview.
 *
 * Shared by the Sidebar and AdminPage; both mount at once, and the browser
 * collapses the two identical GETs, so this stays a plain fetch rather than a
 * context.
 */
export default function useAdminAccess() {
  const [state, setState] = useState({ allowed: false, loading: true, reason: null })

  useEffect(() => {
    const controller = new AbortController()

    fetch('/api/admin/access', { credentials: 'include', signal: controller.signal })
      .then((res) => {
        // 401 = no LTI session yet; 403 shouldn't happen on this route, but
        // either way the answer is "no".
        if (!res.ok) return { allowed: false, reason: `http-${res.status}` }
        return res.json()
      })
      .then((data) => setState({ allowed: Boolean(data?.allowed), loading: false, reason: data?.reason ?? null }))
      .catch((err) => {
        if (err.name === 'AbortError') return
        setState({ allowed: false, loading: false, reason: 'unreachable' })
      })

    return () => controller.abort()
  }, [])

  return state
}
