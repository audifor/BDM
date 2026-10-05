import { compareGameDates, createGameDate } from '@/domain/date'
import { calculateStandings } from '@/engine/competition/standings'
import { getGamesToday, getScheduledGamesToday, getUserTeam } from '@/engine/calendar'
import { calculateActiveLineups } from '@/engine/match'
import { describe, expect, it } from 'vitest'
import { updateGameWorld } from '@/domain/world'
import { calculateFatigueAtEvents } from '@/engine/match'
import { createMatchSession } from '@/engine/match'

import {
  advanceGameDay,
  createNewGame,
  getCurrentSeason,
  instantResult,
  playUserGame,
  prepareUserMatch,
  completeMatch,
  simulateRemainingGamesToday,
} from './index'
import { prepareMatchOptions } from './playUserGame'
import { createMatchEnginePort } from '@/app/matchNext'

describe('prototype game application', () => {
  it('creates a playable scheduled world from the fixed prototype configuration', () => {
    const world = createNewGame()
    const userTeam = getUserTeam(world)

    expect(world.currentDate).toBe(createGameDate(2032, 10, 1))
    expect(Object.values(world.games).filter((game) => game.competitionId === world.seasons[world.currentSeasonId]!.competitionId)).toHaveLength(56)
    expect(userTeam?.id).toBe('generated-team-0001')
    expect(Object.values(world.seasons).filter((season) => world.ecosystems[world.competitions[season.competitionId]!.ecosystemId]!.category === 'men')).toHaveLength(4)
    expect(Object.values(world.seasons).some((season) => world.ecosystems[world.competitions[season.competitionId]!.ecosystemId]!.category === 'women')).toBe(true)
  })

  it('completes only the user game without advancing or mutating the input', () => {
    const world = createNewGame()
    const userGame = getGamesToday(world).find((game) => game.homeTeamId === getUserTeam(world)?.id)
    const updatedWorld = playUserGame(world)

    expect(userGame).toBeDefined()
    expect(updatedWorld.currentDate).toBe(world.currentDate)
    expect(updatedWorld.games[userGame!.id]?.status).toBe('completed')
    expect(world.games[userGame!.id]?.status).toBe('scheduled')
    expect(getScheduledGamesToday(updatedWorld).filter((game) => game.competitionId === userGame!.competitionId)).toHaveLength(3)
  })

  it('returns the same user result for the same world and game inputs', () => {
    const first = playUserGame(createNewGame(), 12345)
    const second = playUserGame(createNewGame(), 12345)
    const gameId = getGamesToday(first).find((game) => game.status === 'completed')!.id

    expect(first.games[gameId]?.result).toEqual(second.games[gameId]?.result)
  })

  it('prepares a viewer session without completing the Game, then applies it once on completion', () => {
    const world = createNewGame()
    const simulation = prepareUserMatch(world)
    const completedWorld = completeMatch(world, simulation)

    expect(world.games[simulation.gameId]?.status).toBe('scheduled')
    expect(completedWorld.games[simulation.gameId]).toMatchObject({ status: 'completed', result: { homeScore: simulation.finalScore.home, awayScore: simulation.finalScore.away } })
  })

  it('carries career fatigue into MatchEngine and returns actual legacy match load to the Player world state', () => {
    const world = createNewGame()
    const game = getGamesToday(world).find((candidate) => candidate.homeTeamId === getUserTeam(world)?.id)!
    const starterId = prepareUserMatch(world, undefined, 5678).lineups.home[0]!
    const fatigueWorld = updateGameWorld(world, { careerFatigueByPlayerId: { ...world.careerFatigueByPlayerId, [starterId]: 40 } })
    const session = createMatchSession(prepareMatchOptions(fatigueWorld, game, undefined, 5678))
    const simulation = prepareUserMatch(fatigueWorld, undefined, 5678)
    const completed = completeMatch(fatigueWorld, simulation)
    const initialMatchFatigue = 20
    const finalMatchFatigue = calculateFatigueAtEvents(simulation.lineups, simulation.squads, simulation.homeTeamId, simulation.awayTeamId, simulation.events, { [starterId]: initialMatchFatigue })[starterId]!

    expect(completed.careerFatigueByPlayerId[starterId]).toBeGreaterThan(40)
    expect(session.state.fatigueByPlayerId[starterId]).toBe(20)
    expect(completed.developmentStimulusByPlayerId[starterId]!.byRating.stamina).toBeGreaterThan(fatigueWorld.developmentStimulusByPlayerId[starterId]!.byRating.stamina)
    expect(completed.players[starterId]!.basketball.ratings).toEqual(fatigueWorld.players[starterId]!.basketball.ratings)
    expect(finalMatchFatigue).toBeGreaterThan(initialMatchFatigue)
    expect(() => completeMatch(completed, simulation)).toThrow()
  })

  it('keeps the completed user result and standings scoped to its canonical competition', () => {
    const world = createNewGame()
    const simulation = prepareUserMatch(world)
    const game = world.games[simulation.gameId]!
    const unrelatedSeason = Object.values(world.seasons).find((season) => season.competitionId !== game.competitionId)!
    const unrelatedBefore = calculateStandings(world, unrelatedSeason.id)
    const completed = completeMatch(world, simulation)
    const home = calculateStandings(completed, game.seasonId).find((entry) => entry.teamId === game.homeTeamId)!
    const away = calculateStandings(completed, game.seasonId).find((entry) => entry.teamId === game.awayTeamId)!

    expect(completed.games[game.id]).toMatchObject({ status: 'completed', result: { homeScore: simulation.finalScore.home, awayScore: simulation.finalScore.away } })
    expect(home).toMatchObject({ played: 1, pointsFor: simulation.finalScore.home, pointsAgainst: simulation.finalScore.away, wins: simulation.finalScore.home > simulation.finalScore.away ? 1 : 0, losses: simulation.finalScore.home > simulation.finalScore.away ? 0 : 1 })
    expect(away).toMatchObject({ played: 1, pointsFor: simulation.finalScore.away, pointsAgainst: simulation.finalScore.home, wins: simulation.finalScore.away > simulation.finalScore.home ? 1 : 0, losses: simulation.finalScore.away > simulation.finalScore.home ? 0 : 1 })
    expect(calculateStandings(completed, unrelatedSeason.id)).toEqual(unrelatedBefore)
  })

  it('uses the same final score for Instant Result and the Match Next live viewer', () => {
    // ME-LOCK1: Instant resolves through Match Next FAST; the viewer is the Match Next Live session of the same Game and seed.
    const world = createNewGame()
    const userTeam = getUserTeam(world)!
    const game = getGamesToday(world).find((candidate) => candidate.homeTeamId === userTeam.id || candidate.awayTeamId === userTeam.id)!
    const port = createMatchEnginePort('match-next')
    const live = port.createLiveSession(port.prepare(world, game, 12345))
    while (!live.matchState.isComplete) live.advanceTicks(200)
    const viewer = live.result()
    const instantWorld = instantResult(world, undefined, 12345)

    expect(instantWorld.games[game.id]?.result).toEqual({ homeScore: viewer.score.home, awayScore: viewer.score.away })
  }, 300_000)

  it('prepares transient five-player lineups from each game roster', () => {
    const world = createNewGame()
    const simulation = prepareUserMatch(world)
    expect(simulation.lineups.home).toHaveLength(5)
    expect(simulation.lineups.away).toHaveLength(5)
    expect(new Set(simulation.lineups.home)).toHaveLength(5)
    expect(new Set(simulation.lineups.away)).toHaveLength(5)
    expect(simulation.lineups.home.every((id) => world.teams[simulation.homeTeamId]!.rosterPlayerIds.includes(id))).toBe(true)
    expect(simulation.lineups.away.every((id) => world.teams[simulation.awayTeamId]!.rosterPlayerIds.includes(id))).toBe(true)
  })

  it('attributes each sporting event to a player from the active attacking lineup', () => {
    const simulation = prepareUserMatch(createNewGame())
    let activeLineups = simulation.lineups
    for (const event of simulation.events) {
      if (event.type === 'substitution') {
        activeLineups = calculateActiveLineups(activeLineups, simulation.homeTeamId, simulation.awayTeamId, [event])
        continue
      }
      if (event.type === 'shotMade' || event.type === 'shotMissed' || event.type === 'turnover') {
        const lineup = event.teamId === simulation.homeTeamId ? activeLineups.home : activeLineups.away
        expect(lineup).toContain(event.playerId)
      }
    }
  })

  it('simulates every remaining game today and is idempotent after completion', () => {
    const world = createNewGame()
    const completedWorld = simulateRemainingGamesToday(world)

    expect(getScheduledGamesToday(completedWorld)).toHaveLength(0)
    expect(getGamesToday(completedWorld).filter((game) => game.competitionId === world.seasons[world.currentSeasonId]!.competitionId && game.status === 'completed')).toHaveLength(4)
    expect(simulateRemainingGamesToday(completedWorld)).toBe(completedWorld)
    expect(
      Object.values(completedWorld.games).filter((game) => game.date !== completedWorld.currentDate),
    ).toEqual(Object.values(world.games).filter((game) => game.date !== world.currentDate))
  })

  it('simulates only the three AI games when the user game is already complete', () => {
    const userGameCompleted = playUserGame(createNewGame())
    const completedWorld = simulateRemainingGamesToday(userGameCompleted)

    expect(getGamesToday(completedWorld).every((game) => game.status === 'completed')).toBe(true)
  })

  it('resolves pending games, advances exactly one day, and leaves no scheduled past games', () => {
    const world = createNewGame()
    const advancedWorld = advanceGameDay(world)
    const season = getCurrentSeason(advancedWorld)

    expect(advancedWorld.currentDate).toBe(createGameDate(2032, 10, 2))
    expect(getGamesToday(advancedWorld)).toHaveLength(0)
    expect(
      Object.values(advancedWorld.games).some(
        (game) => game.status === 'scheduled' && compareGameDates(game.date, advancedWorld.currentDate) < 0,
      ),
    ).toBe(false)
    expect(calculateStandings(advancedWorld, season.id).reduce((total, entry) => total + entry.played, 0)).toBe(8)
  })
})
