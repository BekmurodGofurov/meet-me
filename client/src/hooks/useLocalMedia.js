import { useCallback, useEffect, useRef, useState } from 'react'

// Camera and microphone are requested separately and only on demand, so the
// browser asks for one permission at the moment it is actually needed instead
// of demanding both on page load.
export default function useLocalMedia(onTrackChangedRef) {
  const tracksRef = useRef({ video: null, audio: null, screen: null })

  const [stream, setStream] = useState(null)
  const [screenStream, setScreenStream] = useState(null)
  const [cameraOn, setCameraOn] = useState(false)
  const [micOn, setMicOn] = useState(false)
  const [screenOn, setScreenOn] = useState(false)
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

  const stopScreenShare = useCallback(() => {
    const track = tracksRef.current.screen
    if (track) {
      track.stop()
      tracksRef.current.screen = null
    }

    setScreenStream(null)
    setScreenOn(false)
    onTrackChangedRef.current?.('screen', null)
  }, [onTrackChangedRef])

  const startScreenShare = useCallback(async () => {
    setMediaError('')

    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        throw new Error('Screen sharing is not supported by your browser.')
      }

      const displayMedia = await navigator.mediaDevices.getDisplayMedia({ video: true })
      const track = displayMedia.getVideoTracks?.()[0] ?? displayMedia.getTracks()[0]
      if (!track) return

      tracksRef.current.screen = track
      const nextStream = new MediaStream([track])
      setScreenStream(nextStream)
      setScreenOn(true)

      // Handle native browser floating "Stop sharing" button
      track.onended = () => {
        stopScreenShare()
      }

      onTrackChangedRef.current?.('screen', track)
    } catch (err) {
      if (err.name !== 'NotAllowedError') {
        console.error('Failed to start screen share', err)
        setMediaError('Could not share screen. Check browser permissions.')
      }
    }
  }, [onTrackChangedRef, stopScreenShare])

  const toggleScreenShare = useCallback(
    () => (screenOn ? stopScreenShare() : startScreenShare()),
    [screenOn, stopScreenShare, startScreenShare],
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
      tracks.screen?.stop()
    }
  }, [])

  return {
    stream,
    screenStream,
    cameraOn,
    micOn,
    screenOn,
    mediaError,
    tracksRef,
    toggleCamera,
    toggleMic,
    toggleScreenShare,
  }
}
