import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import VideoTile from './VideoTile'

describe('VideoTile', () => {
  it('shows a placeholder with the first letter of the label when there is no stream', () => {
    render(<VideoTile stream={null} label="Bekmurod" />)
    expect(screen.getByText('B')).toBeInTheDocument()
  })

  it('shows a placeholder when showVideo is false, even with a stream', () => {
    const fakeStream = {}
    render(<VideoTile stream={fakeStream} showVideo={false} label="Aziz" />)
    expect(screen.getByText('A')).toBeInTheDocument()
  })

  it('falls back to "?" when there is no label', () => {
    render(<VideoTile stream={null} label={undefined} />)
    expect(screen.getByText('?')).toBeInTheDocument()
  })

  it('renders the caption text', () => {
    render(<VideoTile stream={null} label="Bekmurod (you)" />)
    expect(screen.getByText('Bekmurod (you)')).toBeInTheDocument()
  })

  it('is not focusable or clickable when no onClick is given', () => {
    render(<VideoTile stream={null} label="Bekmurod" />)
    const figure = screen.getByText('Bekmurod').closest('figure')
    expect(figure).not.toHaveAttribute('role')
    expect(figure).not.toHaveAttribute('tabindex')
  })

  it('calls onClick when clicked, when clickable', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<VideoTile stream={null} label="Bekmurod" onClick={onClick} />)

    await user.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('calls onClick on Enter and Space when focused', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<VideoTile stream={null} label="Bekmurod" onClick={onClick} />)

    const tile = screen.getByRole('button')
    tile.focus()
    await user.keyboard('{Enter}')
    await user.keyboard(' ')

    expect(onClick).toHaveBeenCalledTimes(2)
  })

  it('applies the size and active modifiers as classes', () => {
    render(<VideoTile stream={null} label="Bekmurod" size="large" active />)
    const figure = screen.getByText('Bekmurod').closest('figure')

    expect(figure).toHaveClass('video-tile--large')
    expect(figure).toHaveClass('is-active')
  })
})
