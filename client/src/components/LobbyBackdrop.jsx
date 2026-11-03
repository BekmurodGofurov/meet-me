import { useEffect, useRef, useState } from 'react'
import { PauseIcon, PlayIcon } from './icons'

const POSTER = '/media/lobby-bg-poster.jpg'

// The video is decoration, so it only plays where it can't hurt: on a wide
// screen (the narrow layout shows the poster as a small banner) and for people
// who haven't asked their OS for less motion. Everyone else gets the poster.
const PLAYABLE_QUERY = '(min-width: 900px) and (prefers-reduced-motion: no-preference)'

function usePlayable() {
  const [playable, setPlayable] = useState(
    () => typeof window !== 'undefined' && Boolean(window.matchMedia?.(PLAYABLE_QUERY).matches),
  )

  useEffect(() => {
    const query = window.matchMedia?.(PLAYABLE_QUERY)
    if (!query) return undefined
    const onChange = (event) => setPlayable(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  return playable
}

export default function LobbyBackdrop() {
  const playable = usePlayable()
  const videoRef = useRef(null)
  const [paused, setPaused] = useState(false)

  const togglePause = () => {
    const video = videoRef.current
    if (!video) return
    if (paused) {
      video.play?.()?.catch?.(() => {})
    } else {
      video.pause?.()
    }
    setPaused(!paused)
  }

  return (
    <div className="lobby__backdrop">
      {playable ? (
        <video
          ref={videoRef}
          className="lobby__backdrop-media"
          poster={POSTER}
          autoPlay
          muted
          loop
          playsInline
          aria-hidden="true"
          tabIndex={-1}
        >
          <source src="/media/lobby-bg.webm" type="video/webm" />
          <source src="/media/lobby-bg.mp4" type="video/mp4" />
        </video>
      ) : (
        <img className="lobby__backdrop-media" src={POSTER} alt="" aria-hidden="true" />
      )}
      <div className="lobby__backdrop-shade" aria-hidden="true" />

      {playable && (
        <button
          type="button"
          className="lobby__backdrop-toggle"
          onClick={togglePause}
          aria-label={paused ? 'Play background video' : 'Pause background video'}
          title={paused ? 'Play background video' : 'Pause background video'}
        >
          {paused ? <PlayIcon /> : <PauseIcon />}
        </button>
      )}
    </div>
  )
}
