import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Lobby from './Lobby'

beforeEach(() => {
  localStorage.clear()
})

describe('Lobby - name step', () => {
  it('asks for a name first when there is no remembered name', () => {
    render(<Lobby onCreate={() => {}} onJoin={() => {}} error="" disabled={false} />)
    expect(screen.getByRole('heading', { name: /name/i })).toBeInTheDocument()
  })

  it('Continue is disabled until a name is typed', async () => {
    const user = userEvent.setup()
    render(<Lobby onCreate={() => {}} onJoin={() => {}} error="" disabled={false} />)

    const button = screen.getByRole('button', { name: /continue/i })
    expect(button).toBeDisabled()

    await user.type(screen.getByPlaceholderText(/name|bekmurod/i), 'Aziz')
    expect(button).toBeEnabled()
  })

  it('pressing Enter with a name advances to the choice step', async () => {
    const user = userEvent.setup()
    render(<Lobby onCreate={() => {}} onJoin={() => {}} error="" disabled={false} />)

    await user.type(screen.getByPlaceholderText(/name|bekmurod/i), 'Aziz{Enter}')
    expect(screen.getByText('Hi, Aziz')).toBeInTheDocument()
  })

  it('skips straight to the choice step when a name is already remembered', () => {
    render(
      <Lobby onCreate={() => {}} onJoin={() => {}} error="" disabled={false} initialName="Aziz" />,
    )
    expect(screen.getByText('Hi, Aziz')).toBeInTheDocument()
  })
})

describe('Lobby - choice step', () => {
  async function goToChoice(user, name = 'Aziz') {
    render(<Lobby onCreate={() => {}} onJoin={() => {}} error="" disabled={false} />)
    await user.type(screen.getByPlaceholderText(/name|bekmurod/i), `${name}{Enter}`)
  }

  it('Create a room calls onCreate with the trimmed name', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    render(<Lobby onCreate={onCreate} onJoin={() => {}} error="" disabled={false} />)

    await user.type(screen.getByPlaceholderText(/name|bekmurod/i), '  Aziz  {Enter}')
    await user.click(screen.getByRole('button', { name: /create a room/i }))

    expect(onCreate).toHaveBeenCalledWith('Aziz')
  })

  it('Create/Join are disabled while disconnected', async () => {
    const user = userEvent.setup()
    render(<Lobby onCreate={() => {}} onJoin={() => {}} error="" disabled />)

    await user.type(screen.getByPlaceholderText(/name|bekmurod/i), 'Aziz{Enter}')
    expect(screen.getByRole('button', { name: /create a room/i })).toBeDisabled()
  })

  it('Join a room moves to the code step', async () => {
    const user = userEvent.setup()
    await goToChoice(user)

    await user.click(screen.getByRole('button', { name: /^join a room$/i }))
    expect(screen.getByText('Enter room code')).toBeInTheDocument()
  })

  it('Change name goes back to the name step', async () => {
    const user = userEvent.setup()
    await goToChoice(user)

    await user.click(screen.getByRole('button', { name: /change name/i }))
    expect(screen.getByRole('heading', { name: /name/i })).toBeInTheDocument()
  })

  it('shows a room error if present', async () => {
    const user = userEvent.setup()
    render(<Lobby onCreate={() => {}} onJoin={() => {}} error="Room is full" disabled={false} />)

    await user.type(screen.getByPlaceholderText(/name|bekmurod/i), 'Aziz{Enter}')
    expect(screen.getByText('Room is full')).toBeInTheDocument()
  })
})

describe('Lobby - join step', () => {
  it('completing the code calls onJoin with the code and name', async () => {
    const user = userEvent.setup()
    const onJoin = vi.fn()
    render(<Lobby onCreate={() => {}} onJoin={onJoin} error="" disabled={false} />)

    await user.type(screen.getByPlaceholderText(/name|bekmurod/i), 'Aziz{Enter}')
    await user.click(screen.getByRole('button', { name: /^join a room$/i }))

    const boxes = screen.getAllByLabelText(/room code character/i)
    await user.click(boxes[0])
    await user.keyboard('a5fb67')

    expect(onJoin).toHaveBeenCalledWith('a5fb67', 'Aziz')
  })

  it('Back returns to the choice step', async () => {
    const user = userEvent.setup()
    render(<Lobby onCreate={() => {}} onJoin={() => {}} error="" disabled={false} />)

    await user.type(screen.getByPlaceholderText(/name|bekmurod/i), 'Aziz{Enter}')
    await user.click(screen.getByRole('button', { name: /^join a room$/i }))
    await user.click(screen.getByRole('button', { name: /back/i }))

    expect(screen.getByText('Hi, Aziz')).toBeInTheDocument()
  })
})

describe('Lobby - localStorage persistence', () => {
  it('saves typed name to localStorage and restores it on subsequent load', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<Lobby onCreate={() => {}} onJoin={() => {}} error="" disabled={false} />)

    await user.type(screen.getByPlaceholderText(/name|bekmurod/i), 'Rustam{Enter}')
    expect(localStorage.getItem('meet-me:name')).toBe('Rustam')

    unmount()

    // Simulating page refresh by rendering Lobby without explicit initialName prop:
    render(<Lobby onCreate={() => {}} onJoin={() => {}} error="" disabled={false} />)
    expect(screen.getByText('Hi, Rustam')).toBeInTheDocument()
  })
})
