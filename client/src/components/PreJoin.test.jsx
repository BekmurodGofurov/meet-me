import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PreJoin from './PreJoin'

describe('PreJoin', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders preview card and controls with camera off by default', () => {
    const fakeMedia = {
      cameraOn: false,
      micOn: false,
      toggleCamera: vi.fn(),
      toggleMic: vi.fn(),
    }

    render(
      <PreJoin
        roomId="abc123"
        initialName="Bekmurod"
        media={fakeMedia}
        onSubmitJoin={() => {}}
      />,
    )

    expect(screen.getByText('Ready to join?')).toBeInTheDocument()
    expect(screen.getByText(/camera is off/i)).toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
    expect(screen.queryByText('abc123')).not.toBeInTheDocument()
  })

  it('calls toggleCamera and toggleMic when clicked', async () => {
    const user = userEvent.setup()
    const fakeMedia = {
      cameraOn: false,
      micOn: false,
      toggleCamera: vi.fn(),
      toggleMic: vi.fn(),
    }

    render(
      <PreJoin
        roomId="abc123"
        initialName="Bekmurod"
        media={fakeMedia}
        onSubmitJoin={() => {}}
      />,
    )

    const micBtn = screen.getByRole('button', { name: /unmute microphone/i })
    await user.click(micBtn)
    expect(fakeMedia.toggleMic).toHaveBeenCalled()

    const camBtn = screen.getByRole('button', { name: /turn camera on/i })
    await user.click(camBtn)
    expect(fakeMedia.toggleCamera).toHaveBeenCalled()
  })

  it('disables join button until name is entered', async () => {
    const user = userEvent.setup()
    const onSubmitJoin = vi.fn()

    render(
      <PreJoin
        roomId="abc123"
        initialName=""
        onSubmitJoin={onSubmitJoin}
      />,
    )

    const joinBtn = screen.getByRole('button', { name: /request to join room/i })
    expect(joinBtn).toBeDisabled()

    const nameInput = screen.getByPlaceholderText(/name|bekmurod/i)
    await user.type(nameInput, 'Aziz')
    expect(joinBtn).toBeEnabled()

    await user.click(joinBtn)
    expect(onSubmitJoin).toHaveBeenCalledWith('abc123', 'Aziz')
  })

  it('calls onCancel when cancel button is clicked', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()

    render(
      <PreJoin
        roomId="abc123"
        initialName="Bekmurod"
        onSubmitJoin={() => {}}
        onCancel={onCancel}
      />,
    )

    const cancelBtn = screen.getByRole('button', { name: /cancel/i })
    await user.click(cancelBtn)
    expect(onCancel).toHaveBeenCalled()
  })
})
