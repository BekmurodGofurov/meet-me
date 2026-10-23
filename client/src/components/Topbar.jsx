import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import StatusDot from './StatusDot'
import Logo from './Logo'
import ThemeToggle from './ThemeToggle'

export default function Topbar({
  connectionStatus,
  roomId,
  admitRequests = [],
  onShowAdmitPanel,
  inviteLink,
  onCreateInvite,
}) {
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const containerRef = useRef(null)

  const shareUrl = inviteLink || (roomId ? `${window.location.origin}/lobby?action=join&roomId=${roomId}` : '')

  const handleToggleInvite = () => {
    if (!showInviteModal) {
      if (!inviteLink && onCreateInvite) {
        onCreateInvite()
      }
      setShowInviteModal(true)
    } else {
      setShowInviteModal(false)
    }
  }

  const handleCopyCode = async () => {
    if (!roomId) return
    try {
      await navigator.clipboard.writeText(roomId)
      setCodeCopied(true)
      setTimeout(() => setCodeCopied(false), 1500)
    } catch (err) {
      console.error('Failed to copy room code', err)
    }
  }

  const handleCopyLink = async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 1500)
    } catch (err) {
      console.error('Failed to copy share link', err)
    }
  }

  useEffect(() => {
    if (!showInviteModal) return

    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowInviteModal(false)
      }
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setShowInviteModal(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [showInviteModal])

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
          <div className="topbar__invite-container" ref={containerRef}>
            <button
              className="topbar__room topbar__invite-btn"
              onClick={handleToggleInvite}
              data-room-id={roomId}
              title={`Room ${roomId} • Click to invite`}
              aria-label="Invite to meeting"
              aria-expanded={showInviteModal}
            >
              <span className="topbar__invite-icon" aria-hidden="true">🔗</span>
              <span>Invite</span>
            </button>

            {showInviteModal && (
              <div className="topbar__invite-modal" role="dialog" aria-label="Invite to meeting">
                <div className="topbar__invite-modal-header">
                  <span className="topbar__invite-modal-title">Invite to Meeting</span>
                  <button
                    className="topbar__invite-modal-close"
                    onClick={() => setShowInviteModal(false)}
                    aria-label="Close"
                  >
                    ✕
                  </button>
                </div>

                <div className="topbar__invite-modal-body">
                  <div className="topbar__invite-section">
                    <label className="topbar__invite-label">Room Code</label>
                    <div className="topbar__invite-row">
                      <div className="topbar__invite-code">{roomId}</div>
                      <button
                        className="is-secondary topbar__invite-copy-btn"
                        onClick={handleCopyCode}
                      >
                        {codeCopied ? '✓ Copied!' : 'Copy Code'}
                      </button>
                    </div>
                  </div>

                  <div className="topbar__invite-section">
                    <label className="topbar__invite-label">Share Link</label>
                    <div className="topbar__invite-row">
                      <input
                        type="text"
                        readOnly
                        value={shareUrl}
                        className="topbar__invite-input"
                        onClick={(e) => e.target.select()}
                      />
                      <button
                        className="is-secondary topbar__invite-copy-btn"
                        onClick={handleCopyLink}
                      >
                        {linkCopied ? '✓ Copied!' : 'Copy Link'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  )
}
