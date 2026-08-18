import { Link } from 'react-router-dom'
import { useDashboardData } from '../context/DashboardDataContext.jsx'
import FileCard, { FileCardSkeleton } from './cards/FileCard.jsx'
import { DocumentIcon } from './icons.jsx'

// Dashboard shows a preview; the full grid lives at /resources.
const PREVIEW_COUNT = 6

export default function ResourceHub() {
  const { files, loading, failed } = useDashboardData()
  const preview = files.slice(0, PREVIEW_COUNT)

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-heading text-lg font-semibold text-rep-navy">Resource Hub</h2>
        {files.length > 0 && (
          <Link
            to="/resources"
            className="font-body text-xs font-semibold text-rep-orange hover:underline"
          >
            View all
          </Link>
        )}
      </div>

      {loading.files && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <FileCardSkeleton key={i} />
          ))}
        </div>
      )}

      {!loading.files && failed.files && (
        <p className="rounded-xl bg-white p-4 font-body text-sm text-gray-500 shadow-sm">
          Couldn't load resources. Try refreshing.
        </p>
      )}

      {!loading.files && !failed.files && files.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl bg-white p-8 text-center shadow-sm">
          <DocumentIcon className="h-9 w-9 text-gray-300" />
          <p className="font-body text-sm text-gray-500">
            Resources will appear here as they're added
          </p>
        </div>
      )}

      {!loading.files && !failed.files && files.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {preview.map((file) => (
              <FileCard key={`${file.courseId}-${file.id}`} file={file} />
            ))}
          </div>

          {files.length > PREVIEW_COUNT && (
            <Link
              to="/resources"
              className="mt-3 inline-block font-body text-xs font-semibold text-rep-orange hover:underline"
            >
              View all {files.length} resources →
            </Link>
          )}
        </>
      )}
    </section>
  )
}
