# WebSocket Message Contract

This is the frozen list of every message our WebSocket signaling server
sends or receives. Nothing on the frontend gets built against a message
shape that isn't written here first. If a shape needs to change later,
it changes here first, then in the code.

Design note: `create-room` and `join-room` are two separate message
types (not one, unlike the original draft), because a room creator and
a room joiner are different actions from the client's point of view,
even though the server ends up doing similar work for both. Room
deletion / host controls are explicitly skipped for now — a room just
stops existing once its member Map is empty, no explicit action needed.

---

## 1. `create-room`

**Direction:** Browser → Server

**When:** User clicks "Create Room" on the landing page.

**Payload:**
```json
{ "type": "create-room", "name": "Bekmurod" }
```
`name` is the display name the user typed in the lobby. The server still
invents the room code and the client's ID — the browser only supplies the
name. The server trims it, caps it at 24 characters, and falls back to
"Guest" if it's empty, so no client can inject an oversized or blank name.

**Server behavior:** Generates a new unique `roomId`, generates a new
unique `clientId` for this connection, creates an entry for the room in
`Map<roomId, Map<clientId, ws>>`, adds this client as its only member.
Responds with `room-created` (see below).

---

## 2. `room-created`

**Direction:** Server → the client who just created the room

**When:** Immediately after handling `create-room`.

**Payload:**
```json
{
  "type": "room-created",
  "roomId": "x7k2p9",
  "clientId": "c-1a2b3c",
  "name": "Bekmurod",
  "isOwner": true,
  "ownerId": "c-1a2b3c",
  "rejoinToken": "5b0c…",
  "iceServers": [{ "urls": ["stun:stun.l.google.com:19302"] }]
}
```
`name` is echoed back as the server actually stored it (after trimming and
capping), so the client displays the same value everyone else sees.

`roomId` is 6 characters from `a-z0-9` (~2.2 billion codes), never reused
while a room with that code still exists.

`rejoinToken` is single-use proof that this browser is already a member.
The client stores it with the session so a page reload can come straight
back in with `join-room` (see below) instead of asking the host again.

`iceServers` goes straight into `new RTCPeerConnection({ iceServers })`.
If the server has a TURN server configured, it includes short-lived TURN
credentials made for this client.

**Browser behavior:** Displays the `roomId` to the user so they can
share it, and stores its own `clientId` for use in all future messages
(it needs to know its own ID to make sense of who peers are).

---

## 3. `join-room` (rejoin)

**Direction:** Browser → Server

**When:** The page reloads (or the socket reconnects) while the user was in
a room. A first-time join never uses this - it goes through `join-request`.

**Payload:**
```json
{ "type": "join-room", "roomId": "x7k2p9", "name": "Aziz", "rejoinToken": "5b0c…" }
```

**Server behavior:** Accepted only if `rejoinToken` was issued for this
`roomId` and hasn't been used yet. Otherwise:
- unknown room → `{ "type": "error", "message": "Room does not exist" }`
- missing/wrong token → `{ "type": "error", "message": "Ask the host to let you in" }`
- full → `{ "type": "error", "message": "Room is full" }`

On success the old token is spent, a new one is issued, and the server:
- Sends `existing-peers` back to this client only.
- Sends `peer-joined` to every client already in the room.

If the room was empty (everyone reloaded within the grace period), the
first person back becomes its owner, so join requests always have someone
to go to.

---

## 4. `existing-peers`

**Direction:** Server → the client who just joined (create or join
path — whoever just got added to the room)

**When:** Right after that client is added to the room.

**Payload:**
```json
{
  "type": "existing-peers",
  "roomId": "X7K2P9",
  "clientId": "c-9f8e7d",
  "name": "Aziz",
  "peers": [
    { "clientId": "c-1a2b3c", "name": "Bekmurod" },
    { "clientId": "c-4d5e6f", "name": "Kamila" }
  ],
  "ownerId": "c-1a2b3c",
  "rejoinToken": "9e1f…",
  "iceServers": [{ "urls": ["stun:stun.l.google.com:19302"] }],
  "chatHistory": [
    { "from": "c-9f8e7d", "fromName": "Aziz", "text": "hey, can everyone hear me?" },
    { "from": "c-1a2b3c", "fromName": "Bekmurod", "text": "yes, loud and clear" }
  ]
}
```
`ownerId`, `rejoinToken` and `iceServers` mean the same as in `room-created`.

