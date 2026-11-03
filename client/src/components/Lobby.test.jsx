import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Lobby from './Lobby'

beforeEach(() => {
  localStorage.clear()
})

function renderLobby(props = {}) {
  return render(<Lobby onCreate={() => {}} onJoin={() => {}} error="" disabled={false} {...props} />)
}

const nameInput = () => screen.getByLabelText(/your name/i)
const codeBoxes = () => screen.getAllByLabelText(/room code character/i)

describe('Lobby - one screen', () => {
  it('shows the name field, Create and the code boxes together', () => {
    renderLobby()

    expect(nameInput()).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create a room/i })).toBeInTheDocument()
    expect(codeBoxes()).toHaveLength(6)
    expect(screen.getByRole('button', { name: /^join room$/i })).toBeInTheDocument()
  })

  it('prefills the name when one is already remembered', () => {
    renderLobby({ initialName: 'Aziz' })
    expect(nameInput()).toHaveValue('Aziz')
  })

  it('Create is disabled until a name is typed', async () => {
    const user = userEvent.setup()
    renderLobby()

    const create = screen.getByRole('button', { name: /create a room/i })
    expect(create).toBeDisabled()

    await user.type(nameInput(), 'Aziz')
    expect(create).toBeEnabled()
  })

  it('treats a whitespace-only name as empty', async () => {
    const user = userEvent.setup()
    renderLobby()

    await user.type(nameInput(), '   ')
    expect(screen.getByRole('button', { name: /create a room/i })).toBeDisabled()
  })

  it('shows a room error if present', () => {
    renderLobby({ error: 'Room is full' })
    expect(screen.getByText('Room is full')).toBeInTheDocument()
  })

  it('shows the connection status when it is provided', () => {
    renderLobby({ connectionStatus: 'connected' })
    expect(screen.getByText('Connected')).toBeInTheDocument()
  })

  it('shows no connection status when none is provided', () => {
    renderLobby()
    expect(screen.queryByText(/connect/i)).not.toBeInTheDocument()
  })
})

describe('Lobby - creating a room', () => {
  it('Create a room calls onCreate with the trimmed name', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    renderLobby({ onCreate })

    await user.type(nameInput(), '  Aziz  ')
    await user.click(screen.getByRole('button', { name: /create a room/i }))

    expect(onCreate).toHaveBeenCalledWith('Aziz')
  })

  it('pressing Enter in the name field creates the room', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    renderLobby({ onCreate })

    await user.type(nameInput(), 'Aziz{Enter}')

    expect(onCreate).toHaveBeenCalledWith('Aziz')
  })

  it('pressing Enter without a name does nothing', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    renderLobby({ onCreate })

    await user.click(nameInput())
    await user.keyboard('{Enter}')

    expect(onCreate).not.toHaveBeenCalled()
  })

  it('Create and Join are disabled while disconnected', async () => {
    const user = userEvent.setup()
    const onJoin = vi.fn()
    renderLobby({ disabled: true, initialName: 'Aziz', onJoin })

    expect(screen.getByRole('button', { name: /create a room/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^join room$/i })).toBeDisabled()

    await user.click(codeBoxes()[0])
    await user.keyboard('a5fb67')
    expect(onJoin).not.toHaveBeenCalled()
  })

  it('saves the typed name to localStorage and restores it on the next load', async () => {
    const user = userEvent.setup()
    const { unmount } = renderLobby()

    await user.type(nameInput(), 'Rustam')
    expect(localStorage.getItem('meet-me:name')).toBe('Rustam')

    unmount()

    // Simulating page refresh by rendering Lobby without explicit initialName prop:
    renderLobby()
    expect(nameInput()).toHaveValue('Rustam')
  })
})

describe('Lobby - joining with a code', () => {
  it('Join room is disabled until there is a name and a full code', async () => {
    const user = userEvent.setup()
    renderLobby()
    const join = screen.getByRole('button', { name: /^join room$/i })

    expect(join).toBeDisabled()

    await user.type(nameInput(), 'Aziz')
    expect(join).toBeDisabled()

    await user.click(codeBoxes()[0])
    await user.keyboard('a5fb6')
    expect(join).toBeDisabled()
  })

  it('completing the code calls onJoin with the code and name', async () => {
    const user = userEvent.setup()
    const onJoin = vi.fn()
    renderLobby({ onJoin, initialName: 'Aziz' })

    await user.click(codeBoxes()[0])
    await user.keyboard('a5fb67')

    expect(onJoin).toHaveBeenCalledWith('a5fb67', 'Aziz')
  })

  it('prefers onRequestJoin over onJoin when both are given', async () => {
    const user = userEvent.setup()
    const onJoin = vi.fn()
    const onRequestJoin = vi.fn()
    renderLobby({ onJoin, onRequestJoin, initialName: 'Aziz' })

    await user.click(codeBoxes()[0])
    await user.keyboard('a5fb67')

    expect(onRequestJoin).toHaveBeenCalledWith('a5fb67', 'Aziz')
    expect(onJoin).not.toHaveBeenCalled()
  })

  it('does not join without a name, and sends focus to the name field instead', async () => {
    const user = userEvent.setup()
    const onJoin = vi.fn()
    renderLobby({ onJoin })

    await user.click(codeBoxes()[0])
    await user.keyboard('a5fb67')

    expect(onJoin).not.toHaveBeenCalled()
    expect(nameInput()).toHaveFocus()
  })

  it('lets the visitor finish the join after typing the name late', async () => {
    const user = userEvent.setup()
    const onJoin = vi.fn()
    renderLobby({ onJoin })

    await user.click(codeBoxes()[0])
    await user.keyboard('a5fb67')
    await user.type(nameInput(), 'Aziz')
    await user.click(screen.getByRole('button', { name: /^join room$/i }))

    expect(onJoin).toHaveBeenCalledWith('a5fb67', 'Aziz')
  })

  it('pasting an invite link joins with the room id from the link', async () => {
    const user = userEvent.setup()
    const onJoin = vi.fn()
    renderLobby({ onJoin, initialName: 'Aziz' })

    await user.click(codeBoxes()[0])
    await user.paste('https://meet-me.bekmurod.uz/lobby?action=join&roomId=F54FFE')

    expect(onJoin).toHaveBeenCalledWith('f54ffe', 'Aziz')
  })
})

