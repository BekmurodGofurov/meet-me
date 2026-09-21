import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import WebSocket from 'ws';
import { createSignalingServer } from './signaling.js';

// Plain http + ws://, not https/wss - the signaling logic itself has no
// opinion on TLS, and testing over plain ws avoids any dependency on the
// mkcert certificate (which is gitignored and IP-specific).
let httpServer;
let wss;
let baseUrl;

// Short by default so the "leaves an empty room" tests don't have to wait
// out the real 10s production grace period - it's only the duration that
// matters for those tests, not any specific number.
const ROOM_GRACE_MS = 100;

beforeEach(async () => {
  httpServer = createServer();
  wss = createSignalingServer(httpServer, { roomGraceMs: ROOM_GRACE_MS });

  await new Promise((resolve) => httpServer.listen(0, resolve));
  const { port } = httpServer.address();
  baseUrl = `ws://localhost:${port}`;
});

afterEach(async () => {
  wss.clients.forEach((client) => client.terminate());
  await new Promise((resolve) => httpServer.close(resolve));
});

// A persistent listener queues every message as it arrives, in order.
// nextMessage() then always returns the oldest unread message for that
// socket - whether it was already sitting in the queue or arrives later -
// instead of racing a fresh .once('message') against real network timing.
// That race is real: a notification like peer-joined can arrive on another
// socket before the next nextMessage() call for it is even made, and a bare
// .once would then wrongly hand that leftover message to a later step.
function connect() {
  return new Promise((resolve) => {
    const ws = new WebSocket(baseUrl);
    ws.inbox = [];
    ws.waiters = [];

    ws.on('message', (data) => {
      const parsed = JSON.parse(data.toString());
      const waiter = ws.waiters.shift();
      if (waiter) waiter(parsed);
      else ws.inbox.push(parsed);
    });

    ws.on('open', () => resolve(ws));
  });
}

function nextMessage(ws) {
  if (ws.inbox.length > 0) return Promise.resolve(ws.inbox.shift());
  return new Promise((resolve) => ws.waiters.push(resolve));
}

function send(ws, payload) {
  ws.send(JSON.stringify(payload));
}

async function createRoom(name = 'Owner') {
  const ws = await connect();
  send(ws, { type: 'create-room', name });
  const created = await nextMessage(ws);
  return { ws, created };
}

// notifyTargets: existing members who will receive (and here, consume) the
// peer-joined notification this join triggers - without draining it, it
// sits in that socket's queue ahead of whatever the test checks next.
async function joinRoom(roomId, name, notifyTargets = []) {
  const ws = await connect();
  const notifications = notifyTargets.map((target) => nextMessage(target));

  send(ws, { type: 'join-room', roomId, name });
  const joined = await nextMessage(ws);
  const peerJoinedMessages = await Promise.all(notifications);

  return { ws, joined, peerJoinedMessages };
}

describe('create-room', () => {
  test('returns a room code, a client id, and the trimmed name', async () => {
    const { created } = await createRoom('  Bekmurod  ');

    assert.equal(created.type, 'room-created');
    assert.match(created.roomId, /^[0-9a-f]{6}$/);
    assert.ok(created.clientId);
    assert.equal(created.name, 'Bekmurod');
  });

  test('two different clients never get the same clientId', async () => {
    const { created: a } = await createRoom('A');
    const { created: b } = await createRoom('B');

    assert.notEqual(a.clientId, b.clientId);
  });

  test('blank name falls back to Guest', async () => {
    const { created } = await createRoom('   ');
    assert.equal(created.name, 'Guest');
  });

  test('name longer than 24 characters is truncated', async () => {
    const longName = 'x'.repeat(40);
    const { created } = await createRoom(longName);
    assert.equal(created.name.length, 24);
  });
});

