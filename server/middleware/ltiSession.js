import LTI_CONFIG from '../config/ltiConfig.js'

/**
 * Resolves the Canvas user every /api request should read data for.
 *
 * LTI off (default): every request resolves to the fallback user id, which is
 * the same hardcoded 2619 the routes used before LTI existed. No session is
 * consulted and no request is ever rejected — behaviour is unchanged.
 *
 * LTI on: the id comes from the verified launch session. An unauthenticated
 * request gets a 401 rather than silently falling back to somebody else's data.
 */
export default function ltiSession(req, res, next) {
  if (!LTI_CONFIG.enabled) {
    req.canvasUserId = LTI_CONFIG.fallbackUserId
    req.ltiUser = null
    return next()
  }

  const session = req.session?.lti

  if (!session?.canvasUserId) {
    return res.status(401).json({
      error: true,
      message: 'No active LTI session — launch this tool from Canvas',
    })
  }

  req.canvasUserId = session.canvasUserId
  req.ltiUser = session
  next()
}
