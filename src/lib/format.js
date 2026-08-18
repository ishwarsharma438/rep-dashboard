/**
 * Relative time from an ISO timestamp: "just now", "2 hours ago", "3 days ago".
 */
export function formatRelativeTime(iso, now = Date.now()) {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''

  const seconds = Math.round((now - then) / 1000)
  if (seconds < 0) return 'just now'

  const units = [
    { limit: 60, seconds: 1, name: 'second' },
    { limit: 3600, seconds: 60, name: 'minute' },
    { limit: 86400, seconds: 3600, name: 'hour' },
    { limit: 604800, seconds: 86400, name: 'day' },
    { limit: 2592000, seconds: 604800, name: 'week' },
    { limit: 31536000, seconds: 2592000, name: 'month' },
    { limit: Infinity, seconds: 31536000, name: 'year' },
  ]

  if (seconds < 45) return 'just now'

  const unit = units.find((u) => seconds < u.limit)
  const value = Math.max(1, Math.floor(seconds / unit.seconds))
  return `${value} ${unit.name}${value === 1 ? '' : 's'} ago`
}

/**
 * Canvas announcement bodies are HTML; render them as plain text.
 * Stripping before truncating also avoids cutting a tag in half, and keeps
 * unsanitised Canvas markup out of the DOM.
 */
export function toPlainText(html = '') {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

export const MAX_MESSAGE_LENGTH = 150

export function truncate(text, max = MAX_MESSAGE_LENGTH) {
  return text.length > max ? `${text.slice(0, max)}...` : text
}
