import { useCallback, useEffect, useRef, useState } from 'react'

// Camera and microphone are requested separately and only on demand, so the
// browser asks for one permission at the moment it is actually needed instead
// of demanding both on page load.

// Check the current permission state without triggering a prompt.
// Returns 'granted', 'denied', 'prompt', or null if the API is not available.
async function queryPermission(kind) {
  try {
    const name = kind === 'video' ? 'camera' : 'microphone'
    const result = await navigator.permissions?.query({ name })
    return result?.state ?? null
  } catch {
    return null
  }
}

async function acquireMediaStream(kind) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('MediaDevices API is not available. Please ensure you are using a secure connection (HTTPS).')
  }

  if (kind === 'audio') {
    return await navigator.mediaDevices.getUserMedia({ audio: true })
  }

  // Attempt standard constraints first
  try {
    return await navigator.mediaDevices.getUserMedia({ video: true })
  } catch (err) {
    const isConstraintError =
      err?.name === 'OverconstrainedError' ||
      String(err?.message || '').toLowerCase().includes('constraint')

    if (!isConstraintError) {
      throw err
    }

    // Fallbacks for browsers/devices where { video: true } rejects with OverconstrainedError
    // Fallback 1: Ideal dimensions with user facingMode
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })
    } catch {
      // Proceed to next fallback
    }

    // Fallback 2: Ideal facingMode only
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'user' } },
      })
    } catch {
      // Proceed to next fallback
    }

    // Fallback 3: Query available device IDs and target the first camera
    try {
      const devices = await navigator.mediaDevices.enumerateDevices?.()
      const videoDevices = devices?.filter((d) => d.kind === 'videoinput')
      if (videoDevices && videoDevices.length > 0) {
        for (const device of videoDevices) {
          if (device.deviceId) {
            try {
              return await navigator.mediaDevices.getUserMedia({
                video: { deviceId: { ideal: device.deviceId } },
              })
            } catch {
              // Try next device
            }
          }
        }
      }
    } catch {
      // Fallback enumeration failed
    }

    throw err
  }
}

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
        const media = await acquireMediaStream(kind)
        const track = media.getTracks()[0]

        tracksRef.current[kind] = track
        rebuildStream()
        onTrackChangedRef.current?.(kind, track)

        if (kind === 'video') setCameraOn(true)
        else setMicOn(true)
      } catch (err) {
        console.error(`Failed to start ${kind}:`, err.name, err.message, err)
        let message
        const isConstraintError =
          err.name === 'OverconstrainedError' ||
          String(err.message || '').toLowerCase().includes('constraint')

        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          message =
            kind === 'video'
              ? 'Camera permission was denied. Click the camera icon in the browser address bar to allow access, or check System Settings → Privacy & Security → Camera.'
              : 'Microphone permission was denied. Click the camera icon in the browser address bar to allow access, or check System Settings → Privacy & Security → Microphone.'
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
          message =
            kind === 'video'
              ? 'Could not access the camera. It may be in use by another application (FaceTime, Zoom, etc.).'
              : 'Could not access the microphone. It may be in use by another application.'
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          // NotFoundError can mean: (1) no physical camera, OR (2) permission
          // was blocked at the OS/browser level before the prompt could appear.
          // Check the Permissions API to distinguish these two cases.
          const permState = await queryPermission(kind)
          if (permState === 'denied') {
            message =
              kind === 'video'
                ? 'Camera permission is blocked. Click the lock/camera icon in the browser address bar and allow access, then refresh the page. Also check System Settings → Privacy & Security → Camera.'
                : 'Microphone permission is blocked. Click the lock/mic icon in the browser address bar and allow access, then refresh the page. Also check System Settings → Privacy & Security → Microphone.'
          } else {
            message =
              kind === 'video'
                ? 'Could not find a camera. Make sure your camera is connected, then try again.'
                : 'Could not find a microphone. Make sure your microphone is connected, then try again.'
          }
        } else if (isConstraintError) {
          let hasDevice = true
          try {
            const devices = await navigator.mediaDevices?.enumerateDevices?.()
            if (devices && devices.length > 0) {
              const matching = devices.filter((d) => d.kind === (kind === 'video' ? 'videoinput' : 'audioinput'))
              if (matching.length === 0) {
                hasDevice = false
              }
            }
          } catch {
            // ignore
          }

          if (!hasDevice) {
            message =
              kind === 'video'
                ? 'Could not find a camera. No camera was detected or permission is blocked in system settings.'
                : 'Could not find a microphone. No microphone was detected or permission is blocked in system settings.'
          } else {
            message =
              kind === 'video'
                ? 'Could not access the camera. No compatible camera was found, or camera permissions are restricted by your browser/system settings.'
                : 'Could not access the microphone. No compatible microphone was found, or microphone permissions are restricted by your browser/system settings.'
          }
        } else {
          message =
            kind === 'video'
              ? `Could not access the camera. ${err.message || 'Check browser permissions.'}`
              : `Could not access the microphone. ${err.message || 'Check browser permissions.'}`
        }
        setMediaError(message)
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
