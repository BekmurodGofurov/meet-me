import { useEffect, useRef } from 'react'
import './App.scss'
import Lobby from './components/Lobby'
import Room from './components/Room'
import Topbar from './components/Topbar'
import useLocalMedia from './hooks/useLocalMedia'
import useRoom from './hooks/useRoom'

export default function App() {
  // useLocalMedia needs to tell useRoom about track changes, and useRoom needs
  // useLocalMedia's tracks - a ref breaks that circle without either hook
  // having to know about the other.
  const publishTrackRef = useRef(null)

  const media = useLocalMedia(publishTrackRef)
  const room = useRoom(media.tracksRef)

  useEffect(() => {
    publishTrackRef.current = room.publishTrack
  }, [room.publishTrack])

  return (
    <div className="app">
      <Topbar connectionStatus={room.connectionStatus} roomId={room.currentRoom} />

      {room.rejoining ? (
        <p className="rejoining">Rejoining your room...</p>
      ) : room.currentRoom ? (
        <Room
          me={room.me}
          participants={room.participants}
          localStream={media.stream}
          remoteStreams={room.remoteStreams}
          remoteMedia={room.remoteMedia}
          media={media}
          onLeave={room.leaveRoom}
          messages={room.messages}
          onSendMessage={room.sendChatMessage}
        />
      ) : (
        <Lobby
          onCreate={room.createRoom}
          onJoin={room.joinRoom}
          error={room.roomError}
          disabled={room.connectionStatus !== 'connected'}
          initialName={room.rememberedName}
        />
      )}
    </div>
  )
}
