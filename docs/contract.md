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
{ "type": "room-created", "roomId": "X7K2P9", "clientId": "c-1a2b3c", "name": "Bekmurod" }
```
`name` is echoed back as the server actually stored it (after trimming and
capping), so the client displays the same value everyone else sees.

**Browser behavior:** Displays the `roomId` to the user so they can
share it, and stores its own `clientId` for use in all future messages
(it needs to know its own ID to make sense of who peers are).

---

## 3. `join-room`

**Direction:** Browser → Server

**When:** User types in a room code and clicks "Join Room".

**Payload:**
```json
{ "type": "join-room", "roomId": "X7K2P9", "name": "Aziz" }
```

**Server behavior:** Looks up `roomId` in the Map. If it doesn't exist,
or already has 6 members, this fails (see "Open question" below).
Otherwise: generates a new `clientId` for this connection, adds it to
the room's member Map, then:
- Sends `existing-peers` back to this new client only.
- Sends `peer-joined` to every client already in the room.

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
  ]
}
```
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

**Server behavior:** Looks up `targetId` in the current room's member
Map, forwards the entire message to that client's connection only.

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
{ "type": "media-state", "from": "c-9f8e7d", "cameraOn": false, "micOn": true }
```
`from` is stamped by the server, like `chat-message`.

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
every other member's connection.

**Browser behavior:** Appends the message to the visible chat log.

---

## Open questions (things not decided yet — revisit before/while coding)

- **Room full / room doesn't exist:** what does the server send back to
  someone who tries to `join-room` with a bad or full room code? Not
  needed for Day 1 (a happy-path join is enough to start), but needs an
  answer before Day 3-4 testing with real users. Candidate: a
  `join-error` message with a `reason` field.
- **Where does a `clientId` come from, exactly?** Decided: server
  generates it per connection (not per message), the moment a
  WebSocket connection opens — before `create-room`/`join-room` even
  arrives. Needs to be implemented as step 1 of the server's
  `connection` handler.
