import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import LicensePage from './LicensePage'
import ContributingPage from './ContributingPage'
import LandingPage from './LandingPage'

describe('LicensePage', () => {
  it('renders ISC license text and details', () => {
    render(
      <MemoryRouter>
        <LicensePage connectionStatus="connected" />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { level: 1, name: 'ISC License' })).toBeInTheDocument()
    expect(screen.getByText(/Permission to use, copy, modify, and\/or distribute/i)).toBeInTheDocument()
    expect(screen.getByText('Commercial Use')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /back to home/i })).toHaveAttribute('href', '/')
  })
})

describe('ContributingPage', () => {
  it('renders contributing instructions and code blocks', () => {
    render(
      <MemoryRouter>
        <ContributingPage connectionStatus="connected" />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { level: 1, name: 'Contributing to Meet-Me' })).toBeInTheDocument()
    expect(screen.getByText('Getting Started')).toBeInTheDocument()
    expect(screen.getByText('Development Workflow')).toBeInTheDocument()
    expect(screen.getByText('Reporting Issues')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /back to home/i })).toHaveAttribute('href', '/')
  })
})

describe('LandingPage nav and links', () => {
  it('renders footer links pointing to internal license and contributing routes', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    )

    const licenseLink = screen.getByRole('link', { name: 'ISC License' })
    expect(licenseLink).toHaveAttribute('href', '/license')

    const contributingLink = screen.getByRole('link', { name: 'Contributing' })
    expect(contributingLink).toHaveAttribute('href', '/contributing')
  })

  it('does not have GitHub link in the top nav', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    )

    const topNav = screen.getByRole('navigation')
    expect(topNav.querySelector('.landing__nav-github')).toBeNull()
  })
})
