import { createGame } from '@/domain/game'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { applyMoraleEvent } from '@/domain/morale'
import type { MatchStatLog } from '@/domain/stats/MatchStatLog'
import { applyCoachExperienceGain, applyMatchCoachReputationConsequences, deriveCoachMatchExperienceGain } from '@/engine/coach'
import { calculateTeamStrength } from '@/engine/team'

import { calculateMatchPlayerStats } from './PlayerMatchStats'
import { finalizeCompletedSeason } from '@/engine/season'
import { recordEligibilityParticipation } from '@/engine/eligibility'
import { processNarrativeMatch } from '@/engine/narrative'
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

  const resultWorld = updateGameWorld(world, { games })
  return processNarrativeMatch(applyMatchMorale(applyMatchCoachExperience(world, applyMatchCoachReputationConsequences(resultWorld, completedGame), completedGame), completedGame), completedGame.id)
}

function applyMatchMorale(world: GameWorld, game: ReturnType<typeof createGame>): GameWorld {
  const morale = { ...world.moraleByPersonId }
  for (const teamId of [game.homeTeamId, game.awayTeamId]) {
    const won = teamId === game.homeTeamId ? game.result!.homeScore > game.result!.awayScore : game.result!.awayScore > game.result!.homeScore
    for (const personId of [...world.teams[teamId]!.rosterPlayerIds, world.teams[teamId]!.coachId].filter((id): id is NonNullable<typeof id> => id !== undefined)) {
      const profile = morale[personId]; const personality = world.personalitiesByPersonId[personId]
      if (profile === undefined || personality === undefined) throw new MatchResultApplicationError(`Missing morale person ${personId}`)
      morale[personId] = applyMoraleEvent(profile, personality, { id: `morale:match:${game.id}:${personId}`, personId, gameDate: game.date, source: 'matchResult', delta: won ? 4 : -4, context: { gameId: game.id, result: won ? 'win' : 'loss' } })
    }
  }
  return updateGameWorld(world, { moraleByPersonId: morale })
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
  const completedWorld = updateGameWorld(resultWorld, { matchStatLogs: [...Object.values(resultWorld.matchStatLogsByGameId), log] })
  return finalizeCompletedSeason(recordEligibilityParticipation(completedWorld, originalGame.id), originalGame.seasonId)
}

function validateScore(value: number, side: string): void {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new MatchResultApplicationError(`${side} score must be a non-negative finite integer`)
  }
}

/** Uses pre-match strength and applies XP only after the result is canonical. */
function applyMatchCoachExperience(worldBefore: GameWorld, resultWorld: GameWorld, completedGame: ReturnType<typeof createGame>): GameWorld {
  const homeCoachId = worldBefore.teams[completedGame.homeTeamId]?.coachId
  const awayCoachId = worldBefore.teams[completedGame.awayTeamId]?.coachId
  if (homeCoachId === undefined && awayCoachId === undefined) return resultWorld

  const homeStrength = calculateTeamStrength(worldBefore, completedGame.homeTeamId, completedGame.date).value
  const awayStrength = calculateTeamStrength(worldBefore, completedGame.awayTeamId, completedGame.date).value
  const margin = Math.abs(completedGame.result!.homeScore - completedGame.result!.awayScore)
  const professional = { ...resultWorld.coachProfessionalProfilesByCoachId }; const rpg = { ...resultWorld.coachRpgProfilesByCoachId }
  for (const [coachId, gain] of [[homeCoachId, deriveCoachMatchExperienceGain({ ownStrength: homeStrength, opponentStrength: awayStrength, won: completedGame.result!.homeScore > completedGame.result!.awayScore, scoreMargin: margin })], [awayCoachId, deriveCoachMatchExperienceGain({ ownStrength: awayStrength, opponentStrength: homeStrength, won: completedGame.result!.awayScore > completedGame.result!.homeScore, scoreMargin: margin })]] as const) {
    if (coachId === undefined || professional[coachId] === undefined || rpg[coachId] === undefined) continue
    const applied = applyCoachExperienceGain(professional[coachId], rpg[coachId], gain); professional[coachId] = applied.professionalProfile; rpg[coachId] = applied.rpgProfile
  }
  return updateGameWorld(resultWorld, { coachProfessionalProfilesByCoachId: professional, coachRpgProfilesByCoachId: rpg })
}
