import { existsSync, globSync, readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

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
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    ...(httpsAvailable && {
      https: {
        key: readFileSync(keyPath),
        cert: readFileSync(certPath),
      },
    }),
  },
})
