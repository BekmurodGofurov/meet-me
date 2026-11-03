import { expect, test } from '@playwright/test'
import { RoomPage } from './room-page.js'

test('the lobby shows the name, Create and the room code boxes on one screen', async ({ page }) => {
  const room = new RoomPage(page)
  await room.open()

  await expect(page.getByLabel(/your name/i)).toBeVisible()
  await expect(page.getByRole('button', { name: /create a room/i })).toBeVisible()
  await expect(page.getByLabel(/room code character/i)).toHaveCount(6)
})

test('Create stays off until there is a name', async ({ page }) => {
  const room = new RoomPage(page)
  await room.open()

  const create = page.getByRole('button', { name: /create a room/i })
  await expect(create).toBeDisabled()

  await room.enterName('Bekmurod')
  await expect(create).toBeEnabled()
})

test('the background video plays on a wide screen and can be paused', async ({ page }) => {
  const room = new RoomPage(page)
  await room.open()

  const video = page.locator('.lobby__backdrop video')
  await expect(video).toHaveCount(1)
  await expect.poll(() => video.evaluate((v) => !v.paused)).toBe(true)

  await page.getByRole('button', { name: /pause background video/i }).click()
  await expect.poll(() => video.evaluate((v) => v.paused)).toBe(true)
})

test('the camera is only requested when you ask to preview it, and the preview can be turned off', async ({
  page,
}) => {
  const room = new RoomPage(page)
  await room.open()
  await room.enterName('Bekmurod')

  const preview = page.getByLabel('Camera preview')
  await expect(preview).toHaveCount(0)

  await page.getByRole('button', { name: /preview your camera/i }).click()
  await expect(preview).toBeVisible()
  await expect.poll(() => preview.evaluate((v) => v.videoWidth)).toBeGreaterThan(0)

  await page.getByRole('button', { name: /turn camera preview off/i }).click()
  await expect(preview).toHaveCount(0)
})
