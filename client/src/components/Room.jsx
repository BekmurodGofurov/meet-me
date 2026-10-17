import { useState } from 'react'
import Chat from './Chat'
import MediaControls from './MediaControls'
import VideoTile from './VideoTile'

export default function Room({
  me,
  participants,
  localStream,
  localScreenStream,
  remoteStreams,
  remoteScreenStreams = {},
  remoteMedia,
  media,
  onLeave,
  messages,
  onSendMessage,
}) {
  const [manualPinnedId, setManualPinnedId] = useState(null)

  const screenTiles = []
  if (media.screenOn && localScreenStream) {
    screenTiles.push({
      id: `screen-${me?.clientId ?? 'local'}`,
      name: me ? `${me.name} (Screen)` : 'Your Screen',
      stream: localScreenStream,
      muted: true,
      showVideo: true,
      isScreen: true,
    })
  }

  participants.forEach((participant) => {
    const isSharing = remoteMedia[participant.clientId]?.screenSharing
    const screenStream = remoteScreenStreams[participant.clientId]
    if (isSharing || screenStream) {
      screenTiles.push({
        id: `screen-${participant.clientId}`,
        name: `${participant.name}'s Screen`,
        stream: screenStream ?? null,
        muted: false,
        showVideo: true,
        isScreen: true,
      })
    }
  })

  const cameraTiles = [
    {
      id: me?.clientId ?? 'local',
      name: me ? `${me.name} (you)` : 'You',
      stream: localStream,
      muted: true,
      showVideo: media.cameraOn,
      isScreen: false,
    },
    ...participants.map((participant) => ({
      id: participant.clientId,
      name: participant.name,
      stream: remoteStreams[participant.clientId] ?? null,
      muted: false,
      showVideo: remoteMedia[participant.clientId]?.cameraOn ?? false,
      isScreen: false,
    })),
  ]

  const tiles = [...screenTiles, ...cameraTiles]

  const defaultPinnedId = screenTiles.length > 0 ? screenTiles[0].id : null
  const effectivePinnedId = manualPinnedId === 'none' ? null : (manualPinnedId ?? defaultPinnedId)

  const togglePin = (id) => {
    setManualPinnedId((prev) => {
      const active = prev === 'none' ? null : (prev ?? defaultPinnedId)
      return active === id ? 'none' : id
    })
  }

  const soloTile = tiles.length === 1 ? tiles[0] : null
  const pinnedTile = soloTile ?? tiles.find((tile) => tile.id === effectivePinnedId)
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
                isScreen={tile.isScreen}
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
                  isScreen={pinnedTile.isScreen}
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
                    isScreen={tile.isScreen}
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
                screenOn={media.screenOn}
                onToggleCamera={media.toggleCamera}
                onToggleMic={media.toggleMic}
                onToggleScreenShare={media.toggleScreenShare}
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
