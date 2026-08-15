import { calculateSeasonStandings } from '@/domain/season'
import type { FinalStandingLine } from '@/domain/season'
import type { SeasonId } from '@/domain/ids'
import type { CompetitionId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'

export type StandingsEntry = FinalStandingLine

/** Compatibility boundary: standings remain an Engine-facing projection. */
export function calculateStandings(world: GameWorld, seasonId: SeasonId): StandingsEntry[] {
  return calculateSeasonStandings(world, seasonId)
}

export function calculateStandingsForCompetition(world: GameWorld, competitionId: CompetitionId): StandingsEntry[] {
  const seasons = Object.values(world.seasons).filter((season) => season.competitionId === competitionId).sort((a, b) => b.startDate.localeCompare(a.startDate) || b.id.localeCompare(a.id))
  const season = seasons[0]
  if (season === undefined) throw new Error(`Competition has no Season: ${competitionId}`)
  return calculateStandings(world, season.id)
}
