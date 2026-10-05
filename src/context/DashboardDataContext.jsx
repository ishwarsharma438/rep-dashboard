import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { USER_ID } from './ProfileContext.jsx'
import useSocket from '../hooks/useSocket.js'
import {
  EMPTY_GROUPS,
  addToGroups,
  flattenGroups,
  normalizeGroups,
} from '../lib/announcements.js'
import {
  EMPTY_DISCUSSION_GROUPS,
  flattenDiscussionGroups,
  normalizeDiscussionGroups,
  regroupDiscussions,
} from '../lib/discussions.js'

/**
 * The single source of dashboard data (courses, announcements, discussions)
 * plus their live socket updates.
 *
 * Every consumer — the Dashboard previews, the dedicated pages and
 * EngagementStats — reads from here, so the data is fetched once per session
 * and one socket handler keeps all routes in sync.
 */
const EMPTY_FLAGS = { courses: true, announcements: true, discussions: true }

const DashboardDataContext = createContext({
  courses: [],
  announcements: [],
  announcementGroups: EMPTY_GROUPS,
  discussionGroups: EMPTY_DISCUSSION_GROUPS,
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
  // Two views of one fetch: `announcements` is the flat newest-first list the
  // dashboard preview and EngagementStats read; `announcementGroups` is the
  // programme feed plus per-course sections the /announcements page renders.
  const [announcements, setAnnouncements] = useState([])
  const [announcementGroups, setAnnouncementGroups] = useState(EMPTY_GROUPS)
  // Discussions follow the same two-views-of-one-fetch shape: the flat list
  // feeds the dashboard widget, the groups feed its sections.
  const [discussions, setDiscussions] = useState([])
  const [discussionGroups, setDiscussionGroups] = useState(EMPTY_DISCUSSION_GROUPS)
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
      json(`/api/discussions/${USER_ID}`),
    ]).then(([c, a, d]) => {
      if (cancelled) return

      const groups = normalizeGroups(a.status === 'fulfilled' ? a.value : null)
      const discussionSections = normalizeDiscussionGroups(
        d.status === 'fulfilled' ? d.value : null
      )

      setCourses(asArray(c))
      setAnnouncementGroups(groups)
      setAnnouncements(flattenGroups(groups))
      setDiscussionGroups(discussionSections)
      setDiscussions(flattenDiscussionGroups(discussionSections))
      setLoading({ courses: false, announcements: false, discussions: false })
      setFailed({
        courses: c.status !== 'fulfilled',
        announcements: a.status !== 'fulfilled',
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

    // The poller emits a flat array; fold it into the sections too, or a live
    // arrival would reach the dashboard preview but not the page.
    setAnnouncementGroups((groups) => addToGroups(groups, incoming))
    settle('announcements')
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

    // This event replaces the list rather than appending, so the sections are
    // rebuilt — folding in would keep a topic the server has since dropped.
    setDiscussionGroups((groups) => regroupDiscussions(next, groups.programmeConfigured))
    settle('discussions')
  }, [])

  useEffect(() => {
    if (!socket) return
    socket.on('coursesUpdate', onCourses)
    socket.on('newAnnouncement', onAnnouncement)
    socket.on('discussionsUpdate', onDiscussions)

    return () => {
      socket.off('coursesUpdate', onCourses)
      socket.off('newAnnouncement', onAnnouncement)
      socket.off('discussionsUpdate', onDiscussions)
    }
  }, [socket, onCourses, onAnnouncement, onDiscussions])

  /**
   * Optimistic local adjustment so a reply's count moves immediately.
   * The server's post-write broadcast reconciles it to the true value; `delta`
   * of -1 rolls the bump back if the request failed.
   */
  const bumpReplyCount = useCallback((topicId, delta = 1) => {
    const bump = (d) =>
      d.id === topicId ? { ...d, replyCount: Math.max(0, (d.replyCount ?? 0) + delta) } : d

    setDiscussions((current) => current.map(bump))

    // The Collaboration Space renders from the groups, so the optimistic bump
    // has to land there too or the count wouldn't move until the broadcast.
    setDiscussionGroups((groups) => ({
      ...groups,
      programme: groups.programme.map(bump),
      courses: groups.courses.map((g) => ({ ...g, discussions: g.discussions.map(bump) })),
    }))
  }, [])

  return (
    <DashboardDataContext.Provider
      value={{
        courses,
        announcements,
        announcementGroups,
        discussions,
        discussionGroups,
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
