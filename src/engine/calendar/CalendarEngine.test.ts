import { describe, expect, it } from 'vitest'

import { createGameDate } from '@/domain/date'
import type { Game } from '@/domain/game'
import { createTeam } from '@/domain/team'
import { createGameWorld, type GameWorld } from '@/domain/world'
import { calculateStandings } from '@/engine/competition/standings'
import { generateRoundRobinSchedule } from '@/engine/competition/schedule'
import { applyMatchResult, createMatchPlayerProfile, simulateMatch, type MatchLineups } from '@/engine/match'
import { SeededRandomSource } from '@/engine/random'
import { generateWorld } from '@/engine/world'

import {
  advanceDay,
  getGamesToday,
  getNextUserGame,
  getScheduledGamesToday,
  getUserTeam,
  inspectCurrentDate,
} from './index'

describe('CalendarEngine', () => {
  it('advances one day immutably without auto-applying the legacy training plan pipeline', () => {
    const { world } = createScheduledGameWorld()
    const before = JSON.parse(JSON.stringify(world)) as { currentDate: string }
    const nextWorld = advanceDay(world)

    expect(nextWorld).not.toBe(world)
    expect(nextWorld.currentDate).toBe('2032-10-02')
    expect(JSON.parse(JSON.stringify(world))).toEqual(before)
    // The scheduled session/module system is the sole canonical automatic training authority;
    // the legacy trainingPlansByTeamId pipeline is no longer auto-applied by advanceDay.
    expect(Object.keys(nextWorld.trainingSessionsById)).toHaveLength(0)
    expect(nextWorld.schemaVersion).toBe(world.schemaVersion)
    expect(nextWorld.userCoachId).toBe(world.userCoachId)
    expect(Object.keys(nextWorld.games)).toHaveLength(Object.keys(world.games).length)
    expect(nextWorld.staffPeopleById).toEqual(world.staffPeopleById)
    expect(nextWorld.teamStaffAssignmentsById).toEqual(world.teamStaffAssignmentsById)
  })

  it.each([
    [createGameDate(2032, 10, 31), '2032-11-01'],
    [createGameDate(2032, 12, 31), '2033-01-01'],
    [createGameDate(2032, 2, 28), '2032-02-29'],
  ])('advances correctly over date boundaries', (startDate, expectedDate) => {
    const world = generateWorld({ seed: 1, gender: 'female', startDate })

    expect(advanceDay(world).currentDate).toBe(expectedDate)
  })

  it('preserves completed games while advancing the date', () => {
    const { world, games } = createScheduledGameWorld()
    const completedWorld = applyScore(world, games[0]!, 90, 80)
    const nextWorld = advanceDay(completedWorld)

    expect(nextWorld.games[games[0]!.id]).toMatchObject({
      status: 'completed',
      result: { homeScore: 90, awayScore: 80 },
    })
  })

  it('finds scheduled games on the first and fifth days but none in between', () => {
    const { world } = createScheduledGameWorld()
    const dayTwo = advanceDay(world)
    const dayThree = advanceDay(dayTwo)
    const dayFour = advanceDay(dayThree)
    const dayFive = advanceDay(dayFour)

    expect(getGamesToday(world)).toHaveLength(4)
    expect(getScheduledGamesToday(world)).toHaveLength(4)
    expect(getGamesToday(dayTwo)).toHaveLength(0)
    expect(getGamesToday(dayThree)).toHaveLength(0)
    expect(getGamesToday(dayFour)).toHaveLength(0)
    expect(getGamesToday(dayFive)).toHaveLength(4)
  })

  it('derives the user team and its next scheduled game', () => {
    const { world } = createScheduledGameWorld()
    const userTeam = getUserTeam(world)
    const userGame = getNextUserGame(world)

    expect(userTeam).toMatchObject({ id: 'generated-team-0001', coachId: world.userCoachId })
    expect(userGame).toBeDefined()
    expect(userGame!.homeTeamId === userTeam!.id || userGame!.awayTeamId === userTeam!.id).toBe(true)
    expect(userGame!.date).toBe(world.currentDate)
  })

  it('returns no user team or next game when the user coach is unemployed', () => {
    const { world } = createScheduledGameWorld()
    const userTeam = getUserTeam(world)!
    const unemployedWorld = recreateWorld(world, {
      teams: [createTeam({ ...userTeam, coachId: undefined }), ...Object.values(world.teams).filter((team) => team.id !== userTeam.id)],
    })

    expect(getUserTeam(unemployedWorld)).toBeUndefined()
    expect(getNextUserGame(unemployedWorld)).toBeUndefined()
  })

  it('skips completed and past user games when finding the next one', () => {
    const { world } = createScheduledGameWorld()
    const firstUserGame = getNextUserGame(world)!
    const completedWorld = applyScore(world, firstUserGame, 90, 80)
    const nextAfterCompletion = getNextUserGame(completedWorld)!
    const nextDayWorld = advanceDay(world)
    const nextAfterDate = getNextUserGame(nextDayWorld)!

    expect(nextAfterCompletion.id).not.toBe(firstUserGame.id)
    expect(nextAfterCompletion.date > firstUserGame.date).toBe(true)
    expect(nextAfterDate.id).not.toBe(firstUserGame.id)
    expect(nextAfterDate.date > firstUserGame.date).toBe(true)
  })

  it('returns no next user game after all of the user team games are completed', () => {
    const { world, games } = createScheduledGameWorld()
    const userTeam = getUserTeam(world)!
    let completedWorld = world

    for (const game of games.filter((game) => game.homeTeamId === userTeam.id || game.awayTeamId === userTeam.id)) {
      completedWorld = applyScore(completedWorld, game, 90, 80)
    }

    expect(getNextUserGame(completedWorld)).toBeUndefined()
  })

  it('reports current date status for days with and without games', () => {
    const { world } = createScheduledGameWorld()
    const gameDay = inspectCurrentDate(world)
    const nonGameDay = inspectCurrentDate(advanceDay(world))

    expect(gameDay).toMatchObject({ date: world.currentDate, hasGames: true })
    expect(gameDay.scheduledGames).toHaveLength(4)
    expect(gameDay.userGame).toBeDefined()
    expect(nonGameDay).toMatchObject({ hasGames: false })
    expect(nonGameDay.scheduledGames).toEqual([])
    expect(nonGameDay.userGame).toBeUndefined()
  })

  it('keeps a completed user game visible in current date status while removing it from scheduled games', () => {
    const { world } = createScheduledGameWorld()
    const userGame = getNextUserGame(world)!
    const completedWorld = applyScore(world, userGame, 90, 80)
    const status = inspectCurrentDate(completedWorld)

    expect(status.hasGames).toBe(true)
    expect(status.scheduledGames).toHaveLength(3)
    expect(status.userGame).toMatchObject({ id: userGame.id, status: 'completed' })
  })

  it('integrates current-date inspection, simulation, result application, standings, and progression', () => {
    const { world, seasonId } = createScheduledGameWorld()
    const initialStatus = inspectCurrentDate(world)
    const userGame = initialStatus.userGame!
    const simulation = simulateMatch({
      world,
      gameId: userGame.id,
      homeStrength: { teamId: userGame.homeTeamId, value: 50 },
      awayStrength: { teamId: userGame.awayTeamId, value: 50 },
      lineups: lineupsFor(world, userGame),
      squads: { home: world.teams[userGame.homeTeamId]!.rosterPlayerIds, away: world.teams[userGame.awayTeamId]!.rosterPlayerIds },
      playerProfiles: { home: world.teams[userGame.homeTeamId]!.rosterPlayerIds.map((id) => createMatchPlayerProfile(world.players[id]!)), away: world.teams[userGame.awayTeamId]!.rosterPlayerIds.map((id) => createMatchPlayerProfile(world.players[id]!)) },
      random: new SeededRandomSource(12345),
      decisionRandom: new SeededRandomSource(67891),
      actorRandom: new SeededRandomSource(67890),
    })
    const completedWorld = applyMatchResult(world, simulation)
    const completedStatus = inspectCurrentDate(completedWorld)
    const standings = calculateStandings(completedWorld, seasonId)
    const nextDay = advanceDay(completedWorld)

    expect(initialStatus.scheduledGames).toHaveLength(4)
    expect(initialStatus.userGame).toMatchObject({ id: userGame.id })
    expect(completedStatus.hasGames).toBe(true)
    expect(completedStatus.userGame).toMatchObject({ id: userGame.id, status: 'completed' })
    expect(completedStatus.scheduledGames).toHaveLength(3)
    expect(standings.reduce((total, entry) => total + entry.played, 0)).toBe(2)
    expect(inspectCurrentDate(nextDay)).toMatchObject({ hasGames: false })
  })
})

