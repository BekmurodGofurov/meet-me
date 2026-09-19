import { useEffect, useRef } from 'react'

export default function VideoTile({ stream, muted = false, label }) {
  const videoRef = useRef(null)

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  return (
    <figure className="video-tile">
      <video ref={videoRef} autoPlay muted={muted} playsInline />
      {label && <figcaption>{label}</figcaption>}
    </figure>
  )
}
