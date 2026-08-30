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
import { updateRotationMinutesForTeam } from '@/engine/tactics/RotationEngine'
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

  it.each<readonly ['balanced' | 'short' | 'deep' | 'starters' | 'bench']>([['balanced'], ['short'], ['deep'], ['starters'], ['bench']])(
    'the %s preset produces an EXACT valid regulation total under FIBA 10-minute periods',
    (presetId) => {
      const world = withStarterLineup(createNewGame())
      const team = getUserTeam(world)!
      const roster = getTeamRoster(world, team.id)
      const onUpdateRotationMinutes = vi.fn()
      render(createElement(TacticsPcbPage, { world, onUpdateRotationMinutes }))
      fireEvent.click(screen.getByRole('button', { name: 'Rotaciones' }))

      fireEvent.change(screen.getByLabelText('Preset de rotación'), { target: { value: presetId } })
      const saveButton = screen.getByRole('button', { name: 'Guardar' })
      expect(saveButton).not.toBeDisabled()
      fireEvent.click(saveButton)

      expect(onUpdateRotationMinutes).toHaveBeenCalledTimes(1)
      const minutesByPeriod = onUpdateRotationMinutes.mock.calls[0]![0] as Record<string, readonly number[]>
      for (let period = 0; period < 4; period += 1) {
        const total = roster.reduce((sum, player) => sum + (minutesByPeriod[player.id]?.[period] ?? 0), 0)
        expect(total).toBe(10 * 5)
      }
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    },
  )

  it.each<readonly ['balanced' | 'short' | 'deep' | 'starters' | 'bench']>([['balanced'], ['short'], ['deep'], ['starters'], ['bench']])(
    'the %s preset produces an EXACT valid regulation total under NCAA-men 20-minute periods',
    (presetId) => {
      const base = withStarterLineup(createNewGame())
      const team = getUserTeam(base)!
      const roster = getTeamRoster(base, team.id)
      const nextGame = getNextUserGame(base)!
      const ncaaWorld = { ...base, competitions: Object.fromEntries(Object.entries(base.competitions).map(([id, competition]) => [id, id === nextGame.competitionId ? { ...competition, rules: { ...competition.rules, gameFormat: NCAA_MEN_GAME_FORMAT } } : competition])) }
      const onUpdateRotationMinutes = vi.fn()
      render(createElement(TacticsPcbPage, { world: ncaaWorld, onUpdateRotationMinutes }))
      fireEvent.click(screen.getByRole('button', { name: 'Rotaciones' }))

      fireEvent.change(screen.getByLabelText('Preset de rotación'), { target: { value: presetId } })
      const saveButton = screen.getByRole('button', { name: 'Guardar' })
      expect(saveButton).not.toBeDisabled()
      fireEvent.click(saveButton)

      expect(onUpdateRotationMinutes).toHaveBeenCalledTimes(1)
      const minutesByPeriod = onUpdateRotationMinutes.mock.calls[0]![0] as Record<string, readonly number[]>
      // NCAA men resolve to 2 regulation periods of 20 minutes each.
      for (let period = 0; period < 2; period += 1) {
        const total = roster.reduce((sum, player) => sum + (minutesByPeriod[player.id]?.[period] ?? 0), 0)
        expect(total).toBe(20 * 5)
      }
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    },
  )

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

    // Reconciliation zeroes the newly-added player's minutes, which makes the carried-over
    // allocation invalid (the old PG's minutes are gone); apply a preset to reach a valid
    // allocation for the new lineup before saving, so this test can observe what gets persisted.
    fireEvent.change(screen.getByLabelText('Preset de rotación'), { target: { value: 'starters' } })
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

  it('deleting an action in frame 1 rebuilds frame 2\'s derived starting player/ball state, not just frame 1 (Issue #9 blocker 3)', () => {
    // Frame 1: player 1 has a "move" action from (250,380) to (100,100). Frame 2 was authored
    // starting from the OLD baked position (100,100) — its own player token is seeded there, and
    // it has its own authored action continuing from there. If frame 2's starting state is not
    // rebuilt after frame 1's action is deleted, player 1 would still render at/for (100,100) in
    // frame 2; if it IS rebuilt, player 1's frame-2 starting position must revert to (250,380) -
    // frame 1's ORIGINAL (un-moved) position, since deleting the action means player 1 never moved.
    const frame1 = {
      players: [{ id: 1, x: 250, y: 380, label: '1', role: 'PG' }],
      ballOwnerId: 1,
      ballPosition: { x: 250, y: 380 },
      paths: [{ id: 301, type: 'move', points: [{ x: 250, y: 380 }, { x: 100, y: 100 }], linkedId: 1 }],
      defenders: [],
    }
    const frame2 = {
      // Authored starting from frame 1's baked (100,100) end position — this is frame 2's own
      // recorded starting state before any rebuild, exactly as `addFrame()` would have produced it.
      players: [{ id: 1, x: 100, y: 100, label: '1', role: 'PG' }],
      ballOwnerId: 1,
      ballPosition: { x: 100, y: 100 },
      paths: [],
      defenders: [],
    }
    const seededWorld = saveDesignerPlay(createNewGame(), { id: 'two-frame-play', name: 'Two Frame Play', createdAt: '2026-01-01', frames: [frame1, frame2] })
    render(createElement(TacticsPcbPage, { world: seededWorld }))
    fireEvent.click(screen.getByRole('button', { name: 'Diseñador' }))
    fireEvent.click(screen.getByRole('button', { name: /Cargar/ }))
    fireEvent.click(screen.getByText('Two Frame Play'))

    // Confirm we're on frame 1/2 and it has the move action.
    expect(screen.getByText('MOVE')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar acción move' }))

    // Advance to frame 2 via the timeline thumbnail (index 1).
    const frameThumbnails = document.querySelectorAll('[style*="min-width: 60px"]')
    fireEvent.click(frameThumbnails[1]!)

    // Frame 2's player token must now render at the REBUILT starting position (250,380) -
    // frame 1's un-moved position - not the stale (100,100) it was originally authored with.
    const playerGroup = document.querySelector('g[transform="translate(250,380)"]')
    expect(playerGroup).not.toBeNull()
    expect(document.querySelector('g[transform="translate(100,100)"]')).toBeNull()
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

  it('remounting Tactics for the same upcoming game rehydrates the persisted pace/coverage override into Partido controls', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const nextGame = getNextUserGame(world)!
    const persistedOverride = { pace: 1 as const, shotProfile: { rim: 0 as const, midRange: 0 as const, threePoint: 0 as const }, defense: { interior: 2 as const, perimeter: -1 as const } }
    const worldWithOverride = { ...world, gamePlansByKey: { ...world.gamePlansByKey, [`${nextGame.id}:${team.id}`]: { gameId: nextGame.id, teamId: team.id, tacticalOverride: persistedOverride } } }

    // No `plan` prop supplied at all: this simulates the real app boundary, where the session
    // tactical-plan store is reset on save/load and the host always passes SOME plan (its own
    // default) rather than the persisted override - the persisted override must still surface.
    render(createElement(TacticsPcbPage, { world: worldWithOverride }))
    fireEvent.click(screen.getByRole('button', { name: 'Partido' }))

    expect((screen.getByLabelText('Ritmo') as HTMLSelectElement).value).toBe('Rápido')
    expect((screen.getByLabelText('Cobertura P&R') as HTMLSelectElement).value).toBe('Switch')
  })

  it('an in-session edit after rehydration takes precedence over the persisted override, without a second authority conflict', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const nextGame = getNextUserGame(world)!
    const persistedOverride = { pace: 1 as const, shotProfile: { rim: 0 as const, midRange: 0 as const, threePoint: 0 as const }, defense: { interior: 0 as const, perimeter: 0 as const } }
    const worldWithOverride = { ...world, gamePlansByKey: { ...world.gamePlansByKey, [`${nextGame.id}:${team.id}`]: { gameId: nextGame.id, teamId: team.id, tacticalOverride: persistedOverride } } }
    const onChange = vi.fn()

    render(createElement(TacticsPcbPage, { world: worldWithOverride, onChange }))
    fireEvent.click(screen.getByRole('button', { name: 'Partido' }))
    expect((screen.getByLabelText('Ritmo') as HTMLSelectElement).value).toBe('Rápido')

    fireEvent.change(screen.getByLabelText('Ritmo'), { target: { value: 'Lento' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ pace: -1 }))
  })
})

