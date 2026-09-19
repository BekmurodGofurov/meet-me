import { useCallback, useEffect, useRef, useState } from 'react'

// Camera and microphone are requested separately and only on demand, so the
// browser asks for one permission at the moment it is actually needed instead
// of demanding both on page load.
export default function useLocalMedia(onTrackChangedRef) {
  const tracksRef = useRef({ video: null, audio: null })

  const [stream, setStream] = useState(null)
  const [cameraOn, setCameraOn] = useState(false)
  const [micOn, setMicOn] = useState(false)
  const [mediaError, setMediaError] = useState('')

  const rebuildStream = useCallback(() => {
    const { video, audio } = tracksRef.current
    const next = new MediaStream()
    if (video) next.addTrack(video)
    if (audio) next.addTrack(audio)
    setStream(next.getTracks().length > 0 ? next : null)
  }, [])

  const disable = useCallback(
    (kind) => {
      const track = tracksRef.current[kind]
      if (track) {
        track.stop()
        tracksRef.current[kind] = null
      }

      rebuildStream()
      onTrackChangedRef.current?.(kind, null)

      if (kind === 'video') setCameraOn(false)
      else setMicOn(false)
    },
    [onTrackChangedRef, rebuildStream],
  )

  const enable = useCallback(
    async (kind) => {
      setMediaError('')

      try {
        const media = await navigator.mediaDevices.getUserMedia(
          kind === 'video' ? { video: true } : { audio: true },
        )
        const track = media.getTracks()[0]

        tracksRef.current[kind] = track
        rebuildStream()
        onTrackChangedRef.current?.(kind, track)

        if (kind === 'video') setCameraOn(true)
        else setMicOn(true)
      } catch (err) {
        console.error(`Failed to start ${kind}`, err)
        setMediaError(
          kind === 'video'
            ? 'Could not access the camera. Check browser permissions.'
            : 'Could not access the microphone. Check browser permissions.',
        )
      }
    },
    [onTrackChangedRef, rebuildStream],
  )

  const toggleCamera = useCallback(
    () => (cameraOn ? disable('video') : enable('video')),
    [cameraOn, disable, enable],
  )

  const toggleMic = useCallback(
    () => (micOn ? disable('audio') : enable('audio')),
    [micOn, disable, enable],
  )

  useEffect(() => {
    const tracks = tracksRef.current
    return () => {
      tracks.video?.stop()
      tracks.audio?.stop()
    }
  }, [])

  return { stream, cameraOn, micOn, mediaError, tracksRef, toggleCamera, toggleMic }
}
