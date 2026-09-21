import { useState } from 'react'
import Chat from './Chat'
import MediaControls from './MediaControls'
import VideoTile from './VideoTile'

export default function Room({
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
  // With just one person in the room (yourself, before anyone else has
  // joined), that person IS the active screen by default - there's no
  // meaningful "gallery" to show for a party of one. Once someone else is
  // there, it defaults back to a gallery, and clicking any tile promotes
  // that person to the large view with everyone else in a thumbnail strip.
  const [pinnedId, setPinnedId] = useState(null)

  // Built from the room roster, not from remoteStreams: a participant whose
  // camera and mic are both off never produces a track, so ontrack never
  // fires for them - keying tiles off remoteStreams instead of participants
  // would make them invisible entirely, not just show a placeholder, and it
  // would also miscount solo/gallery mode below.
  const tiles = [
    {
      id: me?.clientId ?? 'local',
      name: me ? `${me.name} (you)` : 'You',
      stream: localStream,
      muted: true,
      showVideo: media.cameraOn,
    },
    ...participants.map((participant) => ({
      id: participant.clientId,
      name: participant.name,
      stream: remoteStreams[participant.clientId] ?? null,
      muted: false,
      showVideo: remoteMedia[participant.clientId]?.cameraOn ?? false,
    })),
  ]

  const togglePin = (id) => setPinnedId((prev) => (prev === id ? null : id))

  const soloTile = tiles.length === 1 ? tiles[0] : null
  // If the pinned person left, tiles.find here simply returns undefined and
  // the gallery renders instead - no separate cleanup needed for that case.
  const pinnedTile = soloTile ?? tiles.find((tile) => tile.id === pinnedId)
  const otherTiles = pinnedTile && !soloTile ? tiles.filter((tile) => tile.id !== pinnedTile.id) : []

  return (
    <div className="room">
      <div className="room__layout">
        {pinnedTile && (
          <div className="stage-sidebar">
            {otherTiles.map((tile) => (
              <VideoTile
                key={tile.id}
                stream={tile.stream}
                muted={tile.muted}
                showVideo={tile.showVideo}
                label={tile.name}
                size="small"
                onClick={() => togglePin(tile.id)}
              />
            ))}
          </div>
        )}

        <div className="room__main">
          <div className="video-stage">
            {pinnedTile ? (
              <div className="stage-active">
                <VideoTile
                  stream={pinnedTile.stream}
                  muted={pinnedTile.muted}
                  showVideo={pinnedTile.showVideo}
                  label={pinnedTile.name}
                  size="large"
                  active={!soloTile}
                  onClick={soloTile ? undefined : () => togglePin(pinnedTile.id)}
                />
              </div>
            ) : (
              <div className="video-grid">
                {tiles.map((tile) => (
                  <VideoTile
                    key={tile.id}
                    stream={tile.stream}
                    muted={tile.muted}
                    showVideo={tile.showVideo}
                    label={tile.name}
                    onClick={() => togglePin(tile.id)}
                  />
                ))}
              </div>
            )}

            {/* Overlaid on the video itself, not a separate row below it. */}
            <div className="video-stage__controls">
              <MediaControls
                cameraOn={media.cameraOn}
                micOn={media.micOn}
                onToggleCamera={media.toggleCamera}
                onToggleMic={media.toggleMic}
                onLeave={onLeave}
              />
            </div>
          </div>

          {media.mediaError && <p className="media-error">{media.mediaError}</p>}
        </div>

        <Chat messages={messages} myId={me?.clientId} onSend={onSendMessage} />
      </div>
    </div>
  )
}
