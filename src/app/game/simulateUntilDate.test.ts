import { describe, expect, it } from 'vitest'

import { addDays, compareGameDates, parseGameDate } from '@/domain/date'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { isSeasonComplete } from '@/engine/season'
import { reviewReturnToPlay } from '@/engine/injury/ReturnToPlayEngine'
import { skipMediaOpportunity } from '@/engine/media'
import { simulateAndApplyGame } from './matchResolution'

import { advanceGameDay } from './advanceGameDay'
import { createAcbTestGame as createFullAcbTestGame } from './createAcbTestGame'
import { createNewGame as createFullNewGame } from './createNewGame'
import { simulateUntilDate, tickSimulateUntilDate } from './simulateUntilDate'
import { withShortGameFormat } from './testFixtures'

// ME-LOCK1: a lifecycle test (calendar/season/staff), not a basketball one: its Games still resolve through Match Next FAST, with a short game format.
const createNewGame = (...args: Parameters<typeof createFullNewGame>): ReturnType<typeof createFullNewGame> => withShortGameFormat(createFullNewGame(...args))
const createAcbTestGame = (...args: Parameters<typeof createFullAcbTestGame>): ReturnType<typeof createFullAcbTestGame> => withShortGameFormat(createFullAcbTestGame(...args))

/**
 * MX0.2 closure: the explicit "simulate until date" surface must be as temporally coherent as Continue. A committed
 * state may not contain a completed Game (or a MatchStatLog) dated after the world clock -- the day pipeline resolves
 * today's Games before the calendar advances, so a future result could only appear if that order broke.
 */
function expectTemporallyCoherent(world: GameWorld): void {
  for (const game of Object.values(world.games)) {
    if (game.status === 'completed') expect(compareGameDates(game.date, world.currentDate), `Game ${game.id} (${game.date}) is completed while the world clock is ${world.currentDate}`).toBeLessThanOrEqual(0)
    if (compareGameDates(game.date, world.currentDate) > 0) expect(game.status, `future Game ${game.id} (${game.date}) is not scheduled`).toBe('scheduled')
  }
  for (const log of Object.values(world.matchStatLogsByGameId)) {
    expect(compareGameDates(log.gameDate, world.currentDate), `MatchStatLog ${log.gameId} (${log.gameDate}) is ahead of the world clock ${world.currentDate}`).toBeLessThanOrEqual(0)
  }
}

