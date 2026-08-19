import { createClient } from 'redis'
import { RedisStore } from 'connect-redis'

/**
 * Redis-backed session storage.
 *
 * Without REDIS_URL the app keeps express-session's default MemoryStore, which
 * is exactly the previous behaviour — fine for local dev, but it loses every
 * session on restart, which is what this module exists to fix in production.
 *
 * Redis being unavailable must never take the app down. The client reconnects
 * on its own, and the store is wrapped (see resilientStore) so a dead Redis
 * degrades to "nobody is logged in" rather than a 500 on every request.
 */

// 'not configured' | 'connected' | 'disconnected'
let status = 'not configured'
let client = null

export const redisStatus = () => status

/**
 * Wraps a session store so read failures degrade instead of erroring.
 *
 *   get      — a failure resolves to "no session". The teacher is treated as
 *              unauthenticated and gets the normal 401, rather than a 500 on
 *              every request while Redis is down.
 *   touch    — failures are ignored; it only extends an expiry.
 *   destroy  — failures are ignored; the cookie is being discarded anyway.
 *   set      — failures propagate ON PURPOSE. An LTI launch that cannot persist
 *              its session must fail loudly at /lti/launch instead of
 *              redirecting the teacher into a dashboard that 401s.
 */
function resilientStore(store) {
  const soften = (method, fallback) => {
    const original = store[method]?.bind(store)
    if (typeof original !== 'function') return

    store[method] = (...args) => {
      const callback = args[args.length - 1]
      if (typeof callback !== 'function') return original(...args)

      original(...args.slice(0, -1), (err, result) => {
        if (err) {
          console.error(`[redis] session ${method} failed: ${err.message}`)
          return callback(null, fallback)
        }
        callback(null, result)
      })
    }
  }

  soften('get', undefined)
  soften('touch', undefined)
  soften('destroy', undefined)

  return store
}

/**
 * The session store for express-session.
 *
 * Returns undefined when REDIS_URL is unset, which leaves express-session on
 * its built-in MemoryStore — the caller passes it straight through as `store`.
 */
export function createSessionStore() {
  const url = process.env.REDIS_URL?.trim()

  if (!url) {
    status = 'not configured'
    console.log('[session] no REDIS_URL — using in-memory sessions (lost on restart)')
    return undefined
  }

  client = createClient({
    url,
    socket: {
      // Keep retrying forever, backing off to 3s so a Redis outage produces a
      // steady trickle of retries rather than a tight loop of error logs.
      reconnectStrategy: (retries) => Math.min(retries * 200, 3000),
    },
  })

  client.on('error', (err) => {
    // Fires on every failed reconnect, so this must not be noisy per attempt.
    if (status !== 'disconnected') {
      console.error(`[redis] error: ${err.message}`)
      status = 'disconnected'
    }
  })
  client.on('connect', () => console.log('[redis] connecting…'))
  client.on('ready', () => {
    console.log('[redis] connected — sessions will survive restarts')
    status = 'connected'
  })
  client.on('end', () => {
    console.warn('[redis] connection closed — sessions are unavailable until it returns')
    status = 'disconnected'
  })
  client.on('reconnecting', () => {
    status = 'disconnected'
  })

  // Deliberately not awaited: a Redis that is slow or down must not block boot.
  client.connect().catch((err) => {
    console.error(`[redis] initial connection failed: ${err.message}`)
    status = 'disconnected'
  })

  status = 'disconnected'
  return resilientStore(new RedisStore({ client, prefix: 'rep:sess:' }))
}
