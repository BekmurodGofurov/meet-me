import { useState } from 'react'
import CodeInput from './CodeInput'

const CODE_LENGTH = 6

export default function Lobby({ onCreate, onJoin, error, disabled }) {
  const [step, setStep] = useState('name')
  const [name, setName] = useState('')
  const [chars, setChars] = useState(Array(CODE_LENGTH).fill(''))

  const trimmedName = name.trim()
  const code = chars.join('')
  const codeComplete = chars.every(Boolean)

  const submitJoin = (value = code) => {
    if (value.length === CODE_LENGTH && !disabled) onJoin(value, trimmedName)
  }

  if (step === 'name') {
    return (
      <div className="lobby">
        <h2>What's your name?</h2>
        <input
          autoFocus
          placeholder="e.g. Bekmurod"
          value={name}
          maxLength={24}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && trimmedName && setStep('choice')}
        />
        <button disabled={!trimmedName} onClick={() => setStep('choice')}>
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

        <button disabled={disabled} onClick={() => onCreate(trimmedName)}>
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
