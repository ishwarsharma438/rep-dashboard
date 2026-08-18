import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { USER_ID } from './ProfileContext.jsx'
import useSocket from '../hooks/useSocket.js'

/**
 * The single source of dashboard data (courses, announcements, files,
 * discussions) plus their live socket updates.
 *
 * Every consumer — the Dashboard previews, the dedicated pages and
 * EngagementStats — reads from here, so the data is fetched once per session
 * and one socket handler keeps all routes in sync.
 */
const EMPTY_FLAGS = { courses: true, announcements: true, files: true, discussions: true }

const DashboardDataContext = createContext({
  courses: [],
  announcements: [],
  files: [],
  discussions: [],
  loading: EMPTY_FLAGS,
  failed: {},
  newAnnouncementIds: new Set(),
  newDiscussionIds: new Set(),
  bumpReplyCount: () => {},
})

const json = (url) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json()
  })

const asArray = (result) =>
  result.status === 'fulfilled' && Array.isArray(result.value) ? result.value : []

export function DashboardDataProvider({ children }) {
  const [courses, setCourses] = useState([])
  const [announcements, setAnnouncements] = useState([])
  const [files, setFiles] = useState([])
  const [discussions, setDiscussions] = useState([])
  const [loading, setLoading] = useState(EMPTY_FLAGS)
  const [failed, setFailed] = useState({})
  const [newAnnouncementIds, setNewAnnouncementIds] = useState(() => new Set())
  const [newDiscussionIds, setNewDiscussionIds] = useState(() => new Set())

  const socket = useSocket()

  useEffect(() => {
    let cancelled = false

    Promise.allSettled([
      json(`/api/courses/${USER_ID}`),
      json('/api/announcements'),
      json(`/api/files/${USER_ID}`),
      json(`/api/discussions/${USER_ID}`),
    ]).then(([c, a, f, d]) => {
      if (cancelled) return
      setCourses(asArray(c))
      setAnnouncements(asArray(a))
      setFiles(asArray(f))
      setDiscussions(asArray(d))
      setLoading({ courses: false, announcements: false, files: false, discussions: false })
      setFailed({
        courses: c.status !== 'fulfilled',
        announcements: a.status !== 'fulfilled',
        files: f.status !== 'fulfilled',
        discussions: d.status !== 'fulfilled',
      })
    })

    return () => {
      cancelled = true
    }
  }, [])

  const settle = (key) => {
    setLoading((l) => ({ ...l, [key]: false }))
    setFailed((f) => ({ ...f, [key]: false }))
  }

  const onCourses = useCallback((next) => {
    if (!Array.isArray(next)) return
    console.log('[socket] coursesUpdate', next.length)
    setCourses(next)
    settle('courses')
  }, [])

  const onAnnouncement = useCallback((payload) => {
    const incoming = Array.isArray(payload) ? payload : [payload]
    if (incoming.length === 0) return
    console.log('[socket] newAnnouncement', incoming.length)

    setAnnouncements((current) => {
      const known = new Set(current.map((a) => a.id))
      const fresh = incoming.filter((a) => !known.has(a.id))
      if (!fresh.length) return current
      setNewAnnouncementIds((ids) => new Set([...ids, ...fresh.map((a) => a.id)]))
      return [...fresh, ...current]
    })
    settle('announcements')
  }, [])

  const onFiles = useCallback((next) => {
    if (!Array.isArray(next)) return
    console.log('[socket] filesUpdate', next.length)
    setFiles(next)
    settle('files')
  }, [])

  const onDiscussions = useCallback((next) => {
    if (!Array.isArray(next)) return
    console.log('[socket] discussionsUpdate', next.length)

    // Flag arrivals so the list can highlight them, same as announcements.
    setDiscussions((current) => {
      const known = new Set(current.map((d) => d.id))
      const arrived = next.filter((d) => !known.has(d.id)).map((d) => d.id)
      if (arrived.length) setNewDiscussionIds((ids) => new Set([...ids, ...arrived]))
      return next
    })
    settle('discussions')
  }, [])

  useEffect(() => {
    if (!socket) return
    socket.on('coursesUpdate', onCourses)
    socket.on('newAnnouncement', onAnnouncement)
    socket.on('filesUpdate', onFiles)
    socket.on('discussionsUpdate', onDiscussions)

    return () => {
      socket.off('coursesUpdate', onCourses)
      socket.off('newAnnouncement', onAnnouncement)
      socket.off('filesUpdate', onFiles)
      socket.off('discussionsUpdate', onDiscussions)
    }
  }, [socket, onCourses, onAnnouncement, onFiles, onDiscussions])

  /**
   * Optimistic local adjustment so a reply's count moves immediately.
   * The server's post-write broadcast reconciles it to the true value; `delta`
   * of -1 rolls the bump back if the request failed.
   */
  const bumpReplyCount = useCallback((topicId, delta = 1) => {
    setDiscussions((current) =>
      current.map((d) =>
        d.id === topicId ? { ...d, replyCount: Math.max(0, (d.replyCount ?? 0) + delta) } : d
      )
    )
  }, [])

  return (
    <DashboardDataContext.Provider
      value={{
        courses,
        announcements,
        files,
        discussions,
        loading,
        failed,
        newAnnouncementIds,
        newDiscussionIds,
        bumpReplyCount,
      }}
    >
      {children}
    </DashboardDataContext.Provider>
  )
}

export function useDashboardData() {
  return useContext(DashboardDataContext)
}
