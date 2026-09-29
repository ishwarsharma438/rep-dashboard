/**
 * The grouped discussions payload from GET /api/discussions/:userId.
 *
 * Same envelope as announcements, with `discussions` as the per-course array.
 *
 * Unlike announcements, the socket event for discussions broadcasts the whole
 * refreshed list rather than just new arrivals — so the context rebuilds the
 * groups with regroupDiscussions() instead of folding items in, or a topic the
 * server has dropped would linger in its section.
 */
import { byPostedAtDesc, makeCourseLabel, makeGrouping } from './grouping.js'

const grouping = makeGrouping('discussions', { sort: byPostedAtDesc })

export const EMPTY_DISCUSSION_GROUPS = grouping.EMPTY_GROUPS
export const {
  addToGroups: addToDiscussionGroups,
  flattenGroups: flattenDiscussionGroups,
  normalizeGroups: normalizeDiscussionGroups,
  regroup: regroupDiscussions,
} = grouping

export const discussionCourseLabel = makeCourseLabel('Other discussions')