describe('simulate until date', () => {
  it('rejects a target on or before the current date without changing the world', () => {
    const world = createNewGame()
    const before = JSON.stringify(world)

    expect(() => simulateUntilDate(world, world.currentDate)).toThrow(RangeError)
    expect(() => simulateUntilDate(world, addDays(world.currentDate, -1))).toThrow(RangeError)
    expect(JSON.stringify(world)).toBe(before)
  })

  it('uses the same canonical daily transition as repeated advances when nothing interrupts', () => {
    const world = createAcbTestGame()
    const target = addDays(world.currentDate, 3)
    let manual = world
    manual = advanceGameDay(manual)
    manual = advanceGameDay(manual)
    manual = advanceGameDay(manual)

    const result = simulateUntilDate(world, target)

    expect(result.daysAdvanced).toBe(3)
    expect(result.finalDate).toBe(target)
    expect(result.stopReason).toEqual({ type: 'arrived' })
    expect(result.world).toEqual(manual)
  }, 15_000)

  it('simulates user-team games and other fixtures before the requested date', () => {
    const base = createNewGame()
    const userTeamId = Object.values(base.teams).find((team) => team.coachId === base.userCoachId)!.id
    const userGame = Object.values(base.games).find((game) => game.status === 'scheduled' && (game.homeTeamId === userTeamId || game.awayTeamId === userTeamId))!
    const target = addDays(base.currentDate, 2)
    const world = updateGameWorld(base, { games: Object.values(base.games).map((game) => game.id === userGame.id ? { ...game, date: addDays(base.currentDate, 1) } : game) })
    const before = JSON.stringify(world)
    const gamesThroughTarget = Object.values(world.games).filter((game) => game.status === 'scheduled' && game.date <= target)

    const result = simulateUntilDate(world, target)

    expect(JSON.stringify(world)).toBe(before)
    expect(result.world.currentDate).toBe(target)
    expect(result.daysAdvanced).toBe(2)
    expect(result.stopReason).toEqual({ type: 'arrived' })
    expect(gamesThroughTarget.every((game) => result.world.games[game.id]?.status === 'completed')).toBe(true)
    expect(gamesThroughTarget.every((game) => result.world.matchStatLogsByGameId[game.id] !== undefined)).toBe(true)
    expect(Object.keys(result.world.matchStatLogsByGameId)).toHaveLength(Object.keys(world.matchStatLogsByGameId).length + gamesThroughTarget.length)
  }, 15_000)

  it('continues the world clock beyond a completed competition season', () => {
    const world = createNewGame()
    const complete = {
      ...world,
      games: Object.fromEntries(Object.entries(world.games).map(([id, game]) => [id, game.status === 'completed' ? game : { ...game, status: 'completed', result: { homeScore: 0, awayScore: 0 } }])),
    } as typeof world

    const result = simulateUntilDate(complete, addDays(complete.currentDate, 10))

    expect(result.daysAdvanced).toBe(10)
    expect(result.stopReason).toEqual({ type: 'arrived' })
    expect(result.world.currentDate).toBe(addDays(complete.currentDate, 10))
  })

  describe('RWS-BUG-002 SIMULAR HASTA FECHA', () => {
    it('simulates until tomorrow', () => {
      const world = withNoScheduledGames(createNewGame())
      const target = addDays(world.currentDate, 1)
      const result = simulateUntilDate(world, target)
      expect(result.finalDate).toBe(target)
    })

    it('simulates +30 days exactly', () => {
      const world = withNoScheduledGames(createNewGame())
      const target = addDays(world.currentDate, 30)
      const result = simulateUntilDate(world, target)
      expect(result.finalDate).toBe(target)
    }, 15_000)

    // These date-boundary tests remove unrelated scheduled games and recruiting cycles so their
    // assertions stay focused on calendar arithmetic. NCAA future-season support and recruiting
    // cycle IDs are covered by the focused lifecycle tests.
    it('crosses 31 December to 1 January', () => {
      const world = withNoScheduledGames(createNewGame())
      const start = parseGameDate('2032-12-31')
      const target = addDays(start, 1)
      const result = simulateUntilDate({ ...world, currentDate: start }, target)
      expect(result.finalDate).toBe('2033-01-01')
    }, 15_000)

    it('crosses a normal February and a 29 February leap year day without breaking', () => {
      const world = withNoScheduledGames(createNewGame())
      const normalFeb = simulateUntilDate({ ...world, currentDate: parseGameDate('2033-02-27') }, parseGameDate('2033-03-01'))
      expect(normalFeb.finalDate).toBe('2033-03-01')

      // 2036 is a leap year and is safely after this world's 2032-10-01 bootstrap date.
      const leapFeb = simulateUntilDate({ ...world, currentDate: parseGameDate('2036-02-27') }, parseGameDate('2036-03-01'))
      expect(leapFeb.finalDate).toBe('2036-03-01')
    }, 15_000)

    it('crosses 30 June and offseason days without stopping', () => {
      const world = withNoScheduledGames(createNewGame())
      const result = simulateUntilDate({ ...world, currentDate: parseGameDate('2033-06-28') }, parseGameDate('2033-07-05'))
      expect(result.finalDate).toBe('2033-07-05')
    }, 15_000)

    it('never exposes a completed future Game or its consequences while holidaying', { timeout: 300_000 }, () => {
      const world = createAcbTestGame()
      const target = addDays(world.currentDate, 14)
      const seedFactory = () => 20261001
      let walk = world
      // Explicit date orders quick-sim today's user Game themselves, so only the non-game required decisions can interrupt.
      for (let guard = 0; guard < 12 && compareGameDates(walk.currentDate, target) < 0; guard += 1) {
        const result = simulateUntilDate(walk, target, seedFactory)
        expectTemporallyCoherent(result.world)
        walk = result.world
        if (result.stopReason.type === 'arrived') break
        if (result.stopReason.type === 'mediaOpportunity') { walk = skipMediaOpportunity(walk, result.stopReason.opportunityId); continue }
        if (result.stopReason.type === 'breakpoint' && result.stopReason.breakpoint.reason === 'returnToPlayReview') {
          const review = reviewReturnToPlay(walk, { injuryId: result.stopReason.breakpoint.sourceId as never, decision: 'CONTINUE_RECOVERY', actor: { kind: 'USER', coachId: walk.userCoachId } })
          if (review.ok) { walk = review.world; continue }
        }
        break
      }

      expectTemporallyCoherent(walk)
      expect(Object.values(walk.matchStatLogsByGameId).length).toBeGreaterThan(0)
    })

    it('auto-resolves a CompetitionSeason completion and rolls to the next season on the way to targetDate', () => {
      // createAcbTestGame is a single fibaLike competition (no NCAA-like), so the whole 400-day
      // window is FULLY_SUPPORTED_PRIMARY end to end and the walk can reach targetDate cleanly.
      const world = createAcbTestGame()
      const primarySeasonId = world.currentSeasonId
      let complete = world
      let seed = 7_000_000
      for (const game of Object.values(world.games).filter((candidate) => candidate.seasonId === primarySeasonId)) {
        complete = simulateAndApplyGame(complete, game, seed)
        seed += 1
      }
      expect(isSeasonComplete(complete, primarySeasonId)).toBe(true)

      // startNextSeason's fallback (no calendarPolicy) moves the next edition about a year
      // ahead. Explicit date advancement simulates fixtures on the way there, and -- exactly like the app --
      // still pauses on a required decision, which the test resolves through its own canonical command.
      const target = addDays(complete.currentDate, 400)
      const seedFactory = () => 20261001
      let walk = complete
      for (let guard = 0; guard < 30 && walk.currentDate !== target; guard += 1) {
        const result = simulateUntilDate(walk, target, seedFactory)
        walk = result.world
        if (result.stopReason.type === 'arrived') break
        if (result.stopReason.type === 'mediaOpportunity') { walk = skipMediaOpportunity(walk, result.stopReason.opportunityId); continue }
        if (result.stopReason.type === 'breakpoint' && result.stopReason.breakpoint.reason === 'returnToPlayReview') {
          const review = reviewReturnToPlay(walk, { injuryId: result.stopReason.breakpoint.sourceId as never, decision: 'CONTINUE_RECOVERY', actor: { kind: 'USER', coachId: walk.userCoachId } })
          if (review.ok) { walk = review.world; continue }
        }
        break
      }

      expect(walk.currentDate).toBe(target)
      // Rollover never moves currentSeasonId directly (see startNextSeason.ts): it only migrates
      // once the world clock naturally reaches the new edition's startDate, which 400 days does.
      expect(walk.currentSeasonId).not.toBe(primarySeasonId)
      // ME-LOCK1: 306 ACB Games through Match Next FAST plus a 400-day walk: ~9 minutes alone, more under parallel load.
    }, 1_200_000)

    it('rolls the next edition immediately but keeps currentSeasonId until the clock actually reaches its startDate', () => {
      const world = withNoRecruiting(createNewGame())
      const primarySeasonId = world.currentSeasonId
      let complete = world
      let seed = 8_000_000
      for (const game of Object.values(world.games).filter((candidate) => candidate.seasonId === primarySeasonId)) {
        complete = simulateAndApplyGame(complete, game, seed)
        seed += 1
      }
      expect(isSeasonComplete(complete, primarySeasonId)).toBe(true)

      // A short target well before the next edition's startDate (~1 year out): startNextSeasonFor
      // already created SCHEDULED CompetitionSeason A 2033-34 (rollover never moves currentDate --
      // see startNextSeason.ts), but currentSeasonId only migrates once currentDate itself reaches
      // that startDate (CalendarEngine.migrateCurrentSeasonIfElapsed), which 10 days does not.
      const target = addDays(complete.currentDate, 10)
      const result = simulateUntilDate(complete, target, () => 20261001)

      expect(result.finalDate).toBe(target)
      expect(result.world.currentSeasonId).toBe(primarySeasonId)
      expect(result.seasonTransitions).toEqual(expect.arrayContaining([expect.objectContaining({ sourceSeasonId: primarySeasonId, schedule: expect.objectContaining({ kind: 'generated' }) })]))
      // ME-LOCK1: resolving a whole season through Match Next FAST needs more than the default test timeout.
    }, 300_000)

    it('empty days with no games or events still advance correctly', () => {
      const world = createNewGame()
      const complete = { ...world, games: Object.fromEntries(Object.entries(world.games).map(([id, game]) => [id, game.status === 'completed' ? game : { ...game, status: 'completed', result: { homeScore: 0, awayScore: 0 } }])) } as typeof world
      const target = addDays(complete.currentDate, 15)
      const result = simulateUntilDate(complete, target)
      expect(result.finalDate).toBe(target)
      expect(result.daysAdvanced).toBe(15)
    })

    it('rejects a target date on or before currentDate', () => {
      const world = createNewGame()
      expect(() => simulateUntilDate(world, world.currentDate)).toThrow(RangeError)
      expect(() => simulateUntilDate(world, addDays(world.currentDate, -5))).toThrow(RangeError)
    })

    it('is deterministic: the same seed and target produce the same final world', () => {
      const worldA = createNewGame()
      const worldB = createNewGame()
      const target = addDays(worldA.currentDate, 10)
      const resultA = simulateUntilDate(worldA, target, () => 12345)
      const resultB = simulateUntilDate(worldB, target, () => 12345)
      expect(resultA.world).toEqual(resultB.world)
    }, 15_000)
  })

  it('exposes a daily-advance tick that resolves today user game', () => {
    const world = createNewGame()
    const target = addDays(world.currentDate, 1)
    const arrived = tickSimulateUntilDate(world, world.currentDate)
    expect(arrived.event.type).toBe('finished')

    const tick = tickSimulateUntilDate(world, target)
    expect(tick.event.type).toBe('dayAdvanced')
    expect(tick.world.currentDate).toBe(target)
    const todaysGames = Object.values(world.games).filter((game) => game.status === 'scheduled' && game.date === world.currentDate)
    expect(todaysGames.every((game) => tick.world.games[game.id]?.status === 'completed')).toBe(true)
  })
})

function withNoScheduledGames<T extends { readonly games: Record<string, { readonly status: string }>; readonly recruitingCyclesById: Record<string, unknown> }>(world: T): T {
  // `Game` requires a result on a completed game: completing the fixtures keeps the world type-consistent so the
  // calendar walk is exercised instead of the standings projection (which legitimately reads completed results).
  const games = Object.fromEntries(Object.entries(world.games).map(([id, game]) => [id, game.status === 'completed' ? game : { ...game, status: 'completed', result: { homeScore: 0, awayScore: 0 } }]))
  return { ...withNoRecruiting(world), games } as T
}

/**
 * Keeps recruiting lifecycle work out of calendar-boundary fixtures; recruiting ID uniqueness is
 * covered by RecruitingEngine tests.
 */
function withNoRecruiting<T extends { readonly recruitingCyclesById: Record<string, unknown> }>(world: T): T {
  return { ...world, recruitingCyclesById: {} }
}
