import { useCallback, useEffect, useRef, useState } from 'react'
import { clearSession, loadName, loadSession, saveName, saveSession } from '../session'

export const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:openrelay.metered.ca:80' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
}

export function getWebSocketUrl() {
  let envWsUrl = import.meta.env.VITE_WS_URL
  const secretKey = import.meta.env.VITE_SECRET_KEY

  let targetUrl
  if (envWsUrl) {
    if (envWsUrl.startsWith('http://')) {
      envWsUrl = 'ws://' + envWsUrl.slice(7)
    } else if (envWsUrl.startsWith('https://')) {
      envWsUrl = 'wss://' + envWsUrl.slice(8)
    }

    if (envWsUrl.startsWith('ws://') || envWsUrl.startsWith('wss://')) {
      targetUrl = new URL(envWsUrl)
    } else {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const path = envWsUrl.startsWith('/') ? envWsUrl : `/${envWsUrl}`
      targetUrl = new URL(`${protocol}//${window.location.host}${path}`)
    }
  } else {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    targetUrl = new URL(`${protocol}//${window.location.host}/ws`)
  }

  if (secretKey) {
    targetUrl.searchParams.set('secretKey', secretKey)
  }

  return targetUrl.toString()
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
  const remoteStreamsRef = useRef(new Map())
  const remoteScreenStreamsRef = useRef(new Map())
  const pendingCandidatesRef = useRef(new Map())
  const myIdRef = useRef(null)
  const mediaStateRef = useRef({ cameraOn: false, micOn: false, screenSharing: false })
  // peer-left only carries a clientId, not a name - by the time it arrives
  // the name has to already be known somewhere that isn't a stale closure
  // over participants state, so it's kept here instead.
  const participantNamesRef = useRef(new Map())
  // Read once on mount, before the connect effect runs, so it's available the instant
  // the socket opens rather than racing a state update.
  const [initialSession] = useState(() => {
    const session = loadSession()
    if (session?.name && !loadName()) {
      saveName(session.name)
    }
    return session
  })
  const storedSessionRef = useRef(initialSession)
  const isRejoiningRef = useRef(Boolean(initialSession))

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
  const [rejoining, setRejoining] = useState(Boolean(initialSession))
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

  const send = useCallback((message) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message))
    }
  }, [])

  const announceMediaState = useCallback(() => {
    send({ type: 'media-state', ...mediaStateRef.current })
  }, [send])

  useEffect(() => {
    // Same-origin, path-based - not a hardcoded port. In production this
    // lets a single nginx/domain proxy /ws to the backend container on
    // whatever internal port it actually runs on, no separate public port
    // needed. In dev, Vite's own server.proxy (see vite.config.js) forwards
    // this to the local backend the same way.
    const wsUrl = getWebSocketUrl()
    const socket = new WebSocket(wsUrl)
    wsRef.current = socket

    const post = (message) => socket.send(JSON.stringify(message))

    const getPeer = (peerId) => {
      const existing = peersRef.current.get(peerId)
      if (existing) return existing

      const pc = new RTCPeerConnection(ICE_CONFIG)
      const peer = {
        pc,
        // Deterministic and symmetric: exactly one side of any pair is polite,
        // and both sides agree on which without extra signaling.
        polite: (myIdRef.current ?? '') > peerId,
        makingOffer: false,
        ignoreOffer: false,
        settingRemoteAnswer: false,
        senders: { video: null, audio: null, screen: null },
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

      pc.ontrack = (event) => {
        const { track } = event
        const transceiver = event.transceiver
        const remoteInfo = remoteMediaRef.current?.[peerId]

        const isScreen =
          Boolean(track.id && remoteInfo?.screenTrackId && track.id === remoteInfo.screenTrackId) ||
          (transceiver && transceiver._isScreen === true) ||
          Boolean(remoteInfo?.screenSharing && !remoteInfo?.cameraOn) ||
          (track.kind === 'video' &&
            remoteStreamsRef.current.get(peerId)?.getVideoTracks()?.length > 0)

        if (isScreen) {
          let screenStream = remoteScreenStreamsRef.current.get(peerId)
          if (!screenStream) {
            screenStream = new MediaStream()
          }
          if (!screenStream.getTracks().some((t) => t.id === track.id)) {
            screenStream.addTrack(track)
          }
          const updated = new MediaStream(screenStream.getTracks())
          remoteScreenStreamsRef.current.set(peerId, updated)
          setRemoteScreenStreams((prev) => ({ ...prev, [peerId]: updated }))
        } else {
          let stream = remoteStreamsRef.current.get(peerId)
          if (!stream) {
            stream = new MediaStream()
          }
          if (!stream.getTracks().some((existingTrack) => existingTrack.id === track.id)) {
            stream.addTrack(track)
          }
          const updatedStream = new MediaStream(stream.getTracks())
          remoteStreamsRef.current.set(peerId, updatedStream)
          setRemoteStreams((prev) => ({ ...prev, [peerId]: updatedStream }))
        }
      }

      const { video, audio, screen } = tracksRef.current

      // Send what exists now; ask to receive the kinds we can't send yet, so
      // there is always something to negotiate and the m-lines exist for a
      // track switched on later. Order is deterministic: [camera, audio, screen].
      // Each transceiver is tagged with _isScreen so ontrack can reliably
      // distinguish camera from screen regardless of which tracks are active.
      if (video) {
        const sender = pc.addTrack(video)
        peer.senders.video = sender
        const t = pc.getTransceivers().find((tr) => tr.sender === sender)
        if (t) t._isScreen = false
      } else {
        const t = pc.addTransceiver('video', { direction: 'recvonly' })
        t._isScreen = false
      }

      if (audio) peer.senders.audio = pc.addTrack(audio)
      else pc.addTransceiver('audio', { direction: 'recvonly' })

      if (screen) {
        const sender = pc.addTrack(screen)
        peer.senders.screen = sender
        const t = pc.getTransceivers().find((tr) => tr.sender === sender)
        if (t) t._isScreen = true
      } else {
        const t = pc.addTransceiver('video', { direction: 'recvonly' })
        t._isScreen = true
      }

      peersRef.current.set(peerId, peer)
      return peer
    }

    const closePeer = (peerId) => {
      peersRef.current.get(peerId)?.pc.close()
      peersRef.current.delete(peerId)
      remoteStreamsRef.current.delete(peerId)
      remoteScreenStreamsRef.current.delete(peerId)
      pendingCandidatesRef.current.delete(peerId)
      delete remoteMediaRef.current[peerId]

      setRemoteStreams((prev) => {
        const next = { ...prev }
        delete next[peerId]
        return next
      })
      setRemoteScreenStreams((prev) => {
        const next = { ...prev }
        delete next[peerId]
        return next
      })
      setRemoteMedia((prev) => {
        const next = { ...prev }
        delete next[peerId]
        return next
      })
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
    }

    socket.onopen = () => {
      setConnectionStatus('connected')

      const stored = storedSessionRef.current || loadSession()
      if (stored) {
        storedSessionRef.current = stored
        isRejoiningRef.current = true
        post({ type: 'join-room', roomId: stored.roomId, name: stored.name })
      }
    }
    socket.onerror = () => setConnectionStatus('error')
    socket.onclose = () => setConnectionStatus('closed')

    socket.onmessage = async (event) => {
      const data = JSON.parse(event.data)

      try {
        switch (data.type) {
          case 'room-created':
            myIdRef.current = data.clientId
            setMe({ clientId: data.clientId, name: data.name })
            setCurrentRoom(data.roomId)
            setParticipants([])
            setRejoining(false)
            isRejoiningRef.current = false
            setRememberedName(data.name)
            setMessages([])
            setIsOwner(true)
            setWaitingForAdmit(false)
            saveSession(data.roomId, data.name)
            storedSessionRef.current = { roomId: data.roomId, name: data.name }
            break

          case 'existing-peers': {
            myIdRef.current = data.clientId
            setMe({ clientId: data.clientId, name: data.name })
            setParticipants(data.peers)
            setCurrentRoom(data.roomId)
            setRejoining(false)
            isRejoiningRef.current = false
            setRememberedName(data.name)
            setMessages([])
            setWaitingForAdmit(false)
            waitingRequestIdRef.current = null
            setIsOwner(Boolean(data.ownerId && data.ownerId === data.clientId))
            saveSession(data.roomId, data.name)
            storedSessionRef.current = { roomId: data.roomId, name: data.name }

            // Creating the connection is enough - onnegotiationneeded fires and
            // sends the offer.
            data.peers.forEach((peer) => {
              getPeer(peer.clientId)
              participantNamesRef.current.set(peer.clientId, peer.name)
            })
            post({ type: 'media-state', ...mediaStateRef.current })
            break
          }

          case 'peer-joined':
            participantNamesRef.current.set(data.clientId, data.name)
            setParticipants((prev) => [...prev, { clientId: data.clientId, name: data.name }])
            setMessages((prev) => [
              ...prev,
              { id: crypto.randomUUID(), kind: 'system', tone: 'join', text: `${data.name} joined the room` },
            ])
            // Tell the newcomer whether our camera/mic are already on, since
            // they missed the announcement we made when we arrived.
            post({ type: 'media-state', ...mediaStateRef.current })
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

          case 'invite-created': {
            const origin = window.location.origin
            setInviteLink(`${origin}/join/${data.token}`)
            break
          }

          case 'invite-resolved':
            setResolvedRoomId(data.roomId)
            setResolveError(null)
            break

          case 'offer':
          case 'answer':
            await handleDescription(data.senderId, data.payload)
            break

          case 'ice-candidate': {
            if (!data.payload) break
            const peer = peersRef.current.get(data.senderId)
            if (!peer || !peer.pc.remoteDescription) {
              const queue = pendingCandidatesRef.current.get(data.senderId) ?? []
              queue.push(data.payload)
              pendingCandidatesRef.current.set(data.senderId, queue)
              break
            }
            try {
              await peer.pc.addIceCandidate(data.payload)
            } catch (err) {
              // A candidate for an offer we deliberately ignored is expected.
              if (!peer.ignoreOffer) console.error('Failed to add ICE candidate', err)
            }
            break
          }

          case 'media-state': {
            const nextMedia = {
              cameraOn: data.cameraOn,
              micOn: data.micOn,
              ...(data.screenSharing !== undefined && { screenSharing: Boolean(data.screenSharing) }),
              ...(data.screenTrackId !== undefined && { screenTrackId: data.screenTrackId }),
            }
            remoteMediaRef.current[data.from] = nextMedia
            setRemoteMedia((prev) => ({
              ...prev,
              [data.from]: nextMedia,
            }))

            if (data.screenSharing && data.screenTrackId) {
              const cameraStream = remoteStreamsRef.current.get(data.from)
              const screenTrack = cameraStream?.getVideoTracks()?.find((t) => t.id === data.screenTrackId)
              if (screenTrack) {
                if (typeof cameraStream.removeTrack === 'function') {
                  cameraStream.removeTrack(screenTrack)
                }
                const remainingTracks = cameraStream.getTracks().filter((t) => t.id !== screenTrack.id)
                const updatedCamera = new MediaStream(remainingTracks)
                remoteStreamsRef.current.set(data.from, updatedCamera)
                setRemoteStreams((prev) => ({ ...prev, [data.from]: updatedCamera }))

                let screenStream = remoteScreenStreamsRef.current.get(data.from)
                if (!screenStream) screenStream = new MediaStream()
                if (!screenStream.getTracks().some((t) => t.id === screenTrack.id)) {
                  screenStream.addTrack(screenTrack)
                }
                const updatedScreen = new MediaStream(screenStream.getTracks())
                remoteScreenStreamsRef.current.set(data.from, updatedScreen)
                setRemoteScreenStreams((prev) => ({ ...prev, [data.from]: updatedScreen }))
              }
            } else if (!data.screenSharing) {
              remoteScreenStreamsRef.current.delete(data.from)
              setRemoteScreenStreams((prev) => {
                const next = { ...prev }
                delete next[data.from]
                return next
              })
            }
            break
          }

          case 'chat-message':
            setMessages((prev) => [
              ...prev,
              { id: crypto.randomUUID(), kind: 'chat', from: data.from, fromName: data.fromName, text: data.text },
            ])
            break

          case 'error': {
            const wasRejoining = isRejoiningRef.current
            if (storedSessionRef.current || wasRejoining) {
              clearSession()
              storedSessionRef.current = null
              setRejoining(false)
              isRejoiningRef.current = false
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
      } catch (err) {
        console.error(`Failed handling ${data.type}`, err)
      }
    }

    const peers = peersRef.current
    const remoteStreams = remoteStreamsRef.current
    const remoteScreenStreams = remoteScreenStreamsRef.current
    const pendingCandidates = pendingCandidatesRef.current

    return () => {
      peers.forEach((peer) => peer.pc.close())
      peers.clear()
      remoteStreams.clear()
      remoteScreenStreams.clear()
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
  }, [tracksRef])

  const publishTrack = useCallback(
    (kind, track) => {
      if (kind === 'video') mediaStateRef.current.cameraOn = Boolean(track)
      else if (kind === 'audio') mediaStateRef.current.micOn = Boolean(track)
      else if (kind === 'screen') {
        mediaStateRef.current.screenSharing = Boolean(track)
        mediaStateRef.current.screenTrackId = track ? track.id : null
      }

      peersRef.current.forEach((peer) => {
        const { pc, senders } = peer

        if (!track) {
          if (senders[kind]) {
            senders[kind].replaceTrack(null)
            const transceiver = pc.getTransceivers().find((t) => t.sender === senders[kind])
            if (transceiver && transceiver.direction !== 'recvonly') {
              transceiver.direction = 'recvonly'
            }
          }
          return
        }

        if (senders[kind]) {
          senders[kind].replaceTrack(track)
          const transceiver = pc.getTransceivers().find((t) => t.sender === senders[kind])
          if (transceiver && transceiver.direction !== 'sendrecv') {
            transceiver.direction = 'sendrecv'
          }
          return
        }

        const transceivers = pc.getTransceivers ? pc.getTransceivers() : []
        const videoTransceivers = transceivers.filter(
          (t) => t.receiver?.track?.kind === 'video' || t.sender?.track?.kind === 'video',
        )

        let reusable = null
        if (kind === 'video') {
          reusable =
            transceivers.find(
              (t) =>
                t._isScreen === false &&
                (t.receiver?.track?.kind === 'video' || t.sender?.track?.kind === 'video'),
            ) || videoTransceivers[0]
        } else if (kind === 'screen') {
          reusable =
            transceivers.find(
              (t) =>
                t._isScreen === true &&
                (t.receiver?.track?.kind === 'video' || t.sender?.track?.kind === 'video'),
            ) || videoTransceivers[1]
        } else if (kind === 'audio') {
          reusable = transceivers.find(
            (t) => t.receiver?.track?.kind === 'audio' || t.sender?.track?.kind === 'audio',
          )
        }

        if (reusable) {
          reusable.direction = 'sendrecv'
          if (reusable.sender) {
            reusable.sender.replaceTrack(track)
            senders[kind] = reusable.sender
          } else {
            senders[kind] = pc.addTrack(track)
          }
        } else {
          const sender = pc.addTrack(track)
          senders[kind] = sender
          if (kind === 'video' || kind === 'screen') {
            const newT = pc.getTransceivers().find((t) => t.sender === sender)
            if (newT) newT._isScreen = kind === 'screen'
          }
        }
      })

      announceMediaState()
    },
    [announceMediaState],
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

  const joinRoom = useCallback(
    (roomId, name) => {
      isRejoiningRef.current = false
      setRoomError('')
      setRememberedName(name)
      saveName(name)
      send({ type: 'join-room', roomId, name })
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

    peersRef.current.forEach((peer) => peer.pc.close())
    peersRef.current.clear()
    remoteStreamsRef.current.clear()
    remoteScreenStreamsRef.current.clear()
    participantNamesRef.current.clear()
    pendingCandidatesRef.current.clear()

    send({ type: 'leave-room' })

    setCurrentRoom(null)
    setMe(null)
    setParticipants([])
    setRemoteStreams({})
    setRemoteScreenStreams({})
    setRemoteMedia({})
    remoteMediaRef.current = {}
    setRoomError('')
    setMessages([])
    setWaitingForAdmit(false)
    waitingRequestIdRef.current = null
    setAdmitRequests([])
    setIsOwner(false)
    setInviteLink(null)
  }, [send])

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
    joinRoom,
    leaveRoom,
    sendChatMessage,

    // New features:
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
