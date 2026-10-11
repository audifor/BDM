import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game/createNewGame'
import { prepareMatchOptions, completeMatch } from '@/app/game/playUserGame'
import { calculateMatchPlayerStats, simulateMatchWithRotations, createMatchSession, stepMatchSession } from '@/engine/match'
import { updateGameWorld } from '@/domain/world'
import { calculateSeasonStandings } from '@/domain/season'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { resolveSimulationDetail, type SimulationDetail } from './SimulationResolutionPolicy'

const world = createNewGame()
const userTeam = Object.values(world.teams).find(team => team.coachId === world.userCoachId)!
const userGame = Object.values(world.games).find(game => game.homeTeamId === userTeam.id || game.awayTeamId === userTeam.id)!
const remoteGame = Object.values(world.games).find(game => !world.competitions[game.competitionId]!.participantTeamIds.includes(userTeam.id))!

describe('production simulation detail', () => {
  it('keeps user and observed games full, related competitions standard, distant AI background', () => {
    expect(resolveSimulationDetail(world, userGame)).toBe('FULL')
    expect(resolveSimulationDetail(world, remoteGame)).toBe('BACKGROUND')
    expect(resolveSimulationDetail(world, remoteGame, { observedGameIds: [remoteGame.id] })).toBe('FULL')
    expect(resolveSimulationDetail(world, remoteGame, { followedTeamIds: [remoteGame.homeTeamId] })).toBe('STANDARD')
    expect(resolveSimulationDetail(world, userGame, { forceDetail: 'BACKGROUND' })).toBe('BACKGROUND')
    const related = Object.values(world.games).find(game => game.competitionId === userGame.competitionId && game.homeTeamId !== userTeam.id && game.awayTeamId !== userTeam.id)!
    expect(resolveSimulationDetail(world, related)).toBe('STANDARD')
  })
  it.each(['FULL', 'STANDARD', 'BACKGROUND'] as const)('%s preserves the canonical completion contract and is deterministic', (detail: SimulationDetail) => {
    const run = () => simulateMatchWithRotations({ ...prepareMatchOptions(world, remoteGame, undefined, 15015), simulationDetail: detail })
    const simulation = run()
    expect(run()).toEqual(simulation)
    expect(simulation.finalScore.home).not.toBe(simulation.finalScore.away)
    expect(simulation.finalScore.home + simulation.finalScore.away).toBeGreaterThan(50)
    expect(simulation.finalScore.home + simulation.finalScore.away).toBeLessThan(400)
    const stats = calculateMatchPlayerStats(simulation)
    for (const squad of [simulation.squads.home, simulation.squads.away]) {
      const lines = stats.filter(line => squad.includes(line.playerId))
      expect(lines.filter(line => line.secondsPlayed > 0).length).toBeGreaterThanOrEqual(5)
      const end = simulation.events.find(event => event.type === 'gameEnd')!
      const rules = world.competitions[remoteGame.competitionId]!.rules
      expect(lines.reduce((sum, line) => sum + line.secondsPlayed, 0)).toBeGreaterThan(0)
      expect(end.period).toBeGreaterThan(0)
      expect(rules).toBeDefined()
    }
    const after = completeMatch(world, simulation)
    expect(after.games[remoteGame.id]!.status).toBe('completed')
    expect(after.matchStatLogsByGameId[remoteGame.id]!.playerLines.length).toBe(stats.length)
    expect(after.teams).toEqual(world.teams)
    expect(Object.values(after.players).map(player => [player.id, player.personId])).toEqual(Object.values(world.players).map(player => [player.id, player.personId]))
    expect(calculateSeasonStandings(after, remoteGame.seasonId).reduce((sum, line) => sum + line.wins, 0)).toBe(1)
    expect(() => completeMatch(after, simulation)).toThrow()
    const loaded = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(after, '2032-10-01T00:00:00.000Z'))))
    expect(loaded.games).toEqual(after.games)
    expect(loaded.matchStatLogsByGameId).toEqual(after.matchStatLogsByGameId)
    expect(loaded.eligibilityProfilesById).toEqual(after.eligibilityProfilesById)
    expect(loaded.injuriesById).toEqual(after.injuriesById)
  })
  it.each(['FULL', 'BACKGROUND'] as const)('%s records NCAA appearances and closes its competition season', detail => {
    const game = Object.values(world.games).find(game => world.ecosystems[world.competitions[game.competitionId]!.ecosystemId]!.kind === 'ncaaLike')!
    const base = updateGameWorld(world, { games: Object.values(world.games).filter(candidate => candidate.seasonId !== game.seasonId || candidate.id === game.id) })
    const result = completeMatch(base, simulateMatchWithRotations({ ...prepareMatchOptions(base, game, undefined, 15015), simulationDetail: detail }))
    const participants = result.matchStatLogsByGameId[game.id]!.playerLines.filter(line => line.stats.secondsPlayed > 0)
    expect(participants.length).toBeGreaterThanOrEqual(10)
    for (const line of participants) {
      const profile = Object.values(result.eligibilityProfilesById).find(profile => profile.playerId === line.playerId)!
      expect(profile.seasonRecordsBySeasonId[game.seasonId]!.gameIds).toContain(game.id)
    }
    expect(result.seasonHistoryBySeasonId[game.seasonId]).toBeDefined()
  })
  it('background does not create movement/action intents', () => {
    let session = createMatchSession({ ...prepareMatchOptions(world, remoteGame, undefined, 23), simulationDetail: 'BACKGROUND' })
    const positions = session.state.spatial.players.map(player => player.position)
    session = stepMatchSession(session).session
    expect(session.state.spatial.players.map(player => player.position)).toEqual(positions)
    expect(session.state.offensiveAction).toBeUndefined()
    expect(session.state.screenIntent).toBeUndefined()
  })
})
