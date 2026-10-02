import { describe, expect, it } from 'vitest'

import { addDays } from '@/domain/date'
import { updateGameWorld } from '@/domain/world'
import { createNewGame } from './createNewGame'
import { advanceGameDay, simulateRemainingGamesToday } from './advanceGameDay'
import { continueGame, getContinueStopReason, getNextKnownEvent } from './ContinueFlow'
import { instantResult, simulateAndApplyGame } from './playUserGame'
import { createPreMatchMediaOpportunity } from '@/engine/media'

describe('continue flow', () => {
  it('auto-simulates today\'s user fixture through the canonical daily advance', () => {
    const world = createNewGame()
    const userTeam = Object.values(world.teams).find((team) => team.coachId === world.userCoachId)!
    const userGame = Object.values(world.games).find((game) => game.status === 'scheduled' && game.date === world.currentDate && (game.homeTeamId === userTeam.id || game.awayTeamId === userTeam.id))!
    const result = continueGame(world, 1)

    expect(result.daysAdvanced).toBe(1)
    expect(result.finalDate).toBe(addDays(world.currentDate, 1))
    expect(world.games[userGame.id]?.status).toBe('scheduled')
    expect(result.world.games[userGame.id]?.status).toBe('completed')
    expect(result.world.matchStatLogsByGameId[userGame.id]).toBeDefined()
    expect(Object.values(result.world.matchStatLogsByGameId).filter((log) => log.gameId === userGame.id)).toHaveLength(1)
    expect(getContinueStopReason(world)).toMatchObject({ type: 'userGame', gameId: userGame.id })
  })

  it('continues a normal day when no user fixture is scheduled today', () => {
    const base = createNewGame()
    const userTeam = Object.values(base.teams).find((team) => team.coachId === base.userCoachId)!
    const userGame = Object.values(base.games).find((game) => game.status === 'scheduled' && (game.homeTeamId === userTeam.id || game.awayTeamId === userTeam.id))!
    const world = updateGameWorld(base, { games: Object.values(base.games).map((game) => game.id === userGame.id ? { ...game, date: addDays(base.currentDate, 1) } : game) })

    const result = continueGame(world, 1)

    expect(result.daysAdvanced).toBe(1)
    expect(result.finalDate).toBe(addDays(world.currentDate, 1))
    expect(result.world.games[userGame.id]?.status).toBe('scheduled')
  })

  it('resolves every scheduled same-day fixture once before advancing', () => {
    const world = createNewGame()
    const gamesToResolve = Object.values(world.games).filter((game) => game.status === 'scheduled' && game.date === world.currentDate)
    expect(gamesToResolve.length).toBeGreaterThan(1)

    const result = continueGame(world, 1)

    expect(result.daysAdvanced).toBe(1)
    expect(result.finalDate).toBe(addDays(world.currentDate, 1))
    for (const game of gamesToResolve) {
      expect(result.world.games[game.id]?.status).toBe('completed')
      expect(Object.values(result.world.matchStatLogsByGameId).filter((log) => log.gameId === game.id)).toHaveLength(1)
    }
  })

  it('preserves a non-match ACTION_REQUIRED blocker on a user match day', () => {
    const base = createNewGame()
    const userTeam = Object.values(base.teams).find((team) => team.coachId === base.userCoachId)!
    const userGame = Object.values(base.games).find((game) => game.status === 'scheduled' && game.date === base.currentDate && (game.homeTeamId === userTeam.id || game.awayTeamId === userTeam.id))!
    const important = updateGameWorld(base, { games: Object.values(base.games).map((game) => game.id === userGame.id ? { ...game, stakes: 'final' } : game) })
    const withMedia = createPreMatchMediaOpportunity(important, userGame.id)

    expect(getContinueStopReason(withMedia)).toMatchObject({ type: 'mediaOpportunity' })
    const result = continueGame(withMedia, 1)
    expect(result.daysAdvanced).toBe(0)
    expect(result.world).toBe(withMedia)
    expect(result.stopReason).toMatchObject({ type: 'mediaOpportunity' })
    expect(result.world.games[userGame.id]?.status).toBe('scheduled')
  })

  it('activates a relevant pre-match media interaction through the canonical daily lifecycle', () => {
    const base=createNewGame(); const userGame=Object.values(base.games).find(game=>game.status==='scheduled'&&(game.homeTeamId===Object.values(base.teams).find(team=>team.coachId===base.userCoachId)!.id||game.awayTeamId===Object.values(base.teams).find(team=>team.coachId===base.userCoachId)!.id))!
    const scheduled=updateGameWorld(base,{games:Object.values(base.games).map(game=>game.id===userGame.id?{...game,date:addDays(base.currentDate,1),stakes:'final' as never}:game)})
    const next=advanceGameDay(scheduled); const pending=Object.values(next.mediaOpportunitiesById)[0]!
    expect(pending.type).toBe('preMatch'); expect(Object.keys(next.newsItemsById)).toHaveLength(1); expect(getContinueStopReason(next)).toMatchObject({type:'mediaOpportunity',opportunityId:pending.id,breakpoint:{level:'ACTION_REQUIRED',reason:'mediaOpportunity'}})
  })

  it('continues through the next user game date after automatically resolving that fixture', () => {
    const ready = advanceGameDay(simulateRemainingGamesToday(instantResult(createNewGame())))
    const next = getNextKnownEvent(ready)!
    let manual = ready
    let days = 0
    while (manual.currentDate <= next.date) { manual = advanceGameDay(manual); days += 1 }

    const result = continueGame(ready, days)

    expect(result.daysAdvanced).toBe(days)
    expect(result.finalDate).toBe(addDays(next.date, 1))
    expect(result.world.games[next.gameId]?.status).toBe('completed')
    expect(result.world.matchStatLogsByGameId[next.gameId]).toBeDefined()
  }, 30_000)

  it('continues through a future user game after the current competition has completed', () => {
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

    const result = continueGame(ready, 5)

    expect(result.daysAdvanced).toBe(5)
    expect(result.finalDate).toBe(addDays(next.date, 1))
    expect(result.world.games[next.gameId]?.status).toBe('completed')
    expect(result.world.matchStatLogsByGameId[next.gameId]).toBeDefined()
  }, 10_000)

  it('uses the identical canonical daily transition as one manual advance', () => {
    const ready = advanceGameDay(simulateRemainingGamesToday(instantResult(createNewGame())))
    const continued = continueGame(ready, 1)
    expect(continued.world).toEqual(advanceGameDay(ready))
    expect(continued.daysAdvanced).toBe(1)
  })

  it('reports the exact number of requested canonical daily advances', () => {
    const world = createNewGame()
    const userTeam = Object.values(world.teams).find((team) => team.coachId === world.userCoachId)!
    const userGame = Object.values(world.games).find((game) => game.status === 'scheduled' && game.date === world.currentDate && (game.homeTeamId === userTeam.id || game.awayTeamId === userTeam.id))!

    const result = continueGame(world, 2)

    expect(result.daysAdvanced).toBe(2)
    expect(result.finalDate).toBe(addDays(world.currentDate, 2))
    expect(result.world.games[userGame.id]?.status).toBe('completed')
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
