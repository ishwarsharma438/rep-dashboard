import { useDashboardData } from '../context/DashboardDataContext.jsx'
import AnnouncementRow from '../components/cards/AnnouncementRow.jsx'
import { MegaphoneIcon } from '../components/icons.jsx'

/** Newest first — the API already returns that order; sort defensively. */
const newestFirst = (list) =>
  [...list].sort((a, b) => new Date(b.postedAt ?? 0) - new Date(a.postedAt ?? 0))

export default function AnnouncementsPage() {
  const { announcements, loading, failed, newAnnouncementIds } = useDashboardData()
  const sorted = newestFirst(announcements)

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold text-rep-navy sm:text-3xl">Announcements</h1>
        {sorted.length > 0 && (
          <span className="font-body text-sm text-gray-500">
            {sorted.length} {sorted.length === 1 ? 'announcement' : 'announcements'}
          </span>
        )}
      </div>

      <div className="mt-6 rounded-2xl bg-white p-5 shadow-md">
        {loading.announcements && (
          <div className="space-y-3 py-2">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="flex animate-pulse items-start gap-3">
                <div className="h-8 w-8 shrink-0 rounded-full bg-gray-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-40 rounded bg-gray-200" />
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

        {!loading.announcements && !failed.announcements && sorted.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <MegaphoneIcon className="h-10 w-10 text-gray-300" />
            <p className="font-body text-sm text-gray-500">
              No announcements yet — check back soon
            </p>
          </div>
        )}

        {!loading.announcements && !failed.announcements && sorted.length > 0 && (
          <ul className="divide-y divide-gray-100">
            {sorted.map((a) => (
              <AnnouncementRow
                key={a.id}
                announcement={a}
                isNew={newAnnouncementIds.has(a.id)}
                full
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
