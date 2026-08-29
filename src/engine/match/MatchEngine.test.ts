import { describe, expect, it } from 'vitest'

import { createGame } from '@/domain/game'
import { gameIdFromString, playerIdFromString, teamIdFromString } from '@/domain/ids'
import { createGameWorld, updateGameWorld, type GameWorld } from '@/domain/world'
import { organizationIdForTeam } from '@/domain/ids'
import { generateRoundRobinSchedule } from '@/engine/competition/schedule'
import { SeededRandomSource } from '@/engine/random'
import { generateWorld } from '@/engine/world'

import { createMatchPlayerProfile, MatchSimulationError, simulateMatch, simulateMatchDetailed, type MatchLineups } from './index'

describe('MatchEngine result projection', () => {
  it('projects the final score from the same possession simulation used by MatchViewer', () => {
    const { world, game } = createScheduledGameWorld()
    const options = createOptions(world, game.id, 12_345)
    const detailed = simulateMatchDetailed(options)
    const result = simulateMatch(createOptions(world, game.id, 12_345))

    expect(result).toEqual({ gameId: game.id, homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, homeScore: detailed.finalScore.home, awayScore: detailed.finalScore.away })
    expect(result.homeScore).not.toBe(result.awayScore)
  })

  it('is reproducible for the same seed and can differ for another', () => {
    const { world, game } = createScheduledGameWorld()
    expect(simulateMatch(createOptions(world, game.id, 12345))).toEqual(simulateMatch(createOptions(world, game.id, 12345)))
    expect(simulateMatch(createOptions(world, game.id, 12345))).not.toEqual(simulateMatch(createOptions(world, game.id, 54321)))
  })

  it('validates strengths and game status before simulating', () => {
    const { world, game } = createScheduledGameWorld()
    expect(() => simulateMatch({ ...createOptions(world, game.id, 1), homeStrength: { teamId: game.awayTeamId, value: 50 } })).toThrow(MatchSimulationError)
    expect(() => simulateMatch({ ...createOptions(world, game.id, 1), awayStrength: { teamId: game.awayTeamId, value: 101 } })).toThrow(MatchSimulationError)
    expect(() => simulateMatch({ ...createOptions(world, gameIdFromString('missing-game'), 1) })).toThrow('Game does not exist')

    const completedGame = createGame({ ...game, status: 'completed', result: { homeScore: 80, awayScore: 70 } })
    const completedWorld = recreateWorld(world, [completedGame, ...Object.values(world.games).slice(1)])
    expect(() => simulateMatch(createOptions(completedWorld, game.id, 1))).toThrow(MatchSimulationError)
  })

  it('does not mutate GameWorld', () => {
    const { world, game } = createScheduledGameWorld()
    const before = JSON.stringify(world)
    simulateMatch(createOptions(world, game.id, 1))
    expect(JSON.stringify(world)).toBe(before)
  })

  it('keeps physical simulation independent from OrganizationKnowledge', () => {
    const { world, game } = createScheduledGameWorld(); const playerId = world.teams[game.homeTeamId]!.rosterPlayerIds[0]!
    const informed = updateGameWorld(world, { organizationKnowledge: [{ organizationId: organizationIdForTeam(game.homeTeamId), subjectPlayerId: playerId, dimensions: { shooting: { coverage: 1, confidence: 1, assessedAt: world.currentDate, provenance: 'scoutReport', estimate: 100, uncertainty: 1 } } }] })
    expect(simulateMatch(createOptions(informed, game.id, 12345))).toEqual(simulateMatch(createOptions(world, game.id, 12345)))
  })

  it.each([
    ['home lineup has four players', (lineups: MatchLineups) => ({ ...lineups, home: lineups.home.slice(0, 4) })],
    ['home lineup has six players', (lineups: MatchLineups) => ({ ...lineups, home: [...lineups.home, lineups.away[0]!] })],
    ['away lineup has four players', (lineups: MatchLineups) => ({ ...lineups, away: lineups.away.slice(0, 4) })],
    ['home lineup has a duplicate player', (lineups: MatchLineups) => ({ ...lineups, home: [...lineups.home.slice(0, 4), lineups.home[0]!] })],
    ['away lineup has a duplicate player', (lineups: MatchLineups) => ({ ...lineups, away: [...lineups.away.slice(0, 4), lineups.away[0]!] })],
    ['lineups share a player', (lineups: MatchLineups) => ({ ...lineups, away: [...lineups.away.slice(0, 4), lineups.home[0]!] })],
  ])('rejects invalid lineups when %s', (_name, changeLineups) => {
    const { world, game } = createScheduledGameWorld()
    const options = createOptions(world, game.id, 1)

    expect(() => simulateMatch({ ...options, lineups: changeLineups(options.lineups) })).toThrow(MatchSimulationError)
  })

  it('attributes every sporting event to a player from its attacking lineup', () => {
    const { world, game } = createScheduledGameWorld()
    const simulation = simulateMatchDetailed(createOptions(world, game.id, 12_345))

    for (const event of simulation.events) {
      if (event.type === 'shotMade' || event.type === 'shotMissed' || event.type === 'turnover') {
        const lineup = event.teamId === simulation.homeTeamId ? simulation.lineups.home : simulation.lineups.away
        expect(lineup).toContain(event.playerId)
      }
    }
  })

  it('keeps sporting outcomes unchanged when only the actor RNG seed changes', () => {
    const { world, game } = createScheduledGameWorld()
    const first = simulateMatchDetailed(createOptions(world, game.id, 12_345, 101))
    const second = simulateMatchDetailed(createOptions(world, game.id, 12_345, 202))

    expect(second.finalScore).toEqual(first.finalScore)
    expect(withoutPlayerAttribution(second)).toEqual(withoutPlayerAttribution(first))
  })
})

