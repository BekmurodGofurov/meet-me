import { useCallback, useEffect, useRef, useState } from 'react'
import { clearSession, loadName, loadSession, saveName, saveSession } from '../session'

// Used until the server sends its own list with room-created/existing-peers
// (which can include short-lived TURN credentials - see backend/signaling.js).
export const DEFAULT_ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }]

const RECONNECT_MAX_DELAY_MS = 10000
const DISCONNECTED_RESTART_DELAY_MS = 4000

// In a mesh every sender uploads one copy per peer, so the per-peer budget
// has to shrink as the room grows or the uplink saturates and quality drops
// for everyone. Indexed by number of remote peers (1..5).
const CAMERA_LIMITS = [
  { maxBitrate: 1_500_000, scaleResolutionDownBy: 1 }, // 1 peer: ~720p
  { maxBitrate: 1_000_000, scaleResolutionDownBy: 1 },
  { maxBitrate: 700_000, scaleResolutionDownBy: 1.5 }, // ~480p
  { maxBitrate: 450_000, scaleResolutionDownBy: 2 }, // ~360p
  { maxBitrate: 350_000, scaleResolutionDownBy: 2 },
]
const SCREEN_MAX_BITRATE = [2_500_000, 2_000_000, 1_500_000, 1_200_000, 1_000_000]

const limitFor = (table, peerCount) => table[Math.min(Math.max(peerCount, 1), table.length) - 1]

async function limitSender(sender, { maxBitrate, scaleResolutionDownBy }) {
  if (!sender?.track || typeof sender.getParameters !== 'function') return
  const params = sender.getParameters()
  // Encodings only exist once the transceiver has been negotiated; this is
  // re-run after every negotiation, so skipping here is fine.
  if (!params.encodings?.length) return
  params.encodings[0].maxBitrate = maxBitrate
  if (scaleResolutionDownBy) params.encodings[0].scaleResolutionDownBy = scaleResolutionDownBy
  try {
    await sender.setParameters(params)
  } catch (err) {
    console.warn('Could not apply bitrate limit', err)
  }
}

function applyEncodingLimits(peer, peerCount) {
  limitSender(peer.transceivers.video?.sender, limitFor(CAMERA_LIMITS, peerCount))
  limitSender(peer.transceivers.screen?.sender, { maxBitrate: limitFor(SCREEN_MAX_BITRATE, peerCount) })
}

const sameTracks = (a, b) => {
  if (!a || !b) return false
  const aTracks = a.getTracks()
  const bTracks = b.getTracks()
  return aTracks.length === bTracks.length && aTracks.every((track, i) => track === bTracks[i])
}

const MAX_HISTORY_MESSAGES = 200

// The server sends the room's recent chat when someone comes back after a
// reload or a dropped connection. It is flagged so the unread badge and the
// toast don't treat old messages as new ones. Anything malformed is skipped.
function historyToMessages(history) {
  if (!Array.isArray(history)) return []
  return history
    .filter((entry) => entry && typeof entry.text === 'string' && typeof entry.from === 'string')
    .slice(-MAX_HISTORY_MESSAGES)
    .map((entry) => ({
      id: crypto.randomUUID(),
      kind: 'chat',
      history: true,
      from: entry.from,
      fromName: typeof entry.fromName === 'string' ? entry.fromName : 'Guest',
      text: entry.text,
    }))
}

