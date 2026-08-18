import axios from 'axios'

const canvasApi = axios.create({
  baseURL: `${process.env.CANVAS_BASE_URL}/api/v1`,
  headers: {
    Authorization: `Bearer ${process.env.CANVAS_API_TOKEN}`,
  },
})

// In-memory GET cache: 20s per unique URL+params, so frontend polling doesn't
// hammer Canvas rate limits. Entries hold the in-flight promise, which also
// collapses concurrent identical requests into one upstream call.
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS) || 20 * 1000
const cache = new Map()

function cacheKey(url, params) {
  return params ? `${url}?${JSON.stringify(params)}` : url
}

/**
 * Cached GET against Canvas. Resolves to the axios response.
 * A failed request evicts its key so the next call retries fresh.
 */
export function cachedGet(url, config = {}) {
  const key = cacheKey(url, config.params)
  const hit = cache.get(key)

  if (hit && hit.expiresAt > Date.now()) {
    return hit.promise
  }

  const promise = canvasApi.get(url, config).catch((err) => {
    cache.delete(key)
    throw err
  })

  cache.set(key, { promise, expiresAt: Date.now() + CACHE_TTL_MS })
  return promise
}

export function clearCache() {
  cache.clear()
}

/**
 * Drops every cached entry whose URL contains `fragment`.
 *
 * A write makes the matching GET stale for up to the TTL, so callers invalidate
 * before re-reading — otherwise a freshly posted topic wouldn't appear for 20s.
 */
export function invalidateCache(fragment) {
  for (const key of cache.keys()) {
    if (key.includes(fragment)) cache.delete(key)
  }
}

export default canvasApi