function createScheduledGameWorld(): { world: GameWorld; game: GameWorld['games'][keyof GameWorld['games']] } {
  const generatedWorld = generateWorld({ seed: 12345, gender: 'female' })
  const games = generateRoundRobinSchedule({ world: generatedWorld, seasonId: Object.values(generatedWorld.seasons)[0]!.id })
  return { world: recreateWorld(generatedWorld, games), game: games[0]! }
}

function createOptions(world: GameWorld, gameId: GameWorld['games'][keyof GameWorld['games']]['id'], seed: number, actorSeed = seed) {
  const game = world.games[gameId]
  return {
    world,
    gameId,
    homeStrength: { teamId: game?.homeTeamId ?? teamIdFromString('missing-team'), value: 50 },
    awayStrength: { teamId: game?.awayTeamId ?? teamIdFromString('missing-team'), value: 50 },
    lineups: game === undefined ? missingGameLineups() : lineupsFor(world, game),
    squads: game === undefined ? missingGameLineups() : squadsFor(world, game),
    playerProfiles: game === undefined ? { home: [], away: [] } : profilesFor(world, game),
    random: new SeededRandomSource(seed),
    decisionRandom: new SeededRandomSource(seed + 1),
    actorRandom: new SeededRandomSource(actorSeed),
  }
}

function lineupsFor(world: GameWorld, game: GameWorld['games'][keyof GameWorld['games']]): MatchLineups {
  return {
    home: world.teams[game.homeTeamId]!.rosterPlayerIds.slice(0, 5),
    away: world.teams[game.awayTeamId]!.rosterPlayerIds.slice(0, 5),
  }
}

function squadsFor(world: GameWorld, game: GameWorld['games'][keyof GameWorld['games']]) {
  return { home: world.teams[game.homeTeamId]!.rosterPlayerIds, away: world.teams[game.awayTeamId]!.rosterPlayerIds }
}

function profilesFor(world: GameWorld, game: GameWorld['games'][keyof GameWorld['games']]) { return { home: world.teams[game.homeTeamId]!.rosterPlayerIds.map((id) => createMatchPlayerProfile(world.players[id]!)), away: world.teams[game.awayTeamId]!.rosterPlayerIds.map((id) => createMatchPlayerProfile(world.players[id]!)) } }

function missingGameLineups(): MatchLineups {
  return {
    home: Array.from({ length: 5 }, (_, index) => playerIdFromString(`missing-home-player-${index}`)),
    away: Array.from({ length: 5 }, (_, index) => playerIdFromString(`missing-away-player-${index}`)),
  }
}

function withoutPlayerAttribution(simulation: ReturnType<typeof simulateMatchDetailed>) {
  return {
    ...simulation,
    events: simulation.events.map((event) => {
      if (event.type === 'shotMade') {
        const { playerId: _playerId, assistPlayerId: _assistPlayerId, ...eventWithoutPlayer } = event
        return eventWithoutPlayer
      }
      if (event.type === 'shotMissed') {
        const { playerId: _playerId, blockedByPlayerId: _blockedByPlayerId, ...eventWithoutPlayer } = event
        return eventWithoutPlayer
      }
      if (event.type === 'turnover') {
        const { playerId: _playerId, stealPlayerId: _stealPlayerId, ...eventWithoutPlayer } = event
        return eventWithoutPlayer
      }
      if (event.type === 'rebound') {
        const { playerId: _playerId, ...eventWithoutPlayer } = event
        return eventWithoutPlayer
      }
      if (event.type === 'foul' || event.type === 'freeThrowMade' || event.type === 'freeThrowMissed') {
        const { playerId: _playerId, ...eventWithoutPlayer } = event
        return eventWithoutPlayer
      }
      return event
    }),
  }
}

function recreateWorld(source: GameWorld, games: readonly GameWorld['games'][keyof GameWorld['games']][]): GameWorld {
  return createGameWorld({ currentDate: source.currentDate, userCoachId: source.userCoachId, countries: Object.values(source.countries), coaches: Object.values(source.coaches), players: Object.values(source.players), teams: Object.values(source.teams), competitions: Object.values(source.competitions), seasons: Object.values(source.seasons), games })
}
