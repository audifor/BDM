// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MatchNextDebugApp } from './MatchNextDebugApp'

describe('Match Next debug surface', () => {
  it('renders a canonical foundation frame and advances only on explicit controls', () => {
    render(<MatchNextDebugApp />)
    expect(screen.getByText('Period 1')).toBeTruthy()
    expect(screen.getByText('Clock 600.0s')).toBeTruthy()
    expect(screen.getByText('Tick 0')).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Foundation court with ten static player markers' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Single tick' }))
    expect(screen.getByText('Tick 1')).toBeTruthy()
    expect(screen.getByText('Clock 599.9s')).toBeTruthy()
  })
})
