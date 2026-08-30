// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import type { MatchTacticalPlan } from '@/engine/match'
import { TacticsPcbPage } from './TacticsPcbPage'

afterEach(cleanup)

const defaultPlan: MatchTacticalPlan = { pace: 0, shotProfile: { rim: 0, midRange: 0, threePoint: 0 }, defense: { interior: 0, perimeter: 0 } }

describe('TacticsPcbPage / Match Plan', () => {
  it('changing Ritmo calls onChange with the mapped TacticalLevel', () => {
    const onChange = vi.fn()
    render(createElement(TacticsPcbPage, { plan: defaultPlan, onChange }))
    fireEvent.click(screen.getByRole('button', { name: 'Partido' }))

    const paceSelect = screen.getByLabelText('Ritmo') as HTMLSelectElement
    expect(paceSelect.value).toBe('Equilibrado')

    fireEvent.change(paceSelect, { target: { value: 'Rápido' } })

    expect(onChange).toHaveBeenCalledWith({ ...defaultPlan, pace: 1 })
  })

  it('changing Cobertura P&R calls onChange with a valid defense preset', () => {
    const onChange = vi.fn()
    render(createElement(TacticsPcbPage, { plan: defaultPlan, onChange }))
    fireEvent.click(screen.getByRole('button', { name: 'Partido' }))

    const coverageSelect = screen.getByLabelText('Cobertura P&R') as HTMLSelectElement
    expect(coverageSelect.value).toBe('Drop')

    fireEvent.change(coverageSelect, { target: { value: 'Switch' } })
    expect(onChange).toHaveBeenCalledWith({ ...defaultPlan, defense: { interior: 2, perimeter: -1 } })

    fireEvent.change(coverageSelect, { target: { value: 'Blitz' } })
    expect(onChange).toHaveBeenCalledWith({ ...defaultPlan, defense: { interior: -1, perimeter: 2 } })
  })

  it('Reset calls onReset', () => {
    const onReset = vi.fn()
    render(createElement(TacticsPcbPage, { plan: defaultPlan, onReset }))
    fireEvent.click(screen.getByRole('button', { name: 'Partido' }))

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))

    expect(onReset).toHaveBeenCalled()
  })

  it('Rotación stays local UI state with no real domain equivalent', () => {
    render(createElement(TacticsPcbPage, { plan: defaultPlan }))
    fireEvent.click(screen.getByRole('button', { name: 'Partido' }))

    const rotationSelect = screen.getByLabelText('Rotación') as HTMLSelectElement
    expect(rotationSelect.value).toBe('Estándar')
    fireEvent.change(rotationSelect, { target: { value: 'Corta' } })
    expect(rotationSelect.value).toBe('Corta')
  })

  it('opens and closes the scouting modal with a neutral no-data state when there is no world', () => {
    render(createElement(TacticsPcbPage, { plan: defaultPlan }))
    fireEvent.click(screen.getByRole('button', { name: 'Partido' }))

    fireEvent.click(screen.getByRole('button', { name: 'Ver scouting' }))

    const modal = screen.getByRole('heading', { name: /^Scouting ·/ }).closest('section')!
    expect(modal.textContent).toContain('No hay informe de scouting disponible todavía.')

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByRole('heading', { name: /^Scouting ·/ })).not.toBeInTheDocument()
  })
})