`chatHistory` is the room's most recent chat (at most 200 messages, kept in
memory until the room is deleted). It is filled only when the client came
back through `join-room` with a rejoin token (a reload or reconnect); a guest
admitted through the waiting room gets an empty list, so people never see
what was said before they arrived. The returning client's own earlier
messages carry its new `clientId` in `from`, so they still show as theirs.
`clientId` and `name` here are the new client's own (same purpose as in
`room-created` — for `join-room` this is where they first learn them,
since `join-room` itself doesn't return them directly). `roomId` is echoed
so the client doesn't have to remember what it asked to join.

`peers` is a list of objects rather than bare ID strings, because the UI
labels every video tile with a name and would otherwise have no way to
map an ID to a person.

**Browser behavior:** For each ID in `peers`, this client will initiate
a WebRTC `offer` (see below) — this is what kicks off the mesh
connections for a new joiner.

---

## 5. `peer-joined`

**Direction:** Server → everyone already in the room (not the new
client — they get `existing-peers` instead)

**When:** Same moment as `existing-peers`, right after someone joins.

**Payload:**
```json
{ "type": "peer-joined", "clientId": "c-9f8e7d", "name": "Aziz" }
```

**Browser behavior:** Adds a placeholder video tile for this new peer
and prepares to receive a WebRTC `offer` from them (does NOT initiate
one itself — only the new joiner initiates, per R3 in the requirements
doc, to avoid both sides sending offers at once).

---

## 6. `peer-left`

**Direction:** Server → everyone remaining in the room

**When:** A client's WebSocket connection closes (tab closed, browser
crashed, network drop).

**Payload:**
```json
{ "type": "peer-left", "clientId": "c-9f8e7d" }
```

**Server behavior:** Removes this `clientId` from the room's member
Map. If the room is now empty, removes the room entirely.

**Browser behavior:** Removes that peer's video tile and closes the
corresponding `RTCPeerConnection`.

---

## 7. `offer` / `answer` / `ice-candidate`

**Direction:** Browser → Server → forwarded to exactly one other
browser. The server does not read or modify `payload` — pure relay.

**When:**
- `offer` — sent by a newly-joined client to each peer in the
  `existing-peers` list it received, to start a direct connection.
- `answer` — sent by a peer in response to receiving an `offer`.
- `ice-candidate` — sent by either side, potentially many times, as
  each browser discovers possible network paths to the other.

**Payload:**
```json
{
  "type": "offer",
  "targetId": "c-1a2b3c",
  "senderId": "c-9f8e7d",
  "payload": { "...": "SDP or ICE candidate data" }
}
```

**Server behavior:** Looks up `targetId` in the sender's current room and
forwards `{ type, targetId, senderId, payload }` to that client only - any
other fields are dropped, `senderId` is always set by the server, and a
`payload` that isn't a JSON object is dropped.

**Browser behavior:** Feeds `payload` into the matching
`RTCPeerConnection` (matched via `senderId`), which drives the WebRTC
connection toward becoming live audio/video.

---

## 8. `media-state`

**Direction:** Browser → Server → broadcast to every other client in the
same room

