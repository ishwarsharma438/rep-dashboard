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

/** The `rel="next"` URL from a Canvas Link header, or null on the last page. */
function nextPageUrl(linkHeader) {
  if (!linkHeader) return null
  for (const part of linkHeader.split(',')) {
    const [urlPart, ...relParts] = part.split(';')
    if (relParts.some((r) => /rel="?next"?/.test(r))) {
      return urlPart.trim().replace(/^<|>$/g, '')
    }
  }
  return null
}

/**
 * Every page of a paginated Canvas collection, concatenated.
 *
 * `cachedGet` returns only the first page, which is fine for the single-user
 * dashboard reads where nothing exceeds 100 rows. Cohort-wide reads do exceed
 * it — a course with more than 100 enrolments would silently truncate — so the
 * admin aggregation follows the Link header instead.
 *
 * `maxPages` is a guard against an unbounded loop if Canvas ever returns a
 * self-referential next link.
 */
export async function getAllPages(url, config = {}, { maxPages = 50 } = {}) {
  const rows = []
  let response = await canvasApi.get(url, config)
  rows.push(...(Array.isArray(response.data) ? response.data : []))

  let next = nextPageUrl(response.headers?.link)
  let pages = 1

  while (next && pages < maxPages) {
    // The next link is absolute and already carries every query param, so it is
    // fetched as-is rather than rebuilt from config.params.
    response = await canvasApi.get(next, { baseURL: undefined })
    rows.push(...(Array.isArray(response.data) ? response.data : []))
    next = nextPageUrl(response.headers?.link)
    pages += 1
  }

  return rows
}

/**
 * Maps `fn` over `items` with at most `limit` requests in flight.
 *
 * Cohort aggregation needs one Canvas call per student per course. Firing those
 * unbounded would hit rate limits at cohort scale; serialising them would make
 * the admin page take minutes.
 */
export async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length)
  let cursor = 0

  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await fn(items[index], index)
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
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
