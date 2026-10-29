import { useEffect, useRef } from 'react'

const MOBILE_QUERY = '(max-width: 900px)'
const START_THRESHOLD_PX = 8
const CLOSE_DISTANCE_PX = 100
const CLOSE_VELOCITY_PX_PER_MS = 0.6

// Lets a bottom sheet be dragged down to close it. The sheet follows the
// finger; letting go past a distance (or with a quick flick) closes it,
// otherwise it springs back. The panel's own CSS transition does the
// animating - this only sets an inline transform while the finger is down.
//
// A drag that starts inside the message list only counts when the list is
// already scrolled to the top, so scrolling through old messages still works.
export default function useSwipeToClose(panelRef, { enabled, onClose }) {
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    const panel = panelRef.current
    if (!panel || !enabled) return undefined

    let tracking = false
    let dragging = false
    let startX = 0
    let startY = 0
    let startTime = 0
    let offset = 0

    const settle = () => {
      panel.style.transition = ''
      panel.style.transform = ''
    }

    const reset = () => {
      tracking = false
      dragging = false
      offset = 0
    }

    const onTouchStart = (event) => {
      reset()
      if (event.touches.length !== 1 || !window.matchMedia(MOBILE_QUERY).matches) return

      const list = event.target.closest?.('.chat__messages')
      if (list && list.scrollTop > 0) return

      const touch = event.touches[0]
      startX = touch.clientX
      startY = touch.clientY
      startTime = Date.now()
      tracking = true
    }

    const onTouchMove = (event) => {
      if (!tracking) return
      const touch = event.touches[0]
      const dy = touch.clientY - startY
      const dx = touch.clientX - startX

      if (!dragging) {
        // Upward or sideways: not ours, leave the gesture to the browser.
        if (dy < -START_THRESHOLD_PX || Math.abs(dx) > Math.abs(dy) + START_THRESHOLD_PX) {
          tracking = false
          return
        }
        if (dy <= START_THRESHOLD_PX) return
        dragging = true
        panel.style.transition = 'none'
      }

      offset = Math.max(0, dy)
      panel.style.transform = `translateY(${offset}px)`
    }

    const onTouchEnd = () => {
      if (!dragging) {
        reset()
        return
      }
      const elapsed = Math.max(1, Date.now() - startTime)
      const shouldClose = offset > CLOSE_DISTANCE_PX || offset / elapsed > CLOSE_VELOCITY_PX_PER_MS
      reset()
      settle()
      if (shouldClose) onCloseRef.current?.()
    }

    const onTouchCancel = () => {
      const wasDragging = dragging
      reset()
      if (wasDragging) settle()
    }

    panel.addEventListener('touchstart', onTouchStart, { passive: true })
    panel.addEventListener('touchmove', onTouchMove, { passive: true })
    panel.addEventListener('touchend', onTouchEnd)
    panel.addEventListener('touchcancel', onTouchCancel)

    return () => {
      panel.removeEventListener('touchstart', onTouchStart)
      panel.removeEventListener('touchmove', onTouchMove)
      panel.removeEventListener('touchend', onTouchEnd)
      panel.removeEventListener('touchcancel', onTouchCancel)
      settle()
    }
  }, [panelRef, enabled])
}
