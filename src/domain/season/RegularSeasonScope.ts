import type { Game } from '@/domain/game'
import type { Season } from './Season'

/**
 * Canonical regular-season scope for one edition: the real variant's `REGULAR_SEASON` stage nodes
 * index a Game's typed `competitionStageKey`. Games tagged with any other identified stage belong to
 * postseason/cup play; stage-less Games are regular season (legacy editions carry no format document).
 * Standings and the Trade Deadline both resolve the regular season through this single rule.
 */
export function isRegularSeasonGame(season: Season, game: Game): boolean {
  const variant = season.worldCompetitionFormat?.variants.find((item) => item.isRealVariant) ?? season.worldCompetitionFormat?.variants[0]
  const regularStageKeys = new Set(variant?.nodes.filter((node) => node.role === 'REGULAR_SEASON').map((node) => node.key) ?? [])
  return regularStageKeys.size === 0 || game.competitionStageKey === undefined || regularStageKeys.has(game.competitionStageKey)
}
