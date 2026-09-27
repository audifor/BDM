import { describe, expect, it } from 'vitest'

import { addDays, parseGameDate } from '@/domain/date'
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

  it('stops before advancing through an unresolved user game', () => {
    const world = createNewGame()
    const target = addDays(world.currentDate, 7)
    const before = JSON.stringify(world)

    const result = simulateUntilDate(world, target)

    expect(JSON.stringify(world)).toBe(before)
    expect(result.world).toBe(world)
    expect(result.world.currentDate).toBe(world.currentDate)
    expect(result.daysAdvanced).toBe(0)
    expect(result.stopReason).toMatchObject({ type: 'userGame', breakpoint: { level: 'ACTION_REQUIRED', reason: 'userGame' } })
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

      // startNextSeason's fallback (no calendarPolicy) moves the next edition about a year
      // ahead. Simulate Until now stops at the next unresolved user game on the way there.
      const target = addDays(complete.currentDate, 400)
      const result = simulateUntilDate(complete, target)

      expect(result.finalDate < target).toBe(true)
      expect(result.stopReason).toMatchObject({ type: 'userGame', breakpoint: { level: 'ACTION_REQUIRED' } })
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
      expect(result.seasonTransitions).toEqual(expect.arrayContaining([expect.objectContaining({ sourceSeasonId: primarySeasonId, schedule: expect.objectContaining({ kind: 'generated' }) })]))
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
      const resultA = simulateUntilDate(worldA, target, () => 12345)
      const resultB = simulateUntilDate(worldB, target, () => 12345)
      expect(resultA.world).toEqual(resultB.world)
    }, 15_000)
  })

  it('exposes a finished tick with the canonical user-game breakpoint', () => {
    const world = createNewGame()
    const target = addDays(world.currentDate, 1)
    const arrived = tickSimulateUntilDate(world, world.currentDate)
    expect(arrived.event.type).toBe('finished')

    const tick = tickSimulateUntilDate(world, target)
    expect(tick.world).toBe(world)
    expect(tick.event).toMatchObject({ type: 'finished', stopReason: { type: 'userGame', breakpoint: { level: 'ACTION_REQUIRED', reason: 'userGame' } } })
  })
})

function withNoScheduledGames<T extends { readonly games: Record<string, { status: string }>; readonly recruitingCyclesById: Record<string, unknown> }>(world: T): T {
  return { ...withNoRecruiting(world), games: Object.fromEntries(Object.entries(world.games).map(([id, game]) => [id, { ...game, status: 'completed' }])) }
}

/**
 * Keeps recruiting lifecycle work out of calendar-boundary fixtures; recruiting ID uniqueness is
 * covered by RecruitingEngine tests.
 */
function withNoRecruiting<T extends { readonly recruitingCyclesById: Record<string, unknown> }>(world: T): T {
  return { ...world, recruitingCyclesById: {} }
}
