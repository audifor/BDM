import { BASKETBALL_RATING_KEYS, type PlayerRatings } from './Player'

/** Hidden canonical development capacity. This bootstrap proxy is not an overall rating. */
export interface PlayerPotential { readonly ceiling: number }
export type PlayerPotentialBand = 'limited' | 'average' | 'good' | 'high' | 'elite'

/** Bootstrap-only arithmetic mean used by development; never persist or present it. */
export function calculateBootstrapAbilityProxy(ratings: PlayerRatings): number {
  return BASKETBALL_RATING_KEYS.reduce((total, rating) => total + ratings[rating], 0) / BASKETBALL_RATING_KEYS.length
}

export function getPlayerPotentialBand(potential: PlayerPotential): PlayerPotentialBand {
  if (potential.ceiling < 60) return 'limited'
  if (potential.ceiling < 70) return 'average'
  if (potential.ceiling < 80) return 'good'
  if (potential.ceiling < 90) return 'high'
  return 'elite'
}
