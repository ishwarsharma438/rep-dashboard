/**
 * The grouped files payload from GET /api/files/:userId.
 *
 * Same envelope as announcements, with `files` as the per-course array. Not
 * sorted when flattened: Canvas files carry created_at/updated_at rather than a
 * posted date, and the existing Resource Hub preview shows them in the order the
 * API returns — sorting here would silently reshuffle that grid.
 */
import { makeCourseLabel, makeGrouping } from './grouping.js'

const grouping = makeGrouping('files')

export const EMPTY_FILE_GROUPS = grouping.EMPTY_GROUPS
export const {
  addToGroups: addToFileGroups,
  flattenGroups: flattenFileGroups,
  normalizeGroups: normalizeFileGroups,
  regroup: regroupFiles,
} = grouping

export const fileCourseLabel = makeCourseLabel('Other resources')