**When:** Someone turns their camera or microphone on or off, and also
right after joining and whenever a new peer joins (so the newcomer and
the existing members learn each other's current state).

**Payload:**
```json
{
  "type": "media-state",
  "from": "c-9f8e7d",
  "cameraOn": false,
  "micOn": true,
  "screenSharing": true,
  "cameraStreamId": "a1b2…",
  "screenStreamId": "c3d4…"
}
```
`from` is stamped by the server, like `chat-message`.

`cameraStreamId` / `screenStreamId` are the ids of the MediaStreams the
sender attached to its transceivers (camera + mic share one, screen has its
own). Stream ids travel through SDP (`a=msid`) unchanged, so the receiver
matches `event.streams[0].id` in `ontrack` against them to know which tile a
track belongs to. (Track ids are *not* preserved between browsers, which is
why they can't be used for this.) Strings over 64 characters become `null`.

**Why this exists:** turning a camera off stops the media, but the
receiving `<video>` element keeps painting the last frame it got, so the
peer appears frozen rather than gone. There is no reliable "camera is
off" signal in the media itself, so it is sent explicitly and the UI
shows a placeholder instead.

---

## 9. `leave-room`

**Direction:** Browser → Server

**When:** The user clicks the leave/hang-up button.

**Payload:**
```json
{ "type": "leave-room" }
```

**Server behavior:** Same cleanup as a disconnect — removes the client
from the room's Map, notifies remaining members with `peer-left`, deletes
the room if now empty. Unlike a disconnect, the WebSocket connection
itself stays open, so this same client can immediately `create-room` or
`join-room` again without reloading the page.

---

## 10. `chat-message`

**Direction:** Browser → Server → broadcast to every other client in
the same room

**When:** User sends a text message.

**Payload:**
```json
{ "type": "chat-message", "from": "c-9f8e7d", "fromName": "Aziz", "text": "hey, can everyone hear me?" }
```
No `targetId` — unlike offer/answer/ICE, chat is one-to-everyone in the
room, not one-to-one. `from` and `fromName` are both filled in by the
server from the sending connection, never trusted from the client.

**Server behavior:** Looks up the sender's room, sends this message to
every other member's connection. `text` must be a string; it is trimmed and
capped at 500 characters, and an empty or non-string `text` is dropped.

**Browser behavior:** Appends the message to the visible chat log.

---

## 11. `create-invite` & `invite-created`

**Direction:** Browser → Server, then Server → Browser

**When:** Room member requests a shareable invite link (UUID v4 token).
A room has one invite token; asking again returns the same one. It stops
working when the room is deleted.

**Browser payload:**
```json
{ "type": "create-invite", "roomId": "X7K2P9" }
```

**Server response:**
```json
{ "type": "invite-created", "token": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d", "roomId": "X7K2P9" }
```

---

## 12. `resolve-invite` & `invite-resolved`

**Direction:** Browser → Server, then Server → Browser

**When:** Guest opens an invite link `/join/:token` and looks up the room code.

**Browser payload:**
```json
{ "type": "resolve-invite", "token": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d" }
```

**Server response:**
```json
{ "type": "invite-resolved", "roomId": "X7K2P9" }
```
If invalid or expired, returns `{ "type": "error", "message": "Invalid or expired invite link" }`.

---

## 13. `join-request` & `waiting` & `admit-request`

**Direction:** Guest → Server → Owner

**When:** Guest requests to enter the room. Instead of joining immediately, they are held in a waiting state until admitted.

**Guest payload:**
```json
{ "type": "join-request", "roomId": "X7K2P9", "name": "Aziz" }
```

**Server → Guest response:**
```json
{ "type": "waiting", "requestId": "req-uuid-1234" }
```

**Server → Owner notification:**
```json
{ "type": "admit-request", "requestId": "req-uuid-1234", "name": "Aziz", "clientId": "c-9f8e7d" }
```

A connection has at most one open request: a second `join-request`
cancels the first (the owner gets `admit-request-cancelled` for it).
Errors: `Room does not exist`, `Room is full`, `The host is not in the room
right now`, and `Too many attempts. Please wait a minute and try again.`
(after 20 failed lookups from one IP within a minute).

---

## 14. `admit-response`

**Direction:** Owner → Server

**When:** Owner clicks "Admit" or "Decline" in the admit panel.

**Payload:**
```json
{ "type": "admit-response", "requestId": "req-uuid-1234", "admitted": true }
```

**Server behavior:** Ignored unless the sender is the room's current
owner and the guest is still connected.
- If `admitted: true`: Guest receives `existing-peers` and room members receive `peer-joined`.
- If `admitted: false`: Guest receives `{ "type": "join-rejected", "reason": "The host declined your request" }`.

---

## 15. `cancel-join-request` & `admit-request-cancelled`

**Direction:** Guest → Server, Server → Owner

**When:** Guest clicks cancel while waiting, or disconnects.

**Guest payload:**
```json
{ "type": "cancel-join-request", "requestId": "req-uuid-1234" }
```

**Server → Owner notification:**
```json
{ "type": "admit-request-cancelled", "requestId": "req-uuid-1234" }
```

---

## 16. `owner-changed`

**Direction:** Server → Room members

**When:** The room creator/owner leaves, the server designates the next member as owner.

**Payload:**
```json
{ "type": "owner-changed", "newOwnerId": "c-4d5e6f" }
```

---

## Server limits

- Messages over 64 KB close the connection (code 1009).
- Each connection may send a burst of 200 messages, refilled at 50/second;
  anything beyond that is dropped.
- The server pings every 30 s; a connection that misses a ping is closed,
  which runs the normal `peer-left` cleanup.
- If `ALLOWED_ORIGINS` is set, a WebSocket from any other origin is refused
  during the handshake (HTTP 401).
- Room full / room doesn't exist / wrong rejoin token are all answered with
  `{ "type": "error", "message": "..." }`.
