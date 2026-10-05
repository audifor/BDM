import { describe, expect, it } from 'vitest'
import { createMatchEnginePort } from '@/app/matchNext'
import { completeBackgroundMatch } from '@/app/worldSim/BackgroundMatchCompletion'
import { DEFAULT_SIMULATION_DETAIL } from '@/app/worldSim/SimulationResolutionPolicy'
import { resultRecordCopyCount, updateGameWorld, withDailyResultBatch, writableResultRecord, type GameWorld } from '@/domain/world'
import { getScheduledGamesToday } from '@/engine/calendar'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { advanceGameDayWithResult } from './advanceGameDay'
import { createNewGame } from './createNewGame'
import { applyDayOutcomes, prepareDayGames, simulateDayOutcomesInline, type DayOutcome, type PreparedDayGame } from './matchResolution'
import { withShortGameFormat } from './testFixtures'

/** WSR2.1: a day's results applied as one batch must give the world that applying them one by one (the canonical chain) gives. */
// MINIMAL: the user's Game exact (FAST), every other Game BACKGROUND, so a day mixes both resolutions.
const mixed = { ...DEFAULT_SIMULATION_DETAIL, level: 'MINIMAL' as const }

function prepareDay(world: GameWorld, settings = mixed): { prepared: PreparedDayGame[]; outcomes: DayOutcome[] } {
  let seed = 7_000
  const prepared = prepareDayGames(world, getScheduledGamesToday(world), () => seed++, undefined, settings)
  return { prepared, outcomes: simulateDayOutcomesInline(prepared) }
}

/** The pre-WSR2.1 application: every result through the canonical chain on its own, outside any batch. */
function applyOneByOne(world: GameWorld, outcomes: readonly DayOutcome[]): GameWorld {
  const port = createMatchEnginePort('match-next')
  return outcomes.reduce((current, outcome) => outcome.resolution === 'BACKGROUND' ? completeBackgroundMatch(current, outcome.result) : port.complete(current, outcome.result), world)
}

const shared = (world: GameWorld) => ({ morale: world.moraleByPersonId, fatigue: world.careerFatigueByPlayerId, stimulus: world.developmentStimulusByPlayerId })

