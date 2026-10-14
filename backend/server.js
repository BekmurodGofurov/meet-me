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
const secretKey = process.env.SECRET_KEY || undefined;
const roomGraceMs = process.env.ROOM_GRACE_MS ? Number(process.env.ROOM_GRACE_MS) : undefined;

createSignalingServer(server, {
  ...(roomGraceMs ? { roomGraceMs } : {}),
  ...(secretKey ? { secretKey } : {}),
});

server.listen(PORT, () => {
  console.log(`Server is running on ${useHttps ? 'wss' : 'ws'}://localhost:${PORT}`);
  if (secretKey) {
    console.log('Secret key authentication is enabled');
  }
});
