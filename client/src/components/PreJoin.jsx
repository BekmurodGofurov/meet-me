import { useEffect, useRef, useState } from 'react'
import { CameraIcon, MicIcon } from './icons'
import { saveName } from '../session'

export default function PreJoin({
  roomId,
  initialName = '',
  media,
  onSubmitJoin,
  onCancel,
  disabled = false,
  error = '',
}) {
  const [name, setName] = useState(initialName)
  const videoRef = useRef(null)

  const trimmedName = name.trim()
  const initial = trimmedName?.[0]?.toUpperCase() ?? '?'

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    if (media?.cameraOn && media?.stream) {
      if (video.srcObject !== media.stream) {
        video.srcObject = media.stream
      }
      try {
        video.play?.()?.catch?.(() => {})
      } catch {
        // Ignore in test environments
      }
    } else {
      video.srcObject = null
    }
  }, [media?.cameraOn, media?.stream])

  const handleNameChange = (val) => {
    setName(val)
    if (val.trim()) {
      saveName(val.trim())
    }
  }

  const handleSubmit = (e) => {
    e?.preventDefault()
    if (!trimmedName || disabled) return
    saveName(trimmedName)
    onSubmitJoin(roomId, trimmedName)
  }

  const canSubmit = Boolean(trimmedName) && !disabled

  return (
    <div className="prejoin">
      <div className="prejoin__header">
        <h1>Ready to join?</h1>
        <p>Set up your camera and audio before entering the meeting</p>
      </div>

      <div className="prejoin__content">
        {/* Left Column: Camera Preview Box */}
        <div className="prejoin__preview-card">
          {media?.cameraOn && media?.stream ? (
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="prejoin__video"
              aria-label="Camera preview"
            />
          ) : (
            <div className="prejoin__placeholder">
              <div className="prejoin__avatar" aria-hidden="true">
                {initial}
              </div>
              <p className="prejoin__placeholder-text">Camera is off</p>
            </div>
          )}

          {/* Quick overlay controls on preview */}
          <div className="prejoin__preview-controls">
            <button
              type="button"
              className={`prejoin__media-pill-btn ${media?.micOn ? 'is-on' : 'is-off'}`}
              onClick={media?.toggleMic}
              aria-label={media?.micOn ? 'Mute microphone' : 'Unmute microphone'}
              title={media?.micOn ? 'Mute microphone' : 'Unmute microphone'}
            >
              <MicIcon off={!media?.micOn} />
              <span>{media?.micOn ? 'Mic on' : 'Mic off'}</span>
            </button>

            <button
              type="button"
              className={`prejoin__media-pill-btn ${media?.cameraOn ? 'is-on' : 'is-off'}`}
              onClick={media?.toggleCamera}
              aria-label={media?.cameraOn ? 'Turn camera off' : 'Turn camera on'}
              title={media?.cameraOn ? 'Turn camera off' : 'Turn camera on'}
            >
              <CameraIcon off={!media?.cameraOn} />
              <span>{media?.cameraOn ? 'Camera on' : 'Camera off'}</span>
            </button>
          </div>
        </div>

        {/* Right Column: Name & Join Action Card */}
        <form className="prejoin__settings-card" onSubmit={handleSubmit}>
          <div className="prejoin__field">
            <label htmlFor="prejoin-name-input">Your name</label>
            <input
              id="prejoin-name-input"
              autoFocus={!initialName}
              placeholder="Your name... e.g. Bekmurod"
              value={name}
              maxLength={24}
              onChange={(e) => handleNameChange(e.target.value)}
            />
          </div>

          {(error || media?.mediaError) && (
            <p className="prejoin__error">{error || media?.mediaError}</p>
          )}

          <div className="prejoin__actions">
            {onCancel && (
              <button
                type="button"
                className="is-secondary is-cancel"
                onClick={onCancel}
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={!canSubmit}
            >
              Request to join room
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
