import { CANONICAL_RATING_KEYS, calculateAge, calculateBootstrapAbilityProxy, createPlayer, deriveLegacyPotential, type CanonicalRatingKey, type Player } from '@/domain/player'
import type { GameDate } from '@/domain/date'
import type { SeasonId } from '@/domain/ids'
import { hashStringToSeed, SeededRandomSource } from '@/engine/random'

export interface PlayerDevelopmentContext { readonly fromSeasonId: SeasonId; readonly toSeasonId: SeasonId; readonly targetDate: GameDate; readonly stimulusByRating?: Readonly<Partial<Record<CanonicalRatingKey, number>>> }
export interface PlayerRatingDevelopment { readonly rating: CanonicalRatingKey; readonly before: number; readonly delta: number; readonly after: number }
export interface PlayerDevelopmentResult { readonly playerId: Player['id']; readonly age: number; readonly ratings: readonly PlayerRatingDevelopment[] }

export function getBaseDevelopmentTrend(age: number): number {
  if (age <= 20) return 3.5; if (age <= 23) return 2.5; if (age <= 26) return 1.5; if (age <= 28) return 0.5; if (age <= 30) return -0.5; if (age <= 32) return -1.5; if (age <= 34) return -2.5; return -3.5
}

export function calculatePotentialGrowthFactor(player: Player): number {
  const currentAbilityProxy = calculateBootstrapAbilityProxy(player.basketball.ratings)
  const remainingPotential = Math.max(0, deriveLegacyPotential(player.development).ceiling - currentAbilityProxy)
  const theoreticalHeadroom = Math.max(1, 100 - currentAbilityProxy)
  const normalizedPotentialHeadroom = Math.max(0, Math.min(1, remainingPotential / theoreticalHeadroom))
  return 0.25 + 0.75 * normalizedPotentialHeadroom
}

export function developPlayerForSeason(player: Player, context: PlayerDevelopmentContext): { readonly player: Player; readonly result: PlayerDevelopmentResult } {
  const age = calculateAge(player.bio.dateOfBirth, context.targetDate)
  const developments = CANONICAL_RATING_KEYS.map((rating) => developRating(player, rating, age, context))
  const ratings = { ...player.basketball.ratings }
  for (const development of developments) ratings[development.rating] = development.after
  return { player: createPlayer({ ...player, basketball: { ...player.basketball, ratings } }), result: { playerId: player.id, age, ratings: developments } }
}

function developRating(player: Player, rating: CanonicalRatingKey, age: number, context: PlayerDevelopmentContext): PlayerRatingDevelopment {
  const before = player.basketball.ratings[rating]
  const random = new SeededRandomSource(hashStringToSeed(`player-development-v2:${context.fromSeasonId}:${context.toSeasonId}:${player.id}:${rating}`))
  // Training is an input to the canonical seasonal development calculation, never
  // a direct ratings mutation. The cap keeps a full season of work modest.
  const stimulus = Math.min(2, (context.stimulusByRating?.[rating] ?? 0) * 0.05)
  const rawDelta = getBaseDevelopmentTrend(age) + random.nextFloat(-0.75, 0.75) + stimulus
  const growthRoom = 0.35 + 0.65 * ((100 - before) / 100)
  const adjusted = rawDelta > 0 ? rawDelta * growthRoom * calculatePotentialGrowthFactor(player) : rawDelta
  const proposed = Math.max(-5, Math.min(4, Math.round(adjusted)))
  const after = Math.max(1, Math.min(100, before + proposed))
  return { rating, before, delta: after - before, after }
}
