import type { CompetitionId, SeasonId, TeamId } from '@/domain/ids'
import type { GameDate } from '@/domain/date'

export interface PromotionRelegationResolution {
  readonly id: string
  readonly upperCompetitionId: CompetitionId
  readonly lowerCompetitionId: CompetitionId
  readonly upperSeasonId: SeasonId
  readonly lowerSeasonId: SeasonId
  readonly promotedTeamIds: readonly TeamId[]
  readonly relegatedTeamIds: readonly TeamId[]
  readonly resolvedDate: GameDate
}
