import { WebSocketServer } from 'ws';
import crypto from 'crypto';

const MAX_ROOM_SIZE = 6;
const MAX_NAME_LENGTH = 24;
const MAX_CHAT_LENGTH = 500;
// How many recent chat messages a room remembers for people who reload or
// reconnect. Memory only - it goes away with the room.
const MAX_CHAT_HISTORY = 200;
const MAX_STREAM_ID_LENGTH = 64;

// SDP for 3 m-lines is a few KB; 64 KB leaves plenty of headroom while
// stopping a client from pushing the ws default of 100 MB through the server.
const MAX_PAYLOAD_BYTES = 64 * 1024;

// 6 characters from a 36-character alphabet is ~2.2 billion codes (the old
// hex code was ~16.7 million). Combined with the failed-attempt limit below,
// guessing a live room code is no longer practical.
const ROOM_CODE_LENGTH = 6;
const ROOM_CODE_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

const HEARTBEAT_INTERVAL_MS = 30000;

// Token bucket per connection: bursts (like the ICE candidates of a fresh
// mesh) are fine, a sustained flood is dropped.
const MESSAGE_BURST = 200;
const MESSAGES_PER_SECOND = 50;

// Per-IP limit on lookups that fail (unknown room code / invite token) so
// codes can't be brute-forced.
const MAX_FAILED_LOOKUPS = 20;
const FAILED_LOOKUP_WINDOW_MS = 60000;

const cleanName = (value) => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.slice(0, MAX_NAME_LENGTH) || 'Guest';
};

const cleanStreamId = (value) =>
  typeof value === 'string' && value.length <= MAX_STREAM_ID_LENGTH ? value : null;

const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

const roster = (roomClients, excludeId) =>
  Array.from(roomClients.entries())
    .filter(([clientId]) => clientId !== excludeId)
    .map(([clientId, member]) => ({ clientId, name: member.name }));

const generateRoomCode = (rooms) => {
  let code;
  do {
    code = Array.from(
      { length: ROOM_CODE_LENGTH },
      () => ROOM_CODE_ALPHABET[crypto.randomInt(ROOM_CODE_ALPHABET.length)],
    ).join('');
  } while (rooms.has(code));
  return code;
};

// Default ICE servers: one public STUN server. TURN, when configured, is
// added per client with short-lived credentials (see turnCredentials).
const DEFAULT_STUN_URLS = ['stun:stun.l.google.com:19302'];

// coturn "use-auth-secret" (TURN REST API) credentials: the username carries
// its own expiry, the password is an HMAC of it with a secret shared only by
// this server and coturn. Nothing long-lived ever reaches the browser.
const turnCredentials = (secret, ttlSeconds, clientId) => {
  const username = `${Math.floor(Date.now() / 1000) + ttlSeconds}:${clientId}`;
  const credential = crypto.createHmac('sha1', secret).update(username).digest('base64');
  return { username, credential };
};

