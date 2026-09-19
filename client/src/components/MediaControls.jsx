import { CameraIcon, MicIcon } from './icons'

export default function MediaControls({ cameraOn, micOn, onToggleCamera, onToggleMic, error }) {
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

      {error && <p className="media-controls__error">{error}</p>}
    </div>
  )
}
