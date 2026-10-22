import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { installMediaMocks } from '../test/media-mocks'
import useLocalMedia from './useLocalMedia'

function setup() {
  const onTrackChangedRef = { current: vi.fn() }
  const { result } = renderHook(() => useLocalMedia(onTrackChangedRef))
  return { result, onTrackChangedRef }
}

describe('useLocalMedia', () => {
  let getUserMedia

  beforeEach(() => {
    ;({ getUserMedia } = installMediaMocks())
  })

  it('starts with camera and mic both off and no stream', () => {
    const { result } = setup()

    expect(result.current.cameraOn).toBe(false)
    expect(result.current.micOn).toBe(false)
    expect(result.current.stream).toBeNull()
  })

  it('toggling the camera requests only video, not audio', async () => {
    const { result } = setup()

    await act(async () => {
      await result.current.toggleCamera()
    })

    expect(getUserMedia).toHaveBeenCalledWith({ video: true })
    expect(result.current.cameraOn).toBe(true)
    expect(result.current.micOn).toBe(false)
  })

  it('toggling the mic requests only audio, not video', async () => {
    const { result } = setup()

    await act(async () => {
      await result.current.toggleMic()
    })

    expect(getUserMedia).toHaveBeenCalledWith({ audio: true })
    expect(result.current.micOn).toBe(true)
    expect(result.current.cameraOn).toBe(false)
  })

  it('the resulting stream contains both tracks once camera and mic are both on', async () => {
    const { result } = setup()

    await act(async () => {
      await result.current.toggleCamera()
      await result.current.toggleMic()
    })

    expect(result.current.stream.getTracks()).toHaveLength(2)
  })

  it('notifies onTrackChangedRef with the new track when enabling', async () => {
    const { result, onTrackChangedRef } = setup()

    await act(async () => {
      await result.current.toggleCamera()
    })

    expect(onTrackChangedRef.current).toHaveBeenCalledWith('video', expect.objectContaining({ kind: 'video' }))
  })

  it('turning the camera back off stops the track and notifies with null', async () => {
    const { result, onTrackChangedRef } = setup()

    await act(async () => {
      await result.current.toggleCamera()
    })
    const track = result.current.stream.getTracks()[0]

    await act(async () => {
      await result.current.toggleCamera()
    })

    expect(track.stop).toHaveBeenCalledTimes(1)
    expect(result.current.cameraOn).toBe(false)
    expect(result.current.stream).toBeNull()
    expect(onTrackChangedRef.current).toHaveBeenLastCalledWith('video', null)
  })

  it('turning off one of two active tracks leaves the other in the stream', async () => {
    const { result } = setup()

    // Separate act() calls, not one containing all three: batching a whole
    // async block means every call inside it reads the same pre-batch
    // cameraOn/micOn closure, so a same-hook toggle-off right after a
    // toggle-on would wrongly read the stale "off" state and turn on again.
    await act(async () => {
      await result.current.toggleCamera()
    })
    await act(async () => {
      await result.current.toggleMic()
    })
    await act(async () => {
      await result.current.toggleCamera() // camera off, mic stays on
    })

    const tracks = result.current.stream.getTracks()
    expect(tracks).toHaveLength(1)
    expect(tracks[0].kind).toBe('audio')
  })

  it('a getUserMedia rejection sets a readable error and leaves state off', async () => {
    getUserMedia.mockRejectedValueOnce(new Error('Permission denied'))
    const { result } = setup()

    await act(async () => {
      await result.current.toggleCamera()
    })

    expect(result.current.cameraOn).toBe(false)
    expect(result.current.mediaError).toMatch(/camera/i)
  })

  it('mic and camera errors produce different messages', async () => {
    getUserMedia.mockRejectedValueOnce(new Error('nope'))
    const { result } = setup()

    await act(async () => {
      await result.current.toggleMic()
    })

    expect(result.current.mediaError).toMatch(/microphone/i)
  })

  it('falls back to ideal constraints if initial video constraint rejects with OverconstrainedError', async () => {
    const constraintErr = new Error('Invalid constraint')
    constraintErr.name = 'OverconstrainedError'
    getUserMedia.mockRejectedValueOnce(constraintErr)

    const { result } = setup()

    await act(async () => {
      await result.current.toggleCamera()
    })

    expect(getUserMedia).toHaveBeenCalledTimes(2)
    expect(getUserMedia).toHaveBeenNthCalledWith(1, { video: true })
    expect(getUserMedia).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        video: expect.objectContaining({ facingMode: 'user' }),
      }),
    )
    expect(result.current.cameraOn).toBe(true)
    expect(result.current.mediaError).toBe('')
  })

  it('sets a user-friendly error message when an OverconstrainedError cannot be recovered', async () => {
    const constraintErr = new Error('Invalid constraint')
    constraintErr.name = 'OverconstrainedError'
    getUserMedia.mockRejectedValue(constraintErr)

    const { result } = setup()

    await act(async () => {
      await result.current.toggleCamera()
    })

    expect(result.current.cameraOn).toBe(false)
    expect(result.current.mediaError).not.toBe('Could not access the camera. Invalid constraint')
    expect(result.current.mediaError).toMatch(/No compatible camera was found|No camera was detected/i)
  })

  it('starts with screen sharing off and no screen stream', () => {
    const { result } = setup()

    expect(result.current.screenOn).toBe(false)
    expect(result.current.screenStream).toBeNull()
  })

  it('toggling screen share requests getDisplayMedia and notifies onTrackChangedRef', async () => {
    const { result, onTrackChangedRef } = setup()

    await act(async () => {
      await result.current.toggleScreenShare()
    })

    expect(result.current.screenOn).toBe(true)
    expect(result.current.screenStream).not.toBeNull()
    expect(onTrackChangedRef.current).toHaveBeenCalledWith('screen', expect.objectContaining({ kind: 'video' }))
  })

  it('camera and screen can both be active simultaneously (dual stream)', async () => {
    const { result } = setup()

    await act(async () => {
      await result.current.toggleCamera()
    })
    await act(async () => {
      await result.current.toggleScreenShare()
    })

    expect(result.current.cameraOn).toBe(true)
    expect(result.current.screenOn).toBe(true)
    expect(result.current.stream).not.toBeNull()
    expect(result.current.screenStream).not.toBeNull()

    // Turning off camera leaves screen share intact
    await act(async () => {
      await result.current.toggleCamera()
    })
    expect(result.current.cameraOn).toBe(false)
    expect(result.current.screenOn).toBe(true)

    // Turning off screen share leaves camera intact if turned back on
    await act(async () => {
      await result.current.toggleCamera()
      await result.current.toggleScreenShare()
    })
    expect(result.current.cameraOn).toBe(true)
    expect(result.current.screenOn).toBe(false)
  })

  it('browser stop sharing (track.onended) stops screen share and resets state', async () => {
    const { result, onTrackChangedRef } = setup()

    await act(async () => {
      await result.current.toggleScreenShare()
    })
    expect(result.current.screenOn).toBe(true)

    const screenTrack = result.current.screenStream.getTracks()[0]
    act(() => {
      screenTrack.onended?.()
    })

    expect(result.current.screenOn).toBe(false)
    expect(result.current.screenStream).toBeNull()
    expect(onTrackChangedRef.current).toHaveBeenLastCalledWith('screen', null)
  })
})
