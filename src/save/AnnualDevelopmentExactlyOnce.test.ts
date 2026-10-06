import { describe, expect, it } from 'vitest'

import { createAcbTestGame as createFullAcbTestGame, simulateAndApplyGame, startNextSeason } from '@/app/game'
import { loadSavedGame, saveCurrentGame } from '@/app/save/GameSaveService'
import type { GameSaveRepository } from '@/app/save/GameSaveRepository'
import { withShortGameFormat } from '@/app/game/testFixtures'
import { createGameDate, parseGameDate } from '@/domain/date'
import { annualDevelopmentCycleId, hasAppliedAnnualDevelopmentCycle, markAnnualDevelopmentCycleApplied, updateGameWorld, type GameWorld } from '@/domain/world'
import { getSeasonHistoryRecord, isSeasonComplete } from '@/engine/season'
import { advanceDay } from '@/engine/calendar'

// MX0.3 closure — annual player development must execute EXACTLY ONCE around the 1 July world checkpoint, even when
// the career is saved and loaded. The production trigger lives in `advanceDayWithTrace` (CalendarEngine), evaluated on
// the date the clock has just reached; `worldAnnualDevelopmentCycle.lastAppliedCycleId` is its persistent idempotency
// guard, and every application also leaves a durable per-player rating-history entry carrying the same cycle id.

const createAcbTestGame = (...args: Parameters<typeof createFullAcbTestGame>): ReturnType<typeof createFullAcbTestGame> => withShortGameFormat(createFullAcbTestGame(...args))

function memoryRepository(initial = ''): GameSaveRepository & { value: string } {
  return {
    value: initial,
    async save(value) { this.value = value },
    async load() { return this.value },
    async getInfo() { return null },
  }
}

/** The production persistence boundary, exactly as the app uses it. */
async function saveThenLoad(world: GameWorld): Promise<GameWorld> {
  const repository = memoryRepository()
  await saveCurrentGame(world, repository, `${world.currentDate}T12:00:00.000Z`)
  return loadSavedGame(repository)
}

/**
 * The canonical off-season state the day before the checkpoint: the current Season has been played out through the
 * canonical result chain (BACKGROUND resolution tier, so this stays affordable), the next edition exists (the
 * canonical `startNextSeason` rollover), and the world clock sits on 30 June — the only date from which the 1 July
 * checkpoint can fire. Built once: `GameWorld` is immutable, so every test gets its own derived world.
 */
let cached: GameWorld | undefined
function offSeasonBeforeCheckpoint(): GameWorld {
  if (cached !== undefined) return cached
  const base = createAcbTestGame()
  const seasonId = base.currentSeasonId
  let complete = base
  let seed = 9_000_000
  for (const game of Object.values(base.games).filter((candidate) => candidate.seasonId === seasonId)) {
    complete = simulateAndApplyGame(complete, game, seed, undefined, 'BACKGROUND')
    seed += 1
  }
  expect(isSeasonComplete(complete, seasonId)).toBe(true)
  expect(getSeasonHistoryRecord(complete, seasonId)).toBeDefined()

  const rolled = startNextSeason(complete)
  const checkpointYear = Number(complete.seasons[seasonId]!.endDate.slice(0, 4))
  cached = updateGameWorld(rolled, { currentDate: createGameDate(checkpointYear, 6, 30) })
  return cached
}

function cycleIdOf(world: GameWorld): string {
  return annualDevelopmentCycleId(world.currentDate)
}

/**
 * Durable evidence of annual development, read from persisted player rating history: the map of development cycle id
 * -> number of players whose recorded history carries it. A runtime boolean is never used as proof.
 */
function annualDevelopmentRecordedCycles(world: GameWorld): ReadonlyMap<string, number> {
  const counts = new Map<string, number>()
  for (const history of Object.values(world.playerRatingHistoryByPlayerId)) {
    for (const entry of history) {
      if (entry.cycleId === undefined) continue
      counts.set(entry.cycleId, (counts.get(entry.cycleId) ?? 0) + 1)
    }
  }
  return counts
}

/** How many distinct annual development cycles left durable evidence in this world. */
function annualDevelopmentApplications(world: GameWorld): number {
  return annualDevelopmentRecordedCycles(world).size
}

