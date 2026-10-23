import { useEffect, useRef } from 'react'
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

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    if (stream) {
      if (video.srcObject !== stream) {
        video.srcObject = stream
      }
      try {
        video.play?.()?.catch?.(() => {
          // Handled gracefully if browser autoplay policy delays playback
        })
      } catch {
        // Ignore test environments or unsupported play()
      }
    } else {
      video.srcObject = null
    }
  }, [stream, showVideo])

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
      </div>
      <figcaption>{label}</figcaption>
    </figure>
  )
}
