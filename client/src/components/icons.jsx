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
