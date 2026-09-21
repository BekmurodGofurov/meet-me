import { expect } from '@playwright/test'

// A thin wrapper around the real UI flow (name -> create/join -> in-room
// controls) so each spec reads as a user journey, not a pile of selectors.
export class RoomPage {
  constructor(page) {
    this.page = page
  }

  async open() {
    await this.page.goto('/')
  }

  async enterName(name) {
    await this.page.getByPlaceholder(/bekmurod/i).fill(name)
    await this.page.getByRole('button', { name: /continue/i }).click()
  }

  async createRoom() {
    await this.page.getByRole('button', { name: /create a room/i }).click()
    const roomButton = this.page.locator('.topbar__room')
    await expect(roomButton).toBeVisible()
    const text = await roomButton.textContent()
    return text.replace(/^Room /, '').trim()
  }

  async joinRoom(code) {
    await this.page.getByRole('button', { name: /^join a room$/i }).click()
    const boxes = this.page.getByLabel(/room code character/i)
    for (let i = 0; i < code.length; i += 1) {
      await boxes.nth(i).fill(code[i])
    }
  }

  roomCodeText() {
    return this.page.locator('.topbar__room')
  }

  async turnCameraOn() {
    await this.page.getByRole('button', { name: /turn camera on/i }).click()
  }

  async turnMicOn() {
    await this.page.getByRole('button', { name: /turn microphone on/i }).click()
  }

  async leaveRoom() {
    await this.page.getByRole('button', { name: /leave room/i }).click()
  }

  async sendChat(text) {
    await this.page.getByPlaceholder(/type a message/i).fill(text)
    await this.page.getByRole('button', { name: /^send$/i }).click()
  }

  tileByLabel(label) {
    return this.page.locator('figure.video-tile', { hasText: label })
  }

  chatBubble(text) {
    return this.page.locator('.chat__message', { hasText: text })
  }

  systemNotice(text) {
    return this.page.locator('.chat__system', { hasText: text })
  }
}
