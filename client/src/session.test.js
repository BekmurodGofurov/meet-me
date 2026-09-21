import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSession, loadName, loadSession, saveName, saveSession } from './session'

beforeEach(() => {
  localStorage.clear()
})

describe('name', () => {
  it('returns empty string when nothing has been saved', () => {
    expect(loadName()).toBe('')
  })

  it('round-trips through save/load', () => {
    saveName('Bekmurod')
    expect(loadName()).toBe('Bekmurod')
  })
})

describe('session', () => {
  it('returns null when nothing has been saved', () => {
    expect(loadSession()).toBeNull()
  })

  it('round-trips through save/load', () => {
    saveSession('abc123', 'Bekmurod')
    expect(loadSession()).toEqual({ roomId: 'abc123', name: 'Bekmurod' })
  })

  it('saving a session also remembers the name independently', () => {
    saveSession('abc123', 'Bekmurod')
    expect(loadName()).toBe('Bekmurod')
  })

  it('clearSession removes the room but leaves the name alone', () => {
    saveSession('abc123', 'Bekmurod')
    clearSession()

    expect(loadSession()).toBeNull()
    expect(loadName()).toBe('Bekmurod')
  })

  it('treats malformed stored JSON as no session, not a crash', () => {
    localStorage.setItem('meet-me:session', 'not valid json{{{')
    expect(loadSession()).toBeNull()
  })

  it('treats a session missing roomId or name as invalid', () => {
    localStorage.setItem('meet-me:session', JSON.stringify({ roomId: 'abc123' }))
    expect(loadSession()).toBeNull()
  })

  it('degrades to a no-op instead of throwing when localStorage is unavailable', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked')
    })

    expect(() => saveSession('abc123', 'Bekmurod')).not.toThrow()
    spy.mockRestore()
  })
})