export function getWebSocketUrl() {
  let envWsUrl = import.meta.env.VITE_WS_URL

  if (envWsUrl) {
    if (envWsUrl.startsWith('http://')) {
      envWsUrl = 'ws://' + envWsUrl.slice(7)
    } else if (envWsUrl.startsWith('https://')) {
      envWsUrl = 'wss://' + envWsUrl.slice(8)
    }

    if (envWsUrl.startsWith('ws://') || envWsUrl.startsWith('wss://')) {
      return new URL(envWsUrl).toString()
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const path = envWsUrl.startsWith('/') ? envWsUrl : `/${envWsUrl}`
    return new URL(`${protocol}//${window.location.host}${path}`).toString()
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return new URL(`${protocol}//${window.location.host}/ws`).toString()
}

// Owns the signaling socket and the mesh of peer connections it drives. Those
// two are inseparable - every peer connection is created, advanced and torn
// down in response to a signaling message - so they live in one hook.
//
// Negotiation follows the "perfect negotiation" pattern: whenever local media
// changes, onnegotiationneeded re-offers, and a deterministic polite/impolite
// rule resolves the case where both sides offer at once. That is what makes
// turning a camera on mid-call actually reach the other side.
export default function useRoom(tracksRef) {
  const wsRef = useRef(null)
  const peersRef = useRef(new Map())
  // Map<peerId, Map<streamId, MediaStream>> - every remote stream as the
  // browser delivered it. Which one is the camera and which the screen is
  // decided from the stream ids the peer announces in media-state: stream
  // ids survive the trip through SDP (a=msid), track ids do not.
  const remoteStreamsByIdRef = useRef(new Map())
  const remoteStreamsRef = useRef(new Map())
  const remoteScreenStreamsRef = useRef(new Map())
  const pendingCandidatesRef = useRef(new Map())
  // Map<peerId, Promise> - signaling for one peer is applied strictly in
  // arrival order; onmessage is async, so without this an answer and the
  // next offer could interleave and break perfect negotiation.
  const signalingQueuesRef = useRef(new Map())
  const iceServersRef = useRef(DEFAULT_ICE_SERVERS)
  const myIdRef = useRef(null)
  const mediaStateRef = useRef({ cameraOn: false, micOn: false, screenSharing: false })
  // Only their ids matter: they are attached to the outgoing transceivers so
  // the other side can tell camera (with mic) apart from screen.
  const localStreamsRef = useRef(null)
  // peer-left only carries a clientId, not a name - by the time it arrives
  // the name has to already be known somewhere that isn't a stale closure
  // over participants state, so it's kept here instead.
  const participantNamesRef = useRef(new Map())
  const isJoinRoute = typeof window !== 'undefined' && window.location.pathname.startsWith('/join/')
  // Read once on mount, before the connect effect runs, so it's available the instant
  // the socket opens rather than racing a state update.
  const [initialSession] = useState(() => {
    if (isJoinRoute) return null
    const session = loadSession()
    if (session?.name && !loadName()) {
      saveName(session.name)
    }
    return session
  })
  const storedSessionRef = useRef(initialSession)
  const isRejoiningRef = useRef(!isJoinRoute && Boolean(initialSession))

  const [connectionStatus, setConnectionStatus] = useState('connecting')
  const [currentRoom, setCurrentRoom] = useState(null)
  const [me, setMe] = useState(null)
  const [participants, setParticipants] = useState([])
  const [remoteStreams, setRemoteStreams] = useState({})
  const [remoteScreenStreams, setRemoteScreenStreams] = useState({})
  const [remoteMedia, setRemoteMedia] = useState({})
  const remoteMediaRef = useRef({})
  const [roomError, setRoomError] = useState('')
  const [messages, setMessages] = useState([])
  const [rejoining, setRejoining] = useState(!isJoinRoute && Boolean(initialSession))
  // Falls back to the standalone remembered name (survives leaving a room)
  // when there's no active session to rejoin.
  const [rememberedName, setRememberedName] = useState(
    () => initialSession?.name ?? loadName(),
  )

  // Waiting Room, Admit system & Invite Link state
  const [waitingForAdmit, setWaitingForAdmit] = useState(false)
  const waitingRequestIdRef = useRef(null)
  const [admitRequests, setAdmitRequests] = useState([])
  const [isOwner, setIsOwner] = useState(false)
  const [inviteLink, setInviteLink] = useState(null)
  const [resolvedRoomId, setResolvedRoomId] = useState(null)
  const [resolveError, setResolveError] = useState(null)

  const pendingMessagesRef = useRef([])

  const getLocalStreams = useCallback(() => {
    localStreamsRef.current ??= { camera: new MediaStream(), screen: new MediaStream() }
    return localStreamsRef.current
  }, [])

  const send = useCallback((message) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message))
    } else {
      pendingMessagesRef.current.push(message)
    }
  }, [])

  const mediaStateMessage = useCallback(() => {
    const { camera, screen } = getLocalStreams()
    return {
      type: 'media-state',
      ...mediaStateRef.current,
      cameraStreamId: camera.id,
      screenStreamId: screen.id,
    }
  }, [getLocalStreams])

  const announceMediaState = useCallback(() => {
    send(mediaStateMessage())
  }, [send, mediaStateMessage])

  const applyAllEncodingLimits = useCallback(() => {
    const count = peersRef.current.size
    peersRef.current.forEach((peer) => applyEncodingLimits(peer, count))
  }, [])

  // Clears everything tied to the current room - used by leaving, by a
  // failed rejoin, and by losing the signaling connection.
  const resetRoomState = useCallback(() => {
    peersRef.current.forEach((peer) => peer.pc.close())
    peersRef.current.clear()
    remoteStreamsByIdRef.current.clear()
    remoteStreamsRef.current.clear()
    remoteScreenStreamsRef.current.clear()
    participantNamesRef.current.clear()
    pendingCandidatesRef.current.clear()
    signalingQueuesRef.current.clear()
    remoteMediaRef.current = {}

    setCurrentRoom(null)
    setMe(null)
    setParticipants([])
    setRemoteStreams({})
    setRemoteScreenStreams({})
    setRemoteMedia({})
    setMessages([])
    setWaitingForAdmit(false)
    waitingRequestIdRef.current = null
    setAdmitRequests([])
    setIsOwner(false)
    setInviteLink(null)
  }, [])

  useEffect(() => {
    let socket = null
    let disposed = false
    let reconnectTimer = null
    let attempt = 0

    const post = (message) => {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
    }

    const enqueue = (peerId, task) => {
      const previous = signalingQueuesRef.current.get(peerId) ?? Promise.resolve()
      const next = previous.then(task).catch((err) => console.error('Signaling step failed', err))
      signalingQueuesRef.current.set(peerId, next)
      return next
    }

    // Re-derive which of a peer's streams is the camera and which is the
    // screen. Runs whenever a track arrives or the peer's media-state
    // changes, so the order those two arrive in doesn't matter.
    const refreshRemoteStreams = (peerId) => {
      const info = remoteMediaRef.current[peerId] ?? {}
      const byId = remoteStreamsByIdRef.current.get(peerId) ?? new Map()

      const screenSource = info.screenStreamId ? byId.get(info.screenStreamId) : undefined
      const cameraSource = info.cameraStreamId
        ? byId.get(info.cameraStreamId)
        : [...byId.values()].find((stream) => stream !== screenSource)

      const update = (ref, setState, source, visible) => {
        const current = ref.current.get(peerId)
        if (!source || !visible) {
          if (!current) return
          ref.current.delete(peerId)
          setState((prev) => {
            const next = { ...prev }
            delete next[peerId]
            return next
          })
          return
        }
        // A fresh MediaStream object makes React (and the <video>) notice
        // tracks added by a renegotiation.
        if (sameTracks(current, source)) return
        const wrapped = new MediaStream(source.getTracks())
        ref.current.set(peerId, wrapped)
        setState((prev) => ({ ...prev, [peerId]: wrapped }))
      }

      update(remoteStreamsRef, setRemoteStreams, cameraSource, true)
      update(remoteScreenStreamsRef, setRemoteScreenStreams, screenSource, Boolean(info.screenSharing))
    }

    const getPeer = (peerId) => {
      const existing = peersRef.current.get(peerId)
      if (existing) return existing

      const pc = new RTCPeerConnection({ iceServers: iceServersRef.current })
      const peer = {
        pc,
        // Deterministic and symmetric: exactly one side of any pair is polite,
        // and both sides agree on which without extra signaling.
        polite: (myIdRef.current ?? '') > peerId,
        makingOffer: false,
        ignoreOffer: false,
        settingRemoteAnswer: false,
        transceivers: {},
        restartTimer: null,
      }

      pc.onnegotiationneeded = async () => {
        try {
          peer.makingOffer = true
          await pc.setLocalDescription()
          post({ type: 'offer', targetId: peerId, payload: pc.localDescription })
        } catch (err) {
          console.error('Negotiation failed', err)
        } finally {
          peer.makingOffer = false
        }
      }

      pc.onicecandidate = ({ candidate }) => {
        if (candidate) post({ type: 'ice-candidate', targetId: peerId, payload: candidate })
      }

      // Network changes (Wi-Fi -> mobile, a VPN toggling) kill the current
      // ICE path. restartIce() gathers new candidates and renegotiates
      // instead of leaving the tile frozen until someone rejoins.
      pc.onconnectionstatechange = () => {
        clearTimeout(peer.restartTimer)
        if (pc.connectionState === 'failed') {
          pc.restartIce?.()
        } else if (pc.connectionState === 'disconnected') {
          peer.restartTimer = setTimeout(() => {
            if (pc.connectionState === 'disconnected') pc.restartIce?.()
          }, DISCONNECTED_RESTART_DELAY_MS)
        } else if (pc.connectionState === 'connected') {
          applyEncodingLimits(peer, peersRef.current.size)
        }
      }

      pc.ontrack = ({ track, streams }) => {
        const stream = streams?.[0] ?? new MediaStream([track])
        let byId = remoteStreamsByIdRef.current.get(peerId)
        if (!byId) {
          byId = new Map()
          remoteStreamsByIdRef.current.set(peerId, byId)
        }
        byId.set(stream.id, stream)
        refreshRemoteStreams(peerId)
      }

      // Always the same three slots, in the same order: camera, mic, screen.
      // Camera and mic share one stream id (so they're lip-synced and shown
      // in one tile), the screen gets its own. A slot whose device is off is
      // recvonly until it is first switched on.
      const { video, audio, screen } = tracksRef.current
      const { camera: cameraStream, screen: screenStream } = getLocalStreams()
      const addSlot = (track, kind, stream) =>
        pc.addTransceiver(track ?? kind, {
          direction: track ? 'sendrecv' : 'recvonly',
          streams: [stream],
        })
      peer.transceivers = {
        video: addSlot(video, 'video', cameraStream),
        audio: addSlot(audio, 'audio', cameraStream),
        screen: addSlot(screen, 'video', screenStream),
      }

      peersRef.current.set(peerId, peer)
      return peer
    }

    const closePeer = (peerId) => {
      const peer = peersRef.current.get(peerId)
      if (peer) {
        clearTimeout(peer.restartTimer)
        peer.pc.close()
      }
      peersRef.current.delete(peerId)
      remoteStreamsByIdRef.current.delete(peerId)
      remoteStreamsRef.current.delete(peerId)
      remoteScreenStreamsRef.current.delete(peerId)
      pendingCandidatesRef.current.delete(peerId)
      signalingQueuesRef.current.delete(peerId)
      delete remoteMediaRef.current[peerId]

      const without = (prev) => {
        const next = { ...prev }
        delete next[peerId]
        return next
      }
      setRemoteStreams(without)
      setRemoteScreenStreams(without)
      setRemoteMedia(without)
    }

    const handleDescription = async (peerId, description) => {
      const peer = getPeer(peerId)
      const { pc } = peer

      const readyForOffer =
        !peer.makingOffer && (pc.signalingState === 'stable' || peer.settingRemoteAnswer)
      const offerCollision = description.type === 'offer' && !readyForOffer

      peer.ignoreOffer = !peer.polite && offerCollision
      if (peer.ignoreOffer) return

      peer.settingRemoteAnswer = description.type === 'answer'
      await pc.setRemoteDescription(description)
      peer.settingRemoteAnswer = false

      // Drain any ICE candidates that arrived before the remote description was applied
      const queuedCandidates = pendingCandidatesRef.current.get(peerId)
      if (queuedCandidates?.length) {
        pendingCandidatesRef.current.delete(peerId)
        for (const candidate of queuedCandidates) {
          try {
            await pc.addIceCandidate(candidate)
          } catch (err) {
            console.error('Failed to add queued ICE candidate', err)
          }
        }
      }

      if (description.type === 'offer') {
        await pc.setLocalDescription()
        post({ type: 'answer', targetId: peerId, payload: pc.localDescription })
      }

      // Every negotiation can create or change encodings, so (re)apply the
      // bitrate caps now that they exist.
      applyEncodingLimits(peer, peersRef.current.size)
    }

    const handleCandidate = async (peerId, candidate) => {
      const peer = peersRef.current.get(peerId)
      if (!peer || !peer.pc.remoteDescription) {
        const queue = pendingCandidatesRef.current.get(peerId) ?? []
        queue.push(candidate)
        pendingCandidatesRef.current.set(peerId, queue)
        return
      }
      try {
        await peer.pc.addIceCandidate(candidate)
      } catch (err) {
        // A candidate for an offer we deliberately ignored is expected.
        if (!peer.ignoreOffer) console.error('Failed to add ICE candidate', err)
      }
    }

    const enterRoom = (data) => {
      if (Array.isArray(data.iceServers) && data.iceServers.length > 0) {
        iceServersRef.current = data.iceServers
      }
      myIdRef.current = data.clientId
      setMe({ clientId: data.clientId, name: data.name })
      setCurrentRoom(data.roomId)
      setRejoining(false)
      isRejoiningRef.current = false
      setRememberedName(data.name)
      setMessages(historyToMessages(data.chatHistory))
      setWaitingForAdmit(false)
      waitingRequestIdRef.current = null
      setRoomError('')
      saveSession(data.roomId, data.name, data.rejoinToken)
      storedSessionRef.current = { roomId: data.roomId, name: data.name, rejoinToken: data.rejoinToken }
    }

    const handleMessage = async (data) => {
      switch (data.type) {
        case 'room-created':
          enterRoom(data)
          setParticipants([])
          setIsOwner(true)
          break

        case 'existing-peers': {
          enterRoom(data)
          setParticipants(data.peers)
          setIsOwner(Boolean(data.ownerId && data.ownerId === data.clientId))

          // Creating the connection is enough - onnegotiationneeded fires and
          // sends the offer.
          data.peers.forEach((peer) => {
            getPeer(peer.clientId)
            participantNamesRef.current.set(peer.clientId, peer.name)
          })
          post(mediaStateMessage())
          break
        }

        case 'peer-joined':
          participantNamesRef.current.set(data.clientId, data.name)
          setParticipants((prev) => [
            ...prev.filter((p) => p.clientId !== data.clientId),
            { clientId: data.clientId, name: data.name },
          ])
          setMessages((prev) => [
            ...prev,
            { id: crypto.randomUUID(), kind: 'system', tone: 'join', text: `${data.name} joined the room` },
          ])
          // Tell the newcomer whether our camera/mic are already on, since
          // they missed the announcement we made when we arrived.
          post(mediaStateMessage())
          break

        case 'peer-left': {
          const name = participantNamesRef.current.get(data.clientId) ?? 'Someone'
          participantNamesRef.current.delete(data.clientId)

          setParticipants((prev) => prev.filter((p) => p.clientId !== data.clientId))
          setMessages((prev) => [
            ...prev,
            { id: crypto.randomUUID(), kind: 'system', tone: 'leave', text: `${name} left the room` },
          ])
          closePeer(data.clientId)
          // Fewer peers = more upload budget for each remaining one.
          applyAllEncodingLimits()
          break
        }

        case 'owner-changed':
          setIsOwner(data.newOwnerId === myIdRef.current)
          break

        case 'waiting':
          setWaitingForAdmit(true)
          waitingRequestIdRef.current = data.requestId
          setRoomError('')
          break

        case 'join-rejected':
          setWaitingForAdmit(false)
          waitingRequestIdRef.current = null
          setRoomError(data.reason || 'The host declined your join request.')
          break

        case 'admit-request':
          setAdmitRequests((prev) => {
            if (prev.some((r) => r.requestId === data.requestId)) return prev
            return [...prev, { requestId: data.requestId, name: data.name, clientId: data.clientId }]
          })
          break

        case 'admit-request-cancelled':
          setAdmitRequests((prev) => prev.filter((r) => r.requestId !== data.requestId))
          break

        case 'invite-created':
          setInviteLink(`${window.location.origin}/join/${data.token}`)
          break

        case 'invite-resolved':
          setResolvedRoomId(data.roomId)
          setResolveError(null)
          break

        case 'offer':
        case 'answer':
          if (data.senderId && data.payload) {
            await enqueue(data.senderId, () => handleDescription(data.senderId, data.payload))
          }
          break

        case 'ice-candidate':
          if (data.senderId && data.payload) {
            await enqueue(data.senderId, () => handleCandidate(data.senderId, data.payload))
          }
          break

        case 'media-state': {
          const nextMedia = {
            cameraOn: Boolean(data.cameraOn),
            micOn: Boolean(data.micOn),
            screenSharing: Boolean(data.screenSharing),
            cameraStreamId: data.cameraStreamId ?? null,
            screenStreamId: data.screenStreamId ?? null,
          }
          remoteMediaRef.current[data.from] = nextMedia
          setRemoteMedia((prev) => ({ ...prev, [data.from]: nextMedia }))
          refreshRemoteStreams(data.from)
          break
        }

        case 'chat-message':
          // The server validates this too; a peer must never be able to crash
          // our render with a non-string.
          if (typeof data.text !== 'string') break
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              kind: 'chat',
              from: data.from,
              fromName: typeof data.fromName === 'string' ? data.fromName : 'Guest',
              text: data.text,
            },
          ])
          break

        case 'error': {
          const wasRejoining = isRejoiningRef.current
          if (wasRejoining) {
            clearSession()
            storedSessionRef.current = null
            setRejoining(false)
            isRejoiningRef.current = false
            resetRoomState()
          }

          if (data.message === 'Invalid or expired invite link') {
            setResolveError(data.message)
          } else if (wasRejoining) {
            // A stale room was deleted while away; silently return to the clean home page.
            setRoomError('')
          } else {
            const message =
              data.message === 'Room does not exist' ? 'This room does not exist' : data.message
            setRoomError(message)
          }
          break
        }

        default:
          break
      }
    }

    const connect = () => {
      // Same-origin, path-based - not a hardcoded port. In production this
      // lets a single nginx/domain proxy /ws to the backend container on
      // whatever internal port it actually runs on, no separate public port
      // needed. In dev, Vite's own server.proxy (see vite.config.js) forwards
      // this to the local backend the same way.
      socket = new WebSocket(getWebSocketUrl())
      wsRef.current = socket

      socket.onopen = () => {
        attempt = 0
        setConnectionStatus('connected')

        // Flush any queued messages that were sent before socket opened
        while (pendingMessagesRef.current.length > 0) {
          post(pendingMessagesRef.current.shift())
        }

        if (!isJoinRoute) {
          const stored = storedSessionRef.current || loadSession()
          if (stored) {
            storedSessionRef.current = stored
            isRejoiningRef.current = true
            setRejoining(true)
            post({ type: 'join-room', roomId: stored.roomId, name: stored.name, rejoinToken: stored.rejoinToken })
          }
        }
      }

      socket.onerror = () => setConnectionStatus('error')

      // The signaling server lost us (server restart, network drop, laptop
      // sleep). The server has already told the room we left and the peers
      // have closed their side, so tear ours down too and come back with
      // the rejoin token from the saved session.
      socket.onclose = () => {
        setConnectionStatus('closed')
        if (disposed) return

        const hadRoom = Boolean(storedSessionRef.current)
        const wasWaiting = Boolean(waitingRequestIdRef.current)
        resetRoomState()
        if (wasWaiting) setRoomError('Connection to the server was lost. Please ask to join again.')
        if (hadRoom) {
          isRejoiningRef.current = true
          setRejoining(true)
        }

        const delay = Math.min(1000 * 2 ** attempt, RECONNECT_MAX_DELAY_MS)
        attempt += 1
        reconnectTimer = setTimeout(() => {
          setConnectionStatus('connecting')
          connect()
        }, delay)
      }

      socket.onmessage = async (event) => {
        let data
        try {
          data = JSON.parse(event.data)
        } catch {
          return
        }
        if (!data || typeof data.type !== 'string') return

        try {
          await handleMessage(data)
        } catch (err) {
          console.error(`Failed handling ${data.type}`, err)
        }
      }
    }

    connect()

    const peers = peersRef.current
    const remoteStreamsById = remoteStreamsByIdRef.current
    const remoteStreamsMap = remoteStreamsRef.current
    const remoteScreenStreamsMap = remoteScreenStreamsRef.current
    const pendingCandidates = pendingCandidatesRef.current

    return () => {
      disposed = true
      clearTimeout(reconnectTimer)

      peers.forEach((peer) => {
        clearTimeout(peer.restartTimer)
        peer.pc.close()
      })
      peers.clear()
      remoteStreamsById.clear()
      remoteStreamsMap.clear()
      remoteScreenStreamsMap.clear()
      pendingCandidates.clear()

      socket.onopen = null
      socket.onerror = null
      socket.onclose = null
      socket.onmessage = null

      if (socket.readyState === WebSocket.CONNECTING) {
        socket.addEventListener('open', () => socket.close())
      } else {
        socket.close()
      }
    }
  }, [tracksRef, isJoinRoute, getLocalStreams, mediaStateMessage, resetRoomState, applyAllEncodingLimits])

  // Switching a device on or off only swaps the track on an existing
  // transceiver (replaceTrack needs no renegotiation). The first time a slot
  // starts sending, its direction flips to sendrecv, which renegotiates once.
  const publishTrack = useCallback(
    (kind, track) => {
      if (kind === 'video') mediaStateRef.current.cameraOn = Boolean(track)
      else if (kind === 'audio') mediaStateRef.current.micOn = Boolean(track)
      else if (kind === 'screen') mediaStateRef.current.screenSharing = Boolean(track)

      peersRef.current.forEach((peer) => {
        const transceiver = peer.transceivers[kind]
        if (!transceiver) return

        Promise.resolve(transceiver.sender.replaceTrack(track)).catch((err) =>
          console.error(`Failed to switch ${kind} track`, err),
        )
        if (track && transceiver.direction !== 'sendrecv') {
          transceiver.direction = 'sendrecv'
        }
      })

      announceMediaState()
      applyAllEncodingLimits()
    },
    [announceMediaState, applyAllEncodingLimits],
  )

  const createRoom = useCallback(
    (name) => {
      isRejoiningRef.current = false
      setRoomError('')
      setRememberedName(name)
      saveName(name)
      send({ type: 'create-room', name })
    },
    [send],
  )

  const requestJoin = useCallback(
    (roomId, name) => {
      isRejoiningRef.current = false
      setRoomError('')
      setRememberedName(name)
      saveName(name)
      send({ type: 'join-request', roomId, name })
    },
    [send],
  )

  const cancelWaiting = useCallback(() => {
    const reqId = waitingRequestIdRef.current
    if (reqId) {
      send({ type: 'cancel-join-request', requestId: reqId })
    }
    setWaitingForAdmit(false)
    waitingRequestIdRef.current = null
    setRoomError('')
  }, [send])

  const admitGuest = useCallback(
    (requestId, admitted) => {
      send({ type: 'admit-response', requestId, admitted })
      setAdmitRequests((prev) => prev.filter((r) => r.requestId !== requestId))
    },
    [send],
  )

  const createInvite = useCallback(() => {
    if (currentRoom) {
      send({ type: 'create-invite', roomId: currentRoom })
    }
  }, [send, currentRoom])

  const resolveInvite = useCallback(
    (token) => {
      setResolvedRoomId(null)
      setResolveError(null)
      send({ type: 'resolve-invite', token })
    },
    [send],
  )

  const leaveRoom = useCallback(() => {
    clearSession()
    storedSessionRef.current = null
    isRejoiningRef.current = false

    send({ type: 'leave-room' })
    resetRoomState()
    setRoomError('')
  }, [send, resetRoomState])

  const sendChatMessage = useCallback(
    (text) => {
      const trimmed = text.trim()
      if (!trimmed) return

      send({ type: 'chat-message', text: trimmed })

      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), kind: 'chat', from: myIdRef.current, fromName: me?.name ?? 'You', text: trimmed },
      ])
    },
    [send, me],
  )

  const cancelRejoin = useCallback(() => {
    clearSession()
    storedSessionRef.current = null
    isRejoiningRef.current = false
    setRejoining(false)
    setRoomError('')
  }, [])

  return {
    connectionStatus,
    currentRoom,
    me,
    participants,
    remoteStreams,
    remoteScreenStreams,
    remoteMedia,
    roomError,
    rejoining,
    cancelRejoin,
    rememberedName,
    messages,
    publishTrack,
    createRoom,
    leaveRoom,
    sendChatMessage,

    waitingForAdmit,
    admitRequests,
    isOwner,
    inviteLink,
    resolvedRoomId,
    resolveError,
    requestJoin,
    cancelWaiting,
    admitGuest,
    createInvite,
    resolveInvite,
  }
}
