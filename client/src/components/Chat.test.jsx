import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Chat from './Chat'

describe('Chat', () => {
  it('shows a placeholder when there are no messages', () => {
    render(<Chat messages={[]} myId="me" onSend={() => {}} />)
    expect(screen.getByText('No messages yet.')).toBeInTheDocument()
  })

  it('labels your own message "You" and someone else\'s by their name', () => {
    const messages = [
      { id: '1', kind: 'chat', from: 'me', fromName: 'Bekmurod', text: 'hi there' },
      { id: '2', kind: 'chat', from: 'peer-1', fromName: 'Aziz', text: 'hello' },
    ]
    render(<Chat messages={messages} myId="me" onSend={() => {}} />)

    expect(screen.getByText('You')).toBeInTheDocument()
    expect(screen.getByText('Aziz')).toBeInTheDocument()
    expect(screen.getByText('hi there')).toBeInTheDocument()
    expect(screen.getByText('hello')).toBeInTheDocument()
  })

  it('renders a join notice as plain text with no author label', () => {
    const messages = [
      { id: '1', kind: 'system', tone: 'join', text: 'Aziz joined the room' },
    ]
    render(<Chat messages={messages} myId="me" onSend={() => {}} />)

    const notice = screen.getByText('Aziz joined the room')
    expect(notice).toHaveClass('chat__system--join')
  })

  it('renders a leave notice with the leave tone', () => {
    const messages = [
      { id: '1', kind: 'system', tone: 'leave', text: 'Aziz left the room' },
    ]
    render(<Chat messages={messages} myId="me" onSend={() => {}} />)

    expect(screen.getByText('Aziz left the room')).toHaveClass('chat__system--leave')
  })

  it('the send button is disabled until there is text', async () => {
    const user = userEvent.setup()
    render(<Chat messages={[]} myId="me" onSend={() => {}} />)

    const button = screen.getByRole('button', { name: /send/i })
    expect(button).toBeDisabled()

    await user.type(screen.getByPlaceholderText(/type a message/i), 'hello')
    expect(button).toBeEnabled()
  })

  it('submitting calls onSend with the typed text and clears the input', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(<Chat messages={[]} myId="me" onSend={onSend} />)

    const input = screen.getByPlaceholderText(/type a message/i)
    await user.type(input, 'hello there')
    await user.click(screen.getByRole('button', { name: /send/i }))

    expect(onSend).toHaveBeenCalledWith('hello there')
    expect(input).toHaveValue('')
  })

  it('submitting whitespace-only text does not call onSend', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(<Chat messages={[]} myId="me" onSend={onSend} />)

    await user.type(screen.getByPlaceholderText(/type a message/i), '   ')
    // The button is disabled, so try submitting the form directly via Enter.
    await user.keyboard('{Enter}')

    expect(onSend).not.toHaveBeenCalled()
  })
})
