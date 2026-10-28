import { useEffect, useRef, useState } from 'react'
import Chat from './Chat'
import MediaControls from './MediaControls'
import VideoTile from './VideoTile'
import { CloseIcon } from './icons'
import { ChatBubbleIcon } from './FeatureIcons'

export default function Room({
  me,
  participants,
  localStream,
  localScreenStream,
  remoteStreams,
  remoteScreenStreams = {},
  remoteMedia,
  media,
  onLeave,
  messages,
  onSendMessage,
}) {
  const [manualPinnedId, setManualPinnedId] = useState(null)
  const [chatOpen, setChatOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [activeToast, setActiveToast] = useState(null)
  const lastMsgCountRef = useRef(messages.length)
  const toastTimeoutRef = useRef(null)

  useEffect(() => {
    if (messages.length > lastMsgCountRef.current) {
      const newMsgs = messages.slice(lastMsgCountRef.current)
      const incoming = newMsgs.filter((m) => m.kind === 'chat' && m.from !== me?.clientId)
      if (incoming.length > 0) {
        if (!chatOpen) {
          setUnreadCount((prev) => prev + incoming.length)
          const latest = incoming[incoming.length - 1]
          setActiveToast({
            id: latest.id,
            fromName: latest.fromName || 'Someone',
            text: latest.text,
          })

          if (toastTimeoutRef.current) {
            clearTimeout(toastTimeoutRef.current)
          }
          toastTimeoutRef.current = setTimeout(() => {
            setActiveToast(null)
          }, 4500)
        }
      }
    }
    lastMsgCountRef.current = messages.length
  }, [messages, chatOpen, me?.clientId])

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current)
      }
    }
  }, [])

  const handleToggleChat = () => {
    setChatOpen((prev) => {
      const next = !prev
      if (next) {
        setUnreadCount(0)
        setActiveToast(null)
      }
      return next
    })
  }

  const handleCloseChat = () => {
    setChatOpen(false)
  }

  const handleOpenChatFromToast = () => {
    setActiveToast(null)
    setChatOpen(true)
    setUnreadCount(0)
  }

  const handleDismissToast = (e) => {
    e.stopPropagation()
    setActiveToast(null)
  }

  const screenTiles = []
  if (media.screenOn && localScreenStream) {
    screenTiles.push({
      id: `screen-${me?.clientId ?? 'local'}`,
      name: me ? `${me.name} (Screen)` : 'Your Screen',
      stream: localScreenStream,
      muted: true,
      showVideo: true,
      isScreen: true,
    })
  }

  participants.forEach((participant) => {
    const isSharing = remoteMedia[participant.clientId]?.screenSharing
    const screenStream = remoteScreenStreams[participant.clientId]
    if (isSharing || screenStream) {
      screenTiles.push({
        id: `screen-${participant.clientId}`,
        name: `${participant.name}'s Screen`,
        stream: screenStream ?? null,
        muted: false,
        showVideo: true,
        isScreen: true,
      })
    }
  })

  const cameraTiles = [
    {
      id: me?.clientId ?? 'local',
      name: me ? `${me.name} (you)` : 'You',
      stream: localStream,
      muted: true,
      showVideo: media.cameraOn,
      isScreen: false,
    },
    ...participants.map((participant) => ({
      id: participant.clientId,
      name: participant.name,
      stream: remoteStreams[participant.clientId] ?? null,
      muted: false,
      showVideo: remoteMedia[participant.clientId]?.cameraOn ?? false,
      isScreen: false,
    })),
  ]

  const tiles = [...screenTiles, ...cameraTiles]

  const defaultPinnedId = screenTiles.length > 0 ? screenTiles[0].id : null
  const effectivePinnedId = manualPinnedId === 'none' ? null : (manualPinnedId ?? defaultPinnedId)

  const togglePin = (id) => {
    setManualPinnedId((prev) => {
      const active = prev === 'none' ? null : (prev ?? defaultPinnedId)
      return active === id ? 'none' : id
    })
  }

  const soloTile = tiles.length === 1 ? tiles[0] : null
  const pinnedTile = soloTile ?? tiles.find((tile) => tile.id === effectivePinnedId)
  const otherTiles = pinnedTile && !soloTile ? tiles.filter((tile) => tile.id !== pinnedTile.id) : []

  return (
    <div className="room">
      {/* Heads-up Toast Notification when someone sends a message while chat is closed */}
      {activeToast && !chatOpen && (
        <aside
          className="chat-toast"
          role="status"
          aria-live="polite"
          onClick={handleOpenChatFromToast}
        >
          <div className="chat-toast__icon" aria-hidden="true">
            <ChatBubbleIcon width={16} height={16} />
          </div>
          <div className="chat-toast__content">
            <div className="chat-toast__header">
              <span className="chat-toast__author">{activeToast.fromName}</span>
              <span className="chat-toast__hint">Tap to reply</span>
            </div>
            <span className="chat-toast__text">{activeToast.text}</span>
          </div>
          <button
            type="button"
            className="chat-toast__close"
            onClick={handleDismissToast}
            aria-label="Dismiss message notification"
          >
            <CloseIcon width={14} height={14} />
          </button>
        </aside>
      )}

      <div className="room__layout">
        {pinnedTile && otherTiles.length > 0 && (
          <div className="stage-sidebar">
            {otherTiles.map((tile) => (
              <VideoTile
                key={tile.id}
                stream={tile.stream}
                muted={tile.muted}
                showVideo={tile.showVideo}
                label={tile.name}
                size="small"
                isScreen={tile.isScreen}
                onClick={() => togglePin(tile.id)}
              />
            ))}
          </div>
        )}

        <div className="room__main">
          <div className="video-stage">
            {pinnedTile ? (
              <div className="stage-active">
                <VideoTile
                  stream={pinnedTile.stream}
                  muted={pinnedTile.muted}
                  showVideo={pinnedTile.showVideo}
                  label={pinnedTile.name}
                  size="large"
                  isScreen={pinnedTile.isScreen}
                  active={!soloTile}
                  onClick={soloTile ? undefined : () => togglePin(pinnedTile.id)}
                />
              </div>
            ) : (
              <div className="video-grid">
                {tiles.map((tile) => (
                  <VideoTile
                    key={tile.id}
                    stream={tile.stream}
                    muted={tile.muted}
                    showVideo={tile.showVideo}
                    label={tile.name}
                    isScreen={tile.isScreen}
                    onClick={() => togglePin(tile.id)}
                  />
                ))}
              </div>
            )}

            {/* Overlaid on the video itself, not a separate row below it. */}
            <div className="video-stage__controls">
              <MediaControls
                cameraOn={media.cameraOn}
                micOn={media.micOn}
                screenOn={media.screenOn}
                onToggleCamera={media.toggleCamera}
                onToggleMic={media.toggleMic}
                onToggleScreenShare={media.toggleScreenShare}
                onLeave={onLeave}
                onToggleChat={handleToggleChat}
                chatOpen={chatOpen}
                unreadCount={unreadCount}
              />
            </div>
          </div>

          {media.mediaError && <p className="media-error">{media.mediaError}</p>}
        </div>

        {/* Responsive Chat: Sidebar on desktop, slide-up sheet on mobile */}
        <div className={`room__chat-wrapper ${chatOpen ? 'is-open' : ''}`}>
          <div
            className="room__chat-backdrop"
            onClick={handleCloseChat}
            aria-hidden="true"
          />
          <div className="room__chat-panel">
            <div className="room__chat-header">
              <div className="room__chat-header-title">
                <ChatBubbleIcon width={17} height={17} />
                <span>In-Call Messages</span>
              </div>
              <button
                type="button"
                className="room__chat-close-btn"
                onClick={handleCloseChat}
                aria-label="Close chat"
              >
                <CloseIcon width={16} height={16} />
              </button>
            </div>
            <Chat messages={messages} myId={me?.clientId} onSend={onSendMessage} />
          </div>
        </div>
      </div>
    </div>
  )
}
