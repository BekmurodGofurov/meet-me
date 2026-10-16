import { useState } from 'react'
import CodeInput from './CodeInput'
import { loadName, saveName } from '../session'

const CODE_LENGTH = 6

export default function Lobby({ onCreate, onJoin, error, disabled, initialName = '' }) {
  // If a name is already remembered or passed, start at choice step
  const remembered = initialName || loadName()
  const [step, setStep] = useState(remembered ? 'choice' : 'name')
  const [name, setName] = useState(remembered)
  const [chars, setChars] = useState(Array(CODE_LENGTH).fill(''))

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
    setStep('choice')
  }

  const handleCreate = () => {
    if (!trimmedName || disabled) return
    saveName(trimmedName)
    onCreate(trimmedName)
  }

  const submitJoin = (value = code) => {
    if (value.length === CODE_LENGTH && !disabled) {
      saveName(trimmedName)
      onJoin(value, trimmedName)
    }
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
