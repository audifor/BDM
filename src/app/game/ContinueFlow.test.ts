import { describe, expect, it } from 'vitest'

import { addDays } from '@/domain/date'
import { updateGameWorld } from '@/domain/world'
import { createNewGame as createFullNewGame } from './createNewGame'
import { advanceGameDay, simulateRemainingGamesToday } from './advanceGameDay'
import { continueGame, DEFAULT_CONTINUE_DAY_LIMIT, getContinueStopReason, getNextKnownEvent, noProgressStop, type ContinueStopReason } from './ContinueFlow'
import { instantResult } from './matchResolution'
import { startNextSeason } from './startNextSeason'
import { withShortGameFormat } from './testFixtures'

// ME-LOCK1: a lifecycle test (calendar/season/staff), not a basketball one: its Games still resolve through Match Next FAST, with a short game format.
const createNewGame = (...args: Parameters<typeof createFullNewGame>): ReturnType<typeof createFullNewGame> => withShortGameFormat(createFullNewGame(...args))

// ME-LOCK1: production draws fresh entropy per match at the application boundary, so these lifecycle tests inject a
// fixed seed and the career loop under test is reproducible.
const MATCH_SEED = 20261001
const seedFactory = () => MATCH_SEED
const resolvedGame = () => instantResult(createNewGame(), undefined, MATCH_SEED)
const readyAfterOneDay = () => advanceGameDay(simulateRemainingGamesToday(resolvedGame(), seedFactory), seedFactory)

