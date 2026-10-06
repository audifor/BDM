import { describe, expect, it } from 'vitest'

import {
  continueGame,
  createAcbTestGame as createFullAcbTestGame,
  createNewGame as createFullNewGame,
  getContinueStopReason,
  instantResult,
  simulateAndApplyGame,
  startNextSeason,
} from '@/app/game'
import { setTeamResponsibility } from '@/app/staffResponsibilities'
import type { GameWorld } from '@/domain/world'
import { getResponsibility, updateGameWorld } from '@/domain/world'
import { injuryIdFromString } from '@/domain/ids'
import { createInjury } from '@/domain/injury'
import { addDays, compareGameDates } from '@/domain/date'
import { getScheduledGamesToday, getUserTeam } from '@/engine/calendar'
import { reviewReturnToPlay } from '@/engine/injury/ReturnToPlayEngine'
import { skipMediaOpportunity } from '@/engine/media'
import { getSeasonHistoryRecord, isSeasonComplete } from '@/engine/season'
import { loadSavedGame, saveCurrentGame } from '@/app/save/GameSaveService'
import type { GameSaveRepository } from '@/app/save/GameSaveRepository'
import { withShortGameFormat } from '@/app/game/testFixtures'
import { projectPersistentWorldTruth } from './persistentWorldTruth'

// MX0.3 Gate A: save/load truth. Every scenario asserts the CURRENT save authority (V4, the one `GameSaveService`
// writes) reproduces the persistent semantic truth of the world, and that the loaded world can keep playing.

// ME-LOCK1: these are lifecycle/state tests, not basketball ones: their Games resolve through the production route
// with a short game format.
const createNewGame = (...args: Parameters<typeof createFullNewGame>): ReturnType<typeof createFullNewGame> => withShortGameFormat(createFullNewGame(...args))
const createAcbTestGame = (...args: Parameters<typeof createFullAcbTestGame>): ReturnType<typeof createFullAcbTestGame> => withShortGameFormat(createFullAcbTestGame(...args))

const MATCH_SEED = 20261001

function memoryRepository(initial = ''): GameSaveRepository & { value: string } {
  return {
    value: initial,
    async save(value) { this.value = value },
    async load() { return this.value },
    async getInfo() { return null },
  }
}

/** The real production boundary: `GameSaveService` writes the current schema and reads it back. */
async function saveThenLoad(world: GameWorld): Promise<GameWorld> {
  const repository = memoryRepository()
  await saveCurrentGame(world, repository, `${world.currentDate}T12:00:00.000Z`)
  return loadSavedGame(repository)
}

/** One canonical Continue step so the tests drive the same commands the app does. */
function careerStep(world: GameWorld): GameWorld {
  const stop = getContinueStopReason(world)
  if (stop !== undefined) {
    if (stop.type === 'userGame') return instantResult(world, undefined, MATCH_SEED)
    if (stop.type === 'mediaOpportunity') return skipMediaOpportunity(world, stop.opportunityId)
    if (stop.type === 'breakpoint' && stop.breakpoint.reason === 'returnToPlayReview') {
      const review = reviewReturnToPlay(world, { injuryId: stop.breakpoint.sourceId as never, decision: 'CONTINUE_RECOVERY', actor: { kind: 'USER', coachId: world.userCoachId } })
      if (review.ok) return review.world
    }
    throw new Error(`UNEXPECTED_CAREER_STOP: ${stop.type}`)
  }
  return continueGame(world, 1, () => MATCH_SEED).world
}

function advanceDays(world: GameWorld, days: number): GameWorld {
  let current = world
  for (let guard = 0; guard < days * 12 && compareGameDates(current.currentDate, addDays(world.currentDate, days)) < 0; guard += 1) {
    current = careerStep(current)
  }
  return current
}

/** Steps the canonical career commands until the user's Team actually has a Game scheduled today. */
function advanceToUserGameDay(world: GameWorld): GameWorld {
  let current = world
  for (let guard = 0; guard < 24; guard += 1) {
    const userTeam = getUserTeam(current)
    if (userTeam !== undefined && getScheduledGamesToday(current).some((game) => game.homeTeamId === userTeam.id || game.awayTeamId === userTeam.id)) return current
    current = careerStep(current)
  }
  throw new Error('Expected the user Team to have a Game day within 24 career steps')
}

