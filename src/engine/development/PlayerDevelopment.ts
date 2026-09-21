import { PLAYER_TRUTH_RATING_KEYS, calculateAge, calculateBootstrapAbilityProxy, createPlayer, deriveLegacyPotential, type CanonicalRatingKey, type Player, type PlayerTruthRatingKey } from '@/domain/player'
import type { GameDate } from '@/domain/date'
import type { SeasonId } from '@/domain/ids'
import { hashStringToSeed, SeededRandomSource } from '@/engine/random'

export interface PlayerDevelopmentContext {
  readonly fromSeasonId: SeasonId
  readonly toSeasonId: SeasonId
  readonly targetDate: GameDate
  readonly stimulusByRating?: Readonly<Partial<Record<CanonicalRatingKey, number>>>
  /**
   * The WORLD-LEVEL annual development cycle identity (e.g. `annual-development:2027`), used as
   * the deterministic seed instead of `fromSeasonId`/`toSeasonId`. Player development is a
   * world-year event, not a Competition-season event: the same player may belong to several
   * independently-rolling competitions, so seeding by season identity would make the result
   * depend on which competition happened to trigger it. Optional only for legacy/isolated test
   * callers that still exercise a single-season development calculation directly; production
   * calendar-driven development always supplies it.
   */
  readonly cycleId?: string
}
export interface PlayerRatingDevelopment { readonly rating: PlayerTruthRatingKey; readonly before: number; readonly delta: number; readonly after: number }
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
  const developments = PLAYER_TRUTH_RATING_KEYS.map((rating) => developRating(player, rating, age, context))
  const ratings = { ...player.basketball.ratings }
  for (const development of developments) ratings[development.rating] = development.after
  return { player: createPlayer({ ...player, basketball: { ...player.basketball, ratings } }), result: { playerId: player.id, age, ratings: developments } }
}

function developRating(player: Player, rating: PlayerTruthRatingKey, age: number, context: PlayerDevelopmentContext): PlayerRatingDevelopment {
  const before = player.basketball.ratings[rating]
  const random = new SeededRandomSource(hashStringToSeed(`player-development-v2:${context.cycleId ?? `${context.fromSeasonId}:${context.toSeasonId}`}:${player.id}:${rating}`))
  // Training is an input to the canonical seasonal development calculation, never
  // a direct ratings mutation. The cap keeps a full season of work modest.
  const stimulus = Math.min(2, (context.stimulusByRating?.[legacyStimulusKey(rating)] ?? 0) * 0.05)
  const rawDelta = getBaseDevelopmentTrend(age) + random.nextFloat(-0.75, 0.75) + stimulus
  const growthRoom = 0.35 + 0.65 * ((100 - before) / 100)
  const adjusted = rawDelta > 0 ? rawDelta * growthRoom * calculatePotentialGrowthFactor(player) : rawDelta
  const proposed = Math.max(-5, Math.min(4, Math.round(adjusted)))
  const after = Math.max(1, Math.min(100, before + proposed))
  return { rating, before, delta: after - before, after }
}

function legacyStimulusKey(rating: PlayerTruthRatingKey): CanonicalRatingKey {
  if (rating.includes('THREE') || rating === 'DEEP_SHOOTING' || rating === 'MOVEMENT_SHOOTING' || rating === 'CONTESTED_SHOOTING' || rating === 'SHOT_TOUCH' || rating === 'FREE_THROW') return 'threePointShooting'
  if (rating.includes('FINISH') || rating === 'DUNKING' || rating === 'FOUL_DRAWING' || rating === 'CLOSE_TOUCH') return 'rimFinishing'
  if (rating.includes('PASS') || rating.includes('PLAYMAKING') || rating.includes('CREATION') || rating.includes('HANDLING') || rating.includes('DRIBBLE') || rating === 'BALL_CONTROL' || rating === 'DRIVE_CREATION') return 'passing'
  if (rating.includes('REBOUND')) return 'defensiveRebounding'
  if (rating.includes('DEFENSE') || rating.includes('DEFENSIVE') || rating.includes('RIM_PROTECTION') || rating.includes('SHOT_CONTEST') || rating.includes('STEAL') || rating.includes('DEFLECTION')) return 'perimeterDefense'
  if (rating.includes('SPEED') || rating.includes('AGILITY') || rating.includes('STRENGTH') || rating.includes('VERTICAL') || rating.includes('EXPLOSIVENESS') || rating.includes('BALANCE') || rating.includes('STAMINA') || rating.includes('ENDURANCE') || rating.includes('BODY_CONTROL') || rating === 'ACCELERATION') return 'speed'
  if (rating.includes('AWARENESS') || rating.includes('DECISION') || rating.includes('ANTICIPATION') || rating.includes('COMPOSURE') || rating.includes('DISCIPLINE') || rating.includes('CONCENTRATION') || rating.includes('ADAPTABILITY') || rating.includes('REACTION')) return 'passing'
  if (rating.includes('POST')) return 'interiorDefense'
  return 'passing'
}
