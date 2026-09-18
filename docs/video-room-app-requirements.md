# Video Room App — Project Requirements

**Duration:** 1 week
**Team:** 1 engineer (you)
**Goal:** Ship a working service, similar in spirit to Google Meet / Zoom / Microsoft Teams, where a user can create a room, share a room code, and 3–6 people can join, see/hear each other live, and chat via text in real time.

**The real goal:** learn WebSocket signaling and WebRTC peer connections properly, and end the week with a system you understand end to end, not one you copy-pasted.

---

## 1. Why this project

You are doing this specifically to learn WebSocket-based signaling and WebRTC. The point is not the UI. The point is understanding: how two browsers that have never met agree to send video to each other, why a server is required at all if the video itself never touches it, and what happens when a room has more than two people.

Permissions (mic/camera OS-level permission prompts, room passwords, admin/kick controls, etc.) are explicitly **out of scope** for this week. Don't think about them now.

---

## 2. What we're building

A person opens the app, creates a room, gets a room code/link. Up to 5 more people (6 total) join using that code. Everyone in the room sees and hears everyone else, and can send text messages that everyone in the room sees instantly.

```
                    ┌───────────────────────┐
   browser A  ─────►│                       │
   browser B  ─────►│   signaling-service   │◄───── browser C
   browser C  ─────►│   (WebSocket, Node)   │
                    └───────────┬───────────┘
                                │  offer / answer / ICE / chat text
                                │  (small JSON messages only)
                                ▼
                    every browser holds a direct
                    RTCPeerConnection to every
                    other browser in the room
                    (video + audio, mesh topology)
```

One service. One process. No queue, no separate database service, no cache service. Section 3 explains why.

---

## 3. Services — what you actually need

You asked: nechta service bo'ladi, Docker bilan alohida-alohida qilamizmi, DB kerakmi, cache kerakmi. Javob barchasiga: **yo'q, bitta service yetadi.**

| Thing | Do you need it this week? | Why |
|---|---|---|
| A second/third backend service | **No** | There is only one job: pass small JSON signaling messages between browsers in the same room. Splitting that into multiple services adds network hops and deployment complexity with zero benefit at this scale. |
| A database (Postgres/Mongo/etc.) | **No** | Rooms and their member lists live in memory (a `Map` in the Node process), because a room only needs to exist while people are in it. Nothing needs to survive a server restart this week. |
| A cache (Redis/etc.) | **No** | Redis earns its place when you need state shared *across multiple server instances*, or state that must survive a restart. You are running one instance. An in-memory `Map` is your "cache" and it's free. |
| TURN server | **Not required, but be aware of it** | STUN (free, public) is enough for most home/office networks. Some networks (strict corporate NAT, some mobile carriers) block direct peer connections and need a TURN relay. Note it as a known limitation for this week; don't build it. |
| Docker | **Optional, one container is enough if you use it at all** | One service, one container. Multiple containers only make sense once you actually have multiple independently-deployed services. |

**The one thing you do need, that isn't a "service":** a static frontend (plain HTML/JS or a small React app) that the browser loads. That's not a backend service — it's just files served to the browser, and it can even be served by the same Node process for this week.

**If, later, this grows past a week:** that's when a room registry might move to Redis (so you can run more than one signaling server behind a load balancer) and chat history might move to Postgres (so messages survive a refresh). Neither is a day-1 problem. Don't build for a scale you don't have yet.

---

## 4. Rules for this week

**R1 — Signaling and media are different layers. Never confuse them.** The signaling-service only ever sees small JSON messages (join, offer, answer, ice-candidate, chat-message). It must never see raw video/audio bytes — those go peer-to-peer.

**R2 — Contract frozen before UI work starts.** Decide the WebSocket message shapes (see Section 7) on day 1, before writing any frontend code against them.

**R3 — Mesh topology only, and only because the room cap is 6.** Every browser opens a direct connection to every other browser. At 6 people that's 15 total connections across the room, 5 per browser — acceptable. If you ever raise the cap past ~6-8, mesh stops being viable and you'd need an SFU — that is explicitly not this week's problem.

**R4 — Chat text goes over the WebSocket, not a WebRTC DataChannel.** Simpler to build, simpler to reason about, and the server is already open for signaling anyway. Revisit only if you specifically want to practice DataChannels.

**R5 — No permission/auth work.** No login, no room passwords, no host controls. A room code is the only gate. This is intentional descoping, not an oversight.

---

## 5. Day-by-day plan (7 days)

| Day | Focus | Done when |
|---|---|---|
| **1** | Node + `ws` signaling server skeleton. Message contract written down (Section 7). Room join/leave logic with an in-memory `Map<roomId, Map<clientId, ws>>`. | A client can connect, join a room by code, and see a console log on the server confirming it. |
| **2** | Frontend: `getUserMedia()` to grab camera/mic, show your own video tile. Wire the WebSocket connection and room-join UI (create room / join by code). | You can see your own camera feed in the browser after joining a room. |
| **3** | WebRTC handshake for exactly 2 people: offer/answer/ICE exchange through the signaling server, `RTCPeerConnection` on both sides. | Two browser tabs in the same room see and hear each other. |
| **4** | Extend to mesh for 3+ people: new joiner initiates offers to everyone already in the room; existing members respond. | Open 3-4 tabs, everyone sees everyone. |
| **5** | Text chat over WebSocket, broadcast to the room. Basic UI: message list + input box. | Typing in one tab appears live in all other tabs in the room. |
| **6** | Handle disconnects cleanly: when someone leaves/closes the tab, remove their video tile everywhere and close the corresponding peer connections. Test on a flaky network (throttle in devtools). | Closing a tab doesn't freeze or crash the other participants' view. |
| **7** | Polish + a plain README of what you learned: what signaling is, why mesh doesn't scale past ~6, what STUN/TURN each do. | You can explain the whole flow out loud without looking at the code. |

---

## 6. Definition of done

- [ ] A room can be created and joined by code
- [ ] 3–6 people in the same room see and hear each other live
- [ ] Text chat works and is visible to everyone in the room in real time
- [ ] Leaving/closing a tab doesn't break the session for others
- [ ] You can explain, without notes: what a signaling server does, why video doesn't go through it, and what an ICE candidate is

**Never cut:** the signaling/media separation, and understanding *why* it works this way. If the week runs short, cut the polish (styling, reconnect-on-refresh, nicer chat UI) — never cut the concept.

---

## 7. Contract to freeze on day 1

WebSocket JSON message shapes, agreed before frontend work starts:

- `join-room` — client → server: `{ type, roomId, clientId }`
- `existing-peers` — server → new client: `{ type, peers: [clientId, ...] }`
- `peer-joined` — server → existing clients: `{ type, clientId }`
- `peer-left` — server → existing clients: `{ type, clientId }`
- `offer` / `answer` / `ice-candidate` — client → server → target client: `{ type, targetId, senderId, payload }`
- `chat-message` — client → server → everyone else in room: `{ type, from, text }`

---

## 8. If it slips

Cut in this order:
1. Chat text (video/audio is the core learning goal, ship that first)
2. Clean disconnect handling (accept a rough edge for the demo)
3. Any UI polish — a plain, ugly page that works beats a pretty one that doesn't
4. Room cap — drop from 6 to 2 (a working 1-to-1 call is still a complete, honest result)

**Never cut:** the signaling/WebRTC split itself. A 2-person video call you fully understand is a better outcome than a 6-person one that's copy-pasted and you can't explain.
