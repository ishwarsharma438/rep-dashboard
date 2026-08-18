import { useEffect, useRef, useState } from 'react'
import { useDashboardData } from '../context/DashboardDataContext.jsx'

const DURATION_MS = 900

/** Counts 0 -> value with an ease-out curve; respects prefers-reduced-motion. */
function useCountUp(value) {
  const [display, setDisplay] = useState(0)
  const frame = useRef(0)

  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduced || value === 0) {
      setDisplay(value)
      return
    }

    let start = null
    const step = (timestamp) => {
      if (start === null) start = timestamp
      const progress = Math.min((timestamp - start) / DURATION_MS, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(Math.round(value * eased))
      if (progress < 1) frame.current = requestAnimationFrame(step)
    }

    frame.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame.current)
  }, [value])

  return display
}

function StatCard({ value, label }) {
  const shown = useCountUp(value)

  return (
    <div className="rounded-2xl bg-white px-4 py-3 shadow-md">
      <p className="font-heading text-2xl font-bold leading-none text-rep-orange">{shown}</p>
      <p className="mt-1 font-body text-xs text-gray-500">{label}</p>
    </div>
  )
}

export default function EngagementStats() {
  const { courses, announcements, discussions } = useDashboardData()

  const coursesInProgress = courses.filter((c) => c.status === 'in_progress').length
  const discussionActivity = discussions.reduce((sum, d) => sum + (d.replyCount ?? 0), 0)

  return (
    <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
      <StatCard value={coursesInProgress} label="Courses in Progress" />
      <StatCard value={announcements.length} label="Announcements" />
      <StatCard value={discussionActivity} label="Discussion Activity" />
    </div>
  )
}
