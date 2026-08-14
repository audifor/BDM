import {
  applyCoachReputationEvent,
  calculateCoachMatchExpectation,
  calculateMatchReputationImpact,
  getCoachSeasonAchievementReputationDeltas,
  type CoachMatchResult,
  type CoachReputationEvent,
} from '@/domain/coachReputation'
import type { Game } from '@/domain/game'
import type { CoachId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { calculateTeamStrength } from '@/engine/team'

export function applyMatchCoachReputationConsequences(world: GameWorld, game: Game): GameWorld {
  if (game.status !== 'completed' || game.result === null) return world
  const homeCoachId = world.teams[game.homeTeamId]?.coachId
  const awayCoachId = world.teams[game.awayTeamId]?.coachId
  const homeStrength = calculateTeamStrength(world, game.homeTeamId, game.date).value
  const awayStrength = calculateTeamStrength(world, game.awayTeamId, game.date).value
  const consequences = [
    createMatchConsequence(world, game, homeCoachId, game.homeTeamId, game.awayTeamId, homeStrength, awayStrength, true, game.result.homeScore > game.result.awayScore),
    createMatchConsequence(world, game, awayCoachId, game.awayTeamId, game.homeTeamId, awayStrength, homeStrength, false, game.result.awayScore > game.result.homeScore),
  ].filter((consequence): consequence is { readonly coachId: CoachId; readonly event: CoachReputationEvent } => consequence !== undefined)
  if (!consequences.length) return world

  const profiles = { ...world.coachReputationProfilesByCoachId }
  for (const consequence of consequences) {
    const profile = profiles[consequence.coachId]
    if (profile === undefined) return world
    const applied = applyCoachReputationEvent(profile, consequence.event)
    if (!applied.ok) return world
    profiles[consequence.coachId] = applied.profile
  }
  return { ...world, coachReputationProfilesByCoachId: profiles }
}

export function applySeasonChampionCoachReputation(world: GameWorld, seasonId: keyof GameWorld['seasons']): GameWorld {
  const history = world.seasonHistoryBySeasonId[seasonId]
  if (history === undefined) return world
  const coachId = world.teams[history.championTeamId]?.coachId
  if (coachId === undefined) return world
  const profile = world.coachReputationProfilesByCoachId[coachId]
  if (profile === undefined) return world
  const event: CoachReputationEvent = {
    id: `coach-reputation:season-champion:${seasonId}:${coachId}`,
    gameDate: history.completedOn,
    source: 'seasonAchievement',
    deltas: getCoachSeasonAchievementReputationDeltas('champion'),
    context: { kind: 'seasonAchievement', key: `season-champion:${seasonId}`, seasonId, teamId: history.championTeamId, competitionId: history.competitionId, achievement: 'champion' },
  }
  const applied = applyCoachReputationEvent(profile, event)
  return !applied.ok ? world : { ...world, coachReputationProfilesByCoachId: { ...world.coachReputationProfilesByCoachId, [coachId]: applied.profile } }
}

function createMatchConsequence(
  world: GameWorld,
  game: Game,
  coachId: CoachId | undefined,
  teamId: Game['homeTeamId'],
  opponentTeamId: Game['awayTeamId'],
  teamStrength: number,
  opponentTeamStrength: number,
  coachIsHome: boolean,
  won: boolean,
): { readonly coachId: CoachId; readonly event: CoachReputationEvent } | undefined {
  if (coachId === undefined) return undefined
  const result: CoachMatchResult = won ? 'win' : 'loss'
  const expectedWinProbability = calculateCoachMatchExpectation({ coachTeamStrength: teamStrength, opponentTeamStrength, coachIsHome })
  return {
    coachId,
    event: {
      id: `coach-reputation:match:${game.id}:${coachId}`,
      gameDate: game.date,
      source: 'matchResult',
      deltas: calculateMatchReputationImpact(expectedWinProbability, result).deltas,
      context: { kind: 'matchResult', key: `match:${game.id}`, gameId: game.id, teamId, opponentTeamId, seasonId: game.seasonId, competitionId: game.competitionId, result, expectedWinProbability, teamStrength, opponentTeamStrength, coachIsHome },
    },
  }
}
