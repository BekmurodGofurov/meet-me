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
let openSockets = [];

// Short by default so the "leaves an empty room" tests don't have to wait
// out the real 10s production grace period - it's only the duration that
// matters for those tests, not any specific number.
const ROOM_GRACE_MS = 100;

beforeEach(async () => {
  openSockets = [];
  httpServer = createServer();
  wss = createSignalingServer(httpServer, { roomGraceMs: ROOM_GRACE_MS });

  await new Promise((resolve) => httpServer.listen(0, resolve));
  const { port } = httpServer.address();
  baseUrl = `ws://localhost:${port}`;
});

afterEach(async () => {
  openSockets.forEach((ws) => {
    try { ws.terminate(); } catch {}
  });
  wss.clients.forEach((client) => client.terminate());
  await new Promise((resolve) => wss.close(resolve));
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
    openSockets.push(ws);
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

// Joins the way a real guest does: join-request -> owner admits. members is
// everyone already in the room, owner first; each of them receives (and here
// consumes) the peer-joined this triggers - without draining it, it would sit
// in that socket's queue ahead of whatever the test checks next.
async function joinRoom(roomId, name, members) {
  const [ownerWs] = members;
  const ws = await connect();

  send(ws, { type: 'join-request', roomId, name });
  const waiting = await nextMessage(ws);
  assert.equal(waiting.type, 'waiting');
  const request = await nextMessage(ownerWs);
  assert.equal(request.type, 'admit-request');

  const notifications = members.map((member) => nextMessage(member));
  send(ownerWs, { type: 'admit-response', requestId: request.requestId, admitted: true });
  const joined = await nextMessage(ws);
  const peerJoinedMessages = await Promise.all(notifications);

  return { ws, joined, peerJoinedMessages };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('create-room', () => {
  test('returns a room code, a client id, and the trimmed name', async () => {
    const { created } = await createRoom('  Bekmurod  ');

    assert.equal(created.type, 'room-created');
    assert.match(created.roomId, /^[a-z0-9]{6}$/);
    assert.ok(created.rejoinToken);
    assert.ok(Array.isArray(created.iceServers));
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

describe('joining a room', () => {
  test('admitted guest receives existing-peers with the room and their own identity', async () => {
    const { ws: ownerWs, created } = await createRoom('Owner');
    const { joined } = await joinRoom(created.roomId, 'Member', [ownerWs]);

    assert.equal(joined.type, 'existing-peers');
    assert.equal(joined.roomId, created.roomId);
    assert.equal(joined.name, 'Member');
    assert.ok(joined.clientId);
    assert.ok(joined.rejoinToken);
    assert.notEqual(joined.clientId, created.clientId);
  });

  test('peers list contains the existing member as {clientId, name}, not a bare id', async () => {
    const { ws: ownerWs, created } = await createRoom('Owner');
    const { joined } = await joinRoom(created.roomId, 'Member', [ownerWs]);

    assert.deepEqual(joined.peers, [{ clientId: created.clientId, name: 'Owner' }]);
  });

  test("existing member receives peer-joined with the new client's id and name", async () => {
    const { ws: ownerWs, created } = await createRoom('Owner');
    const { joined, peerJoinedMessages } = await joinRoom(created.roomId, 'Member', [ownerWs]);

    assert.equal(peerJoinedMessages[0].type, 'peer-joined');
    assert.equal(peerJoinedMessages[0].clientId, joined.clientId);
    assert.equal(peerJoinedMessages[0].name, 'Member');
  });

  test('asking to join a room that does not exist returns an error, not a crash', async () => {
    const ws = await connect();
    send(ws, { type: 'join-request', roomId: 'nope00', name: 'Ghost' });

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
    send(ws, { type: 'join-request', roomId: created.roomId, name: 'Member 7' });
    const response = await nextMessage(ws);

    assert.equal(response.type, 'error');
    assert.match(response.message, /full/i);
  });

  test('join-room without a rejoin token cannot skip the waiting room', async () => {
    const { ws: ownerWs, created } = await createRoom('Owner');

    const intruder = await connect();
    send(intruder, { type: 'join-room', roomId: created.roomId, name: 'Intruder' });
    const response = await nextMessage(intruder);

    assert.equal(response.type, 'error');
    assert.equal(wss.rooms.get(created.roomId).size, 1);
    await wait(50);
    assert.equal(ownerWs.inbox.length, 0);
  });

  test("join-room with another room's token is rejected", async () => {
    const { created: roomA } = await createRoom('A');
    const { created: roomB } = await createRoom('B');

    const ws = await connect();
    send(ws, { type: 'join-room', roomId: roomB.roomId, rejoinToken: roomA.rejoinToken, name: 'X' });
    const response = await nextMessage(ws);

    assert.equal(response.type, 'error');
  });

  test('creating a room while in another one leaves the old room properly', async () => {
    const { ws: ownerWs, created } = await createRoom('Owner');
    const { ws: memberWs, joined } = await joinRoom(created.roomId, 'Member', [ownerWs]);

    send(memberWs, { type: 'create-room', name: 'Member' });
    const left = await nextMessage(ownerWs);

    assert.equal(left.type, 'peer-left');
    assert.equal(left.clientId, joined.clientId);
    assert.equal(wss.rooms.get(created.roomId).has(joined.clientId), false);
  });

  test('repeated failed lookups from one address are rate limited', async () => {
    const ws = await connect();
    for (let i = 0; i < 20; i += 1) {
      send(ws, { type: 'join-request', roomId: `zz${String(i).padStart(4, '0')}`, name: 'Guesser' });
      const response = await nextMessage(ws);
      assert.match(response.message, /does not exist/i);
    }

    const { created } = await createRoom('Owner');
    send(ws, { type: 'join-request', roomId: created.roomId, name: 'Guesser' });
    const response = await nextMessage(ws);
    assert.match(response.message, /too many attempts/i);
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

describe('relay validation', () => {
  test('a relay with a non-object payload is dropped', async () => {
    const { ws: ownerWs, created } = await createRoom('Owner');
    const { ws: memberWs } = await joinRoom(created.roomId, 'Member', [ownerWs]);

    send(memberWs, { type: 'offer', targetId: created.clientId, payload: 'not an object' });
    send(memberWs, { type: 'offer', targetId: created.clientId, payload: { sdp: 'real' }, extra: 'x' });

    const offer = await nextMessage(ownerWs);
    assert.deepEqual(offer.payload, { sdp: 'real' });
    assert.equal(offer.extra, undefined);
  });

  test('messages larger than the payload limit close the connection', async () => {
    const ws = await connect();
    const closed = new Promise((resolve) => ws.on('close', (code) => resolve(code)));
    send(ws, { type: 'chat-message', text: 'x'.repeat(200 * 1024) });

    assert.equal(await closed, 1009);
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

  test('non-string text is dropped and long text is capped at 500 characters', async () => {
    const { ws: ownerWs, created } = await createRoom('Owner');
    const { ws: memberWs } = await joinRoom(created.roomId, 'Member', [ownerWs]);

    send(ownerWs, { type: 'chat-message', text: { evil: true } });
    send(ownerWs, { type: 'chat-message', text: 'y'.repeat(2000), extra: 'x' });

    const chat = await nextMessage(memberWs);
    assert.equal(chat.text.length, 500);
    assert.equal(chat.extra, undefined);
  });

  test('someone who reloads gets the earlier chat back, with their own messages still marked as theirs', async () => {
    const { ws: ownerWs, created } = await createRoom('Owner');
    const { ws: memberWs, joined: memberJoined } = await joinRoom(created.roomId, 'Member', [ownerWs]);

    send(ownerWs, { type: 'chat-message', text: 'hello from owner' });
    await nextMessage(memberWs);
    send(memberWs, { type: 'chat-message', text: 'hello from member' });
    await nextMessage(ownerWs);

    ownerWs.close();
    await wait(20);

    const ws = await connect();
    send(ws, { type: 'join-room', roomId: created.roomId, rejoinToken: created.rejoinToken, name: 'Owner' });
    const response = await nextMessage(ws);

    assert.equal(response.type, 'existing-peers');
    assert.deepEqual(response.chatHistory, [
      { from: response.clientId, fromName: 'Owner', text: 'hello from owner' },
      { from: memberJoined.clientId, fromName: 'Member', text: 'hello from member' },
    ]);
    // Not the old connection's id - that is what made "You" turn into "Owner".
    assert.notEqual(response.clientId, created.clientId);
  });

  test('a second reload still recognises messages sent before the first one', async () => {
    const { ws: ownerWs, created } = await createRoom('Owner');
    await joinRoom(created.roomId, 'Member', [ownerWs]);
    send(ownerWs, { type: 'chat-message', text: 'first' });
    await wait(30);
    ownerWs.close();
    await wait(20);

    const second = await connect();
    send(second, { type: 'join-room', roomId: created.roomId, rejoinToken: created.rejoinToken, name: 'Owner' });
    const afterFirst = await nextMessage(second);
    second.close();
    await wait(20);

    const third = await connect();
    send(third, { type: 'join-room', roomId: created.roomId, rejoinToken: afterFirst.rejoinToken, name: 'Owner' });
    const afterSecond = await nextMessage(third);

    assert.equal(afterSecond.chatHistory.length, 1);
    assert.equal(afterSecond.chatHistory[0].from, afterSecond.clientId);
  });

  test('a newly admitted guest starts with an empty chat history', async () => {
    const { ws: ownerWs, created } = await createRoom('Owner');
    const { ws: memberWs } = await joinRoom(created.roomId, 'Member', [ownerWs]);
    send(ownerWs, { type: 'chat-message', text: 'private to those present' });
    await nextMessage(memberWs);

    const { joined } = await joinRoom(created.roomId, 'Late', [ownerWs, memberWs]);

    assert.deepEqual(joined.chatHistory, []);
  });

  test('the history keeps only the most recent 200 messages', async () => {
    const { ws: ownerWs, created } = await createRoom('Owner');
    const { ws: memberWs } = await joinRoom(created.roomId, 'Member', [ownerWs]);

    for (let i = 0; i < 150; i += 1) send(ownerWs, { type: 'chat-message', text: `o${i}` });
    for (let i = 0; i < 150; i += 1) send(memberWs, { type: 'chat-message', text: `m${i}` });
    await wait(400);

    ownerWs.close();
    await wait(20);
    const ws = await connect();
    send(ws, { type: 'join-room', roomId: created.roomId, rejoinToken: created.rejoinToken, name: 'Owner' });
    const response = await nextMessage(ws);

    assert.equal(response.chatHistory.length, 200);
    assert.equal(response.chatHistory[0].text, 'o100');
    assert.equal(response.chatHistory[199].text, 'm149');
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

  test('stream ids are forwarded so peers can tell camera from screen', async () => {
    const { ws: ownerWs, created } = await createRoom('Owner');
    const { ws: memberWs } = await joinRoom(created.roomId, 'Member', [ownerWs]);

    send(memberWs, {
      type: 'media-state',
      screenSharing: true,
      cameraStreamId: 'cam-1',
      screenStreamId: 'x'.repeat(500),
    });

    const state = await nextMessage(ownerWs);
    assert.equal(state.cameraStreamId, 'cam-1');
    assert.equal(state.screenStreamId, null);
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
    ownerWs.close();
    await wait(ROOM_GRACE_MS + 50);

    const ws = await connect();
    send(ws, { type: 'join-room', roomId: created.roomId, rejoinToken: created.rejoinToken, name: 'Owner' });
    const response = await nextMessage(ws);

    assert.equal(response.type, 'error');
    assert.match(response.message, /does not exist/i);
  });

  test('a reload (disconnect + rejoin with token) within the grace period keeps the room and the owner role', async () => {
    // This is exactly the shape of a page reload: the old connection drops
    // and a new one rejoins moments later. Without the grace period the room
    // would already be gone; without the owner restore, nobody could admit
    // guests afterwards.
    const { ws: ownerWs, created } = await createRoom('Owner');
    ownerWs.close();
    await wait(20);

    const ws = await connect();
    send(ws, { type: 'join-room', roomId: created.roomId, rejoinToken: created.rejoinToken, name: 'Owner' });
    const response = await nextMessage(ws);

    assert.equal(response.type, 'existing-peers');
    assert.equal(response.roomId, created.roomId);
    assert.equal(response.ownerId, response.clientId);
    assert.ok(response.rejoinToken);
    assert.notEqual(response.rejoinToken, created.rejoinToken);

    const guest = await connect();
    send(guest, { type: 'join-request', roomId: created.roomId, name: 'Guest' });
    await nextMessage(guest);
    const request = await nextMessage(ws);
    assert.equal(request.type, 'admit-request');
  });

  test('a rejoin token works only once', async () => {
    const { ws: ownerWs, created } = await createRoom('Owner');
    ownerWs.close();
    await wait(20);

    const first = await connect();
    send(first, { type: 'join-room', roomId: created.roomId, rejoinToken: created.rejoinToken, name: 'Owner' });
    assert.equal((await nextMessage(first)).type, 'existing-peers');

    const second = await connect();
    send(second, { type: 'join-room', roomId: created.roomId, rejoinToken: created.rejoinToken, name: 'Copy' });
    assert.equal((await nextMessage(second)).type, 'error');
  });

  test('an explicit leave-room forgets the rejoin token', async () => {
    const { ws: ownerWs, created } = await createRoom('Owner');
    send(ownerWs, { type: 'leave-room' });
    await wait(20);

    const ws = await connect();
    send(ws, { type: 'join-room', roomId: created.roomId, rejoinToken: created.rejoinToken, name: 'Owner' });
    const response = await nextMessage(ws);

    assert.equal(response.type, 'error');
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

describe('origin allowlist', () => {
  let originServer;
  let originWss;
  let originUrl;

  beforeEach(async () => {
    originServer = createServer();
    originWss = createSignalingServer(originServer, { allowedOrigins: ['https://meet.example'] });
    await new Promise((resolve) => originServer.listen(0, resolve));
    originUrl = `ws://localhost:${originServer.address().port}`;
  });

  afterEach(async () => {
    originWss.clients.forEach((client) => client.terminate());
    await new Promise((resolve) => originWss.close(resolve));
    await new Promise((resolve) => originServer.close(resolve));
  });

  test('rejects a connection from another website', async () => {
    const ws = new WebSocket(originUrl, { origin: 'https://evil.example' });
    const result = await new Promise((resolve) => {
      ws.on('open', () => resolve('open'));
      ws.on('error', () => resolve('rejected'));
    });
    assert.equal(result, 'rejected');
  });

  test('accepts a connection from the allowed origin', async () => {
    const ws = new WebSocket(originUrl, { origin: 'https://meet.example' });
    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });
    ws.close();
  });
});

describe('heartbeat', () => {
  test('a client that stops answering pings is removed from its room', async () => {
    const hbServer = createServer();
    const hbWss = createSignalingServer(hbServer, { roomGraceMs: ROOM_GRACE_MS, heartbeatIntervalMs: 50 });
    await new Promise((resolve) => hbServer.listen(0, resolve));
    const url = `ws://localhost:${hbServer.address().port}`;

    const owner = new WebSocket(url);
    const dead = new WebSocket(url, { autoPong: false });
    await Promise.all([owner, dead].map((ws) => new Promise((resolve) => ws.on('open', resolve))));

    const ownerInbox = [];
    owner.on('message', (raw) => ownerInbox.push(JSON.parse(raw)));
    owner.send(JSON.stringify({ type: 'create-room', name: 'Owner' }));
    await wait(30);
    const created = ownerInbox.shift();

    const deadInbox = [];
    dead.on('message', (raw) => deadInbox.push(JSON.parse(raw)));
    dead.send(JSON.stringify({ type: 'join-request', roomId: created.roomId, name: 'Dead' }));
    await wait(30);
    const request = ownerInbox.shift();
    owner.send(JSON.stringify({ type: 'admit-response', requestId: request.requestId, admitted: true }));
    await wait(30);
    assert.equal(hbWss.rooms.get(created.roomId).size, 2);

    await wait(200);
    assert.equal(hbWss.rooms.get(created.roomId).size, 1);
    assert.ok(ownerInbox.some((m) => m.type === 'peer-left'));

    owner.terminate();
    await new Promise((resolve) => hbWss.close(resolve));
    await new Promise((resolve) => hbServer.close(resolve));
  });
});

describe('ice servers', () => {
  test('TURN credentials are short-lived HMACs, never the shared secret', async () => {
    const turnServer = createServer();
    const turnWss = createSignalingServer(turnServer, {
      turn: { urls: ['turn:turn.example:3478'], secret: 'shared-secret', ttlSeconds: 600 },
    });
    await new Promise((resolve) => turnServer.listen(0, resolve));

    const ws = new WebSocket(`ws://localhost:${turnServer.address().port}`);
    await new Promise((resolve) => ws.on('open', resolve));
    ws.send(JSON.stringify({ type: 'create-room', name: 'Owner' }));
    const created = await new Promise((resolve) => ws.on('message', (raw) => resolve(JSON.parse(raw))));

    const turnEntry = created.iceServers.find((server) => String(server.urls).includes('turn:'));
    assert.ok(turnEntry);
    const expiry = Number(turnEntry.username.split(':')[0]);
    assert.ok(expiry > Date.now() / 1000 && expiry <= Date.now() / 1000 + 601);
    assert.notEqual(turnEntry.credential, 'shared-secret');

    ws.terminate();
    await new Promise((resolve) => turnWss.close(resolve));
    await new Promise((resolve) => turnServer.close(resolve));
  });
});

describe('invite tokens', () => {
  test('create-invite returns a token for a room member', async () => {
    const { ws, created } = await createRoom('Owner');
    send(ws, { type: 'create-invite', roomId: created.roomId });
    const res = await nextMessage(ws);

    assert.equal(res.type, 'invite-created');
    assert.equal(res.roomId, created.roomId);
    assert.match(res.token, /^[0-9a-f-]{36}$/); // uuid v4
  });

  test('asking again returns the same token instead of creating new ones', async () => {
    const { ws, created } = await createRoom('Owner');
    send(ws, { type: 'create-invite', roomId: created.roomId });
    const first = await nextMessage(ws);
    send(ws, { type: 'create-invite', roomId: created.roomId });
    const second = await nextMessage(ws);

    assert.equal(first.token, second.token);
  });

  test('create-invite fails if client is not in that room', async () => {
    const { ws } = await createRoom('Owner');
    send(ws, { type: 'create-invite', roomId: 'fake-room' });
    const res = await nextMessage(ws);

    assert.equal(res.type, 'error');
    assert.match(res.message, /not in that room/i);
  });

  test('resolve-invite returns the roomId', async () => {
    const { ws: ownerWs, created } = await createRoom('Owner');
    send(ownerWs, { type: 'create-invite', roomId: created.roomId });
    const inv = await nextMessage(ownerWs);

    const guestWs = await connect();
    send(guestWs, { type: 'resolve-invite', token: inv.token });
    const res = await nextMessage(guestWs);

    assert.equal(res.type, 'invite-resolved');
    assert.equal(res.roomId, created.roomId);
  });

  test('resolve-invite fails with invalid token', async () => {
    const ws = await connect();
    send(ws, { type: 'resolve-invite', token: 'non-existent-token' });
    const res = await nextMessage(ws);

    assert.equal(res.type, 'error');
    assert.match(res.message, /invalid or expired invite link/i);
  });
});

describe('waiting room and admit system', () => {
  test('join-request puts guest in pending and notifies owner', async () => {
    const { ws: ownerWs, created } = await createRoom('Owner');

    const guestWs = await connect();
    send(guestWs, { type: 'join-request', roomId: created.roomId, name: 'Guest' });

    const guestRes = await nextMessage(guestWs);
    assert.equal(guestRes.type, 'waiting');
    assert.ok(guestRes.requestId);

    const ownerRes = await nextMessage(ownerWs);
    assert.equal(ownerRes.type, 'admit-request');
    assert.equal(ownerRes.requestId, guestRes.requestId);
    assert.equal(ownerRes.name, 'Guest');
    assert.ok(ownerRes.clientId);
  });

  test('admit-response admitted:true joins the guest to room', async () => {
    const { ws: ownerWs, created } = await createRoom('Owner');

    const guestWs = await connect();
    send(guestWs, { type: 'join-request', roomId: created.roomId, name: 'Guest' });

    const { requestId } = await nextMessage(guestWs);
    await nextMessage(ownerWs); // drain admit-request

    // Owner accepts
    send(ownerWs, { type: 'admit-response', requestId, admitted: true });

    // Guest receives existing-peers
    const guestPeers = await nextMessage(guestWs);
    assert.equal(guestPeers.type, 'existing-peers');
    assert.equal(guestPeers.roomId, created.roomId);
    assert.equal(guestPeers.name, 'Guest');
    assert.equal(guestPeers.peers.length, 1);
    assert.equal(guestPeers.peers[0].name, 'Owner');

    // Owner receives peer-joined
    const ownerPeerJoined = await nextMessage(ownerWs);
    assert.equal(ownerPeerJoined.type, 'peer-joined');
    assert.equal(ownerPeerJoined.name, 'Guest');
  });

  test('admit-response admitted:false rejects the guest', async () => {
    const { ws: ownerWs, created } = await createRoom('Owner');

    const guestWs = await connect();
    send(guestWs, { type: 'join-request', roomId: created.roomId, name: 'Guest' });

    const { requestId } = await nextMessage(guestWs);
    await nextMessage(ownerWs); // drain admit-request

    // Owner rejects
    send(ownerWs, { type: 'admit-response', requestId, admitted: false });

    const guestRes = await nextMessage(guestWs);
    assert.equal(guestRes.type, 'join-rejected');
    assert.match(guestRes.reason, /declined/i);
  });

  test('cancel-join-request removes pending request and notifies owner', async () => {
    const { ws: ownerWs, created } = await createRoom('Owner');

    const guestWs = await connect();
    send(guestWs, { type: 'join-request', roomId: created.roomId, name: 'Guest' });

    const { requestId } = await nextMessage(guestWs);
    await nextMessage(ownerWs); // drain admit-request

    // Guest cancels
    send(guestWs, { type: 'cancel-join-request', requestId });

    const ownerRes = await nextMessage(ownerWs);
    assert.equal(ownerRes.type, 'admit-request-cancelled');
    assert.equal(ownerRes.requestId, requestId);
  });

  test('guest disconnecting while waiting notifies owner', async () => {
    const { ws: ownerWs, created } = await createRoom('Owner');

    const guestWs = await connect();
    send(guestWs, { type: 'join-request', roomId: created.roomId, name: 'Guest' });

    const { requestId } = await nextMessage(guestWs);
    await nextMessage(ownerWs); // drain admit-request

    // Guest closes socket
    guestWs.terminate();

    const ownerRes = await nextMessage(ownerWs);
    assert.equal(ownerRes.type, 'admit-request-cancelled');
    assert.equal(ownerRes.requestId, requestId);
  });

  test('owner leaving rejects pending guests and promotes next member', async () => {
    const { ws: ownerWs, created } = await createRoom('Owner');
    // Add second member directly via joinRoom
    const { ws: member2Ws } = await joinRoom(created.roomId, 'Member2', [ownerWs]);

    const guestWs = await connect();
    send(guestWs, { type: 'join-request', roomId: created.roomId, name: 'Guest' });
    await nextMessage(guestWs); // waiting
    await nextMessage(ownerWs); // admit-request

    // Owner leaves
    send(ownerWs, { type: 'leave-room' });

    // Guest is rejected
    const guestRes = await nextMessage(guestWs);
    assert.equal(guestRes.type, 'join-rejected');
    assert.match(guestRes.reason, /host left/i);

    // Member2 gets peer-left and owner-changed
    const msg1 = await nextMessage(member2Ws);
    const msg2 = await nextMessage(member2Ws);
    const messages = [msg1, msg2];
    const peerLeft = messages.find((m) => m.type === 'peer-left');
    const ownerChanged = messages.find((m) => m.type === 'owner-changed');

    assert.ok(peerLeft);
    assert.ok(ownerChanged);
  });

  test('a second join-request replaces the first, so a disconnected guest can never be admitted', async () => {
    const { ws: ownerWs, created } = await createRoom('Owner');

    const guestWs = await connect();
    send(guestWs, { type: 'join-request', roomId: created.roomId, name: 'Guest' });
    send(guestWs, { type: 'join-request', roomId: created.roomId, name: 'Guest' });
    await nextMessage(guestWs);
    const second = await nextMessage(guestWs);

    const first = await nextMessage(ownerWs);
    const cancelled = await nextMessage(ownerWs);
    await nextMessage(ownerWs); // second admit-request
    assert.equal(cancelled.type, 'admit-request-cancelled');
    assert.equal(cancelled.requestId, first.requestId);

    guestWs.terminate();
    await wait(50);
    send(ownerWs, { type: 'admit-response', requestId: second.requestId, admitted: true });
    send(ownerWs, { type: 'admit-response', requestId: first.requestId, admitted: true });
    await wait(50);

    assert.equal(wss.rooms.get(created.roomId).size, 1);
  });

  test('only the owner can admit', async () => {
    const { ws: ownerWs, created } = await createRoom('Owner');
    const { ws: memberWs } = await joinRoom(created.roomId, 'Member', [ownerWs]);

    const guestWs = await connect();
    send(guestWs, { type: 'join-request', roomId: created.roomId, name: 'Guest' });
    const { requestId } = await nextMessage(guestWs);
    await nextMessage(ownerWs); // admit-request

    send(memberWs, { type: 'admit-response', requestId, admitted: true });
    await wait(50);

    assert.equal(guestWs.inbox.length, 0);
    assert.equal(wss.rooms.get(created.roomId).size, 2);
  });
});
