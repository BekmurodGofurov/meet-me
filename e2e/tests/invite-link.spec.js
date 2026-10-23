import { expect, test } from '@playwright/test'
import { RoomPage } from './room-page.js'

test('guest can open invite link URL, resolve room, request to join, and be admitted', async ({
  browser,
}) => {
  const ownerContext = await browser.newContext()
  const guestContext = await browser.newContext()
  const owner = new RoomPage(await ownerContext.newPage())

  await owner.open()
  await owner.enterName('Bekmurod')
  const code = await owner.createRoom()

  await owner.roomCodeText().click()
  const linkInput = owner.page.locator('.topbar__invite-input')
  await expect(linkInput).toBeVisible()
  await expect(linkInput).toHaveValue(/\/join\//, { timeout: 10000 })
  const inviteUrl = await linkInput.inputValue()
  expect(inviteUrl).toContain('/join/')

  // Close invite modal
  await owner.page.locator('.topbar__invite-modal-close').click()
  await expect(linkInput).not.toBeVisible()

  const guestPage = await guestContext.newPage()
  await guestPage.goto(inviteUrl)

  // Guest's JoinPage resolves the token and redirects to /lobby with roomId prefilled
  await expect(guestPage).toHaveURL(new RegExp(`/lobby.*roomId=${code}`), { timeout: 10000 })

  // Guest enters name on pre-join screen
  await guestPage.getByPlaceholder(/name|bekmurod/i).fill('Aziz')

  // Guest clicks "Request to join room"
  await guestPage.getByRole('button', { name: /request to join|join room/i }).click()

  // Guest is in waiting room
  await expect(guestPage.getByText(/waiting for host/i)).toBeVisible()

  // Owner receives admit request and admits guest
  await owner.admitGuest('Aziz')

  // Both are now in the room!
  await expect(guestPage.locator('.topbar__room')).toHaveAttribute('data-room-id', code, {
    timeout: 10000,
  })
  await expect(owner.tileByLabel('Aziz')).toBeVisible()

  await ownerContext.close()
  await guestContext.close()
})
