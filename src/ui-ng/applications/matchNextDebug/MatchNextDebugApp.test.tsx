// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MatchNextDebugApp } from './MatchNextDebugApp'

describe('Match Next movement debug surface', () => {
  it('shows movement truth, explains selected players, and exposes scenarios A through E', () => {
    render(<MatchNextDebugApp />)
    expect(screen.getByText('Ball:')).toBeTruthy()
    expect(screen.getByText('Formation:')).toBeTruthy()
    expect(screen.getByText('Ball side:')).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Match Next court showing player movement, facing, and target vectors' })).toBeTruthy()
    expect(screen.getByLabelText('Player inspector')).toBeTruthy()
    for (const scenario of ['A', 'B', 'C', 'D', 'E']) expect(screen.getByRole('button', { name: `Scenario ${scenario}` })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Step 0.1s' }))
    expect(screen.getByText(/INBOUND/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Scenario B' }))
    expect(screen.getByText(/scripted opposite-side pass/i)).toBeTruthy()
    expect(screen.getAllByText(/5OUT/).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Scenario C' }))
    expect(screen.getByText(/four players cover the same 6\.3 m target distance/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Step 0.1s' }))
    expect(screen.getByText('Scenario C · Recorded kinematics')).toBeTruthy()
    expect(screen.getAllByText(/Profile:/).length).toBe(4)
    expect(screen.getAllByText(/Peak accel:/)).toHaveLength(4)
    expect(screen.getAllByText(/Peak braking:/)).toHaveLength(4)
    expect(screen.getAllByText('Run start: 6.3 m')).toHaveLength(4)
    for (let index = 0; index < 38; index += 1) fireEvent.click(screen.getByRole('button', { name: 'Step 0.1s' }))
    const traces = screen.getByLabelText('Athletic profile traces')
    expect(screen.getAllByText(/Arrived:/)).toHaveLength(4)
    for (const metric of [/Peak speed:/, /Peak accel:/, /Peak braking:/, /Arrived:/]) {
      const readings = screen.getAllByText(metric).map((element) => element.textContent)
      expect(new Set(readings).size).toBeGreaterThan(1)
    }
    expect(traces.textContent).toContain('5.2 m/s')
    expect(traces.textContent).toContain('4.8 m/s')
    fireEvent.click(screen.getByRole('button', { name: 'Scenario E' }))
    fireEvent.click(screen.getByRole('button', { name: 'Check JSON resume' }))
    expect(screen.getByText('Serialization: PASS')).toBeTruthy()
  })
})
