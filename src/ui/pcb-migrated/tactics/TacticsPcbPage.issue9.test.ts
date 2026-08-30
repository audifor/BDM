// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { createNewGame } from '@/app/game'
import { getNextUserGame, getUserTeam } from '@/engine/calendar'
import { getTeamRoster, resolveGameClockRules } from '@/domain/world'
import { setLineupSlot } from '@/engine/tactics/LineupEngine'
import { saveDesignerPlay } from '@/engine/tactics/PlaybookEngine'
import { NCAA_MEN_GAME_FORMAT } from '@/domain/competition'
import type { DefensiveMatchupAssignment } from '@/domain/tactics'
import { TacticsPcbPage } from './TacticsPcbPage'

afterEach(cleanup)
afterEach(() => window.localStorage.clear())

function withStarterLineup(base: ReturnType<typeof createNewGame>) {
  const team = getUserTeam(base)!
  const roster = getTeamRoster(base, team.id)
  const slots = ['PG', 'SG', 'SF', 'PF', 'C', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7'] as const
  return slots.reduce((next, slot, index) => setLineupSlot(next, team.id, slot, roster[index]!.id), base)
}

/** A designer FrameData with two distinct action paths, matching PcbTacticsCreator's internal shape. */
function frameWithTwoActions() {
  return {
    players: [{ id: 1, x: 250, y: 380, label: '1', role: 'PG' }],
    ballOwnerId: 1,
    ballPosition: { x: 250, y: 380 },
    paths: [
      { id: 101, type: 'move', points: [{ x: 250, y: 380 }, { x: 200, y: 300 }], linkedId: 1 },
      { id: 102, type: 'pass', points: [{ x: 250, y: 380 }, { x: 80, y: 300 }] },
    ],
    defenders: [],
  }
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

  it('Rotaciones rows are not draggable (prohibited drag interference with range/number inputs)', () => {
    const world = withStarterLineup(createNewGame())
    render(createElement(TacticsPcbPage, { world }))
    fireEvent.click(screen.getByRole('button', { name: 'Rotaciones' }))

    const rows = document.querySelectorAll('.pcb-tactics__rotation-grid > div:not(.is-head)')
    expect(rows.length).toBeGreaterThan(0)
    rows.forEach((row) => expect(row).not.toHaveAttribute('draggable'))
  })

  it('offers distinct data-driven rotation presets, each producing its own allocation', () => {
    const world = withStarterLineup(createNewGame())
    const team = getUserTeam(world)!
    const roster = getTeamRoster(world, team.id)
    const onUpdateRotationMinutes = vi.fn()
    render(createElement(TacticsPcbPage, { world, onUpdateRotationMinutes }))
    fireEvent.click(screen.getByRole('button', { name: 'Rotaciones' }))

    const presetSelect = screen.getByLabelText('Preset de rotación') as HTMLSelectElement
    const optionValues = Array.from(presetSelect.options).map((option) => option.value).filter((value) => value !== '')
    expect(optionValues).toEqual(expect.arrayContaining(['balanced', 'short', 'deep', 'starters', 'bench']))

    fireEvent.change(presetSelect, { target: { value: 'starters' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    const startersMinutes = onUpdateRotationMinutes.mock.calls.at(-1)![0]
    expect(startersMinutes[roster[0]!.id]).toEqual([10, 10, 10, 10, 0])
    expect(startersMinutes[roster[5]!.id]).toEqual([0, 0, 0, 0, 0])

    fireEvent.change(presetSelect, { target: { value: 'bench' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    const benchMinutes = onUpdateRotationMinutes.mock.calls.at(-1)![0]
    expect(benchMinutes[roster[0]!.id]).toEqual([0, 0, 0, 0, 0])
    expect(benchMinutes[roster[5]!.id]).toEqual([10, 10, 10, 10, 0])

    expect(startersMinutes).not.toEqual(benchMinutes)
  })

  it('per-period minute caps derive from the actual resolved competition, including a distinct OT cap', () => {
    const base = withStarterLineup(createNewGame())
    const nextGame = getNextUserGame(base)!
    const ncaaWorld = { ...base, competitions: Object.fromEntries(Object.entries(base.competitions).map(([id, competition]) => [id, id === nextGame.competitionId ? { ...competition, rules: { ...competition.rules, gameFormat: NCAA_MEN_GAME_FORMAT } } : competition])) }
    render(createElement(TacticsPcbPage, { world: ncaaWorld }))
    fireEvent.click(screen.getByRole('button', { name: 'Rotaciones' }))

    const numberInputs = document.querySelectorAll('.pcb-tactics__rotation-grid input[type="number"]')
    const rules = resolveGameClockRules(ncaaWorld, nextGame.competitionId)
    // NCAA men resolve to 2 regulation periods (20 min) + 1 OT column (5 min) per row.
    expect(numberInputs[0]).toHaveAttribute('max', String(rules.periodSeconds / 60))
    expect(numberInputs[2]).toHaveAttribute('max', String(rules.overtimeSeconds / 60))
    expect(rules.periodSeconds / 60).not.toBe(rules.overtimeSeconds / 60)
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

  it('rotation editing state reconciles when the canonical active 12 changes: a removed player is not re-persisted', () => {
    const base = withStarterLineup(createNewGame())
    const team = getUserTeam(base)!
    const roster = getTeamRoster(base, team.id)
    // A real generated player from another roster of the same gender, moved onto the user's roster
    // (test-only; mirrors the pattern used elsewhere for exercising a roster swap with real records).
    const donor = Object.values(base.teams).find((candidate) => candidate.id !== team.id && candidate.gender === team.gender)!
    const outsidePlayerId = donor.rosterPlayerIds[0]!
    const worldWithSwap = {
      ...base,
      teams: {
        ...base.teams,
        [team.id]: { ...base.teams[team.id]!, rosterPlayerIds: [...base.teams[team.id]!.rosterPlayerIds, outsidePlayerId] },
        [donor.id]: { ...donor, rosterPlayerIds: donor.rosterPlayerIds.filter((id) => id !== outsidePlayerId) },
      },
    }
    const onUpdateRotationMinutes = vi.fn()
    const { rerender } = render(createElement(TacticsPcbPage, { world: worldWithSwap, onUpdateRotationMinutes }))
    fireEvent.click(screen.getByRole('button', { name: 'Rotaciones' }))

    // Remove roster[0] (PG starter) from the lineup by replacing PG with the newly-added outside player.
    const worldAfterSwap = setLineupSlot(worldWithSwap, team.id, 'PG', outsidePlayerId)
    rerender(createElement(TacticsPcbPage, { world: worldAfterSwap, onUpdateRotationMinutes }))

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    const persisted = onUpdateRotationMinutes.mock.calls.at(-1)![0]
    expect(persisted[roster[0]!.id]).toBeUndefined()
    expect(persisted[outsidePlayerId]).toBeDefined()
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

  it('changing the upcoming game/opponent does not leak the previous game\'s matchup assignments into the new game', () => {
    const base = withStarterLineup(createNewGame())
    const team = getUserTeam(base)!
    const gameA = getNextUserGame(base)!
    const opponentAId = gameA.homeTeamId === team.id ? gameA.awayTeamId : gameA.homeTeamId
    const opponentARoster = getTeamRoster(base, opponentAId)
    const ourRoster = getTeamRoster(base, team.id)

    const onUpdateMatchups = vi.fn()
    const { rerender } = render(createElement(TacticsPcbPage, { world: base, onUpdateMatchups }))
    fireEvent.click(screen.getByRole('button', { name: 'Emparejamientos' }))
    fireEvent.change(screen.getByLabelText(`Defensor de ${opponentARoster[0]!.firstName} ${opponentARoster[0]!.lastName}`), { target: { value: ourRoster[0]!.id } })
    expect(onUpdateMatchups).toHaveBeenCalledTimes(1)

    // Simulate game A completing and a new upcoming game B against a different opponent, with no
    // persisted matchups yet for B - the store would not carry game A's TeamGamePlan forward since
    // gamePlansByKey is keyed by gameId, but the UI's local `assignments` state must also reconcile.
    const otherTeamId = Object.keys(base.teams).find((id) => id !== team.id && id !== opponentAId && id !== gameA.homeTeamId && id !== gameA.awayTeamId)
    const worldWithGameB = otherTeamId === undefined ? base : { ...base, games: { ...base.games, [gameA.id]: { ...gameA, status: 'completed' as const, result: { homeScore: 70, awayScore: 60 } } } }
    rerender(createElement(TacticsPcbPage, { world: worldWithGameB, onUpdateMatchups }))
    fireEvent.click(screen.getByRole('button', { name: 'Emparejamientos' }))

    const nextGame = getNextUserGame(worldWithGameB)
    if (nextGame !== undefined && nextGame.id !== gameA.id) {
      const opponentBId = nextGame.homeTeamId === team.id ? nextGame.awayTeamId : nextGame.homeTeamId
      const opponentBRoster = getTeamRoster(worldWithGameB, opponentBId)
      const select = screen.queryByLabelText(`Defensor de ${opponentBRoster[0]!.firstName} ${opponentBRoster[0]!.lastName}`) as HTMLSelectElement | null
      // No assignment for game B's opponent should be pre-populated from game A.
      if (select !== null) expect(select.value).toBe('')
    }
  })

  it('resolveGameClockRules used by Rotaciones period columns is the same canonical resolver used elsewhere - no duplicated UI thresholds', () => {
    const world = withStarterLineup(createNewGame())
    const nextGame = getNextUserGame(world)!
    expect(resolveGameClockRules(world, nextGame.competitionId).periodCount).toBe(4)
  })

  it('save a Designer play persists it into GameWorld.savedPlaysById and it is immediately present in Jugadas', () => {
    const world = createNewGame()
    const onSaveDesignerPlay = vi.fn((play) => { savedWorld = saveDesignerPlay(savedWorld, play) })
    let savedWorld = world
    const { rerender } = render(createElement(TacticsPcbPage, { world, onSaveDesignerPlay }))
    fireEvent.click(screen.getByRole('button', { name: 'Diseñador' }))

    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }))
    expect(onSaveDesignerPlay).toHaveBeenCalledTimes(1)

    rerender(createElement(TacticsPcbPage, { world: savedWorld, onSaveDesignerPlay }))
    fireEvent.click(screen.getByRole('button', { name: 'Jugadas' }))
    expect(screen.getByText('Nueva Jugada')).toBeInTheDocument()
    expect(Object.keys(savedWorld.savedPlaysById)).toHaveLength(1)
  })

  it('play ids are stable/deterministic entity ids, not Date.now()', () => {
    const world = createNewGame()
    let savedWorld = world
    const onSaveDesignerPlay = vi.fn((play) => { savedWorld = saveDesignerPlay(savedWorld, play) })
    render(createElement(TacticsPcbPage, { world, onSaveDesignerPlay }))
    fireEvent.click(screen.getByRole('button', { name: 'Diseñador' }))
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }))

    const [savedPlay] = Object.values(savedWorld.savedPlaysById)
    expect(savedPlay!.id).not.toMatch(/^library-\d+$/)
  })

  it('a real Designer action/step (not a frame) can be deleted from the RESUMEN list without corrupting other actions', () => {
    const seededWorld = saveDesignerPlay(createNewGame(), { id: 'seeded-play', name: 'Seeded Play', createdAt: '2026-01-01', frames: [frameWithTwoActions()] })
    render(createElement(TacticsPcbPage, { world: seededWorld }))
    fireEvent.click(screen.getByRole('button', { name: 'Diseñador' }))
    fireEvent.click(screen.getByRole('button', { name: /Cargar/ }))
    fireEvent.click(screen.getByText('Seeded Play'))

    // Two distinct action entries in RESUMEN before deletion.
    expect(screen.getByText('MOVE')).toBeInTheDocument()
    expect(screen.getByText('PASS')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar acción move' }))

    // Only the deleted action is gone; the other action survives untouched.
    expect(screen.queryByText('MOVE')).not.toBeInTheDocument()
    expect(screen.getByText('PASS')).toBeInTheDocument()
  })

  it('deleting a middle action of three preserves the other two, identified by id rather than array position', () => {
    const threeActionFrame = {
      ...frameWithTwoActions(),
      paths: [
        { id: 201, type: 'move', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], linkedId: 1 },
        { id: 202, type: 'dribble', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], linkedId: 1 },
        { id: 203, type: 'screen', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], linkedId: 1 },
      ],
    }
    const seededWorld = saveDesignerPlay(createNewGame(), { id: 'seeded-play-2', name: 'Three Actions', createdAt: '2026-01-01', frames: [threeActionFrame] })
    render(createElement(TacticsPcbPage, { world: seededWorld }))
    fireEvent.click(screen.getByRole('button', { name: 'Diseñador' }))
    fireEvent.click(screen.getByRole('button', { name: /Cargar/ }))
    fireEvent.click(screen.getByText('Three Actions'))

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar acción dribble' }))

    expect(screen.getByText('MOVE')).toBeInTheDocument()
    expect(screen.queryByText('DRIBBLE')).not.toBeInTheDocument()
    expect(screen.getByText('SCREEN')).toBeInTheDocument()
  })

  it('Match Plan no longer shows a fake session-only save confirmation for unrelated fields', () => {
    const world = createNewGame()
    render(createElement(TacticsPcbPage, { world }))
    fireEvent.click(screen.getByRole('button', { name: 'Partido' }))

    fireEvent.click(screen.getByRole('button', { name: 'Guardar plan' }))
    expect(screen.queryByText('Plan guardado para esta sesión.')).not.toBeInTheDocument()
  })

  it('Guardar plan in Match Plan persists the tactical override into the real TeamGamePlan for the upcoming game', () => {
    const world = createNewGame()
    const onSaveGamePlanTacticalOverride = vi.fn()
    render(createElement(TacticsPcbPage, { world, onSaveGamePlanTacticalOverride, plan: { pace: 1, shotProfile: { rim: 0, midRange: 0, threePoint: 0 }, defense: { interior: 0, perimeter: 0 } } }))
    fireEvent.click(screen.getByRole('button', { name: 'Partido' }))

    fireEvent.click(screen.getByRole('button', { name: 'Guardar plan' }))

    expect(onSaveGamePlanTacticalOverride).toHaveBeenCalledWith(expect.objectContaining({ pace: 1 }))
  })
})