function createScheduledGameWorld(): {
  world: GameWorld
  seasonId: ReturnType<typeof import('@/domain/ids').seasonIdFromString>
  games: Game[]
} {
  const generatedWorld = generateWorld({ seed: 12345, gender: 'female' })
  const seasonId = Object.values(generatedWorld.seasons)[0]!.id
  const games = generateRoundRobinSchedule({ world: generatedWorld, seasonId })

  return { world: recreateWorld(generatedWorld, { games }), seasonId, games }
}

function recreateWorld(
  source: GameWorld,
  overrides: Partial<{
    teams: GameWorld['teams'][keyof GameWorld['teams']][]
    games: Game[]
  }>,
): GameWorld {
  return createGameWorld({
    currentDate: source.currentDate,
    userCoachId: source.userCoachId,
    countries: Object.values(source.countries),
    coaches: Object.values(source.coaches),
    players: Object.values(source.players),
    teams: overrides.teams ?? Object.values(source.teams),
    competitions: Object.values(source.competitions),
    seasons: Object.values(source.seasons),
    games: overrides.games ?? Object.values(source.games),
  })
}

function applyScore(world: GameWorld, game: Game, homeScore: number, awayScore: number): GameWorld {
  return applyMatchResult(world, {
    gameId: game.id,
    homeTeamId: game.homeTeamId,
    awayTeamId: game.awayTeamId,
    homeScore,
    awayScore,
  })
}

function lineupsFor(world: GameWorld, game: Game): MatchLineups {
  return {
    home: world.teams[game.homeTeamId]!.rosterPlayerIds.slice(0, 5),
    away: world.teams[game.awayTeamId]!.rosterPlayerIds.slice(0, 5),
  }
}
