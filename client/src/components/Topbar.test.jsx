import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import Topbar from './Topbar'

describe('Topbar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })
  })

  it('renders brand logo and title', () => {
    render(
      <MemoryRouter>
        <Topbar connectionStatus="connected" roomId={null} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Meet Me' })).toBeInTheDocument()
  })

  it('renders brand as a link to home when not in a room', () => {
    render(
      <MemoryRouter>
        <Topbar connectionStatus="connected" roomId={null} />
      </MemoryRouter>,
    )
    const link = screen.getByRole('link', { name: /meet me/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/')
  })

  it('does not render brand as a link when inside a room to prevent accidental exits', () => {
    render(
      <MemoryRouter>
        <Topbar connectionStatus="connected" roomId="123456" />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('link', { name: /meet me/i })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Meet Me' })).toBeInTheDocument()
  })

  it('does not render invite button when roomId is null', () => {
    render(
      <MemoryRouter>
        <Topbar connectionStatus="connected" roomId={null} />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('button', { name: /invite/i })).not.toBeInTheDocument()
  })

  it('renders invite button when roomId is present', () => {
    render(
      <MemoryRouter>
        <Topbar connectionStatus="connected" roomId="123456" />
      </MemoryRouter>,
    )
    const btn = screen.getByRole('button', { name: /invite to meeting/i })
    expect(btn).toBeInTheDocument()
    expect(btn).toHaveAttribute('data-room-id', '123456')
  })

  it('opens invite modal when clicking invite button, displaying room code and share link', () => {
    const onCreateInvite = vi.fn()
    render(
      <MemoryRouter>
        <Topbar
          connectionStatus="connected"
          roomId="123456"
          inviteLink="http://localhost:5173/join/token123"
          onCreateInvite={onCreateInvite}
        />
      </MemoryRouter>,
    )

    const btn = screen.getByRole('button', { name: /invite to meeting/i })
    fireEvent.click(btn)

    expect(screen.getByRole('dialog', { name: /invite to meeting/i })).toBeInTheDocument()
    expect(screen.getByText('123456')).toBeInTheDocument()
    expect(screen.getByDisplayValue('http://localhost:5173/join/token123')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /copy code/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /copy link/i })).toBeInTheDocument()
  })

  it('calls onCreateInvite if inviteLink is missing when opening modal', () => {
    const onCreateInvite = vi.fn()
    render(
      <MemoryRouter>
        <Topbar
          connectionStatus="connected"
          roomId="123456"
          inviteLink={null}
          onCreateInvite={onCreateInvite}
        />
      </MemoryRouter>,
    )

    const btn = screen.getByRole('button', { name: /invite to meeting/i })
    fireEvent.click(btn)

    expect(onCreateInvite).toHaveBeenCalledTimes(1)
  })

  it('copies room code to clipboard when clicking Copy Code', async () => {
    render(
      <MemoryRouter>
        <Topbar connectionStatus="connected" roomId="123456" />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: /invite to meeting/i }))
    const copyCodeBtn = screen.getByRole('button', { name: /copy code/i })
    await act(async () => {
      fireEvent.click(copyCodeBtn)
    })

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('123456')
  })

  it('copies share link to clipboard when clicking Copy Link', async () => {
    render(
      <MemoryRouter>
        <Topbar
          connectionStatus="connected"
          roomId="123456"
          inviteLink="http://localhost:5173/join/abc"
        />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: /invite to meeting/i }))
    const copyLinkBtn = screen.getByRole('button', { name: /copy link/i })
    await act(async () => {
      fireEvent.click(copyLinkBtn)
    })

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('http://localhost:5173/join/abc')
  })
})
