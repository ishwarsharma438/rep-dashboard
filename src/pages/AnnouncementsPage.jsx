import { useState } from 'react'
import { useDashboardData } from '../context/DashboardDataContext.jsx'
import AnnouncementRow from '../components/cards/AnnouncementRow.jsx'
import { courseLabel } from '../lib/announcements.js'
import { ChevronDownIcon, MegaphoneIcon } from '../components/icons.jsx'

/** Newest first — the API already returns that order; sort defensively. */
const newestFirst = (list) =>
  [...list].sort((a, b) => new Date(b.postedAt ?? 0) - new Date(a.postedAt ?? 0))

const plural = (n) => `${n} ${n === 1 ? 'announcement' : 'announcements'}`

function SkeletonList({ rows = 3 }) {
  return (
    <div className="space-y-3 py-2">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex animate-pulse items-start gap-3">
          <div className="h-8 w-8 shrink-0 rounded-full bg-gray-200" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-40 rounded bg-gray-200" />
            <div className="h-3 w-full rounded bg-gray-200" />
          </div>
        </div>
      ))}
    </div>
  )
}

function AnnouncementList({ announcements, newIds }) {
  return (
    <ul className="divide-y divide-gray-100">
      {newestFirst(announcements).map((a) => (
        <AnnouncementRow key={a.id} announcement={a} isNew={newIds.has(a.id)} full />
      ))}
    </ul>
  )
}

/**
 * One course's announcements, collapsible.
 *
 * Open by default: a teacher arriving here wants to read, not to click four
 * headings first. Collapsing is for getting a long course out of the way.
 */
function CourseSection({ group, newIds }) {
  const [open, setOpen] = useState(true)
  const count = group.announcements.length
  const unread = group.announcements.filter((a) => newIds.has(a.id)).length

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-md">
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
          {courseLabel(group)}
        </h2>

        {unread > 0 && (
          <span className="shrink-0 rounded-full bg-rep-orange px-2 py-0.5 font-body text-[10px] font-semibold text-white">
            {unread} new
          </span>
        )}
        <span className="shrink-0 font-body text-xs text-gray-500">{count}</span>
      </button>

      {open && (
        <div className="border-t border-gray-100 px-5 pb-3">
          <AnnouncementList announcements={group.announcements} newIds={newIds} />
        </div>
      )}
    </div>
  )
}

export default function AnnouncementsPage() {
  const { announcementGroups, loading, failed, newAnnouncementIds } = useDashboardData()
  const { programme, courses, programmeConfigured, total } = announcementGroups

  const busy = loading.announcements
  const broken = !busy && failed.announcements
  const ready = !busy && !broken

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold text-rep-navy sm:text-3xl">Announcements</h1>
        {ready && total > 0 && (
          <span className="font-body text-sm text-gray-500">{plural(total)}</span>
        )}
      </div>

      {busy && (
        <div className="mt-6 rounded-2xl bg-white p-5 shadow-md">
          <SkeletonList />
        </div>
      )}

      {broken && (
        <div className="mt-6 rounded-2xl bg-white p-5 shadow-md">
          <p className="py-4 font-body text-sm text-gray-500">
            Couldn't load announcements. Try refreshing.
          </p>
        </div>
      )}

      {ready && (
        <div className="mt-6 space-y-6">
          {/*
            Programme-wide posts come from the "Welcome to REP" course and go to
            everyone, so they sit above the per-course sections. The section is
            hidden entirely until that course is configured — an empty box with a
            placeholder would otherwise be the first thing on the page for
            however long it takes to create the course.
          */}
          {(programmeConfigured || programme.length > 0) && (
            <section>
              <h2 className="mb-2 font-heading text-lg font-semibold text-rep-navy">
                Programme Announcements
              </h2>

              <div className="rounded-2xl border-l-4 border-rep-orange bg-white p-5 shadow-md">
                {programme.length > 0 ? (
                  <AnnouncementList announcements={programme} newIds={newAnnouncementIds} />
                ) : (
                  <p className="font-body text-sm text-gray-500">
                    No programme-wide announcements yet
                  </p>
                )}
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-2 font-heading text-lg font-semibold text-rep-navy">
              Course Announcements
            </h2>

            {courses.length > 0 ? (
              <div className="space-y-3">
                {courses.map((group) => (
                  <CourseSection
                    key={group.courseId ?? courseLabel(group)}
                    group={group}
                    newIds={newAnnouncementIds}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 rounded-2xl bg-white py-12 text-center shadow-md">
                <MegaphoneIcon className="h-10 w-10 text-gray-300" />
                <p className="font-body text-sm text-gray-500">
                  No course announcements yet — check back soon
                </p>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
