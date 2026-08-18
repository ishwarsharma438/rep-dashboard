import { NavLink } from 'react-router-dom'
import repLogoFull from '../assets/rep-logo-full.png'
import Avatar from './Avatar.jsx'
import { useProfile } from '../context/ProfileContext.jsx'
import {
  BookIcon,
  CalendarCheckIcon,
  CalendarIcon,
  ChevronDownIcon,
  CloseIcon,
  DocumentIcon,
  HouseIcon,
  MegaphoneIcon,
} from './icons.jsx'

// Only the Dashboard view exists this milestone; the other items route to the
// same view so the navigation shell feels real rather than disabled.
const NAV_ITEMS = [
  { label: 'Dashboard', to: '/dashboard', Icon: HouseIcon },
  { label: 'Courses', to: '/courses', Icon: BookIcon },
  { label: 'Sessions', to: '/sessions', Icon: CalendarCheckIcon },
  { label: 'Calendar', to: '/calendar', Icon: CalendarIcon },
  { label: 'Announcements', to: '/announcements', Icon: MegaphoneIcon },
  { label: 'Resources', to: '/resources', Icon: DocumentIcon },
]

function NavItem({ item, onNavigate }) {
  const { label, to, Icon } = item

  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      // "/" also counts as Dashboard.
      className={({ isActive }) =>
        `relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
          isActive
            ? 'bg-white/5 font-semibold text-rep-orange'
            : 'text-white/70 hover:bg-white/5 hover:text-white'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span className="absolute inset-y-1 left-0 w-1 rounded-full bg-rep-orange" />
          )}
          <Icon className="h-5 w-5 shrink-0" />
          <span>{label}</span>
        </>
      )}
    </NavLink>
  )
}

export default function Sidebar({ open, onClose }) {
  const { user, loading } = useProfile()

  return (
    <>
      {/* Scrim behind the mobile drawer */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-60 shrink-0 flex-col bg-rep-navy transition-transform duration-200 ease-out md:static md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close navigation"
          className="absolute right-3 top-3 rounded-md p-1 text-white/60 hover:bg-white/10 hover:text-white md:hidden"
        >
          <CloseIcon className="h-5 w-5" />
        </button>

        {/* Full horizontal lockup: wordmark and partner logos live in the image. */}
        <div className="px-4 pb-5 pt-5">
          <div className="rounded-lg bg-white p-3">
            <img
              src={repLogoFull}
              alt="replenish — Resilient Educators Partnership"
              className="h-auto w-full object-contain"
            />
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3">
          {NAV_ITEMS.map((item) => (
            <NavItem key={item.to} item={item} onNavigate={onClose} />
          ))}
        </nav>

        {/* Pinned user block */}
        <div className="border-t border-white/10 p-3">
          {loading ? (
            <div className="flex animate-pulse items-center gap-3 px-2 py-1.5">
              <div className="h-9 w-9 rounded-full bg-white/15" />
              <div className="h-3 w-24 rounded bg-white/15" />
            </div>
          ) : (
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/5"
            >
              <Avatar user={user} size={36} />
              <span className="min-w-0 flex-1 truncate font-body text-sm text-white">
                {user?.name ?? 'Unable to load profile'}
              </span>
              <ChevronDownIcon className="h-4 w-4 shrink-0 text-white/50" />
            </button>
          )}
        </div>
      </aside>
    </>
  )
}
