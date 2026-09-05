import { describe, expect, it } from 'vitest'

import { addDays, compareGameDates } from '@/domain/date'
import { getUserTeam } from '@/engine/calendar'

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
  })

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

  it('stops at the completed-season boundary instead of inventing extra days', () => {
    const world = createNewGame()
    const complete = {
      ...world,
      games: Object.fromEntries(Object.entries(world.games).map(([id, game]) => [id, { ...game, status: 'completed' }])),
    } as typeof world

    const result = simulateUntilDate(complete, addDays(complete.currentDate, 10))

    expect(result.daysAdvanced).toBe(0)
    expect(result.stopReason).toEqual({ type: 'seasonComplete' })
    expect(result.world.currentDate).toBe(complete.currentDate)
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
