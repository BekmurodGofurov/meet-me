import { useEffect, useRef } from 'react'

export default function VideoTile({ stream, muted = false, label, showVideo = true }) {
  const videoRef = useRef(null)

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream ?? null
    }
  }, [stream])

  const initial = label?.trim()?.[0]?.toUpperCase() ?? '?'

  return (
    <figure className="video-tile">
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
