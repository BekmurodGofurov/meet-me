import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import LandingPage from './LandingPage'

function Where() {
  const { pathname, search } = useLocation()
  return <p data-testid="where">{pathname + search}</p>
}

function renderLanding() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/lobby" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('LandingPage hero', () => {
  it('leads with the main promise', () => {
    renderLanding()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/video calls,\s*no signup needed/i)
  })

  it('Start a meeting opens the lobby ready to create', async () => {
    const user = userEvent.setup()
    renderLanding()

    await user.click(screen.getByRole('button', { name: /start a meeting/i }))
    expect(screen.getByTestId('where')).toHaveTextContent('/lobby?action=create')
  })

  it('Join with a code opens the lobby ready to join', async () => {
    const user = userEvent.setup()
    renderLanding()

    await user.click(screen.getByRole('button', { name: /join with a code/i }))
    expect(screen.getByTestId('where')).toHaveTextContent('/lobby?action=join')
  })

  it('shows a picture of a call that assistive tech skips', () => {
    const { container } = renderLanding()
    expect(container.querySelector('.call-preview')).toHaveAttribute('aria-hidden', 'true')
  })

  it('does not promise things it cannot guarantee', () => {
    renderLanding()
    expect(screen.queryByText(/webrtc 2\.0/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/<\s*50\s*ms/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/zero-delay/i)).not.toBeInTheDocument()
  })
})
