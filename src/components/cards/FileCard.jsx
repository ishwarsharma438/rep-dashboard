import { DocumentIcon, PlayCircleIcon } from '../icons.jsx'

export const isVideo = (file) => Boolean(file.contentType?.startsWith('video/'))

/** One resource. Shared by the Dashboard preview and the full Resources page. */
export default function FileCard({ file }) {
  const video = isVideo(file)
  const Icon = video ? PlayCircleIcon : DocumentIcon

  return (
    <a
      href={file.url ?? '#'}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-xl bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-rep-orange"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rep-orange/15 text-rep-orange">
        <Icon className="h-5 w-5" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate font-heading text-sm font-semibold text-rep-navy" title={file.filename}>
          {file.filename}
        </p>
        {/* Videos are often hundreds of MB — surface the size plainly rather
            than as muted trailing text, so it's seen before clicking. */}
        {video ? (
          <p className="truncate font-body text-xs text-gray-500">
            <span className="font-semibold text-rep-navy">Video · {file.size ?? 'size unknown'}</span>
            <span className="text-gray-400"> — {file.courseName}</span>
          </p>
        ) : (
          <p className="truncate font-body text-xs text-gray-500">{file.courseName}</p>
        )}
      </div>

      {file.size && !video && (
        <span className="shrink-0 font-body text-xs text-gray-400">{file.size}</span>
      )}
    </a>
  )
}

export function FileCardSkeleton() {
  return (
    <div className="flex animate-pulse items-center gap-3 rounded-xl bg-white p-4 shadow-sm">
      <div className="h-10 w-10 shrink-0 rounded-full bg-gray-200" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-40 rounded bg-gray-200" />
        <div className="h-3 w-24 rounded bg-gray-200" />
      </div>
    </div>
  )
}
