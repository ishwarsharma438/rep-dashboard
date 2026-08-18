import { CalendarCheckIcon, CalendarIcon } from './icons.jsx'

// Same icons the sidebar uses for these nav items, so the page matches the nav.
const ICONS = {
  sessions: CalendarCheckIcon,
  calendar: CalendarIcon,
}

/**
 * Honest placeholder for a route that exists in the nav but isn't built yet.
 * Deliberately shows no mock UI — just what the page will hold, and when.
 */
export default function ComingSoon({ title, description, icon }) {
  const Icon = ICONS[icon] ?? CalendarIcon

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-12 sm:px-6">
      <div className="flex max-w-md flex-col items-center text-center">
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-rep-orange/15 text-rep-orange">
          <Icon className="h-9 w-9" />
        </span>

        <h1 className="mt-5 font-heading text-2xl font-bold text-rep-navy sm:text-3xl">{title}</h1>

        <span className="mt-3 rounded-full bg-rep-gold px-3 py-1 font-body text-xs font-semibold text-white">
          Coming Soon
        </span>

        <p className="mt-4 font-body text-sm leading-relaxed text-gray-500">{description}</p>
      </div>
    </div>
  )
}
