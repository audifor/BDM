// @vitest-environment jsdom
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { createNewGame } from '@/app/game'
import { getUserTeam } from '@/engine/calendar'
import { getTeamRoster } from '@/domain/world'
import { createDefaultTacticalPlan, validateTacticalPlan, type MatchTacticalPlan } from '@/engine/match'
import { TacticsPcbPage } from './TacticsPcbPage'

afterEach(cleanup)
afterEach(() => window.localStorage.clear())

describe('TacticsPcbPage / real GameWorld integration', () => {
  it('Pizarra board uses the real controlled roster, not fake fixture players', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const roster = getTeamRoster(world, team.id)
    render(createElement(TacticsPcbPage, { world }))

    expect(screen.getByText(`${roster.length} disp.`)).toBeInTheDocument()
    for (const player of roster.slice(0, 5)) {
      expect(screen.getAllByText(`${player.firstName} ${player.lastName}`).length).toBeGreaterThan(0)
    }
  })

  it('Rotaciones tab uses the real controlled roster', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const roster = getTeamRoster(world, team.id)
    render(createElement(TacticsPcbPage, { world }))
    fireEvent.click(screen.getByRole('button', { name: 'Rotaciones' }))

    for (const player of roster.slice(0, 5)) {
      expect(screen.getAllByText(`${player.firstName} ${player.lastName}`).length).toBeGreaterThan(0)
    }
  })

  it('no fake TACTICS_PLAYERS / TACTICS_OPPONENTS fixture names remain reachable in production rendering', () => {
    const world = createNewGame()
    const markup = renderToStaticMarkup(createElement(TacticsPcbPage, { world }))
    for (const fakeName of ['Marcus Cole', 'Ethan Brooks', 'Julian Price', 'Malik Grant', 'Noah Bennett', 'Leo Carter', 'Andre Mills', 'Victor Hale', 'Owen Fox', 'Darius King', 'T. Walker', 'J. Lewis', 'R. Stone', 'C. White', 'D. Young', 'Lions BC', 'Falcons BC', 'Titans BC']) {
      expect(markup).not.toContain(fakeName)
    }
  })

  it('TacticsMigrationRepository no longer exports fake roster/opponent fixtures', async () => {
    const mod = await import('./TacticsMigrationRepository')
    const keys = Object.keys(mod)
    expect(keys).not.toContain('TACTICS_PLAYERS')
    expect(keys).not.toContain('TACTICS_OPPONENTS')
    expect(keys).toContain('TacticsMigrationRepository')
    expect(keys).toContain('INITIAL_FRAME')
  })

  it('Match Plan notes default to empty instead of fabricated coaching content', () => {
    const world = createNewGame()
    render(createElement(TacticsPcbPage, { world }))
    fireEvent.click(screen.getByRole('button', { name: 'Partido' }))

    const notes = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(notes.value).toBe('')
    expect(screen.queryByText(/Atacar el lado débil/)).not.toBeInTheDocument()
  })

  it('the Pizarra board persists state under the real team id, not a fabricated fallback', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    render(createElement(TacticsPcbPage, { world }))

    expect(window.localStorage.getItem(`pcbasket.tactics.board.${team.id}.config`)).not.toBeNull()
    expect(window.localStorage.getItem('pcbasket.tactics.board.1.config')).toBeNull()
  })

  it('the pace/coverage tactical controls call onChange with a MatchTacticalPlan valid per validateTacticalPlan', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const plan = createDefaultTacticalPlan()
    const onChange = vi.fn()
    render(createElement(TacticsPcbPage, { world, plan, onChange }))
    fireEvent.click(screen.getByRole('button', { name: 'Partido' }))

    fireEvent.change(screen.getByLabelText('Ritmo'), { target: { value: 'Rápido' } })
    fireEvent.change(screen.getByLabelText('Cobertura P&R'), { target: { value: 'Switch' } })

    expect(onChange).toHaveBeenCalledTimes(2)
    for (const call of onChange.mock.calls) {
      const nextPlan = call[0] as MatchTacticalPlan
      expect(() => validateTacticalPlan(nextPlan, team.rosterPlayerIds)).not.toThrow()
    }
  })
})
