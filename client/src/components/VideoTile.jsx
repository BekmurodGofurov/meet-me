import { useEffect, useRef, useState } from 'react'
import { ScreenShareIcon } from './icons'

export default function VideoTile({
  stream,
  muted = false,
  label,
  showVideo = true,
  onClick,
  size = 'normal',
  active = false,
  isScreen = false,
}) {
  const videoRef = useRef(null)
  // Browsers block unmuted autoplay until the user has interacted with the
  // page - e.g. right after a reload restores the call. Instead of silently
  // staying quiet, offer a button (a click is the interaction they need).
  const [soundBlocked, setSoundBlocked] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    if (stream) {
      if (video.srcObject !== stream) {
        video.srcObject = stream
      }
      try {
        video.play?.()?.then?.(
          () => setSoundBlocked(false),
          (err) => {
            if (err?.name === 'NotAllowedError' && !muted) setSoundBlocked(true)
          },
        )
      } catch {
        // Ignore test environments or unsupported play()
      }
    } else {
      video.srcObject = null
    }
  }, [stream, showVideo, muted])

  const enableSound = (event) => {
    event.stopPropagation()
    videoRef.current
      ?.play?.()
      ?.then?.(() => setSoundBlocked(false))
      ?.catch?.(() => {})
  }

  const initial = label?.trim()?.[0]?.toUpperCase() ?? '?'
  const clickable = Boolean(onClick)

  return (
    <figure
      className={`video-tile video-tile--${size} ${isScreen ? 'video-tile--screen' : ''} ${active ? 'is-active' : ''} ${clickable ? 'is-clickable' : ''}`}
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={(event) => {
        if (clickable && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault()
          onClick()
        }
      }}
    >
      <div className="video-tile__frame">
        {/* Stays mounted even when hidden: this element carries the peer's
            audio too, so unmounting it would silence them. */}
        <video
          ref={videoRef}
          autoPlay
          muted={muted}
          playsInline
          className={showVideo && stream ? '' : 'is-hidden'}
        />
        {(!showVideo || !stream) && (
          <div className="video-tile__placeholder">
            {isScreen ? (
              <ScreenShareIcon />
            ) : (
              <div className="video-tile__avatar">{initial}</div>
            )}
          </div>
        )}
        {soundBlocked && (
          <button type="button" className="video-tile__enable-sound" onClick={enableSound}>
            Click to enable sound
          </button>
        )}
      </div>
      <figcaption>{label}</figcaption>
    </figure>
  )
}
