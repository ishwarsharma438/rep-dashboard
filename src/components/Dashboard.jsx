import CourseCards from './CourseCards.jsx'
import JourneyTimeline from './JourneyTimeline.jsx'
import SessionsSection from './SessionsSection.jsx'
import CollaborationSpace from './CollaborationSpace.jsx'
import ResourceHub from './ResourceHub.jsx'
import EngagementStats from './EngagementStats.jsx'
import ComingUp from './ComingUp.jsx'
import AnnouncementsPanel from './AnnouncementsPanel.jsx'
import repLogo from '../assets/rep-logo.png'
import { useProfile } from '../context/ProfileContext.jsx'

const firstNameOf = (name = '') => name.trim().split(/\s+/)[0] ?? ''

export default function Dashboard() {
  const { user, loading, failed } = useProfile()
  const firstName = firstNameOf(user?.name)

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex items-start justify-between gap-4">
        {loading ? (
          <div className="h-9 w-64 animate-pulse rounded bg-gray-200" />
        ) : (
          <h1 className="font-heading text-2xl font-bold text-rep-navy sm:text-3xl">
            {failed || !firstName ? 'Welcome' : `Welcome, ${firstName}`}
          </h1>
        )}
        <img src={repLogo} alt="REP" className="h-12 w-auto shrink-0 object-contain" />
      </div>

      <EngagementStats />

      {/* Program-position context, full width, above the two-column section. */}
      <JourneyTimeline />

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left column (wider) */}
        <div className="space-y-8 lg:col-span-2">
          <section>
            <h2 className="mb-3 font-heading text-lg font-semibold text-rep-navy">
              Your Courses
            </h2>
            <CourseCards />
          </section>

          <SessionsSection />
          <CollaborationSpace />
          <ResourceHub />
        </div>

        {/* Right column (narrower) */}
        <div className="space-y-6 lg:col-span-1">
          <ComingUp />
          <AnnouncementsPanel />
        </div>
      </div>
    </div>
  )
}
