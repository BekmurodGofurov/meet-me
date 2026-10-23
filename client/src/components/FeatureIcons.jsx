const baseProps = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': 'true',
}

// 1. Peer-to-Peer direct connection (2 nodes connected with exchange)
export function PeerToPeerIcon(props) {
  return (
    <svg {...baseProps} {...props}>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
      <circle cx="6" cy="6" r="3" />
      <line x1="9" y1="6" x2="15" y2="6" />
    </svg>
  )
}

// 2. Screen Sharing
export function ScreenDisplayIcon(props) {
  return (
    <svg {...baseProps} {...props}>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <polyline points="10 9 12 7 14 9" />
      <line x1="12" y1="7" x2="12" y2="13" />
    </svg>
  )
}

// 3. Live Chat
export function ChatBubbleIcon(props) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <line x1="8" y1="10" x2="16" y2="10" />
      <line x1="8" y1="6" x2="12" y2="6" />
    </svg>
  )
}

// 4. Privacy & No Signup (Shield with Checkmark)
export function ShieldLockIcon(props) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  )
}

// 5. Ultra-Low Latency (Fast Bolt)
export function LightningIcon(props) {
  return (
    <svg {...baseProps} {...props}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  )
}

// 6. Open Source / Transparency (Code Brackets)
export function CodeBranchIcon(props) {
  return (
    <svg {...baseProps} {...props}>
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
      <line x1="14" y1="4" x2="10" y2="20" />
    </svg>
  )
}

// Sun Icon
export function SunIcon(props) {
  return (
    <svg {...baseProps} width={18} height={18} {...props}>
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  )
}

// Moon Icon
export function MoonIcon(props) {
  return (
    <svg {...baseProps} width={18} height={18} {...props}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}
