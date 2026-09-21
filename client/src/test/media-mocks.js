import { vi } from 'vitest'

// jsdom doesn't implement WebRTC/media APIs at all, but the hooks call them
// directly (new MediaStream(), navigator.mediaDevices.getUserMedia) rather
// than through an injectable seam - so these need to exist as real globals
// for the hooks to run under test, not just be mockable per call.

export class FakeMediaStreamTrack {
  constructor(kind) {
    this.kind = kind
    this.id = `${kind}-${Math.random().toString(36).slice(2)}`
    this.stop = vi.fn()
  }
}

export class FakeMediaStream {
  constructor(tracks = []) {
    this._tracks = [...tracks]
  }

  addTrack(track) {
    this._tracks.push(track)
  }

  getTracks() {
    return this._tracks
  }
}

export function installMediaMocks() {
  globalThis.MediaStream = FakeMediaStream

  const getUserMedia = vi.fn(async (constraints) => {
    const kind = constraints.video ? 'video' : 'audio'
    return new FakeMediaStream([new FakeMediaStreamTrack(kind)])
  })

  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    value: { getUserMedia },
    configurable: true,
    writable: true,
  })

  return { getUserMedia }
}
