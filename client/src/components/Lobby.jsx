import { useEffect, useState } from 'react'
import CodeInput from './CodeInput'
import PreJoin from './PreJoin'
import { loadName, saveName } from '../session'

const CODE_LENGTH = 6

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

  // Pre-fill chars if roomIdParam exists
  const initialChars = roomIdParam
    ? roomIdParam.slice(0, CODE_LENGTH).split('').concat(Array(CODE_LENGTH).fill('')).slice(0, CODE_LENGTH)
    : Array(CODE_LENGTH).fill('')

  const [step, setStep] = useState(() => {
    if (!remembered) return 'name'
    if (actionParam === 'create') return 'choice'
    if (actionParam === 'join' || roomIdParam) return 'join'
    return 'choice'
  })

  const [name, setName] = useState(remembered)
  const [chars, setChars] = useState(initialChars)

  const trimmedName = name.trim()
  const code = chars.join('')
  const codeComplete = chars.every(Boolean)

  const handleNameChange = (val) => {
    setName(val)
    if (val.trim()) {
      saveName(val.trim())
    }
  }

  const handleContinue = () => {
    if (!trimmedName) return
    saveName(trimmedName)
    if (actionParam === 'create') {
      onCreate(trimmedName)
      return
    }
    if (actionParam === 'join' || roomIdParam) {
      setStep('join')
      return
    }
    setStep('choice')
  }

  const handleCreate = () => {
    if (!trimmedName || disabled) return
    saveName(trimmedName)
    onCreate(trimmedName)
  }

  const submitJoin = (value = code) => {
    const finalCode = (value || code || '').trim().toLowerCase()
    if (finalCode.length === CODE_LENGTH && !disabled) {
      saveName(trimmedName)
      const joinFn = onRequestJoin || onJoin
      joinFn(finalCode, trimmedName)
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

  if (step === 'name') {
    return (
      <div className="lobby">
        <h2>Enter your name !</h2>
        <input
          autoFocus
          placeholder="Your name... e.g. Bekmurod"
          value={name}
          maxLength={24}
          onChange={(e) => handleNameChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && trimmedName && handleContinue()}
        />
        <button disabled={!trimmedName} onClick={handleContinue}>
          Continue
        </button>
      </div>
    )
  }

  if (step === 'choice') {
    return (
      <div className="lobby">
        <h2>Hi, {trimmedName}</h2>
        <p className="lobby__hint">Start a new room, or join one with a code.</p>

        <button disabled={disabled} onClick={handleCreate}>
          Create a room
        </button>
        <button className="is-secondary" onClick={() => setStep('join')}>
          Join a room
        </button>

        <button className="is-link" onClick={() => setStep('name')}>
          Change name
        </button>

        {error && <p className="lobby__error">{error}</p>}
      </div>
    )
  }

  return (
    <div className="lobby">
      <h2>Enter room code</h2>
      <p className="lobby__hint">6 characters, from whoever created the room.</p>

      <CodeInput chars={chars} onChange={setChars} onComplete={submitJoin} />

      <button disabled={!codeComplete || disabled} onClick={() => submitJoin()}>
        Join room
      </button>
      <button className="is-link" onClick={() => setStep('choice')}>
        Back
      </button>

      {error && <p className="lobby__error">{error}</p>}
    </div>
  )
}
