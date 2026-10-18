// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MatchNextDebugApp } from './MatchNextDebugApp'

describe('Match Next debug surface', () => {
  it('projects physical rebound and transition state and keeps the A-G validation scenarios selectable', () => {
    render(<MatchNextDebugApp />)
    expect(screen.getByText(/Defense:/)).toBeTruthy()
    expect(screen.getByText(/ON_BALL defender:/)).toBeTruthy()
    expect(screen.getByLabelText('Match state').textContent).toContain('MAN')
    expect(screen.getByRole('img', { name: 'Match Next court showing player movement, facing, and target vectors' })).toBeTruthy()
    expect(screen.getByLabelText('Action inspector')).toBeTruthy()
    expect(screen.getByLabelText('Defensive player inspector')).toBeTruthy()
    expect(screen.getByText(/Assignment source:/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^A/ }))
    const shotDistance = Number(screen.getByText(/Last shot:/).textContent?.match(/from ([\d.]+) m/)?.[1])
    expect(screen.getByText(/Last shot:/).textContent).toContain('3 points from')
    expect(shotDistance).toBeGreaterThan(6.75)
    expect(shotDistance).toBeLessThan(8)
    for (const [letter, title] of [['A', 'Defensive rebound'], ['B', 'Offensive rebound'], ['C', 'Rebound + outlet'], ['D', 'Turnover transition'], ['E', 'Fast break advantage'], ['F', 'Defense gets back'], ['G', 'Transition → SETUP']]) {
      expect(screen.getByRole('button', { name: `${letter} · ${title}` })).toBeTruthy()
    }
    expect(screen.getByRole('button', { name: 'Vertical Transition Slice' })).toBeTruthy()

    const initialTick = screen.getByText(/Period \/ tick:/).textContent
    for (let index = 0; index < 3; index += 1) fireEvent.click(screen.getByRole('button', { name: 'Step 0.1s' }))
    expect(screen.getByText(/Period \/ tick:/).textContent).not.toBe(initialTick)

    fireEvent.click(screen.getByRole('button', { name: 'C · Rebound + outlet' }))
    for (let index = 0; index < 7; index += 1) fireEvent.click(screen.getByRole('button', { name: 'Step 0.1s' }))
    expect(screen.getByLabelText('Rebound target')).toBeTruthy()
    expect(screen.getByLabelText('Action inspector').textContent).toContain('BOX_OUT')
    // The shooting side may send 0–2 crashers based on the real live decision.
    // All ten players must still receive one coherent rebound/transition responsibility.
    const responsibilities = screen.getByText(/Attacker crash:/).textContent ?? ''
    const roles = responsibilities.match(/Attacker crash: (\d+) \| Defender pursuit: (\d+) \| Box-out: (\d+) \| Transition safety: (\d+)/)
    expect(roles, responsibilities).not.toBeNull()
    const [, crash, pursue, boxOut, safety] = roles!.map(Number)
    expect(pursue).toBe(2)
    expect(boxOut).toBe(3)
    expect(crash + safety).toBe(5)
    fireEvent.click(screen.getByRole('button', { name: 'Check JSON resume' }))
    expect(screen.getByText('Serialization: PASS')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'D · Turnover transition' }))
    for (let index = 0; index < 30; index += 1) fireEvent.click(screen.getByRole('button', { name: 'Step 0.1s' }))
    expect(screen.getByLabelText('Action inspector').textContent).toContain('STOP_BALL')
    expect(Number(screen.getByText(/Interception secured:/).textContent?.match(/at ([\d.]+) m/)?.[1])).toBeLessThanOrEqual(0.12)

    fireEvent.click(screen.getByRole('button', { name: 'E · Fast break advantage' }))
    expect(screen.getByText(/Fast-break advantage/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Vertical Transition Slice' }))
    expect(screen.getByText(/miss → pursuit → physical rebound/)).toBeTruthy()
  })
})
