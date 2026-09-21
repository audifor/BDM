import { describe, expect, it } from 'vitest'

import { addDays, compareGameDates, parseGameDate } from '@/domain/date'
import { getUserTeam } from '@/engine/calendar'
import { isSeasonComplete } from '@/engine/season'
import { simulateAndApplyGame } from './playUserGame'

import { advanceGameDay } from './advanceGameDay'
import { createAcbTestGame } from './createAcbTestGame'
import { createNewGame } from './createNewGame'
import { simulateUntilDate, tickSimulateUntilDate } from './simulateUntilDate'

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

  it('simulates the user match and every other pending game before arriving on the target morning', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const target = addDays(world.currentDate, 7)
    const before = JSON.stringify(world)

    const result = simulateUntilDate(world, target)

    expect(JSON.stringify(world)).toBe(before)
    expect(result.world.currentDate).toBe(target)
    expect(result.daysAdvanced).toBe(7)

    for (const game of Object.values(world.games)) {
      const resolved = result.world.games[game.id]!
      if (compareGameDates(game.date, target) < 0) {
        expect(resolved.status).toBe('completed')
      }
      if (compareGameDates(game.date, target) >= 0) {
        expect(resolved.status).toBe(game.status)
      }
    }

    const userGameOnTarget = Object.values(result.world.games).find(
      (game) =>
        game.status === 'scheduled' &&
        game.date === target &&
        (game.homeTeamId === team.id || game.awayTeamId === team.id),
    )
    if (userGameOnTarget !== undefined) {
      expect(result.stopReason.type === 'userGame' || result.stopReason.type === 'mediaOpportunity').toBe(true)
    }
  })

  it('continues the world clock beyond a completed competition season', () => {
    const world = createNewGame()
    const complete = {
      ...world,
      games: Object.fromEntries(Object.entries(world.games).map(([id, game]) => [id, { ...game, status: 'completed' }])),
    } as typeof world

    const result = simulateUntilDate(complete, addDays(complete.currentDate, 10))

    expect(result.daysAdvanced).toBe(10)
    expect(result.stopReason).toEqual({ type: 'arrived' })
    expect(result.world.currentDate).toBe(addDays(complete.currentDate, 10))
  })

  describe('RWS-BUG-002 SIMULAR HASTA FECHA', () => {
    it('simulates until tomorrow', () => {
      const world = createNewGame()
      const target = addDays(world.currentDate, 1)
      const result = simulateUntilDate(world, target)
      expect(result.finalDate).toBe(target)
    })

    it('simulates +30 days exactly', () => {
      const world = createNewGame()
      const target = addDays(world.currentDate, 30)
      const result = simulateUntilDate(world, target)
      expect(result.finalDate).toBe(target)
    }, 15_000)

    // createNewGame()'s demo world includes an NCAA-like competition with no future-season
    // support (UNSUPPORTED_FUTURE_LIFECYCLE, see CompetitionLifecycleCoordinator.ts) and an
    // unrelated, pre-existing recruiting-pool generation bug that can throw a duplicate-ID error
    // if its recruiting cycles are advanced across certain date ranges. These tests clear
    // recruitingCyclesById to isolate SIMULAR HASTA FECHA's own behavior from that separate,
    // out-of-scope bug; long calendar-year spans and the unsupportedLifecycle diagnostic itself
    // are certified against RealWorldSpain (ACB + Copa) in WorldDbGameBootstrap.test.ts and
    // CompetitionLifecycleCoordinator.test.ts (ncaaLike diagnostic) instead.
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

    it('auto-resolves a CompetitionSeason completion and rolls to the next season on the way to targetDate', () => {
      // createAcbTestGame is a single fibaLike competition (no NCAA-like), so the whole 400-day
      // window is FULLY_SUPPORTED_PRIMARY end to end and the walk can reach targetDate cleanly.
      const world = createAcbTestGame()
      const primarySeasonId = world.currentSeasonId
      let complete = world
      for (const game of Object.values(world.games).filter((candidate) => candidate.seasonId === primarySeasonId)) {
        complete = simulateAndApplyGame(complete, game)
      }
      expect(isSeasonComplete(complete, primarySeasonId)).toBe(true)

      // startNextSeason's fallback (no calendarPolicy) jumps the next edition's start a full
      // calendar year ahead (addYears), so the target must clear that full year for the
      // rollover to actually happen on the way there. `simulateUntilDate` auto-resolves every
      // user game strictly before targetDate (see `tickSimulateUntilDate`'s `instantResult`
      // branch); it only stops early on one scheduled exactly on targetDate itself, exactly like
      // the "simulates the user match..." test above -- createAcbTestGame designates a user team,
      // so that is an equally valid arrival here.
      const target = addDays(complete.currentDate, 400)
      const result = simulateUntilDate(complete, target)

      expect(result.finalDate).toBe(target)
      expect(result.stopReason.type === 'arrived' || result.stopReason.type === 'userGame' || result.stopReason.type === 'mediaOpportunity').toBe(true)
      // Rollover never moves currentSeasonId directly (see startNextSeason.ts): it only migrates
      // once the world clock naturally reaches the new edition's startDate, which 400 days does.
      expect(result.world.currentSeasonId).not.toBe(primarySeasonId)
    }, 600_000)

    it('rolls the next edition immediately but keeps currentSeasonId until the clock actually reaches its startDate', () => {
      const world = withNoRecruiting(createNewGame())
      const primarySeasonId = world.currentSeasonId
      let complete = world
      for (const game of Object.values(world.games).filter((candidate) => candidate.seasonId === primarySeasonId)) {
        complete = simulateAndApplyGame(complete, game)
      }
      expect(isSeasonComplete(complete, primarySeasonId)).toBe(true)

      // A short target well before the next edition's startDate (~1 year out): startNextSeasonFor
      // already created SCHEDULED CompetitionSeason A 2033-34 (rollover never moves currentDate --
      // see startNextSeason.ts), but currentSeasonId only migrates once currentDate itself reaches
      // that startDate (CalendarEngine.migrateCurrentSeasonIfElapsed), which 10 days does not.
      const target = addDays(complete.currentDate, 10)
      const result = simulateUntilDate(complete, target)

      expect(result.finalDate).toBe(target)
      expect(result.world.currentSeasonId).toBe(primarySeasonId)
    })

    it('empty days with no games or events still advance correctly', () => {
      const world = createNewGame()
      const complete = { ...world, games: Object.fromEntries(Object.entries(world.games).map(([id, game]) => [id, { ...game, status: 'completed' }])) } as typeof world
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
      const resultA = simulateUntilDate(worldA, target)
      const resultB = simulateUntilDate(worldB, target)
      expect(resultA.world).toEqual(resultB.world)
    }, 15_000)
  })

  it('exposes one holiday tick so the UI can show the passing date and a resolved user match', () => {
    const world = createNewGame()
    const target = addDays(world.currentDate, 1)
    const arrived = tickSimulateUntilDate(world, world.currentDate)
    expect(arrived.event.type).toBe('finished')

    let current = world
    let match
    for (let step = 0; step < 24; step += 1) {
      const tick = tickSimulateUntilDate(current, target)
      current = tick.world
      if (tick.event.type === 'userMatch') {
        match = tick.event.match
        break
      }
      if (tick.event.type === 'finished') break
    }

    expect(match).toBeDefined()
    expect(match!.homeName.length).toBeGreaterThan(0)
    expect(match!.awayName.length).toBeGreaterThan(0)
    expect(match!.homeScore).toBeGreaterThanOrEqual(0)
    expect(match!.awayScore).toBeGreaterThanOrEqual(0)
    expect(['win', 'loss', 'draw']).toContain(match!.outcome)
  })
})

function withNoScheduledGames<T extends { readonly games: Record<string, { status: string }>; readonly recruitingCyclesById: Record<string, unknown> }>(world: T): T {
  return { ...withNoRecruiting(world), games: Object.fromEntries(Object.entries(world.games).map(([id, game]) => [id, { ...game, status: 'completed' }])) }
}

/**
 * Clears recruiting cycles: they carry date-window state (opensOn/signingOn/closesOn) that a
 * raw currentDate jump, or a long calendar-year span, can leave inconsistent, triggering an
 * unrelated, pre-existing recruiting-pool generation bug (duplicate deterministic player IDs).
 * Out of scope for RWS-BUG-002; this isolates SIMULAR HASTA FECHA's own behavior from it.
 */
function withNoRecruiting<T extends { readonly recruitingCyclesById: Record<string, unknown> }>(world: T): T {
  return { ...world, recruitingCyclesById: {} }
}
