import { Link } from 'react-router-dom'
import { useDashboardData } from '../context/DashboardDataContext.jsx'
import AnnouncementRow from './cards/AnnouncementRow.jsx'
import { MegaphoneIcon } from './icons.jsx'

// Dashboard shows a preview; the full list lives at /announcements.
const PREVIEW_COUNT = 3

export default function AnnouncementsPanel() {
  const { announcements, loading, failed, newAnnouncementIds } = useDashboardData()
  const preview = announcements.slice(0, PREVIEW_COUNT)

  return (
    <div className="rounded-2xl bg-white p-5 shadow-md">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="font-heading text-lg font-semibold text-rep-navy">Announcements</h2>
        <Link
          to="/announcements"
          className="font-body text-xs font-semibold text-rep-orange hover:underline"
        >
          View all
        </Link>
      </div>

      {loading.announcements && (
        <div className="space-y-3 py-2">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="flex animate-pulse items-start gap-3">
              <div className="h-8 w-8 shrink-0 rounded-full bg-gray-200" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-32 rounded bg-gray-200" />
                <div className="h-3 w-full rounded bg-gray-200" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading.announcements && failed.announcements && (
        <p className="py-4 font-body text-sm text-gray-500">
          Couldn't load announcements. Try refreshing.
        </p>
      )}

      {!loading.announcements && !failed.announcements && announcements.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <MegaphoneIcon className="h-9 w-9 text-gray-300" />
          <p className="font-body text-sm text-gray-500">No announcements yet — check back soon</p>
        </div>
      )}

      {!loading.announcements && !failed.announcements && announcements.length > 0 && (
        <>
          <ul className="divide-y divide-gray-100">
            {preview.map((a) => (
              <AnnouncementRow key={a.id} announcement={a} isNew={newAnnouncementIds.has(a.id)} />
            ))}
          </ul>

          {announcements.length > PREVIEW_COUNT && (
            <Link
              to="/announcements"
              className="mt-3 inline-block font-body text-xs font-semibold text-rep-orange hover:underline"
            >
              View all {announcements.length} announcements →
            </Link>
          )}
        </>
      )}
    </div>
  )
}
