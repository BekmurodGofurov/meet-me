# Installation & Local Setup Guide

This guide walks you through setting up, configuring, and running **Meet-Me** locally for development, testing, and production.

---

## Prerequisites

Before starting, ensure you have the following installed:

- **Node.js**: `>= 22.0.0` (Node 24 recommended)
- **npm**: `>= 10.0.0`
- **Docker & Docker Compose** *(optional, for containerized deployment)*
- **mkcert** *(optional, for testing camera/microphone on mobile devices over LAN)*

---

## 1. Clone the Repository

```bash
git clone https://github.com/BekmurodGofurov/meet-me.git
cd meet-me
```

---

## 2. Environment Configuration

Copy the template configuration file:

```bash
cp .env.example .env
```

Key environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8080` | Internal port the Node.js signaling service listens on |
| `BACKEND_PORT` | `8090` | Host port mapped by Docker Compose (`127.0.0.1:8090:8080`) |
| `SECRET_KEY` | `meet-me-secret-key-change-in-production` | Secret key for WebSocket signaling authorization |
| `ROOM_GRACE_MS` | `10000` | Room retention grace period (ms) when all peers leave |
| `VITE_WS_URL` | `/ws` | Signaling WebSocket URL (proxied by Vite in dev) |
| `VITE_API_URL` | `http://localhost:8080` | Backend API base URL |
| `VITE_SECRET_KEY` | `meet-me-secret-key-change-in-production` | Secret key sent by client during connection |

---

## 3. Install Dependencies

Install dependencies for backend, client, and end-to-end test suites:

```bash
# Backend dependencies
npm --prefix backend install

# Frontend dependencies
npm --prefix client install

# E2E dependencies (optional)
npm --prefix e2e install
```

---

## 4. Running in Development Mode

Run the signaling service and the frontend client concurrently in two separate terminal windows:

### Terminal 1 — Signaling Server (Backend)

```bash
npm --prefix backend start
```
*The signaling server starts listening on `ws://localhost:8080`.*

### Terminal 2 — Frontend Application (Client)

```bash
npm --prefix client run dev
```
*The Vite development server starts at `http://localhost:5173`.*

Open `http://localhost:5173` in two separate browser tabs or windows to test room creation, media streaming, screen sharing, and real-time chat.

---

## 5. Testing on Mobile & Local Network (LAN HTTPS)

Modern browsers restrict `navigator.mediaDevices.getUserMedia()` to **Secure Contexts** (`localhost` or `https://`). If you want to connect from a smartphone or another laptop on the same Wi-Fi network:

1. Install [`mkcert`](https://github.com/FiloSottile/mkcert):
   ```bash
   # macOS
   brew install mkcert
   mkcert -install

   # Linux
   sudo apt install libnss3-tools
   # install mkcert binary from GitHub releases
   mkcert -install
   ```

2. Generate certificates for your local LAN IP inside `client/certs/`:
   ```bash
   mkdir -p client/certs
   cd client/certs
   mkcert localhost 127.0.0.1 <YOUR_LAN_IP>
   cd ../..
   ```

3. Start the dev server normally. Vite and the backend server will automatically detect the certificates and serve over `https://` and `wss://`.

---

## 6. Docker Deployment

To run the signaling service in a containerized environment:

```bash
# Start container in detached mode
docker compose up -d --build

# View container logs
docker compose logs -f backend

# Stop container
docker compose down
```

---

## 7. Running Tests

Meet-Me includes automated test suites across all layers:

```bash
# Backend unit & integration tests (Node.js test runner)
npm --prefix backend test

# Frontend unit & component tests (Vitest)
npm --prefix client test

# Frontend ESLint check
npm --prefix client run lint

# Multi-browser WebRTC E2E tests (Playwright)
npm --prefix e2e test
```

---

## 8. Troubleshooting

- **Port 8080 already in use:** Change `PORT` in your `.env` file or terminate the process using `lsof -i :8080`.
- **Camera/Mic not working in browser:** Ensure you granted permissions in browser site settings. On non-localhost URLs, HTTPS is required by browser security policies.
- **WebSocket unauthorized error:** Ensure `VITE_SECRET_KEY` in `client/.env` matches `SECRET_KEY` in `backend/.env`.
