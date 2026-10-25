import { existsSync, globSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { createSignalingServer } from './signaling.js';

// Load environment variables from .env if present
if (typeof process.loadEnvFile === 'function') {
  const envCandidates = [
    '.env',
    fileURLToPath(new URL('./.env', import.meta.url)),
    fileURLToPath(new URL('../.env', import.meta.url)),
  ];
  for (const candidate of envCandidates) {
    if (existsSync(candidate)) {
      try {
        process.loadEnvFile(candidate);
        break;
      } catch {
        // Continue to next candidate
      }
    }
  }
}

const pageHandler = (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/health' || url.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'meet-me signaling' }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Signaling server OK');
};

// Same mkcert certificate the client dev server uses, so the browser trusts
// both - needed because a page loaded over https can't open a plain ws://
// connection (browsers block it as mixed content), it must be wss://. The
// cert is gitignored and tied to one machine's LAN IP, so it's optional: a
// plain http server on localhost is still a secure context for getUserMedia,
// which is what this falls back to (used by the test suite and anyone who
// hasn't generated a cert).
const certDir = fileURLToPath(new URL('../client/certs/', import.meta.url));
const keyName = existsSync(certDir) ? globSync('*-key.pem', { cwd: certDir })[0] : undefined;
const certName = keyName?.replace(/-key\.pem$/, '.pem');
// E2E forces plain http/ws even when a cert exists - see the matching note
// in client/vite.config.js.
const useHttps = !process.env.E2E && Boolean(keyName && certName && existsSync(certDir + certName));

const server = useHttps
  ? createHttpsServer(
      { key: readFileSync(certDir + keyName), cert: readFileSync(certDir + certName) },
      pageHandler,
    )
  : createHttpServer(pageHandler);

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;
const roomGraceMs = process.env.ROOM_GRACE_MS ? Number(process.env.ROOM_GRACE_MS) : undefined;
const list = (value) => (value ?? '').split(',').map((item) => item.trim()).filter(Boolean);

// Comma-separated, e.g. "https://meet-me.bekmurod.uz". Empty = any origin
// (fine for local dev; set it in production).
const allowedOrigins = list(process.env.ALLOWED_ORIGINS);

// Behind nginx every connection comes from 127.0.0.1, so the per-IP limits
// need the X-Forwarded-For header nginx adds. Only trust it when a proxy
// you control sets it.
const trustProxy = process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true';

const stunUrls = process.env.STUN_URLS ? list(process.env.STUN_URLS) : undefined;
const turnUrls = list(process.env.TURN_URLS);
const turn =
  turnUrls.length > 0 && process.env.TURN_SECRET
    ? {
        urls: turnUrls,
        secret: process.env.TURN_SECRET,
        ttlSeconds: process.env.TURN_TTL_SECONDS ? Number(process.env.TURN_TTL_SECONDS) : 3600,
      }
    : null;

createSignalingServer(server, {
  ...(roomGraceMs ? { roomGraceMs } : {}),
  ...(stunUrls ? { stunUrls } : {}),
  allowedOrigins,
  trustProxy,
  turn,
});

server.listen(PORT, () => {
  console.log(`Server is running on ${useHttps ? 'wss' : 'ws'}://localhost:${PORT}`);
  if (allowedOrigins.length > 0) console.log(`Allowed origins: ${allowedOrigins.join(', ')}`);
  if (turn) console.log(`TURN enabled: ${turn.urls.join(', ')}`);
});
