import { useEffect, useRef, useState } from 'react'
import CodeInput from './CodeInput'
import LobbyBackdrop from './LobbyBackdrop'
import Logo from './Logo'
import PreJoin from './PreJoin'
import StatusDot from './StatusDot'
import ThemeToggle from './ThemeToggle'
import { CameraIcon, CheckIcon } from './icons'
import { loadName, saveName } from '../session'

const CODE_LENGTH = 6

const STATUS_LABELS = {
  connected: 'Connected',
  connecting: 'Connecting…',
}

const POINTS = [
  'No signup, no password',
  'Video goes browser-to-browser',
  'Rooms vanish when everyone leaves',
]

function getSearchParams() {
  try {
    return new URLSearchParams(window.location.search)
  } catch {
    return new URLSearchParams()
  }
}

export default function Lobby({
  onCreate,
  onJoin,
  onRequestJoin,
  error,
  disabled,
  initialName = '',
  media,
  connectionStatus,
}) {
  useEffect(() => {
    try {
      window.scrollTo?.(0, 0)
      if (document?.documentElement) document.documentElement.scrollTop = 0
      if (document?.body) document.body.scrollTop = 0
    } catch {
      // Ignore
    }
  }, [])

  const searchParams = getSearchParams()
  const actionParam = searchParams.get('action') // 'create' | 'join' | null
  const roomIdParam = searchParams.get('roomId') // 'abc123' from invite link

  const remembered = initialName || loadName()

  const [name, setName] = useState(remembered)
  const [chars, setChars] = useState(Array(CODE_LENGTH).fill(''))
  const nameRef = useRef(null)
  const previewRef = useRef(null)

  const trimmedName = name.trim()
  const code = chars.join('')
  const codeComplete = chars.every(Boolean)
  const canCreate = Boolean(trimmedName) && !disabled
  const canJoin = canCreate && codeComplete
  const showPreview = Boolean(media?.cameraOn && media?.stream)

  // Same wiring PreJoin uses: hand the live camera stream to the <video>.
  useEffect(() => {
    const video = previewRef.current
    if (!video) return

    if (showPreview) {
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
  }, [showPreview, media?.stream])

  const handleNameChange = (val) => {
    setName(val)
    if (val.trim()) {
      saveName(val.trim())
    }
  }

  const handleCreate = () => {
    if (!canCreate) return
    saveName(trimmedName)
    onCreate(trimmedName)
  }

  const submitJoin = (value = code) => {
    const finalCode = (value || '').trim().toLowerCase()
    if (finalCode.length !== CODE_LENGTH || disabled) return
    if (!trimmedName) {
      // The code can be completed before the name is typed (a pasted link
      // fills every box at once), so send them to the field that's missing.
      nameRef.current?.focus()
      return
    }
    saveName(trimmedName)
    const joinFn = onRequestJoin || onJoin
    joinFn(finalCode, trimmedName)
  }

  const handleNameKeyDown = (event) => {
    if (event.key !== 'Enter') return
    if (actionParam === 'join') {
      if (canJoin) submitJoin()
    } else {
      handleCreate()
    }
  }

  // When arriving via an invite link with roomId:
  // Render Microsoft Teams style pre-join screen (camera preview, mic/camera controls, name)
  // No room code is displayed or requested from the user.
  if (roomIdParam) {
    return (
      <PreJoin
        roomId={roomIdParam}
        initialName={remembered}
        media={media}
        onSubmitJoin={(codeToJoin, nameToJoin) => {
          saveName(nameToJoin)
          const joinFn = onRequestJoin || onJoin
          joinFn(codeToJoin, nameToJoin)
        }}
        onCancel={() => {
          window.location.href = '/'
        }}
        disabled={disabled}
        error={error}
      />
    )
  }

  // Land on whatever the visitor most likely wants next: the name if we don't
  // have one, the code boxes when they came to join, Create otherwise.
  const focusName = !remembered
  const focusCode = Boolean(remembered) && actionParam === 'join'
  const focusCreate = Boolean(remembered) && !focusCode

  return (
    <div className="lobby">
      <section className="lobby__aside" aria-label="About Meet Me">
        <LobbyBackdrop />

        <a href="/" className="lobby__brand">
          <Logo size={30} />
          <span>Meet Me</span>
        </a>

        <div className="lobby__pitch">
          {showPreview && (
            <div className="lobby__preview">
              <video
                ref={previewRef}
                autoPlay
                muted
                playsInline
                className="lobby__preview-video"
                aria-label="Camera preview"
              />
              <span className="lobby__preview-name">{trimmedName || 'You'}</span>
            </div>
          )}

          <h1 className="lobby__headline">
            Ready when <br className="lobby__headline-break" />
            <span>you are.</span>
          </h1>

          <ul className="lobby__points">
            {POINTS.map((point) => (
              <li key={point}>
                <CheckIcon />
                <span>{point}</span>
              </li>
            ))}
          </ul>

          {media?.toggleCamera && (
            <button type="button" className="lobby__preview-btn" onClick={media.toggleCamera}>
              <CameraIcon off={!media.cameraOn} />
              <span>{media.cameraOn ? 'Turn camera preview off' : 'Preview your camera'}</span>
            </button>
          )}
          {media?.mediaError && <p className="lobby__aside-error">{media.mediaError}</p>}
        </div>
      </section>

      <section className="lobby__panel" aria-label="Start or join a meeting">
        <div className="lobby__panel-bar">
          {connectionStatus && (
            <span className="lobby__status">
              <StatusDot status={connectionStatus} />
              <span>{STATUS_LABELS[connectionStatus] ?? 'Disconnected'}</span>
            </span>
          )}
          <ThemeToggle />
        </div>

        <div className="lobby__form">
          <div>
            <h2 className="lobby__title">Start or join a call</h2>
            <p className="lobby__hint">Pick a name, then start a room or enter a code.</p>
          </div>

          <div className="lobby__field">
            <label htmlFor="lobby-name">Your name</label>
            <input
              id="lobby-name"
              ref={nameRef}
              autoFocus={focusName}
              autoComplete="off"
              placeholder="Your name"
              value={name}
              maxLength={24}
              onChange={(e) => handleNameChange(e.target.value)}
              onKeyDown={handleNameKeyDown}
            />
          </div>

          <button
            type="button"
            className="lobby__create"
            autoFocus={focusCreate}
            disabled={!canCreate}
            onClick={handleCreate}
          >
            Create a room
          </button>

          <div className="lobby__divider" role="separator">
            <span>or join with a code</span>
          </div>

          <div className="lobby__field">
            <span id="lobby-code-label" className="lobby__label">
              Room code
            </span>
            <div role="group" aria-labelledby="lobby-code-label">
              <CodeInput
                chars={chars}
                onChange={setChars}
                onComplete={submitJoin}
                autoFocus={focusCode}
              />
            </div>
            <p className="lobby__hint">Paste a full invite link and the code fills itself in.</p>
          </div>

          <button
            type="button"
            className="is-secondary lobby__join"
            disabled={!canJoin}
            onClick={() => submitJoin()}
          >
            Join room
          </button>

          {error && (
            <p className="lobby__error" role="alert">
              {error}
            </p>
          )}
        </div>
      </section>
    </div>
  )
}
