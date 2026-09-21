import { CameraIcon, LeaveIcon, MicIcon } from './icons'

export default function MediaControls({ cameraOn, micOn, onToggleCamera, onToggleMic, onLeave }) {
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
