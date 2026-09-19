import type { GameId, SeasonId } from '@/domain/ids'

import type {
  PerformanceCompetitionFilter,
  PerformancePhaseFilter,
  PerformanceSplitFilter,
} from '@/ui-ng/applications/player/data/buildPlayerPerformanceModel'

export interface PerformanceSession {
  readonly selectedGameId: GameId | null
  readonly setSelectedGameId: (gameId: GameId | null) => void
  /** Season the page is querying; the model defaults it to the season in progress. */
  readonly seasonId: SeasonId | null
  readonly setSeasonId: (seasonId: SeasonId | null) => void
  readonly competitionFilter: PerformanceCompetitionFilter
  readonly setCompetitionFilter: (filter: PerformanceCompetitionFilter) => void
  readonly phaseFilter: PerformancePhaseFilter
  readonly setPhaseFilter: (filter: PerformancePhaseFilter) => void
  readonly splitFilter: PerformanceSplitFilter
  readonly setSplitFilter: (filter: PerformanceSplitFilter) => void
}