describe('join-room', () => {
  test('joining client receives existing-peers with the room and their own identity', async () => {
    const { created } = await createRoom('Owner');
    const { joined } = await joinRoom(created.roomId, 'Member');

    assert.equal(joined.type, 'existing-peers');
    assert.equal(joined.roomId, created.roomId);
    assert.equal(joined.name, 'Member');
    assert.ok(joined.clientId);
    assert.notEqual(joined.clientId, created.clientId);
  });

  test('peers list contains the existing member as {clientId, name}, not a bare id', async () => {
    const { created } = await createRoom('Owner');
    const { joined } = await joinRoom(created.roomId, 'Member');

    assert.deepEqual(joined.peers, [{ clientId: created.clientId, name: 'Owner' }]);
  });

  test("existing member receives peer-joined with the new client's id and name", async () => {
    const { ws: ownerWs, created } = await createRoom('Owner');
    const { joined, peerJoinedMessages } = await joinRoom(created.roomId, 'Member', [ownerWs]);

    assert.equal(peerJoinedMessages[0].type, 'peer-joined');
    assert.equal(peerJoinedMessages[0].clientId, joined.clientId);
    assert.equal(peerJoinedMessages[0].name, 'Member');
  });

  test('joining a room that does not exist returns an error, not a crash', async () => {
    const ws = await connect();
    send(ws, { type: 'join-room', roomId: 'nope00', name: 'Ghost' });

    const response = await nextMessage(ws);
    assert.equal(response.type, 'error');
    assert.match(response.message, /does not exist/i);
  });

  test('a 7th person cannot join a room already at 6', async () => {
    const { ws: ownerWs, created } = await createRoom('Member 1');
    const existing = [ownerWs];

    for (let i = 2; i <= 6; i += 1) {
      const { ws } = await joinRoom(created.roomId, `Member ${i}`, existing);
      existing.push(ws);
    }

    const ws = await connect();
    send(ws, { type: 'join-room', roomId: created.roomId, name: 'Member 7' });
    const response = await nextMessage(ws);

    assert.equal(response.type, 'error');
    assert.match(response.message, /full/i);
  });
});

describe('offer / answer / ice-candidate relay', () => {
  test('server stamps senderId itself and ignores whatever the client claims', async () => {
    const { ws: ownerWs, created } = await createRoom('Owner');
    const { ws: memberWs, joined } = await joinRoom(created.roomId, 'Member', [ownerWs]);

    const offerPromise = nextMessage(ownerWs);
    send(memberWs, {
      type: 'offer',
      targetId: created.clientId,
      senderId: 'SPOOFED-ID',
      payload: { sdp: 'fake' },
    });

    const offer = await offerPromise;
    assert.equal(offer.type, 'offer');
    assert.equal(offer.senderId, joined.clientId);
    assert.notEqual(offer.senderId, 'SPOOFED-ID');
    assert.deepEqual(offer.payload, { sdp: 'fake' });
  });

  test('answer and ice-candidate are relayed the same way', async () => {
    const { ws: ownerWs, created } = await createRoom('Owner');
    const { ws: memberWs, joined } = await joinRoom(created.roomId, 'Member', [ownerWs]);

    const answerPromise = nextMessage(memberWs);
    send(ownerWs, { type: 'answer', targetId: joined.clientId, payload: { sdp: 'answer' } });
    const answer = await answerPromise;
    assert.equal(answer.senderId, created.clientId);

    const candidatePromise = nextMessage(memberWs);
    send(ownerWs, { type: 'ice-candidate', targetId: joined.clientId, payload: { candidate: 'x' } });
    const candidate = await candidatePromise;
    assert.equal(candidate.type, 'ice-candidate');
    assert.equal(candidate.senderId, created.clientId);
  });

  test('a message aimed at an unknown targetId is silently dropped, not an error', async () => {
    const { ws } = await createRoom('Owner');

    send(ws, { type: 'offer', targetId: 'no-such-client', payload: {} });

    // If it had produced a reply, this next call would receive that instead
    // of room-created - the queue makes ordering exact, so there's no need
    // for an arbitrary timeout here.
    send(ws, { type: 'create-room', name: 'Still alive' });
    const response = await nextMessage(ws);
    assert.equal(response.type, 'room-created');
  });
});

describe('chat-message', () => {
  test('is relayed to everyone else in the room, with server-stamped identity', async () => {
    const { ws: ownerWs, created } = await createRoom('Owner');
    const { ws: memberWs } = await joinRoom(created.roomId, 'Member', [ownerWs]);

    const chatPromise = nextMessage(memberWs);
    send(ownerWs, { type: 'chat-message', text: 'hi', from: 'SPOOF', fromName: 'SPOOF' });

    const chat = await chatPromise;
    assert.equal(chat.text, 'hi');
    assert.equal(chat.from, created.clientId);
    assert.equal(chat.fromName, 'Owner');
  });

  test('the sender does not receive their own message back', async () => {
    const { ws: ownerWs, created } = await createRoom('Owner');
    await joinRoom(created.roomId, 'Member', [ownerWs]);

    send(ownerWs, { type: 'chat-message', text: 'hello' });
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Nothing should have arrived and queued for the sender.
    assert.equal(ownerWs.inbox.length, 0);
  });
});

