import { useRef } from 'react'

const LENGTH = 6

export default function CodeInput({ chars, onChange, onComplete }) {
  const inputsRef = useRef([])

  const commit = (next) => {
    onChange(next)
    if (next.every(Boolean)) onComplete?.(next.join(''))
  }

  const handleChange = (index, raw) => {
    const char = raw.trim().slice(-1).toLowerCase()
    if (!char) return

    const next = [...chars]
    next[index] = char
    commit(next)

    inputsRef.current[index + 1]?.focus()
  }

  const handleKeyDown = (index, event) => {
    if (event.key === 'Backspace') {
      event.preventDefault()
      const next = [...chars]

      if (next[index]) {
        next[index] = ''
      } else if (index > 0) {
        next[index - 1] = ''
        inputsRef.current[index - 1]?.focus()
      }
      commit(next)
    }

    if (event.key === 'ArrowLeft') inputsRef.current[index - 1]?.focus()
    if (event.key === 'ArrowRight') inputsRef.current[index + 1]?.focus()
  }

  const handlePaste = (event) => {
    event.preventDefault()
    const pasted = event.clipboardData.getData('text').trim().toLowerCase().slice(0, LENGTH)
    const next = Array.from({ length: LENGTH }, (_, i) => pasted[i] ?? '')
    commit(next)
    inputsRef.current[Math.min(pasted.length, LENGTH - 1)]?.focus()
  }

  return (
    <div className="code-input" onPaste={handlePaste}>
      {chars.map((char, index) => (
        <input
          key={index}
          ref={(el) => {
            inputsRef.current[index] = el
          }}
          className={char ? 'is-filled' : ''}
          value={char}
          inputMode="text"
          autoComplete="off"
          maxLength={1}
          aria-label={`Room code character ${index + 1}`}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
        />
      ))}
    </div>
  )
}
