import { WebSocketServer } from 'ws';
import crypto from 'crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:https';

const MAX_ROOM_SIZE = 6;
const MAX_NAME_LENGTH = 24;

// Map<roomId, Map<clientId, { ws, name }>>
const rooms = new Map();

// Same mkcert certificate the client dev server uses, so the browser trusts
// both. Needed because a page loaded over https can't open a plain ws://
// connection (browsers block it as mixed content) - it must be wss://.
const httpsServer = createServer(
  {
    key: readFileSync(new URL('../client/certs/192.168.1.3+1-key.pem', import.meta.url)),
    cert: readFileSync(new URL('../client/certs/192.168.1.3+1.pem', import.meta.url)),
  },
  // Plain page response so visiting this address in a browser shows something.
  // Without it a browser request hangs forever, which makes it impossible to
  // tell a certificate problem apart from "no handler".
  (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Signaling server OK');
  },
);

const wss = new WebSocketServer({ server: httpsServer });

httpsServer.listen(8080, () => {
  console.log('Server is running on wss://localhost:8080');
});

const cleanName = (value) => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.slice(0, MAX_NAME_LENGTH) || 'Guest';
};

const roster = (roomClients, excludeId) =>
  Array.from(roomClients.entries())
    .filter(([clientId]) => clientId !== excludeId)
    .map(([clientId, member]) => ({ clientId, name: member.name }));

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
      const roomClients = rooms.get(currentRoomId);
      roomClients.delete(clientId);

      if (roomClients.size === 0) {
        rooms.delete(currentRoomId);
        console.log(`Room ${currentRoomId} deleted (empty)`);
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
      console.log('Ignored invalid JSON message.');
    }
  });

  ws.on('close', () => {
    console.log(`Client disconnected: ${clientId}`);
    leaveCurrentRoom();
  });
});