describe('media-state', () => {
  test('is relayed with server-stamped from, not the client-supplied value', async () => {
    const { ws: ownerWs, created } = await createRoom('Owner');
    const { ws: memberWs } = await joinRoom(created.roomId, 'Member', [ownerWs]);

    const statePromise = nextMessage(ownerWs);
    send(memberWs, { type: 'media-state', cameraOn: true, micOn: false, from: 'SPOOF' });

    const state = await statePromise;
    assert.equal(state.type, 'media-state');
    assert.equal(state.cameraOn, true);
    assert.equal(state.micOn, false);
    assert.notEqual(state.from, 'SPOOF');
  });
});

describe('leave-room', () => {
  test('notifies remaining members with peer-left', async () => {
    const { ws: ownerWs, created } = await createRoom('Owner');
    const { ws: memberWs, joined } = await joinRoom(created.roomId, 'Member', [ownerWs]);

    const leftPromise = nextMessage(ownerWs);
    send(memberWs, { type: 'leave-room' });

    const left = await leftPromise;
    assert.equal(left.type, 'peer-left');
    assert.equal(left.clientId, joined.clientId);
  });

  test('the socket stays open and can create/join another room afterwards', async () => {
    const { ws: ownerWs, created } = await createRoom('Owner');
    const { ws: memberWs } = await joinRoom(created.roomId, 'Member', [ownerWs]);

    send(memberWs, { type: 'leave-room' });
    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.equal(memberWs.readyState, WebSocket.OPEN);

    send(memberWs, { type: 'create-room', name: 'Member' });
    const response = await nextMessage(memberWs);
    assert.equal(response.type, 'room-created');
  });

  test('an empty room is removed after its grace period - a stale room code is then rejected', async () => {
    const { ws: ownerWs, created } = await createRoom('Owner');
    send(ownerWs, { type: 'leave-room' });
    await new Promise((resolve) => setTimeout(resolve, ROOM_GRACE_MS + 50));

    const ws = await connect();
    send(ws, { type: 'join-room', roomId: created.roomId, name: 'Late' });
    const response = await nextMessage(ws);

    assert.equal(response.type, 'error');
  });

  test('rejoining within the grace period succeeds instead of "room does not exist"', async () => {
    // This is exactly the shape of a page reload: the old connection leaves
    // (or disconnects) and a new one asks to join the same room moments
    // later - without a grace period this always lost the race and made
    // "refresh keeps you in the room" not actually work for a lone user.
    const { ws: ownerWs, created } = await createRoom('Owner');
    send(ownerWs, { type: 'leave-room' });

    const ws = await connect();
    send(ws, { type: 'join-room', roomId: created.roomId, name: 'Owner' });
    const response = await nextMessage(ws);

    assert.equal(response.type, 'existing-peers');
    assert.equal(response.roomId, created.roomId);
  });

  test('a disconnect (not just an explicit leave-room) also gets the same grace period', async () => {
    const { ws: ownerWs, created } = await createRoom('Owner');
    ownerWs.close();
    await new Promise((resolve) => setTimeout(resolve, 20));

    const ws = await connect();
    send(ws, { type: 'join-room', roomId: created.roomId, name: 'Owner' });
    const response = await nextMessage(ws);

    assert.equal(response.type, 'existing-peers');
  });
});

describe('disconnect (no explicit leave-room)', () => {
  test('closing the socket has the same effect as leave-room', async () => {
    const { ws: ownerWs, created } = await createRoom('Owner');
    const { ws: memberWs, joined } = await joinRoom(created.roomId, 'Member', [ownerWs]);

    const leftPromise = nextMessage(ownerWs);
    memberWs.close();

    const left = await leftPromise;
    assert.equal(left.type, 'peer-left');
    assert.equal(left.clientId, joined.clientId);
  });
});

describe('malformed input', () => {
  test('invalid JSON does not crash the server or the connection', async () => {
    const ws = await connect();
    ws.send('this is not json');

    send(ws, { type: 'create-room', name: 'Still fine' });
    const response = await nextMessage(ws);
    assert.equal(response.type, 'room-created');
  });

  test('an unknown message type is ignored rather than erroring', async () => {
    const ws = await connect();
    send(ws, { type: 'not-a-real-type', foo: 'bar' });

    send(ws, { type: 'create-room', name: 'Still fine' });
    const response = await nextMessage(ws);
    assert.equal(response.type, 'room-created');
  });
});
