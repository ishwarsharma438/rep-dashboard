/**
 * The grouped announcements payload from GET /api/announcements.
 *
 * The API groups them; the dashboard preview and the engagement counter still
 * want one flat newest-first list. Both views are derived from the same fetch
 * here rather than each hitting the API, so the two can't disagree.
 *
 * The mechanics live in grouping.js, shared with resources and discussions.
 * This module's exports are unchanged from when they were implemented here.
 */
import { byPostedAtDesc, makeCourseLabel, makeGrouping } from './grouping.js'

export { PROGRAMME_SOURCE } from './grouping.js'

const grouping = makeGrouping('announcements', { sort: byPostedAtDesc })

export const EMPTY_GROUPS = grouping.EMPTY_GROUPS
export const { addToGroups, flattenGroups, normalizeGroups, regroup } = grouping

export const courseLabel = makeCourseLabel('Other announcements')
