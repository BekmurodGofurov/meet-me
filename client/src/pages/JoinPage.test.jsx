import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import JoinPage from './JoinPage'

describe('JoinPage', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('calls onResolveInvite on mount with route token', () => {
    const onResolveInvite = vi.fn()
    render(
      <MemoryRouter initialEntries={['/join/test-token-123']}>
        <Routes>
          <Route
            path="/join/:token"
            element={
              <JoinPage
                onResolveInvite={onResolveInvite}
                resolvedRoomId={null}
                resolveError={null}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText(/connecting to invite link/i)).toBeInTheDocument()
    expect(onResolveInvite).toHaveBeenCalledWith('test-token-123')
  })

  it('renders error message when resolveError is provided', () => {
    render(
      <MemoryRouter initialEntries={['/join/test-token']}>
        <Routes>
          <Route
            path="/join/:token"
            element={
              <JoinPage
                onResolveInvite={vi.fn()}
                resolvedRoomId={null}
                resolveError="Invalid or expired invite link"
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('Unable to join')).toBeInTheDocument()
    expect(screen.getByText('Invalid or expired invite link')).toBeInTheDocument()
  })

  it('shows timed out error and retry button after 7 seconds if unresolved', () => {
    const onResolveInvite = vi.fn()
    render(
      <MemoryRouter initialEntries={['/join/test-token-timeout']}>
        <Routes>
          <Route
            path="/join/:token"
            element={
              <JoinPage
                onResolveInvite={onResolveInvite}
                resolvedRoomId={null}
                resolveError={null}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText(/connecting to invite link/i)).toBeInTheDocument()

    // Fast-forward past 7s timeout wrapped in act
    act(() => {
      vi.advanceTimersByTime(7500)
    })

    expect(screen.getByText('Unable to join')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()

    // Clicking retry calls onResolveInvite again
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    })
    expect(onResolveInvite).toHaveBeenCalledTimes(2)
  })
})
