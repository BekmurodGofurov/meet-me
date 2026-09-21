import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Deliberately separate from vite.config.js: that file reads the mkcert
// certificate files to serve https in dev, which are gitignored and tied to
// one machine's IP - sharing it here would make tests fail on any other
// machine (or a fresh clone) that hasn't generated those certs.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    globals: true,
  },
})
