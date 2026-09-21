import { expect, test } from '@playwright/test'
import { RoomPage } from './room-page.js'

// Matches ROOM_GRACE_MS set for the backend in playwright.config.js - kept
// short there specifically so these tests don't have to wait out the real
// 10s production grace period.
const ROOM_GRACE_MS = 1500

test('refreshing the page automatically rejoins the same room', async ({ page }) => {
  const room = new RoomPage(page)
  await room.open()
  await room.enterName('Bekmurod')
  const code = await room.createRoom()

  await page.reload()

  await expect(page.getByText(/rejoining your room/i)).toBeVisible()
  await expect(room.roomCodeText()).toHaveText(`Room ${code}`, { timeout: 10000 })
})

test('leaving a room forgets it, so a later refresh goes to the lobby, not back into it', async ({
  page,
}) => {
  const room = new RoomPage(page)
  await room.open()
  await room.enterName('Bekmurod')
  await room.createRoom()

  await room.leaveRoom()
  await page.reload()

  // Back at the lobby's choice step, name remembered, no auto-rejoin.
  await expect(page.getByText('Hi, Bekmurod')).toBeVisible()
})

test('a rejoin against a room that is genuinely gone falls back to the lobby with the name intact', async ({
  page,
  browser,
}) => {
  const room = new RoomPage(page)
  await room.open()
  await room.enterName('Bekmurod')
  await room.createRoom()

  const session = await page.evaluate(() => localStorage.getItem('meet-me:session'))

  // Actually closing the page closes its WebSocket, which is what starts the
  // server's grace-period countdown for this now-empty room. Just reloading
  // wouldn't do that - the whole point of the grace period is that a normal
  // reload's new connection arrives well within it (see the first test).
  await page.close()
  await new Promise((resolve) => setTimeout(resolve, ROOM_GRACE_MS + 1000))

  const laterPage = await browser.newPage()
  await laterPage.goto('/')
  await laterPage.evaluate((value) => localStorage.setItem('meet-me:session', value), session)
  await laterPage.reload()

  await expect(laterPage.getByText('Hi, Bekmurod')).toBeVisible({ timeout: 10000 })
  await laterPage.close()
})