// Attaches the signaling logic to an already-created http/https server and
// returns the WebSocketServer. Kept separate from server.js so tests can run
// this against a plain http server on an ephemeral port, with no dependency
// on the real TLS certificate or a fixed port.
export function createSignalingServer(
  server,
  {
    roomGraceMs = 30000,
    allowedOrigins = [],
    trustProxy = false,
    stunUrls = DEFAULT_STUN_URLS,
    turn = null, // { urls: string[], secret: string, ttlSeconds?: number }
    heartbeatIntervalMs = HEARTBEAT_INTERVAL_MS,
  } = {},
) {
  const wss = new WebSocketServer({
    server,
    maxPayload: MAX_PAYLOAD_BYTES,
    // Browsers always send Origin, so this stops other websites from opening
    // a socket to this server from their visitors' browsers. Empty list =
    // allow all (local dev and tests).
    verifyClient: ({ origin }) => allowedOrigins.length === 0 || allowedOrigins.includes(origin),
  });

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

  // Map<token, roomId> - one reusable invite token per room, removed when
  // the room itself is deleted.
  const inviteTokens = new Map();

  // Map<roomId, clientId> - the current owner of each room. Owner = creator;
  // when they leave the next member is promoted. A room left empty has no
  // owner until someone rejoins it with a rejoin token.
  const roomOwners = new Map();

  // Map<requestId, { conn, name, roomId }> - guests waiting to be admitted.
  const pendingRequests = new Map();

  // Map<token, { roomId, memberId }> - proof that a connection was already
  // admitted to a room. Handed out with room-created / existing-peers and
  // stored by the client, so a page reload can rejoin directly. Without one,
  // the only way into a room is join-request -> admit by the owner. memberId
  // stays the same across rejoins (clientId changes on every connection), so
  // a returning person can be shown which old messages were theirs.
  const rejoinTokens = new Map();

  // Map<roomId, Array<{ memberId, from, fromName, text }>> - the last
  // MAX_CHAT_HISTORY chat messages of each room.
  const roomHistory = new Map();

  // Map<ip, { count, resetAt }>
  const failedLookups = new Map();

  // Map<clientId, leaveCurrentRoom> - lets the admit flow (running on the
  // owner's connection) make a guest leave whatever room it might still be
  // in, using the guest's own closure.
  const leaveFns = new Map();

  const safeSend = (ws, payload) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
  };

  const iceServersFor = (clientId) => {
    const servers = stunUrls.length > 0 ? [{ urls: stunUrls }] : [];
    if (turn?.secret && turn.urls?.length) {
      servers.push({ urls: turn.urls, ...turnCredentials(turn.secret, turn.ttlSeconds ?? 3600, clientId) });
    }
    return servers;
  };

  const notifyOwner = (roomId, payload) => {
    const ownerId = roomOwners.get(roomId);
    const owner = ownerId && rooms.get(roomId)?.get(ownerId);
    if (owner) safeSend(owner.ws, payload);
  };

  const rejectPendingForRoom = (roomId, reason) => {
    for (const [requestId, pending] of pendingRequests.entries()) {
      if (pending.roomId === roomId) {
        safeSend(pending.conn.ws, { type: 'join-rejected', reason });
        pending.conn.pendingRequestId = null;
        pendingRequests.delete(requestId);
      }
    }
  };

  const deleteRoom = (roomId) => {
    rooms.delete(roomId);
    roomOwners.delete(roomId);
    roomHistory.delete(roomId);
    roomDeletionTimers.delete(roomId);
    for (const [token, tokenRoomId] of inviteTokens.entries()) {
      if (tokenRoomId === roomId) inviteTokens.delete(token);
    }
    for (const [token, grant] of rejoinTokens.entries()) {
      if (grant.roomId === roomId) rejoinTokens.delete(token);
    }
    console.log(`Room ${roomId} deleted (empty)`);
  };

  const cancelRoomDeletion = (roomId) => {
    if (roomDeletionTimers.has(roomId)) {
      clearTimeout(roomDeletionTimers.get(roomId));
      roomDeletionTimers.delete(roomId);
    }
  };

  const tooManyFailedLookups = (ip) => {
    const entry = failedLookups.get(ip);
    return Boolean(entry && entry.resetAt > Date.now() && entry.count >= MAX_FAILED_LOOKUPS);
  };

  const recordFailedLookup = (ip) => {
    const now = Date.now();
    const entry = failedLookups.get(ip);
    if (!entry || entry.resetAt <= now) {
      failedLookups.set(ip, { count: 1, resetAt: now + FAILED_LOOKUP_WINDOW_MS });
    } else {
      entry.count += 1;
    }
  };

  // Ping every client; one that didn't answer the previous ping is a dead
  // connection (closed laptop, lost mobile network) and is terminated, which
  // runs the normal close cleanup instead of leaving a ghost in the room.
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        ws.terminate();
        return;
      }
      ws.isAlive = false;
      ws.ping();
    });

    const now = Date.now();
    for (const [ip, entry] of failedLookups.entries()) {
      if (entry.resetAt <= now) failedLookups.delete(ip);
    }
  }, heartbeatIntervalMs);
  heartbeat.unref?.();
  wss.on('close', () => clearInterval(heartbeat));

  wss.on('connection', (ws, req) => {
    const forwardedFor = trustProxy ? req?.headers?.['x-forwarded-for'] : undefined;
    const ip = (forwardedFor?.split(',')[0] ?? req?.socket?.remoteAddress ?? 'unknown').trim();

    // Per-connection state. Kept in one object so the admit flow (which runs
    // on the owner's connection) can update the guest's connection directly.
    const conn = {
      ws,
      clientId: crypto.randomUUID(),
      roomId: null,
      rejoinToken: null,
      memberId: null,
      pendingRequestId: null,
      tokens: MESSAGE_BURST,
      lastRefill: Date.now(),
    };
    const { clientId } = conn;

    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // Protocol errors (e.g. a message over maxPayload) are emitted here and
    // ws closes the socket itself. Without a listener the 'error' event would
    // be thrown and take the whole process down.
    ws.on('error', (err) => {
      console.warn(`Connection error for ${conn.clientId}: ${err.message}`);
    });

    console.log(`Client connected: ${clientId}`);

    const send = (payload) => safeSend(ws, payload);

    const takeToken = () => {
      const now = Date.now();
      conn.tokens = Math.min(MESSAGE_BURST, conn.tokens + ((now - conn.lastRefill) / 1000) * MESSAGES_PER_SECOND);
      conn.lastRefill = now;
      if (conn.tokens < 1) return false;
      conn.tokens -= 1;
      return true;
    };

    const cancelOwnPendingRequest = () => {
      const requestId = conn.pendingRequestId;
      if (!requestId) return;
      const pending = pendingRequests.get(requestId);
      pendingRequests.delete(requestId);
      conn.pendingRequestId = null;
      if (pending) notifyOwner(pending.roomId, { type: 'admit-request-cancelled', requestId });
    };

    // Shared by an explicit leave-room, a disconnect, and switching rooms.
    // An explicit leave also forgets the rejoin token; a disconnect keeps it
    // so a page reload can come straight back.
    const leaveCurrentRoom = ({ explicit }) => {
      const roomId = conn.roomId;
      conn.roomId = null;
      if (explicit && conn.rejoinToken) rejoinTokens.delete(conn.rejoinToken);
      conn.rejoinToken = null;
      conn.memberId = null;

      const roomClients = roomId && rooms.get(roomId);
      if (!roomClients) return;

      roomClients.delete(clientId);
      const wasOwner = roomOwners.get(roomId) === clientId;

      if (roomClients.size === 0) {
        rejectPendingForRoom(roomId, 'The host left the room');
        roomOwners.delete(roomId);

        const timer = setTimeout(() => deleteRoom(roomId), roomGraceMs);
        timer.unref?.();
        roomDeletionTimers.set(roomId, timer);
        return;
      }

      roomClients.forEach((member) => safeSend(member.ws, { type: 'peer-left', clientId }));

      if (wasOwner) {
        rejectPendingForRoom(roomId, 'The host left the room');

        const [nextClientId] = roomClients.keys();
        roomOwners.set(roomId, nextClientId);
        roomClients.forEach((member) => {
          safeSend(member.ws, { type: 'owner-changed', newOwnerId: nextClientId });
        });
        console.log(`Room ${roomId} owner changed to ${nextClientId}`);
      }
    };

    // The one path into a room, used by create, rejoin and admit alike.
    const addMember = (target, roomId, name, memberId = crypto.randomUUID()) => {
      const roomClients = rooms.get(roomId);
      cancelRoomDeletion(roomId);

      const existingPeers = roster(roomClients, target.clientId);
      const rejoinToken = crypto.randomUUID();
      rejoinTokens.set(rejoinToken, { roomId, memberId });

      roomClients.set(target.clientId, { ws: target.ws, name });
      target.roomId = roomId;
      target.rejoinToken = rejoinToken;
      target.memberId = memberId;

      // An empty room (everyone reloaded / left within the grace period)
      // has no owner - whoever comes back first takes it over, so join
      // requests always have someone to go to.
      if (!roomOwners.has(roomId)) roomOwners.set(roomId, target.clientId);

      return { existingPeers, rejoinToken };
    };

    // chatHistory is only passed for a rejoin: someone coming back sees what
    // was said while they were away, a brand-new guest starts with a blank
    // chat. The returning person's own old messages are re-stamped with their
    // new clientId so they still show up as "You".
    const announceJoin = (target, roomId, name, existingPeers, rejoinToken, chatHistory = []) => {
      safeSend(target.ws, {
        type: 'existing-peers',
        roomId,
        clientId: target.clientId,
        name,
        peers: existingPeers,
        ownerId: roomOwners.get(roomId),
        rejoinToken,
        chatHistory: chatHistory.map((entry) => ({
          from: entry.memberId === target.memberId ? target.clientId : entry.from,
          fromName: entry.fromName,
          text: entry.text,
        })),
        iceServers: iceServersFor(target.clientId),
      });

      const roomClients = rooms.get(roomId);
      existingPeers.forEach((peer) => {
        safeSend(roomClients.get(peer.clientId).ws, {
          type: 'peer-joined',
          clientId: target.clientId,
          name,
        });
      });
    };

    leaveFns.set(clientId, leaveCurrentRoom);

    const handlers = {
      'create-room': (data) => {
        if (conn.roomId) leaveCurrentRoom({ explicit: true });
        cancelOwnPendingRequest();

        const roomId = generateRoomCode(rooms);
        const name = cleanName(data.name);
        rooms.set(roomId, new Map());
        roomHistory.set(roomId, []);
        const { rejoinToken } = addMember(conn, roomId, name);

        console.log(`Room created: ${roomId} (${clientId})`);
        send({
          type: 'room-created',
          roomId,
          clientId,
          name,
          isOwner: true,
          ownerId: clientId,
          rejoinToken,
          iceServers: iceServersFor(clientId),
        });
      },

      // Direct (re)join - only with a rejoin token from an earlier admission.
      // Everyone else goes through join-request.
      'join-room': (data) => {
        if (tooManyFailedLookups(ip)) {
          send({ type: 'error', message: 'Too many attempts. Please wait a minute and try again.' });
          return;
        }

        const roomId = typeof data.roomId === 'string' ? data.roomId : '';
        if (!rooms.has(roomId)) {
          recordFailedLookup(ip);
          send({ type: 'error', message: 'Room does not exist' });
          return;
        }

        const grant = typeof data.rejoinToken === 'string' ? rejoinTokens.get(data.rejoinToken) : undefined;
        if (grant?.roomId !== roomId) {
          send({ type: 'error', message: 'Ask the host to let you in' });
          return;
        }

        const roomClients = rooms.get(roomId);
        if (roomClients.size >= MAX_ROOM_SIZE) {
          send({ type: 'error', message: 'Room is full' });
          return;
        }

        if (conn.roomId) leaveCurrentRoom({ explicit: true });
        cancelOwnPendingRequest();
        rejoinTokens.delete(data.rejoinToken);

        const name = cleanName(data.name);
        const { existingPeers, rejoinToken } = addMember(conn, roomId, name, grant.memberId);
        console.log(`${clientId} rejoined room ${roomId}`);
        announceJoin(conn, roomId, name, existingPeers, rejoinToken, roomHistory.get(roomId) ?? []);
      },

      'create-invite': (data) => {
        const roomId = data.roomId;
        if (!conn.roomId || conn.roomId !== roomId) {
          send({ type: 'error', message: 'You are not in that room' });
          return;
        }

        // One reusable token per room, so spamming create-invite can't grow
        // the map without bound.
        let token = [...inviteTokens.entries()].find(([, tokenRoomId]) => tokenRoomId === roomId)?.[0];
        if (!token) {
          token = crypto.randomUUID();
          inviteTokens.set(token, roomId);
        }
        send({ type: 'invite-created', token, roomId });
      },

      'resolve-invite': (data) => {
        if (tooManyFailedLookups(ip)) {
          send({ type: 'error', message: 'Too many attempts. Please wait a minute and try again.' });
          return;
        }

        const roomId = typeof data.token === 'string' ? inviteTokens.get(data.token) : undefined;
        if (!roomId) {
          recordFailedLookup(ip);
          send({ type: 'error', message: 'Invalid or expired invite link' });
          return;
        }
        send({ type: 'invite-resolved', roomId });
      },

      'join-request': (data) => {
        if (tooManyFailedLookups(ip)) {
          send({ type: 'error', message: 'Too many attempts. Please wait a minute and try again.' });
          return;
        }

        const roomId = typeof data.roomId === 'string' ? data.roomId : '';
        const name = cleanName(data.name);

        if (!rooms.has(roomId)) {
          recordFailedLookup(ip);
          send({ type: 'error', message: 'Room does not exist' });
          return;
        }
        if (conn.roomId === roomId) return;

        if (rooms.get(roomId).size >= MAX_ROOM_SIZE) {
          send({ type: 'error', message: 'Room is full' });
          return;
        }
        if (!roomOwners.has(roomId)) {
          send({ type: 'error', message: 'The host is not in the room right now' });
          return;
        }

        // One outstanding request per connection - a second one replaces the
        // first instead of leaving an orphan that could later be admitted.
        cancelOwnPendingRequest();

        const requestId = crypto.randomUUID();
        pendingRequests.set(requestId, { conn, name, roomId });
        conn.pendingRequestId = requestId;

        send({ type: 'waiting', requestId });
        notifyOwner(roomId, { type: 'admit-request', requestId, name, clientId });
        console.log(`Join request ${requestId} for room ${roomId}`);
      },

      'admit-response': (data) => {
        const pending = pendingRequests.get(data.requestId);
        if (!pending) return;

        // Only the current owner of that room may decide.
        if (roomOwners.get(pending.roomId) !== clientId || conn.roomId !== pending.roomId) return;

        pendingRequests.delete(data.requestId);
        const guest = pending.conn;
        guest.pendingRequestId = null;

        if (guest.ws.readyState !== guest.ws.OPEN) return;

        if (!data.admitted) {
          safeSend(guest.ws, { type: 'join-rejected', reason: 'The host declined your request' });
          return;
        }

        const roomClients = rooms.get(pending.roomId);
        if (!roomClients || roomClients.size >= MAX_ROOM_SIZE) {
          safeSend(guest.ws, { type: 'join-rejected', reason: 'Room is no longer available' });
          return;
        }

        if (guest.roomId) leaveFns.get(guest.clientId)?.({ explicit: true });

        const { existingPeers, rejoinToken } = addMember(guest, pending.roomId, pending.name);
        console.log(`${guest.clientId} admitted to room ${pending.roomId}`);
        announceJoin(guest, pending.roomId, pending.name, existingPeers, rejoinToken);
      },

      'cancel-join-request': (data) => {
        if (data.requestId === conn.pendingRequestId) cancelOwnPendingRequest();
      },

      // offer / answer / ice-candidate: relayed to exactly one member of the
      // same room. Only known fields are forwarded, and senderId is always
      // the server's own idea of who this connection is.
      relay: (data) => {
        const target = conn.roomId && rooms.get(conn.roomId)?.get(data.targetId);
        if (!target || !isPlainObject(data.payload)) return;
        safeSend(target.ws, {
          type: data.type,
          targetId: data.targetId,
          senderId: clientId,
          payload: data.payload,
        });
      },

      'media-state': (data) => {
        const roomClients = conn.roomId && rooms.get(conn.roomId);
        if (!roomClients) return;

        const state = {
          type: 'media-state',
          from: clientId,
          cameraOn: Boolean(data.cameraOn),
          micOn: Boolean(data.micOn),
          screenSharing: Boolean(data.screenSharing),
          cameraStreamId: cleanStreamId(data.cameraStreamId),
          screenStreamId: cleanStreamId(data.screenStreamId),
        };
        roomClients.forEach((member, peerId) => {
          if (peerId !== clientId) safeSend(member.ws, state);
        });
      },

      'leave-room': () => {
        cancelOwnPendingRequest();
        leaveCurrentRoom({ explicit: true });
      },

      'chat-message': (data) => {
        const roomClients = conn.roomId && rooms.get(conn.roomId);
        if (!roomClients || typeof data.text !== 'string') return;

        const text = data.text.trim().slice(0, MAX_CHAT_LENGTH);
        if (!text) return;

        const message = {
          type: 'chat-message',
          from: clientId,
          fromName: roomClients.get(clientId)?.name ?? 'Guest',
          text,
        };

        const history = roomHistory.get(conn.roomId);
        if (history) {
          history.push({ memberId: conn.memberId, from: message.from, fromName: message.fromName, text });
          if (history.length > MAX_CHAT_HISTORY) history.shift();
        }
        roomClients.forEach((member, peerId) => {
          if (peerId !== clientId) safeSend(member.ws, message);
        });
      },
    };
    handlers.offer = handlers.relay;
    handlers.answer = handlers.relay;
    handlers['ice-candidate'] = handlers.relay;

    ws.on('message', (message) => {
      if (!takeToken()) return;

      let data;
      try {
        data = JSON.parse(message);
      } catch {
        return; // Malformed input from one client must not take anything down.
      }
      if (!isPlainObject(data) || data.type === 'relay') return;

      const handler = Object.hasOwn(handlers, data.type) ? handlers[data.type] : undefined;
      if (!handler) return;

      try {
        handler(data);
      } catch (err) {
        console.error(`Failed handling ${data.type}:`, err);
      }
    });

    ws.on('close', () => {
      console.log(`Client disconnected: ${clientId}`);
      cancelOwnPendingRequest();
      leaveCurrentRoom({ explicit: false });
      leaveFns.delete(clientId);
    });
  });

  return wss;
}
