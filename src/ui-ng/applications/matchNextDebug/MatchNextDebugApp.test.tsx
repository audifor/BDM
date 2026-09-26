// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MatchNextDebugApp } from './MatchNextDebugApp'

describe('Match Next debug surface', () => {
  it('shows ball and possession state and scripts scenarios A through E', () => {
    render(<MatchNextDebugApp />)
    expect(screen.getByText('Ball state:')).toBeTruthy()
    expect(screen.getByText('Ball owner:')).toBeTruthy()
    expect(screen.getByText('Possession phase:')).toBeTruthy()
    expect(screen.getByText('Game clock:')).toBeTruthy()
    expect(screen.getByText('Shot clock:')).toBeTruthy()
    expect(screen.getByText('Period:')).toBeTruthy()
    expect(screen.getByText('Tick:')).toBeTruthy()
    expect(screen.getByText('Score:')).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Match Next court with static players and current ball position' })).toBeTruthy()
    for (const scenario of ['A', 'B', 'C', 'D', 'E']) expect(screen.getByRole('button', { name: `Scenario ${scenario}` })).toBeTruthy()
    const panel = screen.getByLabelText('Match state')
    expect(panel.textContent).toContain('DEAD')
    fireEvent.click(screen.getByRole('button', { name: 'Step 0.1s' }))
    expect(panel.textContent).toContain('INBOUND')
    fireEvent.click(screen.getByRole('button', { name: 'Scenario C' }))
    for (let i = 0; i < 12; i += 1) fireEvent.click(screen.getByRole('button', { name: 'Step 0.1s' }))
    expect(panel.textContent).toContain('SHOT_IN_FLIGHT')
    for (let i = 0; i < 20; i += 1) fireEvent.click(screen.getByRole('button', { name: 'Step 0.1s' }))
    expect(panel.textContent).toContain('DEAD (madeBasket)')
    fireEvent.click(screen.getByRole('button', { name: 'Step 0.1s' }))
    expect(panel.textContent).toContain('INBOUND')
  })
})
