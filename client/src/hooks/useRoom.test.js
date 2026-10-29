import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSession, loadSession, saveSession } from '../session'
import { FakeMediaStreamTrack, installMediaMocks } from '../test/media-mocks'
import { FakeRTCPeerConnection, installWebrtcMocks, latestSocket } from '../test/webrtc-mocks'
import useRoom, { getWebSocketUrl } from './useRoom'

function setup(tracks = { video: null, audio: null }) {
  const tracksRef = { current: tracks }
  const { result } = renderHook(() => useRoom(tracksRef))
  return { result, tracksRef }
}

async function connectAndOpen() {
  const helpers = setup()
  const socket = latestSocket()
  await act(async () => socket.open())
  return { ...helpers, socket }
}

beforeEach(() => {
  installMediaMocks()
  installWebrtcMocks()
  localStorage.clear()
})

describe('getWebSocketUrl', () => {
  it('returns a same-origin /ws url with nothing secret in the query string', () => {
    const url = getWebSocketUrl()
    expect(url).toMatch(/^ws:\/\/.*\/ws$/)
  })
})

describe('connecting', () => {
  it('starts in the "connecting" state and opens a WebSocket', () => {
    setup()
    const socket = latestSocket()

    expect(socket).toBeDefined()
    expect(socket.url).toMatch(/^ws:\/\//)
  })

  it('moves to "connected" once the socket opens', async () => {
    const { result } = await connectAndOpen()
    expect(result.current.connectionStatus).toBe('connected')
  })

  it('moves to "error" on a socket error, and "closed" when it closes', async () => {
    const { result, socket } = await connectAndOpen()

    await act(async () => socket.onerror?.())
    expect(result.current.connectionStatus).toBe('error')

    await act(async () => socket.onclose?.())
    expect(result.current.connectionStatus).toBe('closed')
  })
})

describe('create-room / room-created', () => {
  it('createRoom sends create-room with the name', async () => {
    const { result, socket } = await connectAndOpen()

    act(() => result.current.createRoom('Bekmurod'))

    expect(socket.lastSent()).toEqual({ type: 'create-room', name: 'Bekmurod' })
  })

  it('createRoom is a no-op before the socket is open', () => {
    const { result } = setup()
    const socket = latestSocket()

    act(() => result.current.createRoom('Bekmurod'))

    expect(socket.sent).toHaveLength(0)
  })

  it('room-created sets the room, identity, and saves the session', async () => {
    const { result, socket } = await connectAndOpen()

    await act(async () => {
      socket.receive({
        type: 'room-created',
        roomId: 'abc123',
        clientId: 'me-1',
        name: 'Bekmurod',
        rejoinToken: 'token-1',
      })
    })

    expect(result.current.currentRoom).toBe('abc123')
    expect(result.current.me).toEqual({ clientId: 'me-1', name: 'Bekmurod' })
    expect(loadSession()).toEqual({ roomId: 'abc123', name: 'Bekmurod', rejoinToken: 'token-1' })
  })

  it('uses the ICE servers the server sends for new peer connections', async () => {
    const { socket } = await connectAndOpen()
    const iceServers = [{ urls: 'turn:turn.example:3478', username: 'u', credential: 'c' }]
    const spy = vi.spyOn(globalThis, 'RTCPeerConnection')

    await act(async () => {
      socket.receive({
        type: 'existing-peers',
        roomId: 'abc123',
        clientId: 'me-1',
        name: 'Aziz',
        peers: [{ clientId: 'peer-1', name: 'Bekmurod' }],
        iceServers,
      })
    })

    expect(spy).toHaveBeenCalledWith({ iceServers })
  })
})

describe('join-room / existing-peers', () => {
  it('existing-peers sets the room, identity, and the peer list', async () => {
    const { result, socket } = await connectAndOpen()

    await act(async () => {
      socket.receive({
        type: 'existing-peers',
        roomId: 'abc123',
        clientId: 'me-1',
        name: 'Aziz',
        peers: [{ clientId: 'peer-1', name: 'Bekmurod' }],
      })
    })

    expect(result.current.currentRoom).toBe('abc123')
    expect(result.current.me).toEqual({ clientId: 'me-1', name: 'Aziz' })
    expect(result.current.participants).toEqual([{ clientId: 'peer-1', name: 'Bekmurod' }])
  })

  it('sends an offer to each existing peer', async () => {
    const { socket } = await connectAndOpen()

    await act(async () => {
      socket.receive({
        type: 'existing-peers',
        roomId: 'abc123',
        clientId: 'me-1',
        name: 'Aziz',
        peers: [{ clientId: 'peer-1', name: 'Bekmurod' }],
      })
    })

    await waitFor(() => {
      expect(socket.sent.some((m) => m.type === 'offer' && m.targetId === 'peer-1')).toBe(true)
    })
  })

  it('when the camera is already on, the new peer connection sends the real track, not just a placeholder', async () => {
    const videoTrack = new FakeMediaStreamTrack('video')
    const tracksRef = { current: { video: videoTrack, audio: null } }
    renderHook(() => useRoom(tracksRef))

    const socket = latestSocket()
    await act(async () => socket.open())
    await act(async () => {
      socket.receive({
        type: 'existing-peers',
        roomId: 'abc123',
        clientId: 'me-1',
        name: 'Aziz',
        peers: [{ clientId: 'peer-1', name: 'Bekmurod' }],
      })
    })

    const pc = FakeRTCPeerConnection.instances.at(-1)
    const videoTransceiver = pc.getTransceivers().find((t) => t.sender.track?.kind === 'video')
    expect(videoTransceiver.sender.track).toBe(videoTrack)

    // And no separate recvonly placeholder transceiver for video, since a
    // real sending track already exists for it.
    const audioTransceiver = pc.getTransceivers().find((t) => t.receiver.track?.kind === 'audio')
    expect(audioTransceiver.direction).toBe('recvonly')
  })

  it('an error response shows roomError', async () => {
    const { result, socket } = await connectAndOpen()

    await act(async () => {
      socket.receive({ type: 'error', message: 'Room is full' })
    })

    expect(result.current.roomError).toBe('Room is full')
  })
})

describe('peer-joined / peer-left', () => {
  async function inRoom() {
    const helpers = await connectAndOpen()
    await act(async () => {
      helpers.socket.receive({
        type: 'existing-peers',
        roomId: 'abc123',
        clientId: 'me-1',
        name: 'Aziz',
        peers: [],
      })
    })
    return helpers
  }

  it('peer-joined adds the participant and a join system message', async () => {
    const { result, socket } = await inRoom()

    await act(async () => {
      socket.receive({ type: 'peer-joined', clientId: 'peer-1', name: 'Bekmurod' })
    })

    expect(result.current.participants).toEqual([{ clientId: 'peer-1', name: 'Bekmurod' }])
    expect(result.current.messages).toEqual([
      expect.objectContaining({ kind: 'system', tone: 'join', text: 'Bekmurod joined the room' }),
    ])
  })

  it('peer-left removes the participant and shows their name in a leave message', async () => {
    const { result, socket } = await inRoom()

    await act(async () => {
      socket.receive({ type: 'peer-joined', clientId: 'peer-1', name: 'Bekmurod' })
    })
    await act(async () => {
      socket.receive({ type: 'peer-left', clientId: 'peer-1' })
    })

    expect(result.current.participants).toEqual([])
    expect(result.current.messages.at(-1)).toEqual(
      expect.objectContaining({ kind: 'system', tone: 'leave', text: 'Bekmurod left the room' }),
    )
  })

  it('peer-left removes their video tile', async () => {
    const { result, socket } = await inRoom()

    await act(async () => {
      socket.receive({ type: 'peer-joined', clientId: 'peer-1', name: 'Bekmurod' })
    })
    // Simulate a track having arrived from them.
    await act(async () => {
      socket.receive({ type: 'offer', senderId: 'peer-1', payload: { type: 'offer', sdp: 'x' } })
    })
    await act(async () => {
      socket.receive({ type: 'peer-left', clientId: 'peer-1' })
    })

    expect(result.current.remoteStreams).toEqual({})
  })
})

describe('media-state', () => {
  async function inRoomWithPeer() {
    const helpers = await connectAndOpen()
    await act(async () => {
      helpers.socket.receive({
        type: 'existing-peers',
        roomId: 'abc123',
        clientId: 'me',
        name: 'Me',
        peers: [{ clientId: 'peer-1', name: 'Other' }],
      })
    })
    return { ...helpers, pc: FakeRTCPeerConnection.instances.at(-1) }
  }

  it('updates remoteMedia keyed by sender', async () => {
    const { result, socket } = await connectAndOpen()

    await act(async () => {
      socket.receive({ type: 'media-state', from: 'peer-1', cameraOn: true, micOn: false })
    })

    expect(result.current.remoteMedia['peer-1']).toEqual(
      expect.objectContaining({ cameraOn: true, micOn: false, screenSharing: false }),
    )
  })

  it('announces its own camera and screen stream ids', async () => {
    const { result, socket } = await connectAndOpen()
    const fakeScreenTrack = new FakeMediaStreamTrack('video')

    act(() => {
      result.current.publishTrack('screen', fakeScreenTrack)
    })

    const sharing = socket.lastSent()
    expect(sharing).toEqual(
      expect.objectContaining({ type: 'media-state', screenSharing: true, cameraOn: false }),
    )
    expect(sharing.cameraStreamId).toBeTruthy()
    expect(sharing.screenStreamId).toBeTruthy()
    expect(sharing.cameraStreamId).not.toBe(sharing.screenStreamId)

    act(() => {
      result.current.publishTrack('screen', null)
    })
    expect(socket.lastSent()).toEqual(expect.objectContaining({ screenSharing: false }))
  })

  it('every peer connection gets camera, mic and screen slots tagged with those stream ids', async () => {
    const { socket, pc } = await inRoomWithPeer()
    const state = socket.sent.find((m) => m.type === 'media-state')
    const [video, audio, screen] = pc.getTransceivers()

    expect(video.streams[0].id).toBe(state.cameraStreamId)
    expect(audio.streams[0].id).toBe(state.cameraStreamId)
    expect(screen.streams[0].id).toBe(state.screenStreamId)
  })

  it('sorts remote tracks into camera and screen by stream id, in either arrival order', async () => {
    const { result, socket, pc } = await inRoomWithPeer()
    const cameraStream = new MediaStream()
    const screenStream = new MediaStream()
    const cameraTrack = new FakeMediaStreamTrack('video')
    const screenTrack = new FakeMediaStreamTrack('video')
    cameraStream.addTrack(cameraTrack)
    screenStream.addTrack(screenTrack)

    // Screen track arrives before the media-state that explains it.
    act(() => {
      pc.ontrack({ track: screenTrack, streams: [screenStream] })
      pc.ontrack({ track: cameraTrack, streams: [cameraStream] })
    })

    await act(async () => {
      socket.receive({
        type: 'media-state',
        from: 'peer-1',
        cameraOn: true,
        micOn: false,
        screenSharing: true,
        cameraStreamId: cameraStream.id,
        screenStreamId: screenStream.id,
      })
    })

    expect(result.current.remoteStreams['peer-1'].getTracks()).toEqual([cameraTrack])
    expect(result.current.remoteScreenStreams['peer-1'].getTracks()).toEqual([screenTrack])

    // Sharing stops: the screen tile goes, the camera stays.
    await act(async () => {
      socket.receive({
        type: 'media-state',
        from: 'peer-1',
        cameraOn: true,
        micOn: false,
        screenSharing: false,
        cameraStreamId: cameraStream.id,
        screenStreamId: screenStream.id,
      })
    })

    expect(result.current.remoteScreenStreams['peer-1']).toBeUndefined()
    expect(result.current.remoteStreams['peer-1'].getTracks()).toEqual([cameraTrack])
  })

  it('mic audio stays with the camera stream even while the peer shares their screen with the camera off', async () => {
    const { result, socket, pc } = await inRoomWithPeer()
    const cameraStream = new MediaStream()
    const screenStream = new MediaStream()
    const audioTrack = new FakeMediaStreamTrack('audio')
    cameraStream.addTrack(audioTrack)

    await act(async () => {
      socket.receive({
        type: 'media-state',
        from: 'peer-1',
        cameraOn: false,
        micOn: true,
        screenSharing: true,
        cameraStreamId: cameraStream.id,
        screenStreamId: screenStream.id,
      })
    })
    act(() => {
      pc.ontrack({ track: audioTrack, streams: [cameraStream] })
    })

    expect(result.current.remoteStreams['peer-1'].getTracks()).toEqual([audioTrack])
  })

  it('turning the camera off and on again only swaps the track, it does not renegotiate', async () => {
    const { result, pc } = await inRoomWithPeer()
    const videoSlot = pc.getTransceivers()[0]
    const first = new FakeMediaStreamTrack('video')
    const second = new FakeMediaStreamTrack('video')

    act(() => result.current.publishTrack('video', first))
    expect(videoSlot.direction).toBe('sendrecv')

    act(() => result.current.publishTrack('video', null))
    act(() => result.current.publishTrack('video', second))

    expect(videoSlot.sender.replaceTrack).toHaveBeenLastCalledWith(second)
    expect(videoSlot.direction).toBe('sendrecv')
    expect(pc.getTransceivers()).toHaveLength(3)
  })

  it('caps the camera bitrate for the number of peers', async () => {
    const { result, pc } = await inRoomWithPeer()
    const videoSlot = pc.getTransceivers()[0]

    act(() => result.current.publishTrack('video', new FakeMediaStreamTrack('video')))
    await waitFor(() => expect(videoSlot.sender.setParameters).toHaveBeenCalled())

    expect(videoSlot.sender._params.encodings[0].maxBitrate).toBe(1_500_000)
  })
})

describe('signaling robustness', () => {
  it('a non-string chat text from a peer is ignored instead of stored', async () => {
    const { result, socket } = await connectAndOpen()

    await act(async () => {
      socket.receive({ type: 'chat-message', from: 'peer-1', fromName: 'X', text: { evil: true } })
    })

    expect(result.current.messages).toHaveLength(0)
  })

  it('a malformed message from the server does not throw', async () => {
    const { socket } = await connectAndOpen()

    await act(async () => {
      socket.onmessage({ data: 'not json' })
    })
  })

  it('losing the socket while in a room tears the room down and reconnects with the rejoin token', async () => {
    vi.useFakeTimers()
    try {
      const { result } = setup()
      const socket = latestSocket()
      await act(async () => socket.open())
      await act(async () => {
        socket.receive({
          type: 'existing-peers',
          roomId: 'abc123',
          clientId: 'me-1',
          name: 'Aziz',
          peers: [{ clientId: 'peer-1', name: 'Bekmurod' }],
          rejoinToken: 'token-1',
        })
      })
      const pc = FakeRTCPeerConnection.instances.at(-1)

      await act(async () => socket.onclose())

      expect(pc.closed).toBe(true)
      expect(result.current.rejoining).toBe(true)
      expect(result.current.participants).toEqual([])

      await act(async () => vi.advanceTimersByTime(1000))
      const next = latestSocket()
      expect(next).not.toBe(socket)

      await act(async () => next.open())
      expect(next.lastSent()).toEqual({
        type: 'join-room',
        roomId: 'abc123',
        name: 'Aziz',
        rejoinToken: 'token-1',
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('a failed connection triggers an ICE restart', async () => {
    const { socket } = await connectAndOpen()
    await act(async () => {
      socket.receive({
        type: 'existing-peers',
        roomId: 'abc123',
        clientId: 'me-1',
        name: 'Aziz',
        peers: [{ clientId: 'peer-1', name: 'Bekmurod' }],
      })
    })
    const pc = FakeRTCPeerConnection.instances.at(-1)

    pc.connectionState = 'failed'
    pc.onconnectionstatechange()

    expect(pc.restartedIce).toBe(true)
  })
})

describe('chat', () => {
  it('sendChatMessage sends over the socket and adds the message locally', async () => {
    const { result, socket } = await connectAndOpen()

    await act(async () => {
      socket.receive({ type: 'room-created', roomId: 'abc123', clientId: 'me-1', name: 'Aziz' })
    })
    act(() => result.current.sendChatMessage('hello'))

    expect(socket.lastSent()).toEqual({ type: 'chat-message', text: 'hello' })
    expect(result.current.messages).toEqual([
      expect.objectContaining({ kind: 'chat', from: 'me-1', fromName: 'Aziz', text: 'hello' }),
    ])
  })

  it('does not send blank/whitespace-only messages', async () => {
    const { result, socket } = await connectAndOpen()

    act(() => result.current.sendChatMessage('   '))

    expect(socket.sent).toHaveLength(0)
    expect(result.current.messages).toHaveLength(0)
  })

  it('an incoming chat-message is appended with the server-provided identity', async () => {
    const { result, socket } = await connectAndOpen()

    await act(async () => {
      socket.receive({ type: 'chat-message', from: 'peer-1', fromName: 'Bekmurod', text: 'hi' })
    })

    expect(result.current.messages).toEqual([
      expect.objectContaining({ kind: 'chat', from: 'peer-1', fromName: 'Bekmurod', text: 'hi' }),
    ])
  })
  it('existing-peers restores the chat history, flagged so it is not treated as new', async () => {
    const { result, socket } = await connectAndOpen()

    await act(async () => {
      socket.receive({
        type: 'existing-peers',
        roomId: 'abc123',
        clientId: 'me-2',
        name: 'Aziz',
        peers: [],
        chatHistory: [
          { from: 'me-2', fromName: 'Aziz', text: 'my old message' },
          { from: 'peer-1', fromName: 'Bekmurod', text: 'their reply' },
        ],
      })
    })

    expect(result.current.messages).toEqual([
      expect.objectContaining({ kind: 'chat', history: true, from: 'me-2', text: 'my old message' }),
      expect.objectContaining({ kind: 'chat', history: true, from: 'peer-1', fromName: 'Bekmurod' }),
    ])
  })

  it('skips malformed history entries and a missing history', async () => {
    const { result, socket } = await connectAndOpen()

    await act(async () => {
      socket.receive({
        type: 'existing-peers',
        roomId: 'abc123',
        clientId: 'me-2',
        name: 'Aziz',
        peers: [],
        chatHistory: [null, { from: 'x', text: { evil: true } }, { from: 'peer-1', fromName: 'B', text: 'ok' }],
      })
    })
    expect(result.current.messages).toHaveLength(1)

    await act(async () => {
      socket.receive({ type: 'room-created', roomId: 'def456', clientId: 'me-3', name: 'Aziz' })
    })
    expect(result.current.messages).toEqual([])
  })
})

describe('leaveRoom', () => {
  it('sends leave-room and resets room state, but keeps the socket open', async () => {
    const { result, socket } = await connectAndOpen()

    await act(async () => {
      socket.receive({ type: 'room-created', roomId: 'abc123', clientId: 'me-1', name: 'Aziz' })
    })
    act(() => result.current.leaveRoom())

    expect(socket.lastSent()).toEqual({ type: 'leave-room' })
    expect(result.current.currentRoom).toBeNull()
    expect(result.current.me).toBeNull()
    expect(socket.readyState).not.toBe(socket.constructor.CLOSED)
  })

  it('clears the saved session', async () => {
    const { result, socket } = await connectAndOpen()

    await act(async () => {
      socket.receive({ type: 'room-created', roomId: 'abc123', clientId: 'me-1', name: 'Aziz' })
    })
    expect(loadSession()).not.toBeNull()

    act(() => result.current.leaveRoom())
    expect(loadSession()).toBeNull()
  })
})

describe('auto-rejoin from a stored session', () => {
  it('sends join-room automatically once the socket opens', async () => {
    saveSession('stored-room', 'Bekmurod')

    const { result } = setup()
    expect(result.current.rejoining).toBe(true)

    const socket = latestSocket()
    await act(async () => socket.open())

    expect(socket.lastSent()).toEqual({ type: 'join-room', roomId: 'stored-room', name: 'Bekmurod' })
  })

  it('includes the rejoin token from the stored session', async () => {
    saveSession('stored-room', 'Bekmurod', 'token-1')

    setup()
    const socket = latestSocket()
    await act(async () => socket.open())

    expect(socket.lastSent()).toEqual({
      type: 'join-room',
      roomId: 'stored-room',
      name: 'Bekmurod',
      rejoinToken: 'token-1',
    })
  })

  it('rejoining becomes false once existing-peers confirms the room', async () => {
    saveSession('stored-room', 'Bekmurod')
    const { result } = setup()
    const socket = latestSocket()

    await act(async () => socket.open())
    await act(async () => {
      socket.receive({
        type: 'existing-peers',
        roomId: 'stored-room',
        clientId: 'me-1',
        name: 'Bekmurod',
        peers: [],
      })
    })

    expect(result.current.rejoining).toBe(false)
    expect(result.current.currentRoom).toBe('stored-room')
  })

  it('a failed rejoin clears the stored session and falls back to the lobby without an error', async () => {
    saveSession('stale-room', 'Bekmurod')
    const { result } = setup()
    const socket = latestSocket()

    await act(async () => socket.open())
    await act(async () => {
      socket.receive({ type: 'error', message: 'Room does not exist' })
    })

    expect(result.current.rejoining).toBe(false)
    expect(result.current.roomError).toBe('')
    expect(loadSession()).toBeNull()
    // The name itself should survive so the lobby doesn't ask again.
    expect(result.current.rememberedName).toBe('Bekmurod')
  })

  it('a manual join request for a non-existent room shows the error', async () => {
    const { result } = setup()
    const socket = latestSocket()

    await act(async () => socket.open())
    act(() => result.current.requestJoin('fake01', 'Bekmurod'))

    await act(async () => {
      socket.receive({ type: 'error', message: 'Room does not exist' })
    })

    expect(result.current.rejoining).toBe(false)
    expect(result.current.roomError).toBe('This room does not exist')
  })
})

describe('rememberedName', () => {
  it('falls back to the standalone remembered name when there is no session', () => {
    clearSession()
    localStorage.setItem('meet-me:name', 'Bekmurod')

    const { result } = setup()
    expect(result.current.rememberedName).toBe('Bekmurod')
  })
})
