/**
 * The grouped announcements payload from GET /api/announcements.
 *
 * The API groups them; the dashboard preview and the engagement counter still
 * want one flat newest-first list. Both views are derived from the same fetch
 * here rather than each hitting the API, so the two can't disagree.
 */

export const PROGRAMME_SOURCE = 'programme'

export const EMPTY_GROUPS = {
  programme: [],
  courses: [],
  programmeConfigured: false,
  total: 0,
}

const newestFirst = (a, b) => new Date(b.postedAt ?? 0) - new Date(a.postedAt ?? 0)

const countAll = (programme, courses) =>
  programme.length + courses.reduce((n, g) => n + g.announcements.length, 0)

/**
 * Trusts nothing about the response shape — a failed fetch, an older server
 * still returning a flat array, or a half-written group must all leave the page
 * rendering something rather than throwing inside a map.
 */
export function normalizeGroups(payload) {
  if (Array.isArray(payload)) {
    // Pre-grouping server: treat everything as course announcements.
    return addToGroups(EMPTY_GROUPS, payload)
  }

  if (!payload || typeof payload !== 'object') return EMPTY_GROUPS

  const programme = Array.isArray(payload.programme) ? payload.programme : []
  const courses = (Array.isArray(payload.courses) ? payload.courses : [])
    .filter((g) => g && Array.isArray(g.announcements) && g.announcements.length > 0)
    .map((g) => ({
      courseId: g.courseId ?? null,
      courseName: g.courseName ?? null,
      announcements: g.announcements,
    }))

  return {
    programme,
    courses,
    programmeConfigured: Boolean(payload.programmeConfigured),
    total: countAll(programme, courses),
  }
}

/** One flat newest-first list across every section. */
export function flattenGroups(groups) {
  return [...groups.programme, ...groups.courses.flatMap((g) => g.announcements)].sort(newestFirst)
}

/**
 * Folds socket-delivered announcements into the grouped shape.
 *
 * The poller emits a flat array, so without this a live arrival would show up
 * in the dashboard preview but not in the page's sections until a reload.
 * Returns the original object when nothing is new, so React can skip the render.
 */
export function addToGroups(groups, incoming) {
  const items = Array.isArray(incoming) ? incoming : [incoming]
  if (items.length === 0) return groups

  const known = new Set(flattenGroups(groups).map((a) => a.id))
  const programme = [...groups.programme]
  const courses = groups.courses.map((g) => ({ ...g, announcements: [...g.announcements] }))
  let changed = false

  for (const a of items) {
    if (!a || known.has(a.id)) continue
    known.add(a.id)
    changed = true

    if (a.source === PROGRAMME_SOURCE) {
      programme.unshift(a)
      continue
    }

    const key = String(a.courseId ?? 'unknown')
    let group = courses.find((g) => String(g.courseId ?? 'unknown') === key)

    if (!group) {
      group = { courseId: a.courseId ?? null, courseName: a.courseName ?? null, announcements: [] }
      courses.push(group)
    }

    group.announcements.unshift(a)
  }

  if (!changed) return groups

  return {
    ...groups,
    programme,
    courses,
    total: countAll(programme, courses),
  }
}

/** Heading for a course section, with a fallback for a course we don't name. */
export function courseLabel(group) {
  if (group.courseName) return group.courseName
  return group.courseId ? `Course ${group.courseId}` : 'Other announcements'
}
