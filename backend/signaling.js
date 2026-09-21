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
export function createSignalingServer(server, { roomGraceMs = 10000 } = {}) {
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

  wss.on('connection', (ws) => {
    const clientId = crypto.randomUUID();
    let currentRoomId = null;

    console.log(`Client connected: ${clientId}`);

    const send = (payload) => ws.send(JSON.stringify(payload));

    // Shared by an explicit leave-room and a real disconnect: without this the
    // server would keep thinking this client is in the room until the socket
    // itself closes, which never happens for an explicit leave (the connection
    // stays open so the same client can create/join another room next).
    const leaveCurrentRoom = () => {
      if (currentRoomId && rooms.has(currentRoomId)) {
        const roomId = currentRoomId;
        const roomClients = rooms.get(roomId);
        roomClients.delete(clientId);

        if (roomClients.size === 0) {
          const timer = setTimeout(() => {
            rooms.delete(roomId);
            roomDeletionTimers.delete(roomId);
            console.log(`Room ${roomId} deleted (empty)`);
          }, roomGraceMs);
          roomDeletionTimers.set(roomId, timer);
        } else {
          roomClients.forEach((member) => {
            member.ws.send(JSON.stringify({ type: 'peer-left', clientId }));
          });
        }
      }
      currentRoomId = null;
    };

    ws.on('message', (message) => {
      try {
        const parsedData = JSON.parse(message);

        if (parsedData.type === 'create-room') {
          const roomId = crypto.randomUUID().slice(0, 6);
          const name = cleanName(parsedData.name);

          const roomClients = new Map();
          roomClients.set(clientId, { ws, name });
          rooms.set(roomId, roomClients);

          currentRoomId = roomId;

          console.log(`Room created: ${roomId} by ${name} (${clientId})`);

          send({ type: 'room-created', roomId, clientId, name });
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

          send({ type: 'existing-peers', roomId, clientId, name, peers: existingPeers });

          existingPeers.forEach((peer) => {
            roomClients.get(peer.clientId).ws.send(
              JSON.stringify({ type: 'peer-joined', clientId, name }),
            );
          });
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
      leaveCurrentRoom();
    });
  });

  return wss;
}
