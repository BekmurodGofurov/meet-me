import { WebSocketServer } from 'ws';
import crypto from 'crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:https';

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

wss.on('connection', (ws) => {
  const clientId = crypto.randomUUID();
  let currentRoomId = null; 
  
  console.log(`Client connected: ${clientId}`);

  ws.on('message', (message) => {
    try {
      const parsedData = JSON.parse(message);
      
      if (parsedData.type === 'create-room') {
        const roomId = crypto.randomUUID().slice(0, 6);
        
        const roomClients = new Map();
        roomClients.set(clientId, ws);
        rooms.set(roomId, roomClients);
        
        currentRoomId = roomId;

        console.log(`Room created: ${roomId} by client: ${clientId}`);

        ws.send(JSON.stringify({
          type: 'room-created',
          roomId: roomId,
          clientId: clientId
        }));
      } 
      else if (parsedData.type === 'join-room') {
        const roomId = parsedData.roomId;

        if (!rooms.has(roomId)) {
          ws.send(JSON.stringify({ type: 'error', message: 'Room does not exist' }));
          return;
        }

        const roomClients = rooms.get(roomId);

        if (roomClients.size >= 6) {
          ws.send(JSON.stringify({ type: 'error', message: 'Room is full' }));
          return;
        }
        
        const existingPeers = Array.from(roomClients.keys());
        
        roomClients.set(clientId, ws);
        currentRoomId = roomId;

        console.log(`Client ${clientId} joined room ${roomId}`);

        ws.send(JSON.stringify({
          type: 'existing-peers',
          peers: existingPeers,
          clientId: clientId 
        }));

        existingPeers.forEach(peerId => {
          const peerWs = roomClients.get(peerId);
          peerWs.send(JSON.stringify({
            type: 'peer-joined',
            clientId: clientId 
          }));
        });
      } 
      else if (['offer', 'answer', 'ice-candidate'].includes(parsedData.type)) {
        if (currentRoomId && rooms.has(currentRoomId)) {
          const roomClients = rooms.get(currentRoomId);
          if (roomClients.has(parsedData.targetId)) {
            const targetWs = roomClients.get(parsedData.targetId);
            
            // FIX: Server enforces the senderId
            targetWs.send(JSON.stringify({
              ...parsedData,
              senderId: clientId
            }));
          }
        }
      } 
      else if (parsedData.type === 'chat-message') {
        if (currentRoomId && rooms.has(currentRoomId)) {
          const roomClients = rooms.get(currentRoomId);
          roomClients.forEach((peerWs, peerId) => {
            if (peerId !== clientId) { 
              
              // FIX: Server enforces the from ID
              peerWs.send(JSON.stringify({
                ...parsedData,
                from: clientId
              }));
            }
          });
        }
      }
      
    } catch (err) {
      console.log("Ignored invalid JSON message.");
    }
  });

  ws.on('close', () => {
    console.log(`Client disconnected: ${clientId}`);

    if (currentRoomId && rooms.has(currentRoomId)) {
      const roomClients = rooms.get(currentRoomId);
      roomClients.delete(clientId);

      if (roomClients.size === 0) {
        rooms.delete(currentRoomId);
        console.log(`Room ${currentRoomId} deleted (empty)`);
      } else {
        roomClients.forEach((peerWs) => {
          peerWs.send(JSON.stringify({
            type: 'peer-left',
            clientId: clientId 
          }));
        });
      }
    }
  });
});