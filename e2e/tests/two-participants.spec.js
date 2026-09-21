import { expect, test } from '@playwright/test'
import { RoomPage } from './room-page.js'

// Two separate browser contexts = two genuinely independent "computers" as
// far as the app can tell, same as two people on two real devices.
test('two people can join the same room, chat, and see join/leave notices', async ({ browser }) => {
  const ownerContext = await browser.newContext()
  const memberContext = await browser.newContext()
  const ownerPage = new RoomPage(await ownerContext.newPage())
  const memberPage = new RoomPage(await memberContext.newPage())

  await ownerPage.open()
  await ownerPage.enterName('Bekmurod')
  const code = await ownerPage.createRoom()

  await memberPage.open()
  await memberPage.enterName('Aziz')
  await memberPage.joinRoom(code)

  // Both land in the same room.
  await expect(ownerPage.roomCodeText()).toHaveText(`Room ${code}`)
  await expect(memberPage.roomCodeText()).toHaveText(`Room ${code}`)

  // Each sees the other as a tile, and their own tile labeled "(you)".
  await expect(ownerPage.tileByLabel('Bekmurod (you)')).toBeVisible()
  await expect(ownerPage.tileByLabel('Aziz')).toBeVisible()
  await expect(memberPage.tileByLabel('Aziz (you)')).toBeVisible()
  await expect(memberPage.tileByLabel('Bekmurod')).toBeVisible()

  // The owner sees a join notice for the member.
  await expect(ownerPage.systemNotice('Aziz joined the room')).toBeVisible()

  // Chat travels both ways with the right names attached.
  await ownerPage.sendChat('hello from Bekmurod')
  await expect(memberPage.chatBubble('hello from Bekmurod')).toBeVisible()
  await expect(memberPage.chatBubble('Bekmurod')).toBeVisible()

  await memberPage.sendChat('hi back')
  await expect(ownerPage.chatBubble('hi back')).toBeVisible()

  // Leaving notifies the other side and removes the tile.
  await memberPage.leaveRoom()
  await expect(ownerPage.systemNotice('Aziz left the room')).toBeVisible()
  await expect(ownerPage.tileByLabel('Aziz')).toHaveCount(0)

  await ownerContext.close()
  await memberContext.close()
})

// Regression test for a real bug this suite caught: peer tiles used to be
// built only from remoteStreams (populated once a track actually arrives),
// so a participant who never turns on camera or mic was invisible entirely -
// not even a placeholder - and their absence from that count also
// miscounted "am I alone" (a room of 2 with both cameras off looked solo).
test('a participant with camera and mic both off still shows as a placeholder tile, and gallery mode is used correctly', async ({
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

  // Neither has turned on camera or mic at any point.
  const ownerViewOfMember = owner.tileByLabel('Aziz')
  await expect(ownerViewOfMember).toBeVisible()
  await expect(ownerViewOfMember.locator('.video-tile__placeholder')).toHaveText('A')

  // Two people present with no media should still be a gallery (both tiles
  // shown side by side), not the solo/active view meant for being alone.
  await expect(owner.tileByLabel('Bekmurod (you)')).not.toHaveClass(/video-tile--large/)
  await expect(ownerViewOfMember).not.toHaveClass(/video-tile--large/)

  await ownerContext.close()
  await memberContext.close()
})

test('a full room (6 people) rejects a 7th', async ({ browser }) => {
  const contexts = await Promise.all(Array.from({ length: 7 }, () => browser.newContext()))
  const pages = await Promise.all(contexts.map(async (ctx) => new RoomPage(await ctx.newPage())))

  await pages[0].open()
  await pages[0].enterName('Person 1')
  const code = await pages[0].createRoom()

  for (let i = 1; i < 6; i += 1) {
    await pages[i].open()
    await pages[i].enterName(`Person ${i + 1}`)
    await pages[i].joinRoom(code)
    await expect(pages[i].roomCodeText()).toHaveText(`Room ${code}`)
  }

  await pages[6].open()
  await pages[6].enterName('Person 7')
  await pages[6].joinRoom(code)

  await expect(pages[6].page.locator('.lobby__error')).toHaveText(/full/i)

  await Promise.all(contexts.map((ctx) => ctx.close()))
})
