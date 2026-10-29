import { expect, test } from '@playwright/test'
import { RoomPage } from './room-page.js'

// Playwright's touchscreen only taps, so the drag is dispatched as real
// TouchEvents on the element.
async function swipeDown(page, selector, distance) {
  await page.evaluate(
    ({ selector, distance }) => {
      const el = document.querySelector(selector)
      const rect = el.getBoundingClientRect()
      const x = rect.left + rect.width / 2
      const y = rect.top + rect.height / 2
      const touchAt = (clientY) =>
        new Touch({ identifier: 1, target: el, clientX: x, clientY })
      const fire = (type, clientY) =>
        el.dispatchEvent(
          new TouchEvent(type, {
            bubbles: true,
            cancelable: true,
            touches: type === 'touchend' ? [] : [touchAt(clientY)],
            changedTouches: [touchAt(clientY)],
          }),
        )

      fire('touchstart', y)
      for (let step = 1; step <= 6; step += 1) fire('touchmove', y + (distance * step) / 6)
      fire('touchend', y + distance)
    },
    { selector, distance },
  )
}

test('on a phone, swiping the chat sheet down closes it', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  })
  const room = new RoomPage(await context.newPage())
  await room.open()
  await room.enterName('Bekmurod')
  await room.createRoom()

  await room.openChat()
  const input = room.page.getByPlaceholder(/type a message/i)
  await expect(input).toBeVisible()

  // A short, slow-ish pull is not enough: the sheet springs back.
  await swipeDown(room.page, '.room__chat-header', 30)
  await expect(input).toBeVisible()

  await swipeDown(room.page, '.room__chat-header', 220)
  await expect(input).toBeHidden()

  await context.close()
})

test('on a phone, the page is protected from pull-to-refresh while in a room', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  })
  const room = new RoomPage(await context.newPage())
  await room.open()
  await room.enterName('Bekmurod')
  await room.createRoom()

  const behavior = await room.page.evaluate(() => getComputedStyle(document.body).overscrollBehaviorY)
  expect(behavior).toBe('none')

  await context.close()
})
