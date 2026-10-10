import type { GameDate } from '@/domain/date'
import type { CompetitionId, GameId, PlayerId, SeasonId, TeamId } from '@/domain/ids'

/**
 * The nine mutually exclusive families are defined by MatchEngine Next's
 * ShotEcology. Persist counts, not hypothetical coordinates.
 */
export const MATCH_SHOT_ZONE_IDS = [
  'RESTRICTED', 'RIM', 'SHORT_PAINT', 'FLOATER_RANGE', 'MIDRANGE',
  'LONG_MIDRANGE', 'CORNER_THREE', 'ABOVE_BREAK_THREE', 'DEEP',
] as const
export type MatchShotZoneId = (typeof MATCH_SHOT_ZONE_IDS)[number]
export interface MatchShotZoneCounts { readonly made: number; readonly attempted: number }
export interface MatchShotZoneBreakdown {
  /** OBSERVED: exact Match Next release events; MODELLED: background
   * conditional-zone allocation derived from already realised 3-zone shots. */
  readonly provenance: 'OBSERVED' | 'MODELLED'
  readonly modelVersion?: string
  readonly counts: Readonly<Partial<Record<MatchShotZoneId, MatchShotZoneCounts>>>
}
export const isThreePointZone = (zone: MatchShotZoneId): boolean =>
  zone === 'CORNER_THREE' || zone === 'ABOVE_BREAK_THREE' || zone === 'DEEP'

export interface PlayerGameStatsSnapshot {
  readonly playerId: PlayerId
  readonly secondsPlayed: number
  readonly points: number
  readonly fieldGoalsMade: number
  readonly fieldGoalsAttempted: number
  readonly twoPointMade: number
  readonly twoPointAttempted: number
  readonly threePointMade: number
  readonly threePointAttempted: number
  readonly freeThrowsMade: number
  readonly freeThrowsAttempted: number
  readonly offensiveRebounds: number
  readonly defensiveRebounds: number
  readonly rebounds: number
  readonly assists: number
  readonly steals: number
  readonly blocks: number
  readonly turnovers: number
  readonly foulsCommitted: number
  readonly plusMinus: number
}

export interface PlayerGameStatLine {
  readonly playerId: PlayerId
  readonly teamId: TeamId
  readonly opponentTeamId: TeamId
  readonly isHome: boolean
  readonly started: boolean
  readonly stats: PlayerGameStatsSnapshot
  /** Optional for legacy imports and already-completed pre-zone games. */
  readonly shotZones?: MatchShotZoneBreakdown
}

/**
 * WSR1: which simulation resolution produced a Game result. FULL and FAST are the exact Match Next engine (watched live / not);
 * BACKGROUND is the World Simulation aggregate tier. Provenance only: every resolution's result is equally canonical. Absent on results
 * saved before WSR1.
 */
export type MatchResolution = 'FULL' | 'FAST' | 'BACKGROUND'

export interface MatchStatLog {
  readonly gameId: GameId
  readonly competitionId: CompetitionId
  readonly seasonId: SeasonId
  readonly gameDate: GameDate
  readonly homeTeamId: TeamId
  readonly awayTeamId: TeamId
  readonly finalScore: { readonly home: number; readonly away: number }
  readonly playerLines: readonly PlayerGameStatLine[]
  readonly resolution?: MatchResolution
  /** BACKGROUND results: the version of the aggregate model that produced them (long-run statistics depend on it). */
  readonly backgroundModelVersion?: string
}
