import { createGame } from '@/domain/game'
import { createGameWorld, type GameWorld } from '@/domain/world'
import type { MatchStatLog } from '@/domain/stats/MatchStatLog'

import { calculateMatchPlayerStats } from './PlayerMatchStats'
import { finalizeCompletedSeason } from '@/engine/season'
import type { MatchSimulation, MatchSimulationResult } from './MatchEngine'

export class MatchResultApplicationError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'MatchResultApplicationError'
  }
}

/**
 * Applies a transient simulation result by creating a newly validated GameWorld.
 * Rebuilding through the canonical factory favors correctness over premature
 * structural-sharing optimization.
 */
export function applyMatchResult(world: GameWorld, result: MatchSimulationResult): GameWorld {
  const originalGame = world.games[result.gameId]
  if (originalGame === undefined) {
    throw new MatchResultApplicationError(`Cannot apply result to missing Game ${result.gameId}`)
  }
  if (originalGame.status !== 'scheduled') {
    throw new MatchResultApplicationError(`Cannot apply result to completed Game ${originalGame.id}`)
  }
  if (result.homeTeamId !== originalGame.homeTeamId) {
    throw new MatchResultApplicationError(
      `Result home Team ${result.homeTeamId} does not match Game home Team ${originalGame.homeTeamId}`,
    )
  }
  if (result.awayTeamId !== originalGame.awayTeamId) {
    throw new MatchResultApplicationError(
      `Result away Team ${result.awayTeamId} does not match Game away Team ${originalGame.awayTeamId}`,
    )
  }

  validateScore(result.homeScore, 'Home')
  validateScore(result.awayScore, 'Away')
  if (result.homeScore === result.awayScore) {
    throw new MatchResultApplicationError('Match results must not end in a tie')
  }

  const completedGame = createGame({
    ...originalGame,
    status: 'completed',
    result: {
      homeScore: result.homeScore,
      awayScore: result.awayScore,
    },
  })
  const games = Object.values(world.games).map((game) => (game.id === completedGame.id ? completedGame : game))

  return createGameWorld({
    currentDate: world.currentDate,
    currentSeasonId: world.currentSeasonId,
    userCoachId: world.userCoachId,
    countries: Object.values(world.countries),
    coaches: Object.values(world.coaches),
    players: Object.values(world.players),
    teams: Object.values(world.teams),
    competitions: Object.values(world.competitions),
    seasons: Object.values(world.seasons),
    games,
    matchStatLogs: Object.values(world.matchStatLogsByGameId),
    seasonHistory: Object.values(world.seasonHistoryBySeasonId),
    injuries: Object.values(world.injuriesById),
    contracts: Object.values(world.contractsById),
    teamFinances: Object.values(world.teamFinancesByTeamId),
    playerTransactions: Object.values(world.playerTransactionsById),
    playerKnowledge: Object.values(world.playerKnowledgeById),
    staffPeople: Object.values(world.staffPeopleById),
    teamStaffAssignments: Object.values(world.teamStaffAssignmentsById),
    coachProfessionalProfilesByCoachId: world.coachProfessionalProfilesByCoachId,
    coachRpgProfilesByCoachId: world.coachRpgProfilesByCoachId,
  })
}

/** Creates the immutable historical snapshot without mutating the source world. */
export function createMatchStatLog(world: GameWorld, gameId: MatchSimulation['gameId'], simulation: MatchSimulation): MatchStatLog {
  const game = world.games[gameId]
  if (game === undefined) throw new MatchResultApplicationError(`Cannot create stats for missing Game ${gameId}`)
  if (simulation.gameId !== gameId || simulation.homeTeamId !== game.homeTeamId || simulation.awayTeamId !== game.awayTeamId) throw new MatchResultApplicationError('Simulation does not match Game')
  if (simulation.finalScore.home === simulation.finalScore.away || !simulation.events.some((event) => event.type === 'gameEnd')) throw new MatchResultApplicationError('MatchStatLog requires completed non-tied simulation')
  const stats = calculateMatchPlayerStats(simulation)
  const playerLines = stats.map((line) => {
    const isHome = simulation.squads.home.includes(line.playerId)
    const teamId = isHome ? game.homeTeamId : game.awayTeamId
    return { playerId: line.playerId, teamId, opponentTeamId: isHome ? game.awayTeamId : game.homeTeamId, isHome, started: (isHome ? simulation.lineups.home : simulation.lineups.away).includes(line.playerId), stats: { ...line } }
  })
  const homePoints = playerLines.filter((line) => line.isHome).reduce((total, line) => total + line.stats.points, 0)
  const awayPoints = playerLines.filter((line) => !line.isHome).reduce((total, line) => total + line.stats.points, 0)
  if (homePoints !== simulation.finalScore.home || awayPoints !== simulation.finalScore.away) throw new MatchResultApplicationError(`MatchStatLog player points do not match final score for ${gameId}: ${homePoints}-${awayPoints} vs ${simulation.finalScore.home}-${simulation.finalScore.away}`)
  return { gameId, competitionId: game.competitionId, seasonId: game.seasonId, gameDate: game.date, homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, finalScore: { ...simulation.finalScore }, playerLines }
}

/** Atomically completes a Game and records its canonical statistical log. */
export function applyCompletedMatch(world: GameWorld, simulation: MatchSimulation): GameWorld {
  if (world.matchStatLogsByGameId[simulation.gameId] !== undefined) throw new MatchResultApplicationError(`MatchStatLog already exists for Game ${simulation.gameId}`)
  const originalGame = world.games[simulation.gameId]
  if (originalGame === undefined) throw new MatchResultApplicationError(`Cannot apply result to missing Game ${simulation.gameId}`)
  const log = createMatchStatLog(world, simulation.gameId, simulation)
  const resultWorld = applyMatchResult(world, { gameId: simulation.gameId, homeTeamId: simulation.homeTeamId, awayTeamId: simulation.awayTeamId, homeScore: simulation.finalScore.home, awayScore: simulation.finalScore.away })
  const completedWorld = createGameWorld({ currentDate: resultWorld.currentDate, currentSeasonId: resultWorld.currentSeasonId, userCoachId: resultWorld.userCoachId, countries: Object.values(resultWorld.countries), coaches: Object.values(resultWorld.coaches), players: Object.values(resultWorld.players), teams: Object.values(resultWorld.teams), competitions: Object.values(resultWorld.competitions), seasons: Object.values(resultWorld.seasons), games: Object.values(resultWorld.games), matchStatLogs: [...Object.values(world.matchStatLogsByGameId), log], seasonHistory: Object.values(world.seasonHistoryBySeasonId), injuries: Object.values(world.injuriesById), contracts: Object.values(world.contractsById), teamFinances: Object.values(world.teamFinancesByTeamId), playerTransactions:Object.values(world.playerTransactionsById),playerKnowledge:Object.values(world.playerKnowledgeById),staffPeople:Object.values(world.staffPeopleById),teamStaffAssignments:Object.values(world.teamStaffAssignmentsById),coachProfessionalProfilesByCoachId:world.coachProfessionalProfilesByCoachId,coachRpgProfilesByCoachId:world.coachRpgProfilesByCoachId })
  return finalizeCompletedSeason(completedWorld, originalGame.seasonId)
}

function validateScore(value: number, side: string): void {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new MatchResultApplicationError(`${side} score must be a non-negative finite integer`)
  }
}
