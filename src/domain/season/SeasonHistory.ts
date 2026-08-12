import type { GameDate } from '@/domain/date'
import type { CompetitionId, SeasonId, TeamId } from '@/domain/ids'

export interface FinalStandingLine {
  readonly position: number
  readonly teamId: TeamId
  readonly played: number
  readonly wins: number
  readonly losses: number
  readonly pointsFor: number
  readonly pointsAgainst: number
  readonly pointDifference: number
}

/** Immutable canonical snapshot created exactly once when a season completes. */
export interface SeasonHistoryRecord {
  readonly seasonId: SeasonId
  readonly competitionId: CompetitionId
  readonly completedOn: GameDate
  readonly championTeamId: TeamId
  readonly finalStandings: readonly FinalStandingLine[]
}
