import { addDays, type GameDate } from '@/domain/date'
import type { PlayerId, TeamId } from '@/domain/ids'
import { type GameWorld } from '@/domain/world'
import type { TrainingParticipation } from '@/domain/training'

/** Derived suggestion only; explicit session choices take precedence at execution. */
export function recommendTrainingParticipation(world: GameWorld, teamId: TeamId, playerId: PlayerId, date: GameDate): TrainingParticipation {
  const fatigue = world.careerFatigueByPlayerId[playerId] ?? 0
  const games = Object.values(world.games).filter((game) => game.status === 'scheduled' && (game.homeTeamId === teamId || game.awayTeamId === teamId))
  const nextGame = games.filter((game) => game.date >= date).sort((a, b) => a.date.localeCompare(b.date))[0]
  const gamesWithinSeven = games.filter((game) => game.date >= date && game.date <= addDays(date, 7)).length
  const daysToGame = nextGame === undefined ? Number.POSITIVE_INFINITY : daysBetween(date, nextGame.date)
  if (fatigue >= 85) return 'REST'
  if (fatigue >= 70) return daysToGame <= 2 || gamesWithinSeven >= 2 ? 'REST' : 'REDUCED'
  if (fatigue >= 50 && (daysToGame <= 2 || gamesWithinSeven >= 2)) return 'REDUCED'
  return 'FULL'
}

export function trainingParticipationForPlayer(world: GameWorld, teamId: TeamId, playerId: PlayerId, date: GameDate, explicit?: TrainingParticipation): TrainingParticipation {
  return explicit ?? recommendTrainingParticipation(world, teamId, playerId, date)
}

function daysBetween(from: GameDate, to: GameDate): number {
  return Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000)
}
