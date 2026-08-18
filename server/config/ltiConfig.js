// Single source of truth for LTI wiring, read once at module load like canvasConfig.
//
// LTI_ENABLED gates the whole feature. While it is false the dashboard behaves
// exactly as it did before LTI existed: no sessions are issued, /lti/launch is
// inert, and every /api request resolves to FALLBACK_USER_ID.
const LTI_CONFIG = {
  enabled: String(process.env.LTI_ENABLED ?? 'false').toLowerCase() === 'true',
  consumerKey: process.env.LTI_CONSUMER_KEY,
  sharedSecret: process.env.LTI_SHARED_SECRET,
  sessionSecret: process.env.SESSION_SECRET,

  // The user the dashboard reads when LTI is off — unchanged from the
  // pre-LTI hardcoded id, so standalone mode is byte-identical.
  fallbackUserId: Number(process.env.LTI_FALLBACK_USER_ID) || 2619,
}

/**
 * Reasons the launch endpoint cannot run, as a list. Empty means ready.
 * Checked at boot so a misconfigured deploy fails loudly rather than at launch.
 */
export function ltiConfigErrors() {
  const missing = []
  if (!LTI_CONFIG.consumerKey) missing.push('LTI_CONSUMER_KEY')
  if (!LTI_CONFIG.sharedSecret) missing.push('LTI_SHARED_SECRET')
  if (!LTI_CONFIG.sessionSecret) missing.push('SESSION_SECRET')
  return missing
}

export default LTI_CONFIG
