import { useEffect, useRef, useState, useCallback } from 'react'
import { Routes, Route, useNavigate, Navigate } from 'react-router-dom'
import './App.scss'
import Lobby from './components/Lobby'
import Room from './components/Room'
import Topbar from './components/Topbar'
import WaitingRoom from './components/WaitingRoom'
import AdmitPanel from './components/AdmitPanel'
import LandingPage from './pages/LandingPage'
import NotFoundPage from './pages/NotFoundPage'
import JoinPage from './pages/JoinPage'
import useLocalMedia from './hooks/useLocalMedia'
import useRoom from './hooks/useRoom'

export default function App() {
  const publishTrackRef = useRef(null)
  const media = useLocalMedia(publishTrackRef)
  const room = useRoom(media.tracksRef)
  const navigate = useNavigate()

  const [admitPanelClosed, setAdmitPanelClosed] = useState(false)

  useEffect(() => {
    publishTrackRef.current = room.publishTrack
  }, [room.publishTrack])

  // Dynamic page title
  useEffect(() => {
    document.title = room.currentRoom
      ? `Meet Me · ${room.currentRoom}`
      : 'Meet Me — Video calls, no signup'
  }, [room.currentRoom])

  // Automatically navigate to /room when a room is entered
  useEffect(() => {
    if (room.currentRoom) {
      navigate('/room', { replace: true })
    }
  }, [room.currentRoom, navigate])

  const showAdmitPanel = room.isOwner && room.admitRequests.length > 0 && !admitPanelClosed

  const handleAdmit = useCallback(
    (requestId) => {
      room.admitGuest(requestId, true)
    },
    [room],
  )

  const handleReject = useCallback(
    (requestId) => {
      room.admitGuest(requestId, false)
    },
    [room],
  )

  const handleCreateInvite = useCallback(() => {
    if (room.currentRoom) {
      room.createInvite()
    }
  }, [room])

  const handleLeave = useCallback(() => {
    room.leaveRoom()
    navigate('/lobby')
  }, [room, navigate])

  return (
    <Routes>
      {/* Home / Landing Page */}
      <Route path="/" element={<LandingPage />} />

      {/* Lobby: Enter name, create room, enter code */}
      <Route
        path="/lobby"
        element={
          room.currentRoom ? (
            <Navigate to="/room" replace />
          ) : room.waitingForAdmit ? (
            <div className="app">
              <Topbar connectionStatus={room.connectionStatus} roomId={null} />
              <WaitingRoom name={room.rememberedName} onCancel={room.cancelWaiting} />
            </div>
          ) : (
            <div className="app">
              <Topbar connectionStatus={room.connectionStatus} roomId={null} />
              {room.rejoining ? (
                <div className="rejoining-container">
                  <p className="rejoining">Rejoining your room...</p>
                  <button className="is-secondary" onClick={room.cancelRejoin}>
                    Go to lobby
                  </button>
                </div>
              ) : (
                <Lobby
                  onCreate={room.createRoom}
                  onRequestJoin={room.requestJoin}
                  onJoin={room.joinRoom}
                  error={room.roomError}
                  disabled={room.connectionStatus !== 'connected'}
                  initialName={room.rememberedName}
                />
              )}
            </div>
          )
        }
      />

      {/* Room: In call view */}
      <Route
        path="/room"
        element={
          !room.currentRoom && !room.rejoining ? (
            <Navigate to="/lobby" replace />
          ) : (
            <div className="app">
              <Topbar
                connectionStatus={room.connectionStatus}
                roomId={room.currentRoom}
                admitRequests={room.isOwner ? room.admitRequests : []}
                onShowAdmitPanel={() => setAdmitPanelClosed((prev) => !prev)}
              />

              {showAdmitPanel && room.isOwner && (
                <AdmitPanel
                  requests={room.admitRequests}
                  onAdmit={handleAdmit}
                  onReject={handleReject}
                />
              )}

              {room.rejoining ? (
                <div className="rejoining-container">
                  <p className="rejoining">Rejoining your room...</p>
                  <button className="is-secondary" onClick={room.cancelRejoin}>
                    Go to lobby
                  </button>
                </div>
              ) : (
                <Room
                  me={room.me}
                  participants={room.participants}
                  localStream={media.stream}
                  localScreenStream={media.screenStream}
                  remoteStreams={room.remoteStreams}
                  remoteScreenStreams={room.remoteScreenStreams}
                  remoteMedia={room.remoteMedia}
                  media={media}
                  onLeave={handleLeave}
                  messages={room.messages}
                  onSendMessage={room.sendChatMessage}
                  inviteLink={room.inviteLink}
                  onCreateInvite={handleCreateInvite}
                />
              )}
            </div>
          )
        }
      />

      {/* Invite link URL join: /join/:token */}
      <Route
        path="/join/:token"
        element={
          <div className="app">
            <Topbar connectionStatus={room.connectionStatus} roomId={null} />
            <JoinPage
              onResolveInvite={room.resolveInvite}
              resolvedRoomId={room.resolvedRoomId}
              resolveError={room.resolveError}
            />
          </div>
        }
      />

      {/* 404 Not Found */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
