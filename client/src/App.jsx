import { useEffect, useRef, useState } from 'react'
import './App.scss'
import VideoTile from './VideoTile'

export default function App() {
  const wsRef = useRef(null)
  const pendingRoomIdRef = useRef('')

  const [joinCode, setJoinCode] = useState('')
  const [currentRoom, setCurrentRoom] = useState(null)
  const [myClientId, setMyClientId] = useState(null)
  const [peers, setPeers] = useState([])
  const [joinError, setJoinError] = useState('')
  const [connectionStatus, setConnectionStatus] = useState('connecting')
  const [closeInfo, setCloseInfo] = useState(null)

  // Runs once: opens the WebSocket connection and wires up message handling.
  useEffect(() => {
    // Match the page's own protocol (wss when the page is https - required,
    // since browsers block plain ws:// connections from an https:// page)
    // and host (so this also works when opened from another device on the
    // network, not just localhost).
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const socket = new WebSocket(`${protocol}://${window.location.hostname}:8080`)
    wsRef.current = socket

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

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data)
      console.log('Server says:', data)

      switch (data.type) {
        case 'room-created':
          setMyClientId(data.clientId)
          setCurrentRoom(data.roomId)
          break
        case 'existing-peers':
          setMyClientId(data.clientId)
          setPeers(data.peers)
          setCurrentRoom(pendingRoomIdRef.current)
          break
        case 'peer-joined':
          setPeers((prev) => [...prev, data.clientId])
          break
        case 'peer-left':
          setPeers((prev) => prev.filter((id) => id !== data.clientId))
          break
        case 'error':
          setJoinError(data.message)
          break
        default:
          break
      }
    }

    return () => socket.close()
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
          <button onClick={createRoom}>Create Room</button>
          <span>or</span>
          <input
            placeholder="Room Code"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
          />
          <button onClick={joinRoom}>Join Room</button>
          {joinError && <p className="join-error">{joinError}</p>}
        </div>
      ) : (
        <div className="room-panel">
          <h3>Room Code: {currentRoom}</h3>
          <p>You are: {myClientId}</p>
          <p>Peers in room: {peers.length ? peers.join(', ') : 'none yet'}</p>
        </div>
      )}

      <VideoTile />
    </div>
  )
}