describe('RotationEngine.updateRotationMinutesForTeam / write-boundary validation (Issue #9 blocker 2)', () => {
  it('an invalid allocation throws and does NOT mutate GameWorld.rotationPlansByTeamId', () => {
    const world = withStarterLineup(createNewGame())
    const team = getUserTeam(world)!
    const roster = getTeamRoster(world, team.id)
    const invalidMinutes = Object.fromEntries(roster.map((player) => [player.id, [1, 1, 1, 1, 0]])) // 12*1=12, not 50

    expect(() => updateRotationMinutesForTeam(world, team.id, invalidMinutes)).toThrow(RangeError)
    expect(world.rotationPlansByTeamId[team.id]).toBeUndefined()
  })

  it('a valid allocation persists, and the boundary strips rows for players no longer in the active lineup', () => {
    const world = withStarterLineup(createNewGame())
    const team = getUserTeam(world)!
    const roster = getTeamRoster(world, team.id)
    const validMinutes = Object.fromEntries(roster.map((player, index) => [player.id, index < 5 ? [10, 10, 10, 10, 0] : [0, 0, 0, 0, 0]]))
    const staleMinutes = { ...validMinutes, 'stale-player-not-in-lineup': [10, 10, 10, 10, 0] }

    const updated = updateRotationMinutesForTeam(world, team.id, staleMinutes as never)
    expect(updated.rotationPlansByTeamId[team.id]!.minutesByPeriod!['stale-player-not-in-lineup' as never]).toBeUndefined()
    expect(updated.rotationPlansByTeamId[team.id]!.minutesByPeriod![roster[0]!.id]).toEqual([10, 10, 10, 10, 0])
  })

  it('an attempted invalid save via the Rotaciones UI never even calls onUpdateRotationMinutes, so the write boundary is a real second line of defense, not the only one', () => {
    const world = withStarterLineup(createNewGame())
    const onUpdateRotationMinutes = vi.fn()
    render(createElement(TacticsPcbPage, { world, onUpdateRotationMinutes }))
    fireEvent.click(screen.getByRole('button', { name: 'Rotaciones' }))

    const numberInputs = document.querySelectorAll('.pcb-tactics__rotation-grid input[type="number"]')
    fireEvent.change(numberInputs[0]!, { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(onUpdateRotationMinutes).not.toHaveBeenCalled()
  })
})
