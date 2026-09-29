import { useState } from 'react'
import { useDashboardData } from '../context/DashboardDataContext.jsx'
import FileCard, { FileCardSkeleton, isVideo } from '../components/cards/FileCard.jsx'
import { fileCourseLabel } from '../lib/resources.js'
import { ChevronDownIcon, DocumentIcon } from '../components/icons.jsx'

const GRID = 'grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3'

function FileGrid({ files }) {
  return (
    <div className={GRID}>
      {files.map((file) => (
        <FileCard key={`${file.courseId}-${file.id}`} file={file} />
      ))}
    </div>
  )
}

/**
 * One course's resources, collapsible.
 *
 * Open by default — a teacher arriving here wants to browse, not to expand four
 * headings first. Collapsing is for getting a long course out of the way.
 */
function CourseSection({ group }) {
  const [open, setOpen] = useState(true)
  const count = group.files.length

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-gray-50"
      >
        <ChevronDownIcon
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${
            open ? '' : '-rotate-90'
          }`}
        />

        <h2 className="min-w-0 flex-1 font-heading text-sm font-bold leading-snug text-rep-navy">
          {fileCourseLabel(group)}
        </h2>

        <span className="shrink-0 font-body text-xs text-gray-500">
          {count} {count === 1 ? 'file' : 'files'}
        </span>
      </button>

      {open && (
        <div className="border-t border-gray-100 p-5">
          <FileGrid files={group.files} />
        </div>
      )}
    </div>
  )
}

export default function ResourcesPage() {
  const { fileGroups, files, loading, failed } = useDashboardData()
  const { programme, courses, programmeConfigured, total } = fileGroups

  const videoCount = files.filter(isVideo).length
  const busy = loading.files
  const broken = !busy && failed.files
  const ready = !busy && !broken

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold text-rep-navy sm:text-3xl">Resource Hub</h1>
        {ready && total > 0 && (
          <span className="font-body text-sm text-gray-500">
            {total} {total === 1 ? 'file' : 'files'} · {videoCount} videos
          </span>
        )}
      </div>

      <div className="mt-6">
        {busy && (
          <div className={GRID}>
            {Array.from({ length: 6 }, (_, i) => (
              <FileCardSkeleton key={i} />
            ))}
          </div>
        )}

        {broken && (
          <p className="rounded-xl bg-white p-4 font-body text-sm text-gray-500 shadow-sm">
            Couldn't load resources. Try refreshing.
          </p>
        )}

        {ready && (
          <div className="space-y-6">
            {/*
              Programme resources come from the "Welcome to REP" course and go to
              everyone, so they sit above the per-course sections. The section is
              hidden entirely until that course is configured, rather than showing
              an empty box for however long it takes to create it.
            */}
            {(programmeConfigured || programme.length > 0) && (
              <section>
                <h2 className="mb-2 font-heading text-lg font-semibold text-rep-navy">
                  Programme Resources
                </h2>

                {programme.length > 0 ? (
                  <div className="rounded-2xl border-l-4 border-rep-orange bg-white p-5 shadow-sm">
                    <FileGrid files={programme} />
                  </div>
                ) : (
                  <p className="rounded-2xl border-l-4 border-rep-orange bg-white p-5 font-body text-sm text-gray-500 shadow-sm">
                    No programme-wide resources yet
                  </p>
                )}
              </section>
            )}

            <section>
              <h2 className="mb-2 font-heading text-lg font-semibold text-rep-navy">
                Course Resources
              </h2>

              {courses.length > 0 ? (
                <div className="space-y-3">
                  {courses.map((group) => (
                    <CourseSection key={group.courseId ?? fileCourseLabel(group)} group={group} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 rounded-xl bg-white p-12 text-center shadow-sm">
                  <DocumentIcon className="h-10 w-10 text-gray-300" />
                  <p className="font-body text-sm text-gray-500">
                    Resources will appear here as they're added
                  </p>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
