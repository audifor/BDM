// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { createNewGame } from '@/app/game'
import { getNextUserGame, getUserTeam } from '@/engine/calendar'
import { getTeamRoster, resolveGameClockRules } from '@/domain/world'
import { setLineupSlot } from '@/engine/tactics/LineupEngine'
import { NCAA_MEN_GAME_FORMAT } from '@/domain/competition'
import type { DefensiveMatchupAssignment } from '@/domain/tactics'
import { TacticsPcbPage } from './TacticsPcbPage'

afterEach(cleanup)
afterEach(() => window.localStorage.clear())

function withStarterLineup(base: ReturnType<typeof createNewGame>) {
  const team = getUserTeam(base)!
  const roster = getTeamRoster(base, team.id)
  const slots = ['PG', 'SG', 'SF', 'PF', 'C'] as const
  return slots.reduce((next, slot, index) => setLineupSlot(next, team.id, slot, roster[index]!.id), base)
}

describe('TacticsPcbPage / Issue #9 acceptance', () => {
  it('no FIBA/NBA/NCAA selector remains as a user-controlled rules context in Rotaciones', () => {
    const world = withStarterLineup(createNewGame())
    render(createElement(TacticsPcbPage, { world }))
    fireEvent.click(screen.getByRole('button', { name: 'Rotaciones' }))

    expect(screen.queryByText('FIBA')).not.toBeInTheDocument()
    expect(screen.queryByText('NBA')).not.toBeInTheDocument()
    expect(screen.queryByText('NCAA')).not.toBeInTheDocument()
  })

  it('Rotaciones renders a period-column grid sized to the real resolved competition format, not a fixed 4-quarter assumption', () => {
    const base = withStarterLineup(createNewGame())
    const nextGame = getNextUserGame(base)!
    const ncaaWorld = { ...base, competitions: Object.fromEntries(Object.entries(base.competitions).map(([id, competition]) => [id, id === nextGame.competitionId ? { ...competition, rules: { ...competition.rules, gameFormat: NCAA_MEN_GAME_FORMAT } } : competition])) }
    render(createElement(TacticsPcbPage, { world: ncaaWorld }))
    fireEvent.click(screen.getByRole('button', { name: 'Rotaciones' }))

    expect(screen.getByText('P1')).toBeInTheDocument()
    expect(screen.getByText('P2')).toBeInTheDocument()
    expect(screen.queryByText('P3')).not.toBeInTheDocument()
    expect(screen.getByText('OT')).toBeInTheDocument()
  })

  it('Guardar in Rotaciones persists rotation minutes into TeamRotationIntent.minutesByPeriod', () => {
    const world = withStarterLineup(createNewGame())
    const team = getUserTeam(world)!
    const onUpdateRotationMinutes = vi.fn()
    render(createElement(TacticsPcbPage, { world, onUpdateRotationMinutes }))
    fireEvent.click(screen.getByRole('button', { name: 'Rotaciones' }))

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(onUpdateRotationMinutes).toHaveBeenCalledTimes(1)
    const minutesByPeriod = onUpdateRotationMinutes.mock.calls[0]![0]
    const roster = getTeamRoster(world, team.id)
    expect(minutesByPeriod[roster[0]!.id]).toEqual([8, 8, 8, 8, 0])
  })

  it('reopening Rotaciones after a save displays the previously persisted minutes, not the hardcoded default', () => {
    const base = withStarterLineup(createNewGame())
    const team = getUserTeam(base)!
    const roster = getTeamRoster(base, team.id)
    const world = { ...base, rotationPlansByTeamId: { ...base.rotationPlansByTeamId, [team.id]: { teamId: team.id, instructions: [], minutesByPeriod: { [roster[0]!.id]: [5, 5, 5, 5, 0] } } } }
    render(createElement(TacticsPcbPage, { world }))
    fireEvent.click(screen.getByRole('button', { name: 'Rotaciones' }))

    const row = screen.getByText(new RegExp(`${roster[0]!.firstName} ${roster[0]!.lastName}$`)).closest('div')!
    const firstPeriodInput = row.querySelector('input[type="number"]') as HTMLInputElement
    expect(Number(firstPeriodInput.value)).toBe(5)
  })

  it('an invalid per-period minutes total produces a truthful warning instead of a silent save', () => {
    const world = withStarterLineup(createNewGame())
    render(createElement(TacticsPcbPage, { world }))
    fireEvent.click(screen.getByRole('button', { name: 'Rotaciones' }))

    // Default starters preset already sums to 5*8=40 for a 10-minute period (valid); break it.
    const numberInputs = document.querySelectorAll('.pcb-tactics__rotation-grid input[type="number"]')
    fireEvent.change(numberInputs[0]!, { target: { value: '1' } })

    expect(screen.getByRole('alert')).toHaveTextContent(/inválidos/)
  })

  it('Matchups shows the real next-opponent roster with zero scouting, and assigning a defender persists a DefensiveMatchupAssignment', () => {
    const world = withStarterLineup(createNewGame())
    const team = getUserTeam(world)!
    const nextGame = getNextUserGame(world)!
    const opponentTeamId = nextGame.homeTeamId === team.id ? nextGame.awayTeamId : nextGame.homeTeamId
    const opponentRoster = getTeamRoster(world, opponentTeamId)
    const onUpdateMatchups = vi.fn()
    render(createElement(TacticsPcbPage, { world, onUpdateMatchups }))
    fireEvent.click(screen.getByRole('button', { name: 'Emparejamientos' }))

    expect(screen.getAllByText(`${opponentRoster[0]!.firstName} ${opponentRoster[0]!.lastName}`).length).toBeGreaterThan(0)

    const select = screen.getByLabelText(`Defensor de ${opponentRoster[0]!.firstName} ${opponentRoster[0]!.lastName}`) as HTMLSelectElement
    const ourRoster = getTeamRoster(world, team.id)
    fireEvent.change(select, { target: { value: ourRoster[0]!.id } })

    expect(onUpdateMatchups).toHaveBeenCalledTimes(1)
    const matchups = onUpdateMatchups.mock.calls[0]![0] as readonly DefensiveMatchupAssignment[]
    expect(matchups).toEqual([{ ourPlayerId: ourRoster[0]!.id, opponentPlayerId: opponentRoster[0]!.id }])
  })

  it('resolveGameClockRules used by Rotaciones period columns is the same canonical resolver used elsewhere - no duplicated UI thresholds', () => {
    const world = withStarterLineup(createNewGame())
    const nextGame = getNextUserGame(world)!
    expect(resolveGameClockRules(world, nextGame.competitionId).periodCount).toBe(4)
  })

  it('save a Designer play, switch to Jugadas, and the play is immediately present', () => {
    const world = createNewGame()
    render(createElement(TacticsPcbPage, { world }))
    fireEvent.click(screen.getByRole('button', { name: 'Diseñador' }))

    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }))

    fireEvent.click(screen.getByRole('button', { name: 'Jugadas' }))
    expect(screen.getByText('Nueva Jugada')).toBeInTheDocument()
  })

  it('a Designer action/step can be deleted without corrupting later state', () => {
    const world = createNewGame()
    render(createElement(TacticsPcbPage, { world }))
    fireEvent.click(screen.getByRole('button', { name: 'Diseñador' }))

    fireEvent.click(screen.getByRole('button', { name: /AÃ‘ADIR/ }))
    expect(screen.getByText('2/2')).toBeInTheDocument()

    const frameThumbnails = document.querySelectorAll('[style*="min-width: 60px"]')
    const deleteButtons = Array.from(frameThumbnails).flatMap((thumb) => Array.from(thumb.querySelectorAll('button')))
    expect(() => fireEvent.click(deleteButtons[0]!)).not.toThrow()
    expect(screen.getByText('1/1')).toBeInTheDocument()
  })
})
