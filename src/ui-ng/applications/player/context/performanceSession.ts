import type { GameId } from '@/domain/ids'

import type { PerformanceCompetitionFilter } from '@/ui-ng/applications/player/data/buildPlayerPerformanceModel'

export interface PerformanceSession {
  readonly selectedGameId: GameId | null
  readonly setSelectedGameId: (gameId: GameId | null) => void
  readonly competitionFilter: PerformanceCompetitionFilter
  readonly setCompetitionFilter: (filter: PerformanceCompetitionFilter) => void
}
