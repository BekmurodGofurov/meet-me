import { CameraIcon, LeaveIcon, MicIcon, ScreenShareIcon } from './icons'
import { ChatBubbleIcon } from './FeatureIcons'

export default function MediaControls({
  cameraOn,
  micOn,
  screenOn = false,
  onToggleCamera,
  onToggleMic,
  onToggleScreenShare,
  onLeave,
  onToggleChat,
  chatOpen = false,
  unreadCount = 0,
}) {
  return (
    <div className="media-controls">
      <button
        className={`icon-button ${micOn ? 'is-on' : ''}`}
        onClick={onToggleMic}
        aria-pressed={micOn}
        aria-label={micOn ? 'Mute microphone' : 'Turn microphone on'}
        title={micOn ? 'Mute microphone' : 'Turn microphone on'}
      >
        <MicIcon off={!micOn} />
      </button>

      <button
        className={`icon-button ${cameraOn ? 'is-on' : ''}`}
        onClick={onToggleCamera}
        aria-pressed={cameraOn}
        aria-label={cameraOn ? 'Turn camera off' : 'Turn camera on'}
        title={cameraOn ? 'Turn camera off' : 'Turn camera on'}
      >
        <CameraIcon off={!cameraOn} />
      </button>

      <button
        className={`icon-button icon-button--screen ${screenOn ? 'is-on is-sharing' : ''}`}
        onClick={onToggleScreenShare}
        aria-pressed={Boolean(screenOn)}
        aria-label={screenOn ? 'Stop sharing screen' : 'Share screen'}
        title={screenOn ? 'Stop sharing screen' : 'Share screen'}
      >
        <ScreenShareIcon off={!screenOn} />
      </button>

      {onToggleChat && (
        <button
          className={`icon-button icon-button--chat ${chatOpen ? 'is-chat-open' : ''}`}
          onClick={onToggleChat}
          aria-pressed={Boolean(chatOpen)}
          aria-label={chatOpen ? 'Close chat' : 'Open chat'}
          title={chatOpen ? 'Close chat' : 'Open chat'}
        >
          <ChatBubbleIcon width={20} height={20} />
          {unreadCount > 0 && (
            <span
              className="media-controls__unread-badge"
              aria-label={`${unreadCount} unread message${unreadCount > 1 ? 's' : ''}`}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      )}

      <button
        className="icon-button icon-button--leave"
        onClick={onLeave}
        aria-label="Leave room"
        title="Leave room"
      >
        <LeaveIcon />
      </button>
    </div>
  )
}
