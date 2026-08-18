import express, { Router } from 'express'
import lti from 'ims-lti'
import LTI_CONFIG, { ltiConfigErrors } from '../config/ltiConfig.js'

const router = Router()

// One shared nonce store for the process lifetime — this is what makes replay
// protection work. A Provider built per-request would carry a fresh, empty
// store, so a captured launch POST could be replayed indefinitely.
//
// The Provider itself stays per-request because it holds request state
// (this.body) that concurrent launches would otherwise race on.
const nonceStore = new lti.Stores.MemoryStore()

// Canvas posts the launch as application/x-www-form-urlencoded. Scoped to this
// router so the rest of the app keeps its JSON-only body parsing.
router.use(express.urlencoded({ extended: false }))

/**
 * Canvas ships roles as a comma-separated string of URNs, e.g.
 * "urn:lti:instrole:ims/lis/Administrator,Instructor". Normalise to bare names.
 */
function parseRoles(raw) {
  if (!raw) return []
  const list = Array.isArray(raw) ? raw : String(raw).split(',')
  return list.map((r) => r.trim().split('/').pop()).filter(Boolean)
}

/** Admin if any role says Administrator; every other launch is a teacher. */
function resolveRole(roles) {
  return roles.some((r) => /^Administrator$/i.test(r)) ? 'admin' : 'teacher'
}

/**
 * Promise wrapper around ims-lti's callback-style validator.
 *
 * valid_request checks the OAuth 1.0a HMAC-SHA1 signature, the timestamp
 * window, and the nonce (replay protection, in-memory for this milestone).
 */
function validate(provider, req) {
  return new Promise((resolve, reject) => {
    provider.valid_request(req, req.body, (err, isValid) => {
      if (err) return reject(err)
      resolve(isValid)
    })
  })
}

/**
 * POST /lti/launch — Canvas external tool launch.
 *
 * Read-only: the launch payload is the only thing consumed. Nothing here calls
 * Canvas at all, and no Canvas state is created or modified.
 */
router.post('/launch', async (req, res) => {
  if (!LTI_CONFIG.enabled) {
    return res.status(503).json({ error: true, message: 'LTI launch is disabled' })
  }

  const missing = ltiConfigErrors()
  if (missing.length > 0) {
    console.error(`[lti] launch refused — missing config: ${missing.join(', ')}`)
    return res.status(500).json({ error: true, message: 'LTI is not configured' })
  }

  try {
    const provider = new lti.Provider(
      LTI_CONFIG.consumerKey,
      LTI_CONFIG.sharedSecret,
      nonceStore
    )
    const isValid = await validate(provider, req)

    if (!isValid) {
      console.warn('[lti] launch rejected: invalid OAuth signature')
      return res.status(401).json({ error: true, message: 'Invalid LTI signature' })
    }

    const body = req.body ?? {}
    const canvasUserId = body.custom_canvas_user_id

    // Without a Canvas user id there is nobody to show a dashboard for. This is
    // a custom variable and must be declared in the Canvas app config.
    if (!canvasUserId) {
      console.warn('[lti] launch rejected: custom_canvas_user_id missing from payload')
      return res
        .status(400)
        .json({ error: true, message: 'Launch is missing custom_canvas_user_id' })
    }

    const roles = parseRoles(body.roles)

    req.session.lti = {
      canvasUserId: String(canvasUserId),
      name: body.lis_person_name_full ?? null,
      email: body.lis_person_contact_email_primary ?? null,
      roles,
      role: resolveRole(roles),
      launchedAt: new Date().toISOString(),
    }

    // Persist before redirecting — otherwise the browser can request /dashboard
    // before the store has the session and bounce straight back to a 401.
    req.session.save((err) => {
      if (err) {
        console.error(`[lti] session save failed: ${err.message}`)
        return res.status(500).json({ error: true, message: 'Could not start session' })
      }

      console.log(
        `[lti] launch ok — canvasUserId=${canvasUserId} role=${req.session.lti.role}`
      )
      res.redirect('/dashboard')
    })
  } catch (err) {
    console.error(`[lti] launch failed: ${err.message}`)
    res.status(401).json({ error: true, message: 'LTI launch validation failed' })
  }
})

/**
 * GET /lti/session — who the current launch says we are. Handy for debugging a
 * Canvas install without opening the dashboard.
 */
router.get('/session', (req, res) => {
  if (!LTI_CONFIG.enabled) {
    return res.json({ enabled: false, authenticated: false })
  }

  const session = req.session?.lti ?? null
  res.json({
    enabled: true,
    authenticated: Boolean(session),
    user: session ? { ...session } : null,
  })
})

export default router
