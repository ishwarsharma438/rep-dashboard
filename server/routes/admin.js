/**
 * GET /api/admin/* — the admin analytics view.
 *
 * Mounted after the same ltiSession middleware the data routes use, so
 * req.canvasUserId resolves identically. Every route here is read-only and new;
 * none of the existing endpoints changed.
 */
import { Router } from 'express'
import { canViewAdminDashboard, requireAdmin } from '../middleware/adminAccess.js'
import { getAdminOverview } from '../services/adminAnalytics.js'

const router = Router()

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

/**
 * GET /api/admin/access — may the caller see the admin view?
 *
 * Deliberately open to any authenticated caller: it answers only a question
 * about themselves, and the client needs it to decide whether to show the nav
 * item at all. A 200 with allowed:false is not an error.
 */
router.get(
  '/access',
  asyncHandler(async (req, res) => {
    const verdict = await canViewAdminDashboard({
      userId: req.canvasUserId,
      ltiUser: req.ltiUser,
    })

    res.json({ ...verdict, userId: String(req.canvasUserId ?? '') })
  })
)

/** GET /api/admin/overview — cohort completion, engagement and bookings. */
router.get(
  '/overview',
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json(await getAdminOverview())
  })
)

export default router
