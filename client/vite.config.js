import { existsSync, globSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// mkcert certs are gitignored and tied to one machine's LAN IP - HTTPS is
// only enabled when they're actually present (needed for phone/LAN camera
// testing), not required to run the app at all. Plain http on localhost is
// still a secure context for getUserMedia, which is what E2E tests and
// anyone without generated certs get instead.
const certFiles = globSync('./certs/*-key.pem')
const keyPath = certFiles[0]
const certPath = keyPath?.replace(/-key\.pem$/, '.pem')
// E2E forces plain http even when certs exist - one less variable (self-signed
// cert trust) for automated browser tests to work around, and it costs
// nothing since getUserMedia treats localhost as secure either way.
const httpsAvailable = !process.env.E2E && keyPath && certPath && existsSync(certPath)

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const rootDir = path.resolve(__dirname, '..')
  const clientDir = __dirname
  const rootEnv = loadEnv(mode, rootDir, '')
  const clientEnv = loadEnv(mode, clientDir, '')
  const env = { ...rootEnv, ...clientEnv, ...process.env }

  let backendPort = env.BACKEND_PORT
  if (!backendPort && env.VITE_API_URL) {
    try {
      const parsed = new URL(env.VITE_API_URL)
      if (parsed.port) backendPort = parsed.port
    } catch {
      // ignore
    }
  }
  backendPort = backendPort || '8090'

  const backendTarget = env.BACKEND_TARGET || `ws://localhost:${backendPort}`

  return {
    plugins: [react()],
    server: {
      host: true,
      // Mirrors what production nginx does: proxy the same-origin /ws path to
      // the actual backend, so useRoom.js's WebSocket URL doesn't need to know
      // a port at all, in dev or production.
      proxy: {
        '/ws': {
          target: backendTarget,
          ws: true,
        },
      },
      ...(httpsAvailable && {
        https: {
          key: readFileSync(keyPath),
          cert: readFileSync(certPath),
        },
      }),
    },
  }
})
