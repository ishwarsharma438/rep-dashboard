/**
 * The single place that decides who may see the admin analytics view.
 *
 * Canvas has no dedicated admin role for this programme yet, so for now the
 * answer is "anyone holding a staff role in a REP course". Everything that
 * depends on that decision goes through canViewAdminDashboard(), so swapping in
 * a real admin role or flag later is a change to this file alone.
 *
 * Read-only, and additive: no existing route consults this, so teacher and
 * student dashboard access is unchanged.
 */
import CANVAS_CONFIG from '../config/canvasConfig.js'
import { cachedGet } from '../services/canvasApi.js'

/**
 * LTI 1.1 roles that count as staff.
 *
 * Checked against the launch's `roles` array, never against the derived
 * `session.lti.role`: resolveRole() in routes/lti.js maps every non-Administrator
 * launch to 'teacher', so a *student* launch also arrives as role 'teacher'.
 * Gating on that would hand the admin view to every participant.
 */
const STAFF_LTI_ROLES = new Set([
  'Administrator',
  'AccountAdmin',
  'Instructor',
  'TeachingAssistant',
  'ContentDeveloper',
])

/** Canvas enrolment types that count as staff. */
const STAFF_ENROLLMENTS = new Set([
  'TeacherEnrollment',
  'TaEnrollment',
  'DesignerEnrollment',
])

/**
 * Explicit allowlist, for when a real admin flag arrives or for verifying the
 * view before LTI is switched on. Unset by default.
 */
function allowlistedIds() {
  return (process.env.ADMIN_USER_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Does the verified LTI launch carry a staff role? */
function staffByLtiRoles(ltiUser) {
  const roles = Array.isArray(ltiUser?.roles) ? ltiUser.roles : []
  return roles.some((role) => STAFF_LTI_ROLES.has(role))
}

/**
 * Does this Canvas user hold a staff enrolment in any REP course?
 *
 * The fallback when there is no LTI session — which is every request while
 * LTI_ENABLED=false. Canvas enrolments are the authoritative answer anyway; LTI
 * roles only describe the course the launch came from.
 */
async function staffByEnrollment(userId) {
  if (userId === null || userId === undefined || userId === '') return false

  const checks = await Promise.all(
    Object.values(CANVAS_CONFIG.courses).map(async (course) => {
      try {
        const { data } = await cachedGet(`/courses/${course.id}/enrollments`, {
          params: { user_id: userId, state: ['active', 'invited'], per_page: 100 },
        })
        return (Array.isArray(data) ? data : []).some((e) => STAFF_ENROLLMENTS.has(e.type))
      } catch {
        // A course we can't read must not grant access.
        return false
      }
    })
  )

  return checks.some(Boolean)
}

/**
 * May this user see the admin analytics view?
 *
 * Returns the reason as well as the verdict so the route can say *why* without
 * leaking anything a caller couldn't already determine about themselves.
 */
export async function canViewAdminDashboard({ userId, ltiUser } = {}) {
  if (allowlistedIds().includes(String(userId))) {
    return { allowed: true, reason: 'allowlist' }
  }

  if (staffByLtiRoles(ltiUser)) {
    return { allowed: true, reason: 'lti-role' }
  }

  if (await staffByEnrollment(userId)) {
    return { allowed: true, reason: 'canvas-enrollment' }
  }

  return { allowed: false, reason: 'not-staff' }
}

/** Express guard for the admin routes. 403s everyone else. */
export function requireAdmin(req, res, next) {
  canViewAdminDashboard({ userId: req.canvasUserId, ltiUser: req.ltiUser })
    .then((verdict) => {
      if (verdict.allowed) {
        req.adminAccess = verdict
        return next()
      }

      res.status(403).json({
        error: true,
        message: 'This view is limited to program staff',
      })
    })
    .catch(next)
}
