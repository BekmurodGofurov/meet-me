import { vi } from 'vitest'

// A fake WebSocket that lets tests both inspect what useRoom sent and
// deliver server messages on demand - a real WebSocket obviously can't be
// driven this way from a unit test.
export class FakeWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  static instances = []

  constructor(url) {
    this.url = url
    this.readyState = FakeWebSocket.CONNECTING
    this.sent = []
    this.onopen = null
    this.onmessage = null
    this.onerror = null
    this.onclose = null
    this._openListeners = []
    FakeWebSocket.instances.push(this)
  }

  send(data) {
    this.sent.push(JSON.parse(data))
  }

  addEventListener(type, listener) {
    if (type === 'open') this._openListeners.push(listener)
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED
    this.onclose?.({ code: 1000, reason: '', wasClean: true })
  }

  // --- test-only helpers below, not part of the real WebSocket API ---

  open() {
    this.readyState = FakeWebSocket.OPEN
    this.onopen?.()
    this._openListeners.forEach((listener) => listener())
  }

  receive(payload) {
    this.onmessage?.({ data: JSON.stringify(payload) })
  }

  lastSent() {
    return this.sent[this.sent.length - 1]
  }
}

// A minimal fake RTCPeerConnection - enough to exercise useRoom's signaling
// logic (offers get created and sent, descriptions get applied, tracks get
// attached) without simulating real SDP/ICE semantics, which is a job for
// real browsers, not a unit-test mock.
export class FakeRTCPeerConnection {
  static instances = []

  constructor() {
    FakeRTCPeerConnection.instances.push(this)
    this.signalingState = 'stable'
    this.localDescription = null
    this.remoteDescription = null
    this.onnegotiationneeded = null
    this.onicecandidate = null
    this.ontrack = null
    this.closed = false
    this._transceivers = []
  }

  _makeSender(track = null) {
    const sender = { track }
    sender.replaceTrack = vi.fn((t) => {
      sender.track = t
    })
    return sender
  }

  addTrack(track) {
    const sender = this._makeSender(track)
    this._transceivers.push({ sender, receiver: { track: null }, direction: 'sendrecv' })
    queueMicrotask(() => this.onnegotiationneeded?.())
    return sender
  }

  addTransceiver(kind, opts = {}) {
    const sender = this._makeSender(null)
    const receiver = { track: opts.direction === 'recvonly' ? { kind } : null }
    const transceiver = { sender, receiver, direction: opts.direction ?? 'sendrecv', currentDirection: null }
    this._transceivers.push(transceiver)
    // Real WebRTC fires negotiationneeded for this too, not just addTrack.
    queueMicrotask(() => this.onnegotiationneeded?.())
    return transceiver
  }

  getTransceivers() {
    return this._transceivers
  }

  async setLocalDescription(desc) {
    this.localDescription = desc ?? {
      type: this.signalingState === 'have-remote-offer' ? 'answer' : 'offer',
      sdp: 'fake-sdp',
    }
    this.signalingState = this.localDescription.type === 'offer' ? 'have-local-offer' : 'stable'
  }

  async setRemoteDescription(desc) {
    this.remoteDescription = desc
    this.signalingState = desc.type === 'offer' ? 'have-remote-offer' : 'stable'
  }

  async addIceCandidate(candidate) {
    this._candidates ??= []
    this._candidates.push(candidate)
  }

  close() {
    this.closed = true
  }
}

export function installWebrtcMocks() {
  FakeWebSocket.instances.length = 0
  FakeRTCPeerConnection.instances.length = 0
  globalThis.WebSocket = FakeWebSocket
  globalThis.RTCPeerConnection = FakeRTCPeerConnection
}

export function latestSocket() {
  return FakeWebSocket.instances[FakeWebSocket.instances.length - 1]
}
