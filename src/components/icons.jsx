// Inline SVG icon set — no external icon library.
// Every icon inherits currentColor and sizes from its className.

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': 'true',
}

export function HouseIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h3v-6h6v6h3a1 1 0 0 0 1-1V9.5" />
    </svg>
  )
}

export function BookIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v15H5.5A1.5 1.5 0 0 0 4 19.5Z" />
      <path d="M4 19.5A1.5 1.5 0 0 1 5.5 18H19v3H5.5A1.5 1.5 0 0 1 4 19.5Z" />
    </svg>
  )
}

export function CalendarCheckIcon(props) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
      <path d="m9 15 2 2 4-4" />
    </svg>
  )
}

export function CalendarIcon(props) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  )
}

export function CalendarPlusIcon(props) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
      <path d="M12 13v5M9.5 15.5h5" />
    </svg>
  )
}

export function MegaphoneIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 10v4a1 1 0 0 0 1 1h2l9 4.5v-15L7 9H5a1 1 0 0 0-1 1Z" />
      <path d="M8 15.3V20a1 1 0 0 0 1 1h1.4a1 1 0 0 0 1-1v-2.7" />
      <path d="M19 9.8a3 3 0 0 1 0 4.4" />
    </svg>
  )
}

export function BellIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7" />
      <path d="M13.7 20a2 2 0 0 1-3.4 0" />
    </svg>
  )
}

export function DocumentIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </svg>
  )
}

export function PlayCircleIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M10.2 8.8v6.4l5.3-3.2Z" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function MenuIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  )
}

export function CloseIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  )
}

export function ChevronLeftIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="m15 5-7 7 7 7" />
    </svg>
  )
}

export function ChevronRightIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="m9 5 7 7-7 7" />
    </svg>
  )
}

export function ChevronDownIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

export function CheckIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="m5 13 4 4L19 7" />
    </svg>
  )
}

export function VideoIcon(props) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="6" width="12" height="12" rx="2" />
      <path d="m15 11 6-3v8l-6-3Z" />
    </svg>
  )
}

/* ---- Course icons ---- */

export function SproutIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 21v-8" />
      <path d="M12 13C12 9.5 9.5 7 6 7c0 3.5 2.5 6 6 6Z" />
      <path d="M12 13c0-3 2-5.5 5-5.5 0 3-2 5.5-5 5.5Z" />
    </svg>
  )
}

export function PeopleIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <path d="M16.5 6.2a3 3 0 0 1 0 5.6M17.5 14.3A5.5 5.5 0 0 1 21 20" />
    </svg>
  )
}

export function PersonIcon(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  )
}

/** Physical venue — marks the in-person sessions apart from the online ones. */
export function MapPinIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  )
}

export function BrainIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 5.5a3 3 0 0 0-5.9-.6A2.8 2.8 0 0 0 4 7.6c0 .7.2 1.3.6 1.8A3 3 0 0 0 5.2 15a3 3 0 0 0 2.9 2.9A2.7 2.7 0 0 0 12 19Z" />
      <path d="M12 5.5a3 3 0 0 1 5.9-.6A2.8 2.8 0 0 1 20 7.6c0 .7-.2 1.3-.6 1.8a3 3 0 0 1-.6 5.6 3 3 0 0 1-2.9 2.9A2.7 2.7 0 0 1 12 19Z" />
      <path d="M12 5.5V19" />
    </svg>
  )
}

export function LotusIcon(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 19c-3 0-5.5-1.6-7-4 1.2-.9 2.6-1.3 4-1.2" />
      <path d="M12 19c3 0 5.5-1.6 7-4-1.2-.9-2.6-1.3-4-1.2" />
      <path d="M12 19c-2.2-1.8-3.4-4-3.4-6.4 0-2.3 1.2-4.4 3.4-6.1 2.2 1.7 3.4 3.8 3.4 6.1 0 2.4-1.2 4.6-3.4 6.4Z" />
    </svg>
  )
}
