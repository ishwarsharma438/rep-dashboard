import { useDashboardData } from '../context/DashboardDataContext.jsx'
import FileCard, { FileCardSkeleton, isVideo } from '../components/cards/FileCard.jsx'
import { DocumentIcon } from '../components/icons.jsx'

export default function ResourcesPage() {
  const { files, loading, failed } = useDashboardData()
  const videoCount = files.filter(isVideo).length

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold text-rep-navy sm:text-3xl">Resource Hub</h1>
        {files.length > 0 && (
          <span className="font-body text-sm text-gray-500">
            {files.length} files · {videoCount} videos
          </span>
        )}
      </div>

      <div className="mt-6">
        {loading.files && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
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
          <div className="flex flex-col items-center gap-2 rounded-xl bg-white p-12 text-center shadow-sm">
            <DocumentIcon className="h-10 w-10 text-gray-300" />
            <p className="font-body text-sm text-gray-500">
              Resources will appear here as they're added
            </p>
          </div>
        )}

        {!loading.files && !failed.files && files.length > 0 && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {files.map((file) => (
              <FileCard key={`${file.courseId}-${file.id}`} file={file} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
