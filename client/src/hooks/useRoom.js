import { useCallback, useEffect, useRef, useState } from 'react'
import { clearSession, loadName, loadSession, saveSession } from '../session'

const ICE_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }

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
  const myIdRef = useRef(null)
  const mediaStateRef = useRef({ cameraOn: false, micOn: false })
  // Read once, before the connect effect runs, so it's available the instant
  // the socket opens rather than racing a state update.
  const storedSessionRef = useRef(loadSession())

  const [connectionStatus, setConnectionStatus] = useState('connecting')
  const [currentRoom, setCurrentRoom] = useState(null)
  const [me, setMe] = useState(null)
  const [participants, setParticipants] = useState([])
  const [remoteStreams, setRemoteStreams] = useState({})
  const [remoteMedia, setRemoteMedia] = useState({})
  const [roomError, setRoomError] = useState('')
  const [rejoining, setRejoining] = useState(() => Boolean(storedSessionRef.current))
  // Falls back to the standalone remembered name (survives leaving a room)
  // when there's no active session to rejoin.
  const [rememberedName, setRememberedName] = useState(
    () => storedSessionRef.current?.name ?? loadName(),
  )

  const send = useCallback((message) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message))
    }
  }, [])

  const announceMediaState = useCallback(() => {
    send({ type: 'media-state', ...mediaStateRef.current })
  }, [send])

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const socket = new WebSocket(`${protocol}://${window.location.hostname}:8080`)
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
        senders: { video: null, audio: null },
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

      pc.ontrack = ({ track }) => {
        let stream = remoteStreamsRef.current.get(peerId)
        if (!stream) {
          stream = new MediaStream()
          remoteStreamsRef.current.set(peerId, stream)
        }
        if (!stream.getTracks().some((existingTrack) => existingTrack.id === track.id)) {
          stream.addTrack(track)
        }
        setRemoteStreams((prev) => ({ ...prev, [peerId]: stream }))
      }

      const { video, audio } = tracksRef.current

      // Send what exists now; ask to receive the kinds we can't send yet, so
      // there is always something to negotiate and the m-lines exist for a
      // track switched on later.
      if (video) peer.senders.video = pc.addTrack(video)
      else pc.addTransceiver('video', { direction: 'recvonly' })

      if (audio) peer.senders.audio = pc.addTrack(audio)
      else pc.addTransceiver('audio', { direction: 'recvonly' })

      peersRef.current.set(peerId, peer)
      return peer
    }

    const closePeer = (peerId) => {
      peersRef.current.get(peerId)?.pc.close()
      peersRef.current.delete(peerId)
      remoteStreamsRef.current.delete(peerId)

      setRemoteStreams((prev) => {
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

      if (description.type === 'offer') {
        await pc.setLocalDescription()
        post({ type: 'answer', targetId: peerId, payload: pc.localDescription })
      }
    }

    socket.onopen = () => {
      setConnectionStatus('connected')

      const stored = storedSessionRef.current
      if (stored) {
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
            setRememberedName(data.name)
            saveSession(data.roomId, data.name)
            break

          case 'existing-peers': {
            myIdRef.current = data.clientId
            setMe({ clientId: data.clientId, name: data.name })
            setParticipants(data.peers)
            setCurrentRoom(data.roomId)
            setRejoining(false)
            setRememberedName(data.name)
            saveSession(data.roomId, data.name)

            // Creating the connection is enough - onnegotiationneeded fires and
            // sends the offer.
            data.peers.forEach((peer) => getPeer(peer.clientId))
            post({ type: 'media-state', ...mediaStateRef.current })
            break
          }

          case 'peer-joined':
            setParticipants((prev) => [...prev, { clientId: data.clientId, name: data.name }])
            // Tell the newcomer whether our camera/mic are already on, since
            // they missed the announcement we made when we arrived.
            post({ type: 'media-state', ...mediaStateRef.current })
            break

          case 'peer-left':
            setParticipants((prev) => prev.filter((p) => p.clientId !== data.clientId))
            closePeer(data.clientId)
            break

          case 'offer':
          case 'answer':
            await handleDescription(data.senderId, data.payload)
            break

          case 'ice-candidate': {
            const peer = peersRef.current.get(data.senderId)
            if (!peer) break
            try {
              await peer.pc.addIceCandidate(data.payload)
            } catch (err) {
              // A candidate for an offer we deliberately ignored is expected.
              if (!peer.ignoreOffer) console.error('Failed to add ICE candidate', err)
            }
            break
          }

          case 'media-state':
            setRemoteMedia((prev) => ({
              ...prev,
              [data.from]: { cameraOn: data.cameraOn, micOn: data.micOn },
            }))
            break

          case 'error':
            // The stored room may no longer exist (server restarted, or
            // everyone else already left and it was cleaned up) - fall back
            // to the normal lobby instead of retrying forever.
            if (storedSessionRef.current) {
              clearSession()
              storedSessionRef.current = null
              setRejoining(false)
            }
            setRoomError(data.message)
            break

          default:
            break
        }
      } catch (err) {
        console.error(`Failed handling ${data.type}`, err)
      }
    }

    return () => {
      peersRef.current.forEach((peer) => peer.pc.close())
      peersRef.current.clear()
      remoteStreamsRef.current.clear()

      // Detach first: a discarded socket must not write state belonging to the
      // socket that replaced it.
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
      else mediaStateRef.current.micOn = Boolean(track)

      peersRef.current.forEach((peer) => {
        const { pc, senders } = peer

        if (!track) {
          senders[kind]?.replaceTrack(null)
          return
        }

        if (senders[kind]) {
          senders[kind].replaceTrack(track)
          return
        }

        // Reuse the receive-only m-line created for this kind if there is one,
        // rather than growing the session description on every toggle. Either
        // path triggers onnegotiationneeded, which republishes the session.
        const reusable = pc
          .getTransceivers()
          .find((t) => t.receiver.track?.kind === kind && !t.sender.track)

        if (reusable) {
          reusable.direction = 'sendrecv'
          reusable.sender.replaceTrack(track)
          senders[kind] = reusable.sender
        } else {
          senders[kind] = pc.addTrack(track)
        }
      })

      announceMediaState()
    },
    [announceMediaState],
  )

  const createRoom = useCallback(
    (name) => {
      setRoomError('')
      send({ type: 'create-room', name })
    },
    [send],
  )

  const joinRoom = useCallback(
    (roomId, name) => {
      setRoomError('')
      send({ type: 'join-room', roomId, name })
    },
    [send],
  )

  const leaveRoom = useCallback(() => {
    clearSession()
    storedSessionRef.current = null

    peersRef.current.forEach((peer) => peer.pc.close())
    peersRef.current.clear()
    remoteStreamsRef.current.clear()

    // Tell the server explicitly - the socket itself stays open so this
    // connection can create/join another room next, which means the server
    // has no other way to learn this room was left.
    send({ type: 'leave-room' })

    setCurrentRoom(null)
    setMe(null)
    setParticipants([])
    setRemoteStreams({})
    setRemoteMedia({})
    setRoomError('')
  }, [send])

  return {
    connectionStatus,
    currentRoom,
    me,
    participants,
    remoteStreams,
    remoteMedia,
    roomError,
    rejoining,
    rememberedName,
    publishTrack,
    createRoom,
    joinRoom,
    leaveRoom,
  }
}
