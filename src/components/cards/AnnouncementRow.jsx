import { BellIcon } from '../icons.jsx'
import { formatRelativeTime, toPlainText, truncate } from '../../lib/format.js'

/**
 * One announcement. Shared by the Dashboard preview and the full page —
 * `full` keeps the whole message instead of the 150-char preview.
 */
export default function AnnouncementRow({ announcement, isNew, full = false }) {
  const plain = toPlainText(announcement.message)
  const body = full ? plain : truncate(plain)
  const relative = formatRelativeTime(announcement.postedAt)

  return (
    <li
      // Gold wash fading to transparent over 2s — only on socket-delivered items.
      className={`flex items-start gap-3 rounded-lg px-2 py-3 ${isNew ? 'rep-new-highlight' : ''}`}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rep-orange/15 text-rep-orange">
        <BellIcon className="h-4 w-4" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <h3
            className={`font-heading text-sm font-bold text-rep-navy ${full ? '' : 'truncate'}`}
          >
            {announcement.title}
          </h3>
          {relative && (
            <span className="shrink-0 font-body text-[11px] text-gray-400">{relative}</span>
          )}
        </div>
        {body && (
          <p
            className={`mt-1 font-body leading-relaxed text-gray-600 ${
              full ? 'whitespace-pre-line text-sm' : 'text-xs'
            }`}
          >
            {body}
          </p>
        )}
      </div>
    </li>
  )
}