/** Test-only world-wide invariant: no player may carry two records for the same development cycle. */
function assertNoDuplicateAnnualDevelopmentCycles(world: GameWorld): void {
  for (const [playerId, history] of Object.entries(world.playerRatingHistoryByPlayerId)) {
    const seen = new Set<string>()
    for (const entry of history) {
      if (entry.cycleId === undefined) continue
      expect(seen.has(entry.cycleId), `player ${playerId} records cycle ${entry.cycleId} more than once`).toBe(false)
      seen.add(entry.cycleId)
    }
  }
}

/** Every persisted Player Truth rating, so a second application of the same cycle is detectable as drift. */
function ratingsByPlayer(world: GameWorld): Readonly<Record<string, Player['basketball']['ratings']>> {
  return Object.fromEntries(Object.keys(world.players).sort().map((id) => [id, world.players[id as never]!.basketball.ratings]))
}

type Player = GameWorld['players'][keyof GameWorld['players']]

function historyEntryFor(world: GameWorld, playerId: string, cycle: string) {
  return (world.playerRatingHistoryByPlayerId[playerId as never] ?? []).filter((entry) => entry.cycleId === cycle)
}

describe('MX0.3 closure — annual development executes exactly once across save/load', () => {
  it('fires only from 30 June and records the checkpoint once', () => {
    const before = offSeasonBeforeCheckpoint()
    const cycle = cycleIdOf(before)
    expect(before.currentDate.slice(5)).toBe('06-30')
    expect(cycle).toMatch(/^annual-development:\d{4}$/)
    expect(annualDevelopmentApplications(before)).toBe(0)
    expect(hasAppliedAnnualDevelopmentCycle(before, cycle)).toBe(false)

    // Crossing the checkpoint (the calendar's own next day) is the only thing that applies it.
    const after = advanceDay(before)
    expect(after.currentDate.slice(5)).toBe('07-01')
    expect(hasAppliedAnnualDevelopmentCycle(after, cycle)).toBe(true)
    expect(annualDevelopmentApplications(after)).toBe(1)
    expect(annualDevelopmentRecordedCycles(after).get(cycle)).toBeGreaterThan(0)
  })

  it('CASE A — save before the checkpoint, load, then cross 1 July: exactly one application', async () => {
    const before = offSeasonBeforeCheckpoint()
    const cycle = cycleIdOf(before)
    const loaded = await saveThenLoad(before)
    expect(annualDevelopmentApplications(loaded)).toBe(0)

    const applied = advanceDay(loaded)
    expect(annualDevelopmentApplications(applied)).toBe(1)
    expect(applied.worldAnnualDevelopmentCycle?.lastAppliedCycleId).toBe(cycle)

    // ...and continuing further inside the same year must not apply it again.
    const later = advanceDay(advanceDay(applied))
    expect(annualDevelopmentApplications(later)).toBe(1)
    expect(later.worldAnnualDevelopmentCycle?.lastAppliedCycleId).toBe(cycle)
    expect(ratingsByPlayer(later)).toEqual(ratingsByPlayer(applied))
  })

  it('CASE B — cross the checkpoint, save, load, continue: development does not run again', async () => {
    const applied = advanceDay(offSeasonBeforeCheckpoint())
    const cycle = cycleIdOf(applied)
    expect(annualDevelopmentApplications(applied)).toBe(1)
    const ratingsAtApplication = ratingsByPlayer(applied)

    const loaded = await saveThenLoad(applied)
    expect(annualDevelopmentApplications(loaded)).toBe(1)
    expect(ratingsByPlayer(loaded)).toEqual(ratingsAtApplication)
    // The persistent guard itself survives the load; it is not a runtime-only projection.
    expect(loaded.worldAnnualDevelopmentCycle?.lastAppliedCycleId).toBe(cycle)
    expect(hasAppliedAnnualDevelopmentCycle(loaded, cycle)).toBe(true)

    // Continuing through the rest of the calendar year must not move ratings again either: a second
    // application of the same cycle is visible as drift, so this is the strongest reload assertion.
    let continued = loaded
    for (let day = 0; day < 30; day += 1) continued = advanceDay(continued)
    expect(continued.currentDate.slice(5)).toBe('07-31')
    expect(annualDevelopmentApplications(continued)).toBe(1)
    expect(ratingsByPlayer(continued)).toEqual(ratingsAtApplication)
    expect(annualDevelopmentRecordedCycles(continued)).toEqual(annualDevelopmentRecordedCycles(applied))
    assertNoDuplicateAnnualDevelopmentCycles(continued)
  })

  it('CASE C — repeated save/load after the checkpoint keeps exactly one application', async () => {
    const applied = advanceDay(offSeasonBeforeCheckpoint())
    const ratingsAtApplication = ratingsByPlayer(applied)
    expect(annualDevelopmentApplications(applied)).toBe(1)

    let world = applied
    for (let round = 0; round < 3; round += 1) {
      world = await saveThenLoad(world)
      expect(annualDevelopmentApplications(world)).toBe(1)
      expect(world.worldAnnualDevelopmentCycle?.lastAppliedCycleId).toBe(cycleIdOf(world))
    }

    const continued = advanceDay(world)
    expect(annualDevelopmentApplications(continued)).toBe(1)
    expect(ratingsByPlayer(continued)).toEqual(ratingsAtApplication)
  })

  it('proves on a real player that the same annual cycle is never applied twice', async () => {
    const applied = advanceDay(offSeasonBeforeCheckpoint())
    const cycle = cycleIdOf(applied)
    const playerId = Object.keys(applied.playerRatingHistoryByPlayerId)
      .find((id) => historyEntryFor(applied, id, cycle).length > 0)!
    expect(playerId).toBeDefined()
    const entry = historyEntryFor(applied, playerId, cycle)[0]!
    expect(entry.checkpointDate).toBe(applied.currentDate)
    expect(entry.seasonId).toBe(applied.currentSeasonId)

    const loaded = await saveThenLoad(applied)
    const continued = advanceDay(advanceDay(loaded))

    // Durable evidence: exactly one recorded development record for this cycle, before and after reloading.
    expect(historyEntryFor(loaded, playerId, cycle)).toHaveLength(1)
    expect(historyEntryFor(continued, playerId, cycle)).toHaveLength(1)
    expect(historyEntryFor(continued, playerId, cycle)[0]).toEqual(entry)
    // ...and the player's persisted ratings are untouched by the reload + continuation.
    expect(continued.players[playerId as never]!.basketball.ratings).toEqual(applied.players[playerId as never]!.basketball.ratings)
  })

  it('holds the world-wide invariant: no player records a cycle twice', async () => {
    const applied = advanceDay(offSeasonBeforeCheckpoint())
    const cycle = cycleIdOf(applied)
    assertNoDuplicateAnnualDevelopmentCycles(applied)

    const loaded = await saveThenLoad(applied)
    const continued = advanceDay(loaded)
    assertNoDuplicateAnnualDevelopmentCycles(continued)
    expect(annualDevelopmentRecordedCycles(continued).get(cycle)).toBe(annualDevelopmentRecordedCycles(applied).get(cycle))

    // The cycle identity is the world year, so next year's checkpoint is a genuinely different cycle.
    const nextYear = updateGameWorld(continued, { currentDate: parseGameDate(`${Number(cycle.slice(-4)) + 1}-06-30`) })
    expect(cycleIdOf(nextYear)).not.toBe(cycle)
    const nextApplication = advanceDay(nextYear)
    expect(annualDevelopmentApplications(nextApplication)).toBe(2)
    expect(nextApplication.worldAnnualDevelopmentCycle?.lastAppliedCycleId).toBe(cycleIdOf(nextApplication))
    assertNoDuplicateAnnualDevelopmentCycles(nextApplication)
  })

  it('consults the persistent marker: a checkpoint already marked for this cycle is never re-applied', () => {
    const before = offSeasonBeforeCheckpoint()
    const cycle = cycleIdOf(before)
    // Same starting world, same clock (30 June), one difference only: whether this year's cycle is already marked.
    // The unmarked world must develop — that proves the trigger really does reach this shape of world, so the marked
    // world's silence below can only come from the marker itself.
    const unmarkedApplied = advanceDay(before)
    expect(annualDevelopmentApplications(unmarkedApplied)).toBe(1)
    expect(ratingsByPlayer(unmarkedApplied)).not.toEqual(ratingsByPlayer(before))

    const marked = markAnnualDevelopmentCycleApplied(before, cycle)
    const after = advanceDay(marked)
    expect(after.currentDate.slice(5)).toBe('07-01')
    expect(annualDevelopmentApplications(after)).toBe(0)
    expect(ratingsByPlayer(after)).toEqual(ratingsByPlayer(before))
    expect(hasAppliedAnnualDevelopmentCycle(after, cycle)).toBe(true)
  })
})
