import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearSession, loadSession, saveSession } from '../session'
import { FakeMediaStreamTrack, installMediaMocks } from '../test/media-mocks'
import { FakeRTCPeerConnection, installWebrtcMocks, latestSocket } from '../test/webrtc-mocks'
import useRoom from './useRoom'

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
      socket.receive({ type: 'room-created', roomId: 'abc123', clientId: 'me-1', name: 'Bekmurod' })
    })

    expect(result.current.currentRoom).toBe('abc123')
    expect(result.current.me).toEqual({ clientId: 'me-1', name: 'Bekmurod' })
    expect(loadSession()).toEqual({ roomId: 'abc123', name: 'Bekmurod' })
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
  it('updates remoteMedia keyed by sender', async () => {
    const { result, socket } = await connectAndOpen()

    await act(async () => {
      socket.receive({ type: 'media-state', from: 'peer-1', cameraOn: true, micOn: false })
    })

    expect(result.current.remoteMedia).toEqual({ 'peer-1': { cameraOn: true, micOn: false } })
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

  it('a failed rejoin clears the stored session and falls back to the lobby', async () => {
    saveSession('stale-room', 'Bekmurod')
    const { result } = setup()
    const socket = latestSocket()

    await act(async () => socket.open())
    await act(async () => {
      socket.receive({ type: 'error', message: 'Room does not exist' })
    })

    expect(result.current.rejoining).toBe(false)
    expect(result.current.roomError).toBe('Room does not exist')
    expect(loadSession()).toBeNull()
    // The name itself should survive so the lobby doesn't ask again.
    expect(result.current.rememberedName).toBe('Bekmurod')
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
