import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    https: {
      key: readFileSync('./certs/192.168.1.3+1-key.pem'),
      cert: readFileSync('./certs/192.168.1.3+1.pem'),
    },
  },
})
