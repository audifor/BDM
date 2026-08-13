import { BASKETBALL_RATING_KEYS, calculateAge, createPlayer, type BasketballRatingKey, type Player } from '@/domain/player'
import type { GameDate } from '@/domain/date'
import type { SeasonId } from '@/domain/ids'
import { hashStringToSeed, SeededRandomSource } from '@/engine/random'

export interface PlayerDevelopmentContext { readonly fromSeasonId: SeasonId; readonly toSeasonId: SeasonId; readonly targetDate: GameDate }
export interface PlayerRatingDevelopment { readonly rating: BasketballRatingKey; readonly before: number; readonly delta: number; readonly after: number }
export interface PlayerDevelopmentResult { readonly playerId: Player['id']; readonly age: number; readonly ratings: readonly PlayerRatingDevelopment[] }

/** Provisional age-only curve; Potential will extend this calculation in a later milestone. */
export function getBaseDevelopmentTrend(age: number): number {
  if (age <= 20) return 3.5; if (age <= 23) return 2.5; if (age <= 26) return 1.5; if (age <= 28) return 0.5; if (age <= 30) return -0.5; if (age <= 32) return -1.5; if (age <= 34) return -2.5; return -3.5
}

export function developPlayerForSeason(player: Player, context: PlayerDevelopmentContext): { readonly player: Player; readonly result: PlayerDevelopmentResult } {
  const age = calculateAge(player.bio.dateOfBirth, context.targetDate)
  const developments = BASKETBALL_RATING_KEYS.map((rating) => developRating(player, rating, age, context))
  const ratings = { ...player.basketball.ratings }
  for (const development of developments) ratings[development.rating] = development.after
  return { player: createPlayer({ ...player, basketball: { ...player.basketball, ratings } }), result: { playerId: player.id, age, ratings: developments } }
}

function developRating(player: Player, rating: BasketballRatingKey, age: number, context: PlayerDevelopmentContext): PlayerRatingDevelopment {
  const before = player.basketball.ratings[rating]
  const random = new SeededRandomSource(hashStringToSeed(`player-development-v1:${context.fromSeasonId}:${context.toSeasonId}:${player.id}:${rating}`))
  const rawDelta = getBaseDevelopmentTrend(age) + random.nextFloat(-0.75, 0.75)
  const adjusted = rawDelta > 0 ? rawDelta * (0.35 + 0.65 * ((100 - before) / 100)) : rawDelta
  const proposed = Math.max(-5, Math.min(4, Math.round(adjusted)))
  const after = Math.max(0, Math.min(100, before + proposed))
  return { rating, before, delta: after - before, after }
}
