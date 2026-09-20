const base = {
  viewBox: '0 0 24 24',
  width: 22,
  height: 22,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

export function MicIcon({ off = false }) {
  return (
    <svg {...base} aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <line x1="12" y1="18" x2="12" y2="21" />
      {off && <line x1="4" y1="4" x2="20" y2="20" />}
    </svg>
  )
}

export function CameraIcon({ off = false }) {
  return (
    <svg {...base} aria-hidden="true">
      <rect x="3" y="6" width="12" height="12" rx="2.5" />
      <path d="M15 10.5 21 7.5v9l-6-3z" />
      {off && <line x1="3" y1="3" x2="21" y2="21" />}
    </svg>
  )
}

export function LeaveIcon() {
  // Rotated phone-hangup glyph, the universal "end call" symbol.
  return (
    <svg {...base} aria-hidden="true" transform="rotate(135)">
      <path d="M3 12c5-4 13-4 18 0" />
      <path d="M8 12.5 6 15" />
      <path d="M16 12.5 18 15" />
      <circle cx="12" cy="13.5" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  )
}
