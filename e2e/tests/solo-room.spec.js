import { expect, test } from '@playwright/test'
import { RoomPage } from './room-page.js'

test('creating a room shows the code, and the connection dot turns green', async ({ page }) => {
  const room = new RoomPage(page)
  await room.open()
  await room.enterName('Bekmurod')

  await expect(page.locator('.status-dot')).toHaveClass(/status-dot--connected/)

  const code = await room.createRoom()
  expect(code).toMatch(/^[a-z0-9]{6}$/)
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

test('clicking invite button opens modal with room code and share link, and copies code to clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])

  const room = new RoomPage(page)
  await room.open()
  await room.enterName('Bekmurod')
  const code = await room.createRoom()

  await room.roomCodeText().click()
  await expect(page.getByText(code)).toBeVisible()
  await expect(page.getByRole('button', { name: /copy code/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /copy link/i })).toBeVisible()

  await page.getByRole('button', { name: /copy code/i }).click()
  await expect(page.getByRole('button', { name: /copied/i })).toBeVisible()

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
