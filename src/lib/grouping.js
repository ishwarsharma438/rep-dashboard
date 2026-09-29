/**
 * Programme / per-course grouping, shared by announcements, resources and
 * discussions.
 *
 * All three APIs return the same envelope — a programme feed from the Welcome
 * course plus one group per course — differing only in what the per-course array
 * is called (`announcements`, `files`, `discussions`) and whether the flattened
 * list is worth sorting. `makeGrouping(key, options)` stamps out one set of
 * helpers per feature.
 *
 * The helpers are deliberately defensive: a failed fetch, a half-written group,
 * or an older server still returning a flat array must all leave the page
 * rendering something rather than throwing inside a map.
 */

export const PROGRAMME_SOURCE = 'programme'

/** Newest-first by postedAt. Only for lists that actually carry one. */
export const byPostedAtDesc = (a, b) => new Date(b.postedAt ?? 0) - new Date(a.postedAt ?? 0)

/** Heading for a course section, with a fallback for a course we don't name. */
export function makeCourseLabel(fallback) {
  return (group) => {
    if (group.courseName) return group.courseName
    return group.courseId ? `Course ${group.courseId}` : fallback
  }
}

/**
 * One feature's grouping helpers.
 *
 * `key` is the per-course array name the API uses. `sort` is applied when
 * flattening; omit it for lists with no meaningful timestamp, since a comparator
 * over missing dates returns NaN and leaves the sort unspecified.
 */
export function makeGrouping(key, { sort = null } = {}) {
  const EMPTY_GROUPS = {
    programme: [],
    courses: [],
    programmeConfigured: false,
    total: 0,
  }

  const countAll = (programme, courses) =>
    programme.length + courses.reduce((n, g) => n + g[key].length, 0)

  const newGroup = (item) => ({
    courseId: item.courseId ?? null,
    courseName: item.courseName ?? null,
    [key]: [],
  })

  /** One flat list across every section, sorted if this feature has an order. */
  function flattenGroups(groups) {
    const flat = [...groups.programme, ...groups.courses.flatMap((g) => g[key])]
    return sort ? flat.sort(sort) : flat
  }

  /**
   * Folds a flat list of items into an existing grouped shape.
   *
   * Returns the original object when nothing is new, so React can skip the
   * render. Never mutates its input.
   */
  function addToGroups(groups, incoming) {
    const items = Array.isArray(incoming) ? incoming : [incoming]
    if (items.length === 0) return groups

    const known = new Set(flattenGroups(groups).map((item) => item.id))
    const programme = [...groups.programme]
    const courses = groups.courses.map((g) => ({ ...g, [key]: [...g[key]] }))
    let changed = false

    for (const item of items) {
      if (!item || known.has(item.id)) continue
      known.add(item.id)
      changed = true

      if (item.source === PROGRAMME_SOURCE) {
        programme.unshift(item)
        continue
      }

      const mapKey = String(item.courseId ?? 'unknown')
      let group = courses.find((g) => String(g.courseId ?? 'unknown') === mapKey)

      if (!group) {
        group = newGroup(item)
        courses.push(group)
      }

      group[key].unshift(item)
    }

    if (!changed) return groups

    return { ...groups, programme, courses, total: countAll(programme, courses) }
  }

  /** The API envelope, or a safe empty one. A flat array is grouped locally. */
  function normalizeGroups(payload) {
    if (Array.isArray(payload)) return addToGroups(EMPTY_GROUPS, payload)
    if (!payload || typeof payload !== 'object') return EMPTY_GROUPS

    const programme = Array.isArray(payload.programme) ? payload.programme : []
    const courses = (Array.isArray(payload.courses) ? payload.courses : [])
      .filter((g) => g && Array.isArray(g[key]) && g[key].length > 0)
      .map((g) => ({ courseId: g.courseId ?? null, courseName: g.courseName ?? null, [key]: g[key] }))

    return {
      programme,
      courses,
      programmeConfigured: Boolean(payload.programmeConfigured),
      total: countAll(programme, courses),
    }
  }

  /**
   * Rebuilds the grouped shape from a flat list that *replaces* what's there.
   *
   * The discussions socket event broadcasts the whole list rather than just
   * arrivals, so folding it in would keep topics that the server has since
   * dropped. `programmeConfigured` is carried over because a flat list can't
   * say whether the Welcome course is configured.
   */
  function regroup(items, programmeConfigured) {
    const rebuilt = addToGroups(EMPTY_GROUPS, Array.isArray(items) ? items : [])
    return { ...rebuilt, programmeConfigured: Boolean(programmeConfigured) }
  }

  return { EMPTY_GROUPS, addToGroups, flattenGroups, normalizeGroups, regroup }
}
