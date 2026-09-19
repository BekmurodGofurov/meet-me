import { useEffect, useRef, useState } from 'react'
import './App.scss'
import VideoTile from './VideoTile'

const ICE_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }

export default function App() {
  const wsRef = useRef(null)
  const pendingRoomIdRef = useRef('')
  // The stream lives in a ref as well as state: the ref is what the WebSocket
  // handlers read (always current, no stale closure, no effect dependency),
  // the state is only for rendering.
  const localStreamRef = useRef(null)
  const peerConnectionsRef = useRef(new Map())
  // ICE candidates can arrive before the remote description is set, and
  // addIceCandidate throws if called that early - hold them until it is.
  const pendingCandidatesRef = useRef(new Map())

  const [joinCode, setJoinCode] = useState('')
  const [currentRoom, setCurrentRoom] = useState(null)
  const [myClientId, setMyClientId] = useState(null)
  const [peers, setPeers] = useState([])
  const [joinError, setJoinError] = useState('')
  const [connectionStatus, setConnectionStatus] = useState('connecting')
  const [closeInfo, setCloseInfo] = useState(null)
  const [localStream, setLocalStream] = useState(null)
  const [remoteStreams, setRemoteStreams] = useState({})

  useEffect(() => {
    let cancelled = false
    let stream = null

    const startMedia = async () => {
      try {
        const acquired = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })

        // getUserMedia can resolve after this effect was torn down (React runs
        // effects twice in dev). Release that stream instead of leaving the
        // camera running with nothing attached to it.
        if (cancelled) {
          acquired.getTracks().forEach((track) => track.stop())
          return
        }

        stream = acquired
        localStreamRef.current = acquired
        setLocalStream(acquired)
      } catch (err) {
        console.error('Failed to get local media. Did you deny permissions?', err)
      }
    }

    startMedia()

    return () => {
      cancelled = true
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const socket = new WebSocket(`${protocol}://${window.location.hostname}:8080`)
    wsRef.current = socket

    const send = (message) => socket.send(JSON.stringify(message))

    const getOrCreatePeerConnection = (peerId) => {
      const existing = peerConnectionsRef.current.get(peerId)
      if (existing) return existing

      const pc = new RTCPeerConnection(ICE_CONFIG)

      const stream = localStreamRef.current
      if (stream) {
        stream.getTracks().forEach((track) => pc.addTrack(track, stream))
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          send({ type: 'ice-candidate', targetId: peerId, payload: event.candidate })
        }
      }

      pc.ontrack = (event) => {
        setRemoteStreams((prev) => ({ ...prev, [peerId]: event.streams[0] }))
      }

      peerConnectionsRef.current.set(peerId, pc)
      return pc
    }

    const flushPendingCandidates = async (peerId, pc) => {
      const queued = pendingCandidatesRef.current.get(peerId)
      if (!queued) return

      for (const candidate of queued) {
        try {
          await pc.addIceCandidate(candidate)
        } catch (err) {
          console.error('Failed to add queued ICE candidate', err)
        }
      }
      pendingCandidatesRef.current.delete(peerId)
    }

    const closePeer = (peerId) => {
      const pc = peerConnectionsRef.current.get(peerId)
      if (pc) {
        pc.close()
        peerConnectionsRef.current.delete(peerId)
      }
      pendingCandidatesRef.current.delete(peerId)
      setRemoteStreams((prev) => {
        const next = { ...prev }
        delete next[peerId]
        return next
      })
    }

    socket.onopen = () => {
      console.log('Connected to signaling server')
      setConnectionStatus('connected')
      setCloseInfo(null)
    }

    socket.onerror = (event) => {
      console.error('WebSocket error:', event)
      setConnectionStatus('error')
    }

    socket.onclose = (event) => {
      console.log('WebSocket closed:', event.code, event.reason)
      setConnectionStatus('closed')
      setCloseInfo({ code: event.code, reason: event.reason, wasClean: event.wasClean })
    }

    socket.onmessage = async (event) => {
      const data = JSON.parse(event.data)
      console.log('Server says:', data)

      switch (data.type) {
        case 'room-created':
          setMyClientId(data.clientId)
          setCurrentRoom(data.roomId)
          break

        case 'existing-peers': {
          setMyClientId(data.clientId)
          setPeers(data.peers)
          setCurrentRoom(pendingRoomIdRef.current)

          // The new joiner initiates one connection per existing peer.
          for (const peerId of data.peers) {
            const pc = getOrCreatePeerConnection(peerId)
            const offer = await pc.createOffer()
            await pc.setLocalDescription(offer)
            send({ type: 'offer', targetId: peerId, payload: pc.localDescription })
          }
          break
        }

        case 'peer-joined':
          // Existing members wait for the newcomer's offer rather than sending
          // their own, so both sides don't offer at once.
          setPeers((prev) => [...prev, data.clientId])
          break

        case 'peer-left':
          setPeers((prev) => prev.filter((id) => id !== data.clientId))
          closePeer(data.clientId)
          break

        case 'offer': {
          const pc = getOrCreatePeerConnection(data.senderId)
          await pc.setRemoteDescription(data.payload)
          await flushPendingCandidates(data.senderId, pc)

          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          send({ type: 'answer', targetId: data.senderId, payload: pc.localDescription })
          break
        }

        case 'answer': {
          const pc = peerConnectionsRef.current.get(data.senderId)
          if (pc) {
            await pc.setRemoteDescription(data.payload)
            await flushPendingCandidates(data.senderId, pc)
          }
          break
        }

        case 'ice-candidate': {
          const pc = peerConnectionsRef.current.get(data.senderId)
          if (pc?.remoteDescription) {
            try {
              await pc.addIceCandidate(data.payload)
            } catch (err) {
              console.error('Failed to add ICE candidate', err)
            }
          } else {
            const queued = pendingCandidatesRef.current.get(data.senderId) ?? []
            queued.push(data.payload)
            pendingCandidatesRef.current.set(data.senderId, queued)
          }
          break
        }

        case 'error':
          setJoinError(data.message)
          break

        default:
          break
      }
    }

    return () => {
      peerConnectionsRef.current.forEach((pc) => pc.close())
      peerConnectionsRef.current.clear()
      pendingCandidatesRef.current.clear()

      // Detach first: a discarded socket must not write state belonging to the
      // socket that replaced it, or a dead connection's onclose can overwrite a
      // live connection's status.
      socket.onopen = null
      socket.onerror = null
      socket.onclose = null
      socket.onmessage = null

      if (socket.readyState === WebSocket.CONNECTING) {
        // Calling close() mid-handshake logs "closed before the connection is
        // established" - wait until it opens, then close it cleanly.
        socket.addEventListener('open', () => socket.close())
      } else {
        socket.close()
      }
    }
  }, [])

  const createRoom = () => {
    setJoinError('')
    wsRef.current.send(JSON.stringify({ type: 'create-room' }))
  }

  const joinRoom = () => {
    if (!joinCode) return
    setJoinError('')
    pendingRoomIdRef.current = joinCode
    wsRef.current.send(JSON.stringify({ type: 'join-room', roomId: joinCode }))
  }

  return (
    <div className="app">
      <h1>Meet Me</h1>
      <p className={`connection-status connection-status--${connectionStatus}`}>
        Server: {connectionStatus}
        {closeInfo && ` (code ${closeInfo.code}${closeInfo.reason ? `: ${closeInfo.reason}` : ''})`}
      </p>

      {!currentRoom ? (
        <div className="join-panel">
          <button onClick={createRoom} disabled={!localStream}>
            Create Room
          </button>
          <span>or</span>
          <input
            placeholder="Room Code"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
          />
          <button onClick={joinRoom} disabled={!localStream}>
            Join Room
          </button>
          {!localStream && <p className="join-hint">Waiting for camera permission...</p>}
          {joinError && <p className="join-error">{joinError}</p>}
        </div>
      ) : (
        <div className="room-panel">
          <h3>Room Code: {currentRoom}</h3>
          <p>You are: {myClientId}</p>
          <p>Peers in room: {peers.length ? peers.join(', ') : 'none yet'}</p>
        </div>
      )}

      <div className="video-grid">
        <VideoTile stream={localStream} muted label="You" />
        {Object.entries(remoteStreams).map(([peerId, stream]) => (
          <VideoTile key={peerId} stream={stream} label={peerId.slice(0, 8)} />
        ))}
      </div>
    </div>
  )
}
