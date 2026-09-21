import { expect, test } from '@playwright/test'
import { RoomPage } from './room-page.js'

test('creating a room shows the code, and the connection dot turns green', async ({ page }) => {
  const room = new RoomPage(page)
  await room.open()
  await room.enterName('Bekmurod')

  await expect(page.locator('.status-dot')).toHaveClass(/status-dot--connected/)

  const code = await room.createRoom()
  expect(code).toMatch(/^[0-9a-f]{6}$/)
})

test('alone in the room, your own tile renders as the large active view, not a small gallery tile', async ({
  page,
}) => {
  const room = new RoomPage(page)
  await room.open()
  await room.enterName('Bekmurod')
  await room.createRoom()

  const tile = room.tileByLabel('Bekmurod (you)')
  await expect(tile).toBeVisible()
  await expect(tile).toHaveClass(/video-tile--large/)
  // Solo is never clickable - there is nothing else to pin instead.
  await expect(tile).not.toHaveClass(/is-clickable/)
})

test('clicking room code copies it to the clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])

  const room = new RoomPage(page)
  await room.open()
  await room.enterName('Bekmurod')
  const code = await room.createRoom()

  await room.roomCodeText().click()
  await expect(room.roomCodeText()).toHaveText('Copied!')

  const clipboardText = await page.evaluate(() => navigator.clipboard.readText())
  expect(clipboardText).toBe(code)
})

test('joining a room that does not exist shows an error', async ({ page }) => {
  const room = new RoomPage(page)
  await room.open()
  await room.enterName('Bekmurod')
  await room.joinRoom('nope00')

  await expect(page.locator('.lobby__error')).toHaveText(/does not exist/i)
})
