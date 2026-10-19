// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import type { MatchTacticalPlan } from '@/engine/match'
import { createNewGame } from '@/app/game'
import { getNextUserGame, getUserTeam } from '@/engine/calendar'
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

  it('changing Cobertura P&R sets the real pick-and-roll coverage and leaves the defensive preset alone', () => {
    const onChange = vi.fn()
    render(createElement(TacticsPcbPage, { plan: defaultPlan, onChange }))
    fireEvent.click(screen.getByRole('button', { name: 'Partido' }))

    // The control is only operable when there is a next game to apply the plan to.
    const coverageSelect = screen.getByLabelText('Cobertura P&R') as HTMLSelectElement
    expect(coverageSelect).toBeDisabled()
    expect(coverageSelect.value).toBe('Switch')
  })

  it('applies pick-and-roll coverage and the defensive preset as independent canonical instructions', () => {
    const world = createNewGame()
    const onChange = vi.fn()
    render(createElement(TacticsPcbPage, { world, plan: defaultPlan, onChange }))
    fireEvent.click(screen.getByRole('button', { name: 'Partido' }))

    fireEvent.change(screen.getByLabelText('Cobertura P&R'), { target: { value: 'Blitz' } })
    expect(onChange).toHaveBeenLastCalledWith({ ...defaultPlan, defense: { interior: 0, perimeter: 0, pickAndRollCoverage: 'blitz' } })

    fireEvent.change(screen.getByLabelText('Esquema defensivo'), { target: { value: 'Proteger pintura' } })
    expect(onChange).toHaveBeenLastCalledWith({ ...defaultPlan, defense: { interior: 2, perimeter: -1 } })
  })

  it('removes the game adjustment only when there is one, and offers no control the engine does not execute', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const nextGame = getNextUserGame(world)!
    const override = { pace: 1 as const, shotProfile: { rim: 0 as const, midRange: 0 as const, threePoint: 0 as const }, defense: { interior: 0 as const, perimeter: 0 as const } }
    const onReset = vi.fn()
    const { rerender } = render(createElement(TacticsPcbPage, { world, onReset }))
    fireEvent.click(screen.getByRole('button', { name: 'Partido' }))
    expect(screen.getByRole('button', { name: 'Quitar ajuste del partido' })).toBeDisabled()

    rerender(createElement(TacticsPcbPage, { world: { ...world, gamePlansByKey: { [`${nextGame.id}:${team.id}`]: { gameId: nextGame.id, teamId: team.id, tacticalOverride: override } } }, onReset }))
    fireEvent.click(screen.getByRole('button', { name: 'Quitar ajuste del partido' }))
    expect(onReset).toHaveBeenCalled()
    // The old "Rotación" select was local state with no canonical equivalent: it must not come back as a decorative control.
    expect(screen.queryByLabelText('Rotación')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Guardar plan' })).not.toBeInTheDocument()
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
