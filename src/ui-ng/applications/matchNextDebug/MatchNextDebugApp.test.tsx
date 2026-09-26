// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MatchNextDebugApp } from './MatchNextDebugApp'

describe('Match Next man-to-man debug surface', () => {
  it('projects assignments, defensive targets, responsibilities, and scenarios A through E', () => {
    render(<MatchNextDebugApp />)
    expect(screen.getByText(/Defense:/)).toBeTruthy()
    expect(screen.getByText(/ON_BALL defender:/)).toBeTruthy()
    expect(screen.getByLabelText('Match state').textContent).toContain('MAN')
    expect(screen.getByRole('img', { name: 'Match Next court showing player movement, facing, and target vectors' })).toBeTruthy()
    expect(screen.getByLabelText('Defensive player inspector')).toBeTruthy()
    expect(screen.getByText(/Assignment source:/)).toBeTruthy()
    for (const scenario of ['A', 'B', 'C', 'D', 'E']) expect(screen.getByRole('button', { name: `Scenario ${scenario}` })).toBeTruthy()

    const selectedPosition = () => screen.getByText(/^Position:/).textContent
    const initialPosition = selectedPosition()
    for (let index = 0; index < 3; index += 1) fireEvent.click(screen.getByRole('button', { name: 'Step 0.1s' }))
    expect(selectedPosition()).not.toBe(initialPosition)

    const onBallSummary = () => screen.getByText(/ON_BALL defender:/).parentElement?.textContent
    const beforePass = onBallSummary()
    fireEvent.click(screen.getByRole('button', { name: 'Scenario B' }))
    expect(screen.getByText(/Pase al lado/)).toBeTruthy()
    for (let index = 0; index < 5; index += 1) fireEvent.click(screen.getByRole('button', { name: 'Step 0.1s' }))
    expect(onBallSummary()).not.toBe(beforePass)

    fireEvent.click(screen.getByRole('button', { name: 'Scenario C' }))
    expect(screen.getByText(/Skip pass to the far side/)).toBeTruthy()
    for (let index = 0; index < 5; index += 1) fireEvent.click(screen.getByRole('button', { name: 'Step 0.1s' }))
    const helpSummary = screen.getByText(/HELP defenders:/).textContent ?? ''
    const helpDefenderId = helpSummary.replace('HELP defenders:', '').split(',')[0]?.trim()
    expect(helpDefenderId).toBeTruthy()
    expect(helpDefenderId).not.toBe('none')
    fireEvent.change(screen.getByLabelText('Player'), { target: { value: helpDefenderId } })
    const helpPosition = selectedPosition()
    for (let index = 0; index < 3; index += 1) fireEvent.click(screen.getByRole('button', { name: 'Step 0.1s' }))
    expect(selectedPosition()).not.toBe(helpPosition)

    fireEvent.click(screen.getByRole('button', { name: 'Scenario D' }))
    expect(screen.getByText(/RECOVER/)).toBeTruthy()
    const recoverHelperId = (screen.getByText(/HELP defenders:/).textContent ?? '').replace('HELP defenders:', '').split(',')[0]?.trim()
    expect(recoverHelperId).toBeTruthy()
    expect(recoverHelperId).not.toBe('none')
    fireEvent.change(screen.getByLabelText('Player'), { target: { value: recoverHelperId } })
    const recoverPosition = selectedPosition()
    for (let index = 0; index < 5; index += 1) fireEvent.click(screen.getByRole('button', { name: 'Step 0.1s' }))
    expect(selectedPosition()).not.toBe(recoverPosition)
    expect(screen.getAllByText('RECOVER').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Scenario E' }))
    expect(screen.getByText(/periodo 3/)).toBeTruthy()
    expect(screen.getByText(/Period \/ tick:/).parentElement?.textContent).toContain('3 /')
    fireEvent.click(screen.getByRole('button', { name: 'Check JSON resume' }))
    expect(screen.getByText('Serialization: PASS')).toBeTruthy()
  })
})
