import { describe, expect, it } from 'vitest'

import { addDays } from '@/domain/date'
import { updateGameWorld } from '@/domain/world'
import { createNewGame } from './createNewGame'
import { advanceGameDay, simulateRemainingGamesToday } from './advanceGameDay'
import { continueGame, getContinueStopReason, getNextKnownEvent } from './ContinueFlow'
import { instantResult, simulateAndApplyGame } from './playUserGame'

describe('continue flow', () => {
  it('stops immediately for a scheduled user game on the current date', () => {
    const world = createNewGame(); const result = continueGame(world)
    expect(result.daysAdvanced).toBe(0)
    expect(result.stopReason.type).toBe('userGame')
    expect(result.world).toBe(world)
  })

  it('activates a relevant pre-match media interaction through the canonical daily lifecycle', () => {
    const base=createNewGame(); const userGame=Object.values(base.games).find(game=>game.status==='scheduled'&&(game.homeTeamId===Object.values(base.teams).find(team=>team.coachId===base.userCoachId)!.id||game.awayTeamId===Object.values(base.teams).find(team=>team.coachId===base.userCoachId)!.id))!
    const scheduled=updateGameWorld(base,{games:Object.values(base.games).map(game=>game.id===userGame.id?{...game,date:addDays(base.currentDate,1),stakes:'final' as never}:game)})
    const next=advanceGameDay(scheduled); const pending=Object.values(next.mediaOpportunitiesById)[0]!
    expect(pending.type).toBe('preMatch'); expect(Object.keys(next.newsItemsById)).toHaveLength(1); expect(getContinueStopReason(next)).toEqual({type:'mediaOpportunity',opportunityId:pending.id})
  })

  it('advances through ordinary days then stops on the next user game date', () => {
    const ready = advanceGameDay(simulateRemainingGamesToday(instantResult(createNewGame())))
    const next = getNextKnownEvent(ready)!; const result = continueGame(ready)
    expect(result.daysAdvanced).toBeGreaterThan(0)
    expect(result.finalDate).toBe(next.date)
    expect(result.stopReason).toEqual({ type: 'userGame', gameId: next.gameId })
  })

  it('keeps advancing to a future user game after the current competition has completed', () => {
    let world = createNewGame()
    const currentCompetitionId = world.seasons[world.currentSeasonId]!.competitionId
    for (const game of Object.values(world.games).filter((candidate) => candidate.competitionId === currentCompetitionId)) {
      world = simulateAndApplyGame(world, game)
    }
    const next = getNextKnownEvent(world)!
    for (const game of Object.values(world.games).filter((candidate) => candidate.status === 'scheduled' && candidate.date < next.date)) {
      world = simulateAndApplyGame(world, game)
    }
    const ready = updateGameWorld(world, { currentDate: addDays(next.date, -4) })

    const result = continueGame(ready)

    expect(result.daysAdvanced).toBe(4)
    expect(result.finalDate).toBe(next.date)
    expect(result.stopReason).toEqual({ type: 'userGame', gameId: next.gameId })
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

  it('stops at the existing completed-season boundary without advancing', () => {
    const resolved = instantResult(createNewGame())
    const complete = { ...resolved, games: Object.fromEntries(Object.entries(resolved.games).map(([id, game]) => [id, { ...game, status: 'completed' }])) } as typeof resolved

    expect(continueGame(complete).stopReason).toEqual({ type: 'seasonComplete' })
    expect(getContinueStopReason(complete)).toEqual({ type: 'seasonComplete' })
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
