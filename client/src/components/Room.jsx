import Chat from './Chat'
import MediaControls from './MediaControls'
import VideoTile from './VideoTile'

export default function Room({
  roomId,
  me,
  participants,
  localStream,
  remoteStreams,
  remoteMedia,
  media,
  onLeave,
  messages,
  onSendMessage,
}) {
  const nameFor = (clientId) =>
    participants.find((p) => p.clientId === clientId)?.name ?? 'Guest'

  return (
    <div className="room">
      <header className="room__header">
        <h2>Room {roomId}</h2>
        <p>Share this code so others can join.</p>
        <p className="room__roster">
          In this room: {[me?.name, ...participants.map((p) => p.name)].filter(Boolean).join(', ')}
        </p>
      </header>

      <MediaControls
        cameraOn={media.cameraOn}
        micOn={media.micOn}
        onToggleCamera={media.toggleCamera}
        onToggleMic={media.toggleMic}
        onLeave={onLeave}
        error={media.mediaError}
      />

      <div className="room__body">
        <div className="video-grid">
          <VideoTile
            stream={localStream}
            muted
            showVideo={media.cameraOn}
            label={me ? `${me.name} (you)` : 'You'}
          />

          {Object.entries(remoteStreams).map(([clientId, stream]) => (
            <VideoTile
              key={clientId}
              stream={stream}
              // Without this the tile keeps painting the last frame the peer
              // sent before switching their camera off.
              showVideo={remoteMedia[clientId]?.cameraOn ?? false}
              label={nameFor(clientId)}
            />
          ))}
        </div>

        <Chat messages={messages} myId={me?.clientId} onSend={onSendMessage} />
      </div>
    </div>
  )
}
