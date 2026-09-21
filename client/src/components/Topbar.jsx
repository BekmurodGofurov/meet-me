import { useState } from 'react'
import StatusDot from './StatusDot'

export default function Topbar({ connectionStatus, roomId }) {
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
    <div className="topbar">
      <h1>Meet Me</h1>

      <div className="topbar__right">
        <StatusDot status={connectionStatus} />
        {roomId && (
          <button className="topbar__room" onClick={copyRoomCode} title="Click to copy">
            {copied ? 'Copied!' : `Room ${roomId}`}
          </button>
        )}
      </div>
    </div>
  )
}
