import { useState } from 'react'
import { Link } from 'react-router-dom'
import StatusDot from './StatusDot'
import Logo from './Logo'
import ThemeToggle from './ThemeToggle'

export default function Topbar({ connectionStatus, roomId, admitRequests = [], onShowAdmitPanel }) {
  const [copied, setCopied] = useState(false)

  const copyRoomCode = async () => {
    if (!roomId) return
    try {
      await navigator.clipboard.writeText(roomId)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      console.error('Failed to copy room code', err)
    }
  }

  return (
    <header className="topbar">
      <Link to="/" className="topbar__brand-link" style={{ textDecoration: 'none' }}>
        <div className="topbar__brand">
          <Logo size={32} className="topbar__logo" />
          <h1 className="topbar__title">Meet Me</h1>
        </div>
      </Link>

      <div className="topbar__right">
        {admitRequests.length > 0 && (
          <button
            className="topbar__admit-badge"
            onClick={onShowAdmitPanel}
            aria-label={`${admitRequests.length} waiting to join`}
            title="Click to view requests"
          >
            <span className="topbar__admit-count">{admitRequests.length}</span>
            <span>waiting</span>
          </button>
        )}

        <ThemeToggle />

        <StatusDot status={connectionStatus} />

        {roomId && (
          <button className="topbar__room" onClick={copyRoomCode} title="Click to copy room code">
            {copied ? 'Copied!' : `Room ${roomId}`}
          </button>
        )}
      </div>
    </header>
  )
}
