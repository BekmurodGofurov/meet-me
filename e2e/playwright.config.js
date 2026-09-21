import { defineConfig, devices } from '@playwright/test'

const FRONTEND_PORT = 5183
const BACKEND_PORT = 8080

export default defineConfig({
  testDir: './tests',
  // The backend keeps room state in memory and tests share that one server -
  // running them one at a time keeps room codes and participant counts
  // predictable instead of racing against other tests' rooms.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  // 'github' turns failures into inline PR annotations; the html report is
  // what CI uploads as an artifact so a failure can actually be inspected
  // (traces, screenshots) after the fact, not just read as a stack trace.
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',

  use: {
    baseURL: `http://localhost:${FRONTEND_PORT}`,
    trace: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Fake devices give every context a real (synthetic) video/audio
        // track without needing actual hardware; fake-ui auto-grants the
        // permission prompt instead of it hanging forever waiting for a
        // human to click "Allow".
        launchOptions: {
          args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
        },
      },
    },
  ],

  webServer: [
    {
      command: 'node ../backend/server.js',
      port: BACKEND_PORT,
      reuseExistingServer: !process.env.CI,
      // Short so the "genuinely stale room" test doesn't need to wait out
      // the real 10s production grace period - the tests know this value.
      env: { E2E: '1', ROOM_GRACE_MS: '1500' },
    },
    {
      command: `npm run dev -- --port ${FRONTEND_PORT}`,
      cwd: '../client',
      port: FRONTEND_PORT,
      reuseExistingServer: !process.env.CI,
      env: { E2E: '1' },
    },
  ],
})
