import { expect, test } from '@playwright/test'
import { RoomPage } from './room-page.js'

// This is the one thing none of the unit/integration tests can prove: two
// independent browser processes actually completing WebRTC negotiation and
// exchanging live media, not just the signaling messages around it.
test('turning cameras on negotiates real peer-to-peer video between two browsers', async ({
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

  await owner.turnCameraOn()
  await member.turnCameraOn()

  const ownerViewOfMember = owner.tileByLabel('Aziz').locator('video')
  const memberViewOfOwner = member.tileByLabel('Bekmurod').locator('video')

  // Once negotiation completes, the placeholder disappears and the <video>
  // element is shown - on both sides.
  await expect(ownerViewOfMember).not.toHaveClass(/is-hidden/, { timeout: 15000 })
  await expect(memberViewOfOwner).not.toHaveClass(/is-hidden/, { timeout: 15000 })

  // Beyond "not hidden": real frames are actually decoding, which only
  // happens if ICE/DTLS genuinely completed between the two processes.
  await expect
    .poll(() => ownerViewOfMember.evaluate((video) => video.videoWidth), { timeout: 15000 })
    .toBeGreaterThan(0)
  await expect
    .poll(() => memberViewOfOwner.evaluate((video) => video.videoWidth), { timeout: 15000 })
    .toBeGreaterThan(0)

  await ownerContext.close()
  await memberContext.close()
})

test('turning the camera back off shows a placeholder instead of a frozen frame', async ({
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

  await owner.turnCameraOn()
  const memberViewOfOwner = member.tileByLabel('Bekmurod').locator('video')
  await expect(memberViewOfOwner).not.toHaveClass(/is-hidden/, { timeout: 15000 })

  await owner.page.getByRole('button', { name: /turn camera off/i }).click()

  await expect(memberViewOfOwner).toHaveClass(/is-hidden/)
  await expect(member.tileByLabel('Bekmurod').locator('.video-tile__placeholder')).toBeVisible()

  await ownerContext.close()
  await memberContext.close()
})
