import { describe, expect, it } from 'vitest'

import { addDays } from '@/domain/date'
import { updateGameWorld } from '@/domain/world'
import { createNewGame } from './createNewGame'
import { advanceGameDay, simulateRemainingGamesToday } from './advanceGameDay'
import { continueGame, getContinueStopReason, getNextKnownEvent } from './ContinueFlow'
import { instantResult } from './playUserGame'

describe('continue flow', () => {
  it('explicitly advancing simulates the user fixture once and advances the date', () => {
    const world = createNewGame()
    const todayGames = Object.values(world.games).filter((game) => game.status === 'scheduled' && game.date === world.currentDate)
    const logsBefore = Object.keys(world.matchStatLogsByGameId).length

    const result = continueGame(world, 1)

    expect(result.daysAdvanced).toBe(1)
    expect(result.finalDate).toBe(addDays(world.currentDate, 1))
    expect(todayGames.length).toBeGreaterThan(0)
    expect(todayGames.every((game) => result.world.games[game.id]?.status === 'completed')).toBe(true)
    expect(todayGames.every((game) => result.world.matchStatLogsByGameId[game.id] !== undefined)).toBe(true)
    expect(Object.keys(result.world.matchStatLogsByGameId)).toHaveLength(logsBefore + todayGames.length)

    const originalGameLog = result.world.matchStatLogsByGameId[todayGames[0]!.id]
    const advancedAgain = continueGame(result.world, 1)
    expect(advancedAgain.world.matchStatLogsByGameId[todayGames[0]!.id]).toEqual(originalGameLog)
  })

  it('activates a relevant pre-match media interaction through the canonical daily lifecycle', () => {
    const base=createNewGame(); const userGame=Object.values(base.games).find(game=>game.status==='scheduled'&&(game.homeTeamId===Object.values(base.teams).find(team=>team.coachId===base.userCoachId)!.id||game.awayTeamId===Object.values(base.teams).find(team=>team.coachId===base.userCoachId)!.id))!
    const scheduled=updateGameWorld(base,{games:Object.values(base.games).map(game=>game.id===userGame.id?{...game,date:addDays(base.currentDate,1),stakes:'final' as never}:game)})
    const next=advanceGameDay(scheduled); const pending=Object.values(next.mediaOpportunitiesById)[0]!
    expect(pending.type).toBe('preMatch'); expect(Object.keys(next.newsItemsById)).toHaveLength(1); expect(getContinueStopReason(next)).toMatchObject({type:'mediaOpportunity',opportunityId:pending.id,breakpoint:{level:'ACTION_REQUIRED',reason:'mediaOpportunity'}})
  })

  it('continues daily progression through a future user fixture and other teams games', () => {
    const base = createNewGame()
    const userTeamId = Object.values(base.teams).find((team) => team.coachId === base.userCoachId)!.id
    const userGame = Object.values(base.games).find((game) => game.status === 'scheduled' && (game.homeTeamId === userTeamId || game.awayTeamId === userTeamId))!
    const targetDate = addDays(base.currentDate, 1)
    const ready = updateGameWorld(base, { games: Object.values(base.games).map((game) => game.id === userGame.id ? { ...game, date: targetDate } : game) })
    const todayGames = Object.values(ready.games).filter((game) => game.status === 'scheduled' && game.date === ready.currentDate)
    const result = continueGame(ready, 2)

    expect(result.daysAdvanced).toBe(2)
    expect(result.finalDate).toBe(addDays(targetDate, 1))
    expect(result.world.games[userGame.id]?.status).toBe('completed')
    expect(result.world.matchStatLogsByGameId[userGame.id]).toBeDefined()
    expect(todayGames.some((game) => game.id !== userGame.id)).toBe(true)
    expect(todayGames.every((game) => result.world.games[game.id]?.status === 'completed')).toBe(true)
  })

  it('uses the identical canonical daily transition as one manual advance', () => {
    const ready = advanceGameDay(simulateRemainingGamesToday(instantResult(createNewGame())))
    const continued = continueGame(ready, 1)
    expect(continued.world).toEqual(advanceGameDay(ready))
    expect(continued.daysAdvanced).toBe(1)
  })

  it('reports the exact number of canonical daily advances needed to reach the game date', () => {
    const ready = advanceGameDay(simulateRemainingGamesToday(instantResult(createNewGame())))
    const next = getNextKnownEvent(ready)!; let manual = ready; let days = 0
    while (manual.currentDate < next.date) { manual = advanceGameDay(manual); days += 1 }

    const result = continueGame(ready)
    expect(result.daysAdvanced).toBe(days)
    expect(result.world).toEqual(manual)
  })

  it('uses a controlled safety stop rather than an unbounded loop', () => {
    const ready = advanceGameDay(simulateRemainingGamesToday(instantResult(createNewGame())))
    const result = continueGame(ready, 1)
    expect(result.stopReason.type).toBe('safetyLimit')
    expect(result.daysAdvanced).toBe(1)
  })

  it('does not keep blocking on a user game that has already been resolved', () => {
    const resolved = instantResult(createNewGame()); const result = continueGame(resolved, 1)
    expect(result.daysAdvanced).toBe(1)
    expect(result.stopReason.type).toBe('safetyLimit')
  })

  it('keeps the world clock moving after every currently scheduled game is complete', () => {
    const resolved = instantResult(createNewGame())
    const complete = { ...resolved, games: Object.fromEntries(Object.entries(resolved.games).map(([id, game]) => [id, { ...game, status: 'completed' }])) } as typeof resolved

    expect(getContinueStopReason(complete)).toBeUndefined()
    const result = continueGame(complete, 1)
    expect(result.daysAdvanced).toBe(1)
    expect(result.world.currentDate).toBe(addDays(complete.currentDate, 1))
  })

  it('rejects an invalid safety limit before changing the world', () => {
    const world = createNewGame()
    expect(() => continueGame(world, 0)).toThrow(RangeError)
    expect(() => continueGame(world, 1.5)).toThrow(RangeError)
    expect(world.currentDate).toBe('2032-10-01')
  })

  it('does not mutate the source world while advancing through the copied daily states', () => {
    const ready = advanceGameDay(simulateRemainingGamesToday(instantResult(createNewGame())))
    const before = JSON.stringify(ready)
    continueGame(ready, 1)
    expect(JSON.stringify(ready)).toBe(before)
  })

  it('derives next known events without mutating the world and handles no future game', () => {
    const world = createNewGame(); const before = JSON.stringify(world)
    expect(getNextKnownEvent(world)?.type).toBe('userGame')
    expect(JSON.stringify(world)).toBe(before)
    const noScheduledGames = { ...world, games: Object.fromEntries(Object.entries(world.games).map(([id, game]) => [id, { ...game, status: 'completed' }])) } as typeof world
    expect(getNextKnownEvent(noScheduledGames)).toBeUndefined()
  })
})