describe('daily result batch (WSR2.1)', () => {
  it('a mixed FAST + BACKGROUND day gives the world of one-by-one application, copying each shared record once', () => {
    const world = withShortGameFormat(createNewGame())
    const { prepared, outcomes } = prepareDay(world)
    expect(new Set(outcomes.map((outcome) => outcome.resolution))).toEqual(new Set(['FAST', 'BACKGROUND']))
    const before = resultRecordCopyCount()
    const batched = applyDayOutcomes(world, prepared, outcomes)
    const batchCopies = resultRecordCopyCount() - before
    const reference = applyOneByOne(world, outcomes)
    const oneByOneCopies = resultRecordCopyCount() - before - batchCopies
    expect(JSON.stringify(batched)).toBe(JSON.stringify(reference))
    expect(oneByOneCopies).toBeGreaterThanOrEqual(3 * outcomes.length)
    expect(batchCopies).toBeLessThanOrEqual(6)
    // Standings, stats, fatigue, development and morale all moved.
    expect(prepared.every((item) => batched.games[item.game.id]!.status === 'completed' && batched.matchStatLogsByGameId[item.game.id] !== undefined)).toBe(true)
    expect(batched.careerFatigueByPlayerId).not.toEqual(world.careerFatigueByPlayerId)
    expect(batched.developmentStimulusByPlayerId).not.toEqual(world.developmentStimulusByPlayerId)
    expect(batched.moraleByPersonId).not.toEqual(world.moraleByPersonId)
  }, 300_000)

  it('never writes the input world, and a failure halfway through the day leaves it exactly as it was', () => {
    const world = withShortGameFormat(createNewGame())
    const { prepared, outcomes } = prepareDay(world, { ...DEFAULT_SIMULATION_DETAIL, level: 'MINIMAL' })
    const records = shared(world)
    const snapshot = JSON.stringify(world)
    // The last result is not the Game it claims to be: the batch fails after applying every earlier result.
    const broken = [...outcomes.slice(0, -1), { ...outcomes.at(-1)!, result: { ...outcomes.at(-1)!.result, gameId: outcomes[0]!.result.gameId } }] as DayOutcome[]
    expect(() => applyDayOutcomes(world, prepared, broken)).toThrow(/does not belong/)
    expect(shared(world)).toEqual(records)
    expect(shared(world).morale).toBe(records.morale)
    expect(JSON.stringify(world)).toBe(snapshot)
    // The same world still applies the day normally afterwards.
    expect(JSON.stringify(applyDayOutcomes(world, prepared, outcomes))).toBe(JSON.stringify(applyOneByOne(world, outcomes)))
  }, 300_000)

  it('seals its copies when it ends: later writers copy again and the returned world never changes', () => {
    const world = withShortGameFormat(createNewGame())
    const { prepared, outcomes } = prepareDay(world, { ...DEFAULT_SIMULATION_DETAIL, level: 'MINIMAL' })
    const day = applyDayOutcomes(world, prepared, outcomes)
    const snapshot = JSON.stringify(shared(day))
    const nextBatchCopy = withDailyResultBatch(() => writableResultRecord(day.moraleByPersonId))
    expect(nextBatchCopy).not.toBe(day.moraleByPersonId)
    nextBatchCopy['changed-outside'] = day.moraleByPersonId[Object.keys(day.moraleByPersonId)[0]!]!
    expect(JSON.stringify(shared(day))).toBe(snapshot)
  }, 300_000)

  it('the last Games of a season on one day: the season completes once, after the last result, as one by one', () => {
    const start = withShortGameFormat(createNewGame())
    const today = getScheduledGamesToday(start)
    const seasonIds = new Set(today.map((game) => game.seasonId))
    // Drop the rest of those seasons' schedule: today's Games become their last ones.
    const world = updateGameWorld(start, { games: Object.values(start.games).filter((game) => !seasonIds.has(game.seasonId) || game.status !== 'scheduled' || game.date === start.currentDate) })
    const { prepared, outcomes } = prepareDay(world, { ...DEFAULT_SIMULATION_DETAIL, level: 'MINIMAL' })
    const batched = applyDayOutcomes(world, prepared, outcomes)
    const reference = applyOneByOne(world, outcomes)
    expect(JSON.stringify(batched)).toBe(JSON.stringify(reference))
    const finalized = [...seasonIds].filter((seasonId) => batched.seasonHistoryBySeasonId[seasonId] !== undefined)
    expect(finalized.length).toBeGreaterThan(0)
    for (const seasonId of finalized) {
      const history = batched.seasonHistoryBySeasonId[seasonId]!
      const seasonGames = Object.values(batched.games).filter((game) => game.seasonId === seasonId)
      expect(seasonGames.every((game) => game.status === 'completed')).toBe(true)
      expect(history.finalStandings.reduce((sum, row) => sum + row.wins + row.losses, 0)).toBe(2 * seasonGames.length)
    }
  }, 300_000)

  it('a batched day saves and reloads like any world (no domain lost beyond the inherited round-trip gaps) and keeps advancing', () => {
    const roundTrip = (world: GameWorld) => deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world, '2026-10-05T00:00:00.000Z'))))
    const lost = (world: GameWorld) => { const reloaded = roundTrip(world); return Object.keys({ ...world, ...reloaded }).filter((key) => JSON.stringify((world as unknown as Record<string, unknown>)[key]) !== JSON.stringify((reloaded as unknown as Record<string, unknown>)[key])) }
    const start = withShortGameFormat(createNewGame())
    let seed = 300
    const day = advanceGameDayWithResult(start, () => seed++, ['userGame'], { simulationDetail: mixed })
    expect(day.status).toBe('COMPLETED')
    // Inherited (pre-WSR2.1, already on a fresh world): the save format does not reproduce a few derived domains exactly.
    expect(lost(day.world).every((key) => lost(start).includes(key))).toBe(true)
    const reloaded = roundTrip(day.world)
    expect(reloaded.matchStatLogsByGameId).toEqual(day.world.matchStatLogsByGameId)
    expect(reloaded.careerFatigueByPlayerId).toEqual(day.world.careerFatigueByPlayerId)
    expect(reloaded.developmentStimulusByPlayerId).toEqual(day.world.developmentStimulusByPlayerId)
    let a = 900, b = 900
    const first = advanceGameDayWithResult(reloaded, () => a++, ['userGame'], { simulationDetail: mixed })
    const again = advanceGameDayWithResult(roundTrip(day.world), () => b++, ['userGame'], { simulationDetail: mixed })
    expect(first.status).not.toBe('FAILED')
    expect(JSON.stringify(again.world)).toBe(JSON.stringify(first.world))
  }, 600_000)
})
