import { calculateSeasonStandings } from '@/domain/season'
import type { FinalStandingLine } from '@/domain/season'
import type { SeasonId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'

export type StandingsEntry = FinalStandingLine

/** Compatibility boundary: standings remain an Engine-facing projection. */
export function calculateStandings(world: GameWorld, seasonId: SeasonId): StandingsEntry[] {
  return calculateSeasonStandings(world, seasonId)
}
