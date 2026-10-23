import { WebSocketServer } from 'ws';
import crypto from 'crypto';

const MAX_ROOM_SIZE = 6;
const MAX_NAME_LENGTH = 24;

const cleanName = (value) => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.slice(0, MAX_NAME_LENGTH) || 'Guest';
};

const roster = (roomClients, excludeId) =>
  Array.from(roomClients.entries())
    .filter(([clientId]) => clientId !== excludeId)
    .map(([clientId, member]) => ({ clientId, name: member.name }));

// Attaches the signaling logic to an already-created http/https server and
// returns the WebSocketServer. Kept separate from server.js so tests can run
// this against a plain http server on an ephemeral port, with no dependency
// on the real TLS certificate or a fixed port.
export function createSignalingServer(server, { roomGraceMs = 30000, secretKey } = {}) {
  const wss = new WebSocketServer({ server });

  // Map<roomId, Map<clientId, { ws, name }>> - exposed on the returned wss
  // purely so tests can inspect room state directly instead of only through
  // client-visible messages.
  const rooms = new Map();
  wss.rooms = rooms;

  // A page reload closes the old WebSocket and opens a new one that re-sends
  // join-room almost immediately after - for someone alone in a room, that
  // races the old connection's own cleanup deleting the room, and the
  // deletion always won before this existed. Deferring deletion by a short
  // grace period lets a lone reconnecting client still find its own room.
  const roomDeletionTimers = new Map();

  // Map<token (UUID-v4), roomId> — permanent invite tokens (reusable).
  const inviteTokens = new Map();

  // Map<roomId, clientId> — tracks the current owner of each room.
  // Owner = first member; when they leave the next member in iteration order
  // is promoted automatically.
  const roomOwners = new Map();

  // Map<requestId, { ws, name, tempClientId, roomId }> — guests waiting to
  // be admitted by the room owner.
  const pendingRequests = new Map();

  // Helper: notify the current owner of a room, if there is one.
  const notifyOwner = (roomId, payload) => {
    const ownerId = roomOwners.get(roomId);
    if (!ownerId) return;
    const roomClients = rooms.get(roomId);
    if (!roomClients) return;
    const owner = roomClients.get(ownerId);
    if (owner) owner.ws.send(JSON.stringify(payload));
  };

  wss.on('connection', (ws, req) => {
    // If a secretKey is configured, ensure the client provided it via query param or header
    if (secretKey) {
      const parsedUrl = new URL(req?.url || '/', 'http://localhost');
      const providedKey =
        parsedUrl.searchParams.get('secretKey') ||
        parsedUrl.searchParams.get('secret') ||
        req?.headers?.['x-secret-key'];

      if (providedKey !== secretKey) {
        console.warn(`Connection rejected: invalid or missing secret key`);
        ws.send(
          JSON.stringify({ type: 'error', message: 'Unauthorized: Invalid secret key' }),
          () => {
            try {
              ws.close(4001, 'Unauthorized');
            } catch {
              // Ignore if already closed
            }
          },
        );
        return;
      }
    }

    const clientId = crypto.randomUUID();
    let currentRoomId = null;

    const syncAdmittedRoom = () => {
      if (ws.__admittedRoomId) {
        currentRoomId = ws.__admittedRoomId;
        delete ws.__admittedRoomId;
      }
    };

    console.log(`Client connected: ${clientId}`);

    const send = (payload) => ws.send(JSON.stringify(payload));

    // Shared by an explicit leave-room and a real disconnect: without this the
    // server would keep thinking this client is in the room until the socket
    // itself closes, which never happens for an explicit leave (the connection
    // stays open so the same client can create/join another room next).
    const leaveCurrentRoom = () => {
      syncAdmittedRoom();
      if (currentRoomId && rooms.has(currentRoomId)) {
        const roomId = currentRoomId;
        const roomClients = rooms.get(roomId);
        roomClients.delete(clientId);

        const isOwner = roomOwners.get(roomId) === clientId;

        if (roomClients.size === 0) {
          // Room is now empty — cancel any pending admit requests for it.
          for (const [requestId, req] of pendingRequests.entries()) {
            if (req.roomId === roomId) {
              req.ws.send(JSON.stringify({ type: 'join-rejected', reason: 'The host left the room' }));
              pendingRequests.delete(requestId);
            }
          }

          roomOwners.delete(roomId);

          // Delete invite tokens that pointed to this room.
          for (const [token, tRoomId] of inviteTokens.entries()) {
            if (tRoomId === roomId) inviteTokens.delete(token);
          }

          const timer = setTimeout(() => {
            rooms.delete(roomId);
            roomDeletionTimers.delete(roomId);
            console.log(`Room ${roomId} deleted (empty)`);
          }, roomGraceMs);
          timer.unref?.();
          roomDeletionTimers.set(roomId, timer);
        } else {
          // Notify remaining peers that this client left.
          roomClients.forEach((member) => {
            member.ws.send(JSON.stringify({ type: 'peer-left', clientId }));
          });

          if (isOwner) {
            // Cancel all pending join requests for this room, notifying guests.
            for (const [requestId, req] of pendingRequests.entries()) {
              if (req.roomId === roomId) {
                req.ws.send(JSON.stringify({ type: 'join-rejected', reason: 'The host left the room' }));
                pendingRequests.delete(requestId);
              }
            }

            // Promote the next member in iteration order to owner.
            const [nextClientId] = roomClients.keys();
            roomOwners.set(roomId, nextClientId);
            roomClients.forEach((member) => {
              member.ws.send(JSON.stringify({ type: 'owner-changed', newOwnerId: nextClientId }));
            });
            console.log(`Room ${roomId} owner changed to ${nextClientId}`);
          }
        }
      }
      currentRoomId = null;
    };

    ws.on('message', (message) => {
      syncAdmittedRoom();
      try {
        const parsedData = JSON.parse(message);

        if (parsedData.type === 'create-room') {
          const roomId = crypto.randomUUID().slice(0, 6);
          const name = cleanName(parsedData.name);

          const roomClients = new Map();
          roomClients.set(clientId, { ws, name });
          rooms.set(roomId, roomClients);
          currentRoomId = roomId;

          // Creator is the initial owner.
          roomOwners.set(roomId, clientId);

          console.log(`Room created: ${roomId} by ${name} (${clientId})`);

          send({ type: 'room-created', roomId, clientId, name, isOwner: true, ownerId: clientId });
        }

        else if (parsedData.type === 'join-room') {
          const roomId = parsedData.roomId;
          const name = cleanName(parsedData.name);

          if (!rooms.has(roomId)) {
            send({ type: 'error', message: 'Room does not exist' });
            return;
          }

          const roomClients = rooms.get(roomId);

          if (roomClients.size >= MAX_ROOM_SIZE) {
            send({ type: 'error', message: 'Room is full' });
            return;
          }

          // The room was mid-way through its grace-period deletion (everyone
          // had left) but someone just claimed it again - keep it alive.
          if (roomDeletionTimers.has(roomId)) {
            clearTimeout(roomDeletionTimers.get(roomId));
            roomDeletionTimers.delete(roomId);
          }

          const existingPeers = roster(roomClients, clientId);

          roomClients.set(clientId, { ws, name });
          currentRoomId = roomId;

          console.log(`${name} (${clientId}) joined room ${roomId}`);

          send({
            type: 'existing-peers',
            roomId,
            clientId,
            name,
            peers: existingPeers,
            ownerId: roomOwners.get(roomId),
          });

          existingPeers.forEach((peer) => {
            roomClients.get(peer.clientId).ws.send(
              JSON.stringify({ type: 'peer-joined', clientId, name }),
            );
          });
        }

        else if (parsedData.type === 'create-invite') {
          const roomId = parsedData.roomId;

          // Security check: client must actually be in that room.
          if (!currentRoomId || currentRoomId !== roomId) {
            send({ type: 'error', message: 'You are not in that room' });
            return;
          }

          const token = crypto.randomUUID(); // full UUID-v4, permanent
          inviteTokens.set(token, roomId);

          console.log(`Invite token created for room ${roomId}`);
          send({ type: 'invite-created', token, roomId });
        }

        else if (parsedData.type === 'resolve-invite') {
          const token = parsedData.token;
          const roomId = inviteTokens.get(token);

          if (!roomId) {
            send({ type: 'error', message: 'Invalid or expired invite link' });
            return;
          }

          send({ type: 'invite-resolved', roomId });
        }

        else if (parsedData.type === 'join-request') {
          const roomId = parsedData.roomId;
          const name = cleanName(parsedData.name);

          if (!rooms.has(roomId)) {
            send({ type: 'error', message: 'Room does not exist' });
            return;
          }

          const roomClients = rooms.get(roomId);

          if (roomClients.size >= MAX_ROOM_SIZE) {
            send({ type: 'error', message: 'Room is full' });
            return;
          }

          const requestId = crypto.randomUUID();
          const tempClientId = clientId; // reuse this connection's clientId as tempClientId

          pendingRequests.set(requestId, { ws, name, tempClientId, roomId });

          // Tell the guest they are waiting.
          send({ type: 'waiting', requestId });

          // Tell the owner about the pending request.
          notifyOwner(roomId, { type: 'admit-request', requestId, name, clientId: tempClientId });

          console.log(`Join request ${requestId} from ${name} for room ${roomId}`);
        }

        else if (parsedData.type === 'admit-response') {
          const { requestId, admitted } = parsedData;
          const pending = pendingRequests.get(requestId);

          if (!pending) {
            // Request no longer exists (guest disconnected, etc.) — ignore silently.
            return;
          }

          if (admitted) {
            // Check room still has space (edge case: someone else joined).
            const roomId = pending.roomId;
            const roomClients = rooms.get(roomId);

            if (!roomClients || roomClients.size >= MAX_ROOM_SIZE) {
              // Can't admit — room full or gone. Reject the guest.
              pending.ws.send(JSON.stringify({ type: 'join-rejected', reason: 'Room is no longer available' }));
              pendingRequests.delete(requestId);
              return;
            }

            // Admit the guest — follow exact same logic as join-room.
            const guestWs = pending.ws;
            const guestName = pending.name;
            const guestClientId = pending.tempClientId;

            // Cancel deletion timer if any.
            if (roomDeletionTimers.has(roomId)) {
              clearTimeout(roomDeletionTimers.get(roomId));
              roomDeletionTimers.delete(roomId);
            }

            const existingPeers = roster(roomClients, guestClientId);
            roomClients.set(guestClientId, { ws: guestWs, name: guestName });

            // We need to update the guest ws's currentRoomId — we do this by
            // sending a message and the guest's own connection handler will
            // pick it up. But we can't reach into the other connection's
            // closure. Instead, the guest's ws.on('message') won't run here.
            // The correct approach: the guest connection already has its own
            // clientId in scope; we just track that this guestWs now belongs
            // to roomId by updating via the pending entry. We'll attach the
            // roomId tracking on the guestWs object itself.
            guestWs.__admittedRoomId = roomId;

            console.log(`${guestName} (${guestClientId}) admitted to room ${roomId}`);

            // Send existing-peers to the guest.
            guestWs.send(JSON.stringify({
              type: 'existing-peers',
              roomId,
              clientId: guestClientId,
              name: guestName,
              peers: existingPeers,
              ownerId: roomOwners.get(roomId),
            }));

            // Notify existing peers that the guest joined.
            existingPeers.forEach((peer) => {
              roomClients.get(peer.clientId).ws.send(
                JSON.stringify({ type: 'peer-joined', clientId: guestClientId, name: guestName }),
              );
            });

            pendingRequests.delete(requestId);
          } else {
            // Rejected.
            pending.ws.send(JSON.stringify({ type: 'join-rejected', reason: 'The host declined your request' }));
            pendingRequests.delete(requestId);
          }
        }

        else if (parsedData.type === 'cancel-join-request') {
          const { requestId } = parsedData;
          const pending = pendingRequests.get(requestId);

          if (!pending) return;

          const roomId = pending.roomId;
          pendingRequests.delete(requestId);

          // Notify the owner that the request was cancelled.
          notifyOwner(roomId, { type: 'admit-request-cancelled', requestId });
        }

        else if (['offer', 'answer', 'ice-candidate'].includes(parsedData.type)) {
          if (currentRoomId && rooms.has(currentRoomId)) {
            const roomClients = rooms.get(currentRoomId);
            const target = roomClients.get(parsedData.targetId);

            if (target) {
              // The server knows who is on this connection, so it stamps the
              // sender itself rather than trusting the client's own claim.
              target.ws.send(JSON.stringify({ ...parsedData, senderId: clientId }));
            }
          }
        }

        else if (parsedData.type === 'media-state') {
          if (currentRoomId && rooms.has(currentRoomId)) {
            const roomClients = rooms.get(currentRoomId);

            roomClients.forEach((member, peerId) => {
              if (peerId !== clientId) {
                member.ws.send(
                  JSON.stringify({
                    type: 'media-state',
                    from: clientId,
                    cameraOn: Boolean(parsedData.cameraOn),
                    micOn: Boolean(parsedData.micOn),
                    screenSharing: Boolean(parsedData.screenSharing),
                  }),
                );
              }
            });
          }
        }

        else if (parsedData.type === 'leave-room') {
          leaveCurrentRoom();
        }

        else if (parsedData.type === 'chat-message') {
          if (currentRoomId && rooms.has(currentRoomId)) {
            const roomClients = rooms.get(currentRoomId);
            const sender = roomClients.get(clientId);

            roomClients.forEach((member, peerId) => {
              if (peerId !== clientId) {
                member.ws.send(
                  JSON.stringify({
                    ...parsedData,
                    from: clientId,
                    fromName: sender?.name ?? 'Guest',
                  }),
                );
              }
            });
          }
        }

      } catch (err) {
        // Malformed input from one client must not take the process down.
      }
    });

    ws.on('close', () => {
      console.log(`Client disconnected: ${clientId}`);

      // If this ws belongs to a guest waiting in a pending request, cancel it.
      for (const [requestId, req] of pendingRequests.entries()) {
        if (req.ws === ws) {
          const roomId = req.roomId;
          pendingRequests.delete(requestId);
          notifyOwner(roomId, { type: 'admit-request-cancelled', requestId });
          break;
        }
      }

      leaveCurrentRoom();
    });
  });

  return wss;
}