function assertRoundTrip(world: GameWorld, loaded: GameWorld): void {
  expect(projectPersistentWorldTruth(loaded)).toEqual(projectPersistentWorldTruth(world))
}

describe('MX0.3 Gate A — current save round-trip preserves persistent semantic truth', () => {
  it('fresh career', { timeout: 180_000 }, async () => {
    const world = createAcbTestGame()
    const loaded = await saveThenLoad(world)
    assertRoundTrip(world, loaded)
    // Competition rules are simulation authority: they must survive byte-for-byte, not as a re-derived default.
    expect(Object.values(loaded.competitions).map((competition) => competition.rules)).toEqual(Object.values(world.competitions).map((competition) => competition.rules))
    expect(loaded.currentDate).toBe(world.currentDate)
    expect(loaded.currentSeasonId).toBe(world.currentSeasonId)
  })

  it('mid-season after resolving several Game days', { timeout: 300_000 }, async () => {
    const world = advanceDays(createAcbTestGame(), 14)
    expect(Object.values(world.matchStatLogsByGameId).length).toBeGreaterThan(0)
    const loaded = await saveThenLoad(world)
    assertRoundTrip(world, loaded)
    expect(Object.keys(loaded.matchStatLogsByGameId).sort()).toEqual(Object.keys(world.matchStatLogsByGameId).sort())
  })

  it('post-match: results, stat logs and their consequences survive', { timeout: 300_000 }, async () => {
    const base = advanceToUserGameDay(advanceDays(createAcbTestGame(), 10))
    const userTeam = getUserTeam(base)!
    const game = getScheduledGamesToday(base).find((candidate) => candidate.homeTeamId === userTeam.id || candidate.awayTeamId === userTeam.id)!
    // Resolve it through the canonical Instant result, exactly as the app's user-Game stop does.
    const world = instantResult(base, undefined, MATCH_SEED)
    expect(world.games[game.id]!.status).toBe('completed')
    const log = world.matchStatLogsByGameId[game.id]!
    expect(log).toBeDefined()

    const loaded = await saveThenLoad(world)

    assertRoundTrip(world, loaded)
    expect(loaded.games[game.id]).toEqual(world.games[game.id])
    expect(loaded.matchStatLogsByGameId[game.id]).toEqual(log)
    expect(Object.values(loaded.injuriesById).length).toBe(Object.values(world.injuriesById).length)
  })

  it('medical state: injury chronology and rehabilitation survive', { timeout: 180_000 }, async () => {
    const base = createAcbTestGame()
    const team = getUserTeam(base)!
    const playerId = team.rosterPlayerIds[0]!
    const injury = createInjury({ id: injuryIdFromString('mx03-medical-round-trip'), playerId, kind: 'ankleSprain', severity: 'moderate', injuredOn: base.currentDate, expectedReturnDate: addDays(base.currentDate, 30) })
    const world = updateGameWorld(base, { injuries: [injury] })

    const loaded = await saveThenLoad(world)

    assertRoundTrip(world, loaded)
    expect(loaded.injuriesById[injury.id]).toEqual(world.injuriesById[injury.id])
    expect(loaded.injuriesById[injury.id]!.injuredOn).toBe(base.currentDate)
  })

  it('staff assignment: a current valid assignment survives', { timeout: 180_000 }, async () => {
    const base = createAcbTestGame()
    const team = getUserTeam(base)!
    const assignment = Object.values(base.teamStaffAssignmentsById).find((item) => item.teamId === team.id && item.role === 'assistantCoach')!
    const world = setTeamResponsibility(base, { teamId: team.id, kind: 'createTeamTrainingPlan', mode: 'delegated', holderStaffId: assignment.staffPersonId })
    const stored = getResponsibility(world, team.id, 'createTeamTrainingPlan')!
    expect(stored.holderStaffId).toBe(assignment.staffPersonId)

    const loaded = await saveThenLoad(world)

    assertRoundTrip(world, loaded)
    expect(getResponsibility(loaded, team.id, 'createTeamTrainingPlan')).toEqual(stored)
  })

  it('season rollover: current season, history and the new schedule survive', { timeout: 600_000 }, async () => {
    // WSR1: the season is completed through the canonical result chain at the BACKGROUND resolution tier (the same
    // canonical completion path a non-exact Game takes), which keeps this test affordable without weakening it.
    const base = createAcbTestGame()
    const seasonId = base.currentSeasonId
    let complete = base
    let seed = 7_000_000
    for (const game of Object.values(base.games).filter((candidate) => candidate.seasonId === seasonId)) {
      complete = simulateAndApplyGame(complete, game, seed, undefined, 'BACKGROUND')
      seed += 1
    }
    expect(isSeasonComplete(complete, seasonId)).toBe(true)
    expect(getSeasonHistoryRecord(complete, seasonId)).toBeDefined()

    const rolled = startNextSeason(complete)
    expect(Object.keys(rolled.seasons).length).toBeGreaterThan(Object.keys(base.seasons).length)

    const loaded = await saveThenLoad(rolled)

    assertRoundTrip(rolled, loaded)
    expect(loaded.currentSeasonId).toBe(rolled.currentSeasonId)
    expect(Object.keys(loaded.seasonHistoryBySeasonId).sort()).toEqual(Object.keys(rolled.seasonHistoryBySeasonId).sort())
    expect(loaded.seasons[loaded.currentSeasonId]).toEqual(rolled.seasons[rolled.currentSeasonId])
    expect(Object.values(loaded.games).filter((game) => game.seasonId === loaded.currentSeasonId).length)
      .toBe(Object.values(rolled.games).filter((game) => game.seasonId === rolled.currentSeasonId).length)
  })

  it('preserves the V4-owned layers the legacy schemas do not carry', { timeout: 180_000 }, async () => {
    // The V1/V2/V3 payloads are strict subsets of the current world: they never carry club strategic state or GM plan
    // state (see `migrateGameWorldSaveV3ToV4`). The current save does, and that guarantee lives here.
    const world = createAcbTestGame()
    expect(Object.keys(world.clubStrategicStatesByTeamId).length).toBeGreaterThan(0)

    const loaded = await saveThenLoad(world)

    assertRoundTrip(world, loaded)
    expect(loaded.clubStrategicStatesByTeamId).toEqual(world.clubStrategicStatesByTeamId)
    expect(loaded.gmPlanStatesById).toEqual(world.gmPlanStatesById)
  })
})

