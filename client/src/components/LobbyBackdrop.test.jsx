import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LobbyBackdrop from './LobbyBackdrop'

const originalMatchMedia = window.matchMedia

function mockMatchMedia(matches) {
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
}

afterEach(() => {
  window.matchMedia = originalMatchMedia
})

describe('LobbyBackdrop', () => {
  it('shows only the poster when the video should not play', () => {
    mockMatchMedia(false)
    const { container } = render(<LobbyBackdrop />)

    expect(container.querySelector('video')).toBeNull()
    expect(container.querySelector('img')).toHaveAttribute('src', '/media/lobby-bg-poster.jpg')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('falls back to the poster when matchMedia is unavailable', () => {
    window.matchMedia = undefined
    const { container } = render(<LobbyBackdrop />)

    expect(container.querySelector('video')).toBeNull()
  })

  it('plays a muted, looping, decorative video when allowed', () => {
    mockMatchMedia(true)
    const { container } = render(<LobbyBackdrop />)
    const video = container.querySelector('video')

    expect(video).not.toBeNull()
    expect(video.muted).toBe(true)
    expect(video.loop).toBe(true)
    expect(video).toHaveAttribute('aria-hidden', 'true')
    expect(video.querySelectorAll('source')).toHaveLength(2)
  })

  it('lets people pause and resume the video', async () => {
    mockMatchMedia(true)
    const user = userEvent.setup()
    const { container } = render(<LobbyBackdrop />)
    const video = container.querySelector('video')
    video.pause = vi.fn()

    await user.click(screen.getByRole('button', { name: /pause background video/i }))
    expect(video.pause).toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /play background video/i }))
    expect(video.play).toHaveBeenCalled()
  })
})
