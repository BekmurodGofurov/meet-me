import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import CodeInput from './CodeInput'

// CodeInput is controlled (chars/onChange live in the parent), so a small
// stateful wrapper is needed to observe multi-keystroke behavior the way it
// actually gets used inside Lobby.
function ControlledCodeInput({ onComplete }) {
  const [chars, setChars] = useState(Array(6).fill(''))
  return <CodeInput chars={chars} onChange={setChars} onComplete={onComplete} />
}

function getBoxes() {
  return screen.getAllByLabelText(/room code character/i)
}

describe('CodeInput', () => {
  it('renders 6 boxes', () => {
    render(<ControlledCodeInput onComplete={() => {}} />)
    expect(getBoxes()).toHaveLength(6)
  })

  it('typing advances focus to the next box', async () => {
    const user = userEvent.setup()
    render(<ControlledCodeInput onComplete={() => {}} />)
    const boxes = getBoxes()

    await user.click(boxes[0])
    await user.keyboard('a')

    expect(boxes[0]).toHaveValue('a')
    expect(boxes[1]).toHaveFocus()
  })

  it('calls onComplete with the joined code once all 6 boxes are filled', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()
    render(<ControlledCodeInput onComplete={onComplete} />)
    const boxes = getBoxes()

    await user.click(boxes[0])
    await user.keyboard('abcdef')

    expect(onComplete).toHaveBeenCalledWith('abcdef')
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('does not call onComplete while boxes are still empty', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()
    render(<ControlledCodeInput onComplete={onComplete} />)
    const boxes = getBoxes()

    await user.click(boxes[0])
    await user.keyboard('abc')

    expect(onComplete).not.toHaveBeenCalled()
  })

  it('lowercases typed characters', async () => {
    const user = userEvent.setup()
    render(<ControlledCodeInput onComplete={() => {}} />)
    const boxes = getBoxes()

    await user.click(boxes[0])
    await user.keyboard('A')

    expect(boxes[0]).toHaveValue('a')
  })

  it('backspace on a filled box clears it without moving focus', async () => {
    const user = userEvent.setup()
    render(<ControlledCodeInput onComplete={() => {}} />)
    const boxes = getBoxes()

    await user.click(boxes[0])
    await user.keyboard('a')
    await user.click(boxes[0])
    await user.keyboard('{Backspace}')

    expect(boxes[0]).toHaveValue('')
  })

  it('backspace on an empty box clears the previous box and moves focus back', async () => {
    const user = userEvent.setup()
    render(<ControlledCodeInput onComplete={() => {}} />)
    const boxes = getBoxes()

    await user.click(boxes[0])
    await user.keyboard('a') // focus is now on box 1 (index 1), box 0 = 'a'
    await user.keyboard('{Backspace}') // box 1 is empty -> clears box 0, focuses box 0

    expect(boxes[0]).toHaveValue('')
    expect(boxes[0]).toHaveFocus()
  })

  it('pasting a full code distributes it across all boxes and completes', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()
    render(<ControlledCodeInput onComplete={onComplete} />)
    const boxes = getBoxes()

    await user.click(boxes[0])
    await user.paste('A5FB67')

    boxes.forEach((box, i) => {
      expect(box).toHaveValue('a5fb67'[i])
    })
    expect(onComplete).toHaveBeenCalledWith('a5fb67')
  })

  it('pasting a code longer than 6 characters truncates it', async () => {
    const user = userEvent.setup()
    render(<ControlledCodeInput onComplete={() => {}} />)
    const boxes = getBoxes()

    await user.click(boxes[0])
    await user.paste('abcdefgh')

    expect(boxes.map((box) => box.value).join('')).toBe('abcdef')
  })
})
