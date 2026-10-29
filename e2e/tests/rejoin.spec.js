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

  await expect(page.getByText(/rejoining your room/i).or(room.roomCodeText())).toBeVisible()
  await expect(room.roomCodeText()).toHaveAttribute('data-room-id', code, { timeout: 10000 })
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
  const name = await page.evaluate(() => localStorage.getItem('meet-me:name'))

  // Actually closing the page closes its WebSocket, which is what starts the
  // server's grace-period countdown for this now-empty room. Just reloading
  // wouldn't do that - the whole point of the grace period is that a normal
  // reload's new connection arrives well within it (see the first test).
  await page.close()
  await new Promise((resolve) => setTimeout(resolve, ROOM_GRACE_MS + 2000))

  const laterPage = await browser.newPage()
  await laterPage.goto('/lobby')
  await laterPage.evaluate(
    ({ sessionVal, nameVal }) => {
      localStorage.setItem('meet-me:session', sessionVal)
      if (nameVal) localStorage.setItem('meet-me:name', nameVal)
    },
    { sessionVal: session, nameVal: name },
  )
  await laterPage.reload()

  await expect(laterPage.getByText('Hi, Bekmurod')).toBeVisible({ timeout: 10000 })
  await laterPage.close()
})

test('after a reload the chat comes back, and your own messages are still "You"', async ({
  browser,
}) => {
  const ownerContext = await browser.newContext()
  const memberContext = await browser.newContext()
  const owner = new RoomPage(await ownerContext.newPage())
  const member = new RoomPage(await memberContext.newPage())

  await owner.open()
  await owner.enterName('Bekmurod')
  const code = await owner.createRoom()
  await member.open()
  await member.enterName('Aziz')
  await member.joinRoom(code)
  await owner.admitGuest('Aziz')

  await member.openChat()
  await owner.sendChat('hello from owner')
  await expect(member.chatBubble('hello from owner')).toBeVisible()
  await member.sendChat('hello from member')
  await expect(owner.chatBubble('hello from member')).toBeVisible()

  await owner.page.reload()
  await expect(owner.roomCodeText()).toHaveAttribute('data-room-id', code, { timeout: 10000 })
  await owner.openChat()

  await expect(owner.chatBubble('hello from owner')).toBeVisible()
  await expect(owner.chatBubble('hello from owner')).toHaveClass(/is-mine/)
  await expect(owner.chatBubble('hello from member')).toBeVisible()
  await expect(owner.chatBubble('hello from member')).not.toHaveClass(/is-mine/)

  await ownerContext.close()
  await memberContext.close()
})