describe('MX0.3 Gate A — save, load and continue on the production-like ACB world', () => {
  it('advances 30 days, saves, loads, preserves the world and advances 30 more', { timeout: 900_000 }, async () => {
    const start = createAcbTestGame()
    const beforeSave = advanceDays(start, 30)
    expect(compareGameDates(beforeSave.currentDate, addDays(start.currentDate, 30))).toBeGreaterThanOrEqual(0)

    const loaded = await saveThenLoad(beforeSave)
    assertRoundTrip(beforeSave, loaded)

    // No duplicate application: loading must not complete or re-apply anything.
    const completedIds = (world: GameWorld) => Object.values(world.games).filter((game) => game.status === 'completed').map((game) => game.id).sort()
    expect(completedIds(loaded)).toEqual(completedIds(beforeSave))
    expect(Object.keys(loaded.matchStatLogsByGameId).filter((id) => loaded.games[id as never]?.status !== 'completed')).toEqual([])
    // ...and no scheduled Game may be left in the past by the load.
    expect(Object.values(loaded.games).filter((game) => game.status === 'scheduled' && compareGameDates(game.date, loaded.currentDate) < 0)).toEqual([])

    const afterLoad = advanceDays(loaded, 30)

    expect(compareGameDates(afterLoad.currentDate, addDays(loaded.currentDate, 30))).toBeGreaterThanOrEqual(0)
    expect(Object.values(afterLoad.games).filter((game) => game.status === 'scheduled' && compareGameDates(game.date, afterLoad.currentDate) < 0)).toEqual([])
    expect(Object.values(afterLoad.games).some((game) => game.status === 'completed')).toBe(true)
    // Continue still works from the loaded world: the canonical command either advances the clock or returns an
    // attributable stop — never a silent no-op.
    const continued = continueGame(afterLoad, 1, () => MATCH_SEED)
    expect(continued.stopReason.type).not.toBe('noProgress')
    expect(continued.finalDate).toBe(continued.world.currentDate)
    expect(Object.values(afterLoad.matchStatLogsByGameId).length).toBeGreaterThan(Object.values(loaded.matchStatLogsByGameId).length)
  })
})