describe('continue flow', () => {
  it('stops immediately for a scheduled user game on the current date instead of simulating it', () => {
    const world = createNewGame()
    const userTeamId = Object.values(world.teams).find((team) => team.coachId === world.userCoachId)!.id
    const todayGames = Object.values(world.games).filter((game) => game.status === 'scheduled' && game.date === world.currentDate)
    const result = continueGame(world)

    expect(todayGames.some((game) => game.homeTeamId === userTeamId || game.awayTeamId === userTeamId)).toBe(true)
    expect(result.daysAdvanced).toBe(0)
    expect(result.stopReason).toMatchObject({ type: 'userGame', breakpoint: { level: 'ACTION_REQUIRED', reason: 'userGame', route: 'match' } })
    expect(result.world).toBe(world)
    expect(Object.values(result.world.games).filter((game) => game.date === world.currentDate).every((game) => game.status === 'scheduled')).toBe(true)
  })

  it('keeps the explicit one-day advance quick-simulation allowance for the user fixture', () => {
    const world = createNewGame()
    const todayGames = Object.values(world.games).filter((game) => game.status === 'scheduled' && game.date === world.currentDate)
    const logsBefore = Object.keys(world.matchStatLogsByGameId).length

    const advanced = advanceGameDay(world, seedFactory)

    expect(todayGames.length).toBeGreaterThan(0)
    expect(advanced.currentDate).toBe(addDays(world.currentDate, 1))
    expect(todayGames.every((game) => advanced.games[game.id]?.status === 'completed')).toBe(true)
    expect(todayGames.every((game) => advanced.matchStatLogsByGameId[game.id] !== undefined)).toBe(true)
    expect(Object.keys(advanced.matchStatLogsByGameId)).toHaveLength(logsBefore + todayGames.length)

    const originalGameLog = advanced.matchStatLogsByGameId[todayGames[0]!.id]
    expect(continueGame(advanced, 1, seedFactory).world.matchStatLogsByGameId[todayGames[0]!.id]).toEqual(originalGameLog)
  })

  it('activates a relevant pre-match media interaction and surfaces it as the Continue stop', () => {
    const base = createNewGame()
    const userTeamId = Object.values(base.teams).find((team) => team.coachId === base.userCoachId)!.id
    const userGame = Object.values(base.games).find((game) => game.status === 'scheduled' && (game.homeTeamId === userTeamId || game.awayTeamId === userTeamId))!
    const scheduled = updateGameWorld(base, { games: Object.values(base.games).map((game) => game.id === userGame.id ? { ...game, date: addDays(base.currentDate, 1), stakes: 'final' as never } : game) })
    const next = advanceGameDay(scheduled, seedFactory)
    const pending = Object.values(next.mediaOpportunitiesById)[0]!

    expect(pending.type).toBe('preMatch')
    expect(getContinueStopReason(next)).toMatchObject({ type: 'mediaOpportunity', opportunityId: pending.id, breakpoint: { level: 'ACTION_REQUIRED', reason: 'mediaOpportunity' } })

    const result = continueGame(next, DEFAULT_CONTINUE_DAY_LIMIT, seedFactory)
    expect(result.daysAdvanced).toBe(0)
    expect(result.world).toBe(next)
    expect(result.stopReason).toMatchObject({ type: 'mediaOpportunity', opportunityId: pending.id, breakpoint: { route: 'media' } })
  })

  it('advances to a future user fixture, resolving the day, and stops there without simulating it', () => {
    const base = createNewGame()
    const userTeamId = Object.values(base.teams).find((team) => team.coachId === base.userCoachId)!.id
    const userGame = Object.values(base.games).find((game) => game.status === 'scheduled' && (game.homeTeamId === userTeamId || game.awayTeamId === userTeamId))!
    const targetDate = addDays(base.currentDate, 1)
    const ready = updateGameWorld(base, { games: Object.values(base.games).map((game) => game.id === userGame.id ? { ...game, date: targetDate } : game) })
    const todayGames = Object.values(ready.games).filter((game) => game.status === 'scheduled' && game.date === ready.currentDate)
    const result = continueGame(ready, DEFAULT_CONTINUE_DAY_LIMIT, seedFactory)

    expect(result.daysAdvanced).toBe(1)
    expect(result.finalDate).toBe(targetDate)
    expect(result.stopReason).toMatchObject({ type: 'userGame', gameId: userGame.id, breakpoint: { level: 'ACTION_REQUIRED', reason: 'userGame' } })
    expect(result.world.games[userGame.id]?.status).toBe('scheduled')
    expect(todayGames.some((game) => game.id !== userGame.id)).toBe(true)
    expect(todayGames.every((game) => result.world.games[game.id]?.status === 'completed')).toBe(true)
  })

  it('advances ordinary days and stops on the next user game date without simulating it', () => {
    const ready = readyAfterOneDay()
    const next = getNextKnownEvent(ready)!
    const result = continueGame(ready, DEFAULT_CONTINUE_DAY_LIMIT, seedFactory)

    expect(result.daysAdvanced).toBeGreaterThan(0)
    expect(result.finalDate).toBe(next.date)
    expect(result.stopReason).toMatchObject({ type: 'userGame', gameId: next.gameId, breakpoint: { level: 'ACTION_REQUIRED', reason: 'userGame' } })
    expect(result.world.games[next.gameId]?.status).toBe('scheduled')
  })

  it('uses the identical canonical daily transition as one manual advance', () => {
    const ready = readyAfterOneDay()
    const continued = continueGame(ready, 1, seedFactory)
    expect(continued.world).toEqual(advanceGameDay(ready, seedFactory))
    expect(continued.daysAdvanced).toBe(1)
  })

  it('walks the same number of canonical daily transitions as a manual loop to the next interruption', () => {
    const ready = readyAfterOneDay()
    let manual = ready; let days = 0
    while (days < DEFAULT_CONTINUE_DAY_LIMIT && getContinueStopReason(manual) === undefined) { manual = advanceGameDay(manual, seedFactory); days += 1 }

    const result = continueGame(ready, DEFAULT_CONTINUE_DAY_LIMIT, seedFactory)
    expect(result.daysAdvanced).toBe(days)
    expect(result.world).toEqual(manual)
  })

  it('honours the day limit instead of running unbounded', () => {
    const ready = readyAfterOneDay()
    const result = continueGame(ready, 1, seedFactory)
    expect(result.daysAdvanced).toBe(1)
    expect(result.finalDate).toBe(addDays(ready.currentDate, 1))
    expect(result.world.currentDate).toBe(addDays(ready.currentDate, 1))
  })

  it('does not keep blocking on a user game that has already been resolved', () => {
    const resolved = resolvedGame()
    const result = continueGame(resolved, 1, seedFactory)
    expect(result.daysAdvanced).toBe(1)
    expect(result.stopReason.type).not.toBe('userGame')
  })

  it('keeps the world clock moving once every game today is resolved', () => {
    const world = simulateRemainingGamesToday(resolvedGame(), seedFactory)

    expect(getContinueStopReason(world)).toBeUndefined()
    const result = continueGame(world, 1, seedFactory)
    expect(result.daysAdvanced).toBe(1)
    expect(result.world.currentDate).toBe(addDays(world.currentDate, 1))
  })

  it('returns an explicit NO_PROGRESS stop instead of a silent zero-day no-op', () => {
    const world = createNewGame()
    const stalled = noProgressStop(world, world)
    if (stalled?.type !== 'noProgress') throw new Error('expected an explicit noProgress stop reason')
    expect(stalled.diagnostic).toContain('NO_PROGRESS_INVARIANT')
    expect(noProgressStop(world, advanceGameDay(world, seedFactory))).toBeUndefined()
  })

  it('rejects an invalid safety limit before changing the world', () => {
    const world = createNewGame()
    expect(() => continueGame(world, 0)).toThrow(RangeError)
    expect(() => continueGame(world, 1.5)).toThrow(RangeError)
    expect(world.currentDate).toBe('2032-10-01')
  })

  it('does not mutate the source world while advancing through the copied daily states', () => {
    const ready = readyAfterOneDay()
    const before = JSON.stringify(ready)
    continueGame(ready, 1, seedFactory)
    expect(JSON.stringify(ready)).toBe(before)
  })

  it('derives next known events without mutating the world and handles no future game', () => {
    const world = createNewGame(); const before = JSON.stringify(world)
    expect(getNextKnownEvent(world)?.type).toBe('userGame')
    expect(JSON.stringify(world)).toBe(before)
    const noScheduledGames = { ...world, games: Object.fromEntries(Object.entries(world.games).map(([id, game]) => [id, { ...game, status: 'completed' }])) } as typeof world
    expect(getNextKnownEvent(noScheduledGames)).toBeUndefined()
  })

  // MX0.1 acceptance smoke: ordinary time must keep advancing, matches must not deadlock the career, and every stop
  // must be attributable to a canonical reason -- never an unexplained zero-progress loop.
  it('advances a bounded career loop of up to 30 game days with only attributable stops', () => {
    let world = createNewGame()
    const startDate = world.currentDate
    let days = 0; let matches = 0; let terminalStop: ContinueStopReason | undefined
    for (let step = 0; step < 40 && days < 30; step += 1) {
      const result = continueGame(world, 30 - days, seedFactory)
      if (result.daysAdvanced === 0 && result.stopReason.type === 'safetyLimit') throw new Error('unexplained zero-day safety limit')
      if (result.stopReason.type === 'noProgress') throw new Error(result.stopReason.diagnostic)
      days += result.daysAdvanced
      world = result.world
      if (result.stopReason.type === 'userGame') { world = instantResult(world, undefined, MATCH_SEED); matches += 1; continue }
      if (result.stopReason.type === 'seasonComplete') { world = startNextSeason(world); continue }
      terminalStop = result.stopReason
      break
    }

    expect(world.currentDate).not.toBe(startDate)
    expect(days).toBeGreaterThan(0)
    expect(matches).toBeGreaterThan(0)
    if (terminalStop !== undefined) {
      if (terminalStop.type === 'breakpoint' || terminalStop.type === 'mediaOpportunity') expect(terminalStop.breakpoint.diagnostic.length).toBeGreaterThan(0)
      else if (terminalStop.type !== 'safetyLimit') throw new Error(`unexplained terminal stop ${terminalStop.type}`)
    }
  }, 120_000)
})
