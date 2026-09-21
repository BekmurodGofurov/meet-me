import { useEffect, useRef } from 'react'

export default function VideoTile({
  stream,
  muted = false,
  label,
  showVideo = true,
  onClick,
  size = 'normal',
  active = false,
}) {
  const videoRef = useRef(null)

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream ?? null
    }
  }, [stream])

  const initial = label?.trim()?.[0]?.toUpperCase() ?? '?'
  const clickable = Boolean(onClick)

  return (
    <figure
      className={`video-tile video-tile--${size} ${active ? 'is-active' : ''} ${clickable ? 'is-clickable' : ''}`}
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
        {(!showVideo || !stream) && <div className="video-tile__placeholder">{initial}</div>}
      </div>
      <figcaption>{label}</figcaption>
    </figure>
  )
}