describe('Lobby - landing on the right control', () => {
  const originalLocation = window.location

  afterEach(() => {
    window.location = originalLocation
  })

  function visit(search) {
    delete window.location
    window.location = new URL(`http://localhost:5173/lobby${search}`)
  }

  it('focuses the name field when no name is remembered', () => {
    visit('?action=create')
    renderLobby()
    expect(nameInput()).toHaveFocus()
  })

  it('focuses Create for ?action=create when the name is remembered, without creating anything', () => {
    visit('?action=create')
    const onCreate = vi.fn()
    renderLobby({ initialName: 'Aziz', onCreate })

    expect(screen.getByRole('button', { name: /create a room/i })).toHaveFocus()
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('focuses the first code box for ?action=join when the name is remembered', () => {
    visit('?action=join')
    renderLobby({ initialName: 'Aziz' })
    expect(codeBoxes()[0]).toHaveFocus()
  })
})

describe('Lobby - camera preview', () => {
  it('offers no preview button when no media controls are passed', () => {
    renderLobby()
    expect(screen.queryByRole('button', { name: /camera preview/i })).not.toBeInTheDocument()
  })

  it('asks for the camera only when the preview button is pressed', async () => {
    const user = userEvent.setup()
    const toggleCamera = vi.fn()
    renderLobby({ media: { cameraOn: false, toggleCamera } })

    expect(toggleCamera).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /preview your camera/i }))
    expect(toggleCamera).toHaveBeenCalledTimes(1)
  })

  it('shows the live preview and an off button once the camera is on', () => {
    renderLobby({ media: { cameraOn: true, stream: {}, toggleCamera: vi.fn() }, initialName: 'Aziz' })

    expect(screen.getByLabelText('Camera preview')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /turn camera preview off/i })).toBeInTheDocument()
  })

  it('shows a media error from the camera', () => {
    renderLobby({ media: { cameraOn: false, toggleCamera: vi.fn(), mediaError: 'Camera blocked' } })
    expect(screen.getByText('Camera blocked')).toBeInTheDocument()
  })
})

describe('Lobby - invite link with roomId', () => {
  const originalLocation = window.location

  beforeEach(() => {
    delete window.location
    window.location = new URL('http://localhost:5173/lobby?action=join&roomId=f54ffe')
  })

  afterEach(() => {
    window.location = originalLocation
  })

  it('skips 6 code input boxes and directly renders Teams-style pre-join view with camera/mic controls', async () => {
    const user = userEvent.setup()
    const onJoin = vi.fn()
    const fakeMedia = {
      cameraOn: false,
      micOn: false,
      toggleCamera: vi.fn(),
      toggleMic: vi.fn(),
    }
    render(<Lobby onJoin={onJoin} error="" disabled={false} initialName="Bekmurod" media={fakeMedia} />)

    // CodeInput should not be rendered
    expect(screen.queryAllByLabelText(/room code character/i)).toHaveLength(0)

    // Ready to join header and preview
    expect(screen.getByText('Ready to join?')).toBeInTheDocument()
    expect(screen.getByText(/camera is off/i)).toBeInTheDocument()

    // Room code is NOT displayed to the user
    expect(screen.queryByText('f54ffe')).not.toBeInTheDocument()

    const requestBtn = screen.getByRole('button', { name: /request to join room/i })
    expect(requestBtn).toBeInTheDocument()

    await user.click(requestBtn)
    expect(onJoin).toHaveBeenCalledWith('f54ffe', 'Bekmurod')
  })

  it('allows entering name directly on pre-join view when not remembered', async () => {
    const user = userEvent.setup()
    const onJoin = vi.fn()
    render(<Lobby onJoin={onJoin} error="" disabled={false} />)

    // Name input is on the prejoin screen
    const nameField = screen.getByPlaceholderText(/name|bekmurod/i)
    expect(nameField).toBeInTheDocument()
    await user.type(nameField, 'Aziz')

    const requestBtn = screen.getByRole('button', { name: /request to join room/i })
    await user.click(requestBtn)
    expect(onJoin).toHaveBeenCalledWith('f54ffe', 'Aziz')
  })
})
