import { fireEvent } from '@testing-library/react'
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import useSwipeToClose from './useSwipeToClose'

let panel
let now

function setup({ enabled = true } = {}) {
  const onClose = vi.fn()
  const ref = { current: panel }
  const view = renderHook((props) => useSwipeToClose(ref, props), {
    initialProps: { enabled, onClose },
  })
  return { onClose, view }
}

const touch = (y, x = 0) => ({ touches: [{ clientX: x, clientY: y }] })

// Drag from y=0 to `to`, taking `ms` milliseconds, then let go.
function drag(target, to, ms) {
  now = 0
  fireEvent.touchStart(target, touch(0))
  now = ms
  fireEvent.touchMove(target, touch(to))
  fireEvent.touchEnd(target)
}

beforeEach(() => {
  panel = document.createElement('div')
  document.body.appendChild(panel)
  window.matchMedia = vi.fn().mockReturnValue({ matches: true })
  now = 0
  vi.spyOn(Date, 'now').mockImplementation(() => now)
})

afterEach(() => {
  panel.remove()
  vi.restoreAllMocks()
})

describe('useSwipeToClose', () => {
  it('closes when dragged down far enough, and hands the transform back to CSS', () => {
    const { onClose } = setup()

    drag(panel, 160, 1000)

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(panel.style.transform).toBe('')
  })

  it('closes on a quick flick even when the distance is short', () => {
    const { onClose } = setup()

    drag(panel, 60, 50)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('springs back when released early and slowly', () => {
    const { onClose } = setup()

    drag(panel, 50, 1000)

    expect(onClose).not.toHaveBeenCalled()
    expect(panel.style.transform).toBe('')
    expect(panel.style.transition).toBe('')
  })

  it('follows the finger while dragging', () => {
    setup()

    fireEvent.touchStart(panel, touch(0))
    fireEvent.touchMove(panel, touch(70))

    expect(panel.style.transform).toBe('translateY(70px)')
    expect(panel.style.transition).toBe('none')
  })

  it('ignores upward drags', () => {
    const { onClose } = setup()

    drag(panel, -200, 1000)

    expect(onClose).not.toHaveBeenCalled()
    expect(panel.style.transform).toBe('')
  })

  it('ignores a drag that starts in a message list scrolled away from the top', () => {
    const list = document.createElement('ul')
    list.className = 'chat__messages'
    Object.defineProperty(list, 'scrollTop', { value: 300 })
    panel.appendChild(list)
    const { onClose } = setup()

    drag(list, 300, 1000)

    expect(onClose).not.toHaveBeenCalled()
  })

  it('does close from a message list that is at the top', () => {
    const list = document.createElement('ul')
    list.className = 'chat__messages'
    panel.appendChild(list)
    const { onClose } = setup()

    drag(list, 300, 1000)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does nothing on a wide (desktop) screen', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false })
    const { onClose } = setup()

    drag(panel, 300, 1000)

    expect(onClose).not.toHaveBeenCalled()
  })

  it('does nothing while disabled, and stops listening when disabled later', () => {
    const { onClose, view } = setup({ enabled: false })
    drag(panel, 300, 1000)
    expect(onClose).not.toHaveBeenCalled()

    view.rerender({ enabled: true, onClose })
    view.rerender({ enabled: false, onClose })
    drag(panel, 300, 1000)
    expect(onClose).not.toHaveBeenCalled()
  })
})
