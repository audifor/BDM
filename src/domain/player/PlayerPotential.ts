import { CANONICAL_RATING_KEYS, LEGACY_BASKETBALL_RATING_KEYS, type LegacyPlayerRatings, type PlayerRatings } from './Player'
import type { PlayerDevelopmentProfile } from './PlayerDevelopmentProfile'

/** Hidden canonical development capacity. This bootstrap proxy is not an overall rating. */
export interface PlayerPotential { readonly ceiling: number }
export type PlayerPotentialBand = 'limited' | 'average' | 'good' | 'high' | 'elite'

/** Bootstrap-only arithmetic mean used by development; never persist or present it. */
export function calculateBootstrapAbilityProxy(ratings: PlayerRatings | LegacyPlayerRatings): number {
  if ('finishing' in ratings && !('midRangeShooting' in ratings)) return LEGACY_BASKETBALL_RATING_KEYS.reduce((total, rating) => total + ratings[rating], 0) / LEGACY_BASKETBALL_RATING_KEYS.length
  return CANONICAL_RATING_KEYS.reduce((total, rating) => total + (ratings as PlayerRatings)[rating], 0) / CANONICAL_RATING_KEYS.length
}

/** TEMPORARY derived compatibility surface for consumers not yet moved to domain projections. */
export function deriveLegacyPotential(profile: PlayerDevelopmentProfile): PlayerPotential { return { ceiling: Math.round(Object.values(profile.ceilings).reduce((sum, value) => sum + value, 0) / 8) } }

export function getPlayerPotentialBand(potential: PlayerPotential): PlayerPotentialBand {
  if (potential.ceiling < 60) return 'limited'
  if (potential.ceiling < 70) return 'average'
  if (potential.ceiling < 80) return 'good'
  if (potential.ceiling < 90) return 'high'
  return 'elite'
}
