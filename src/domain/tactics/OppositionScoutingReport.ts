import type { GameDate } from '@/domain/date'
import { parseGameDate } from '@/domain/date'
import type { GameId, PlayerId, StaffPersonId, TeamId } from '@/domain/ids'
import { requireNonEmptyString } from '@/domain/validation'

export type DefensiveEmphasis = 'interior' | 'perimeter'
export type PaceAdjustment = -2 | -1 | 0 | 1 | 2

/**
 * Canonical Wave 3 pre-match advisory artifact (docs/STAFF_SYSTEM_V2.md §15.1/§8). Plain `string`
 * id — same convention as the sibling scouting types it is built from (`ScoutingAssignment.id`,
 * `EvaluatorReport.id`), not the branded-id pattern used by `Responsibility`.
 *
 * MUST be derived only from information the organization could legitimately know: existing
 * `OrganizationKnowledge`, `EvaluatorReport`s/evidence, and public match history already in
 * `world`. Never reads opponent private `Player` ratings/potential (see
 * `OppositionScoutingReportEngine.ts` for the derivation itself — this module is pure shape +
 * structural validation only).
 */
export interface OppositionScoutingReport {
  readonly id: string
  readonly teamId: TeamId
  readonly opponentTeamId: TeamId
  readonly gameId: GameId
  readonly authoredByStaffId: StaffPersonId
  readonly generatedOn: GameDate
  readonly qualityScore: number
  readonly recommendedDefensiveEmphasis?: DefensiveEmphasis
  readonly recommendedPaceAdjustment?: PaceAdjustment
  readonly flaggedPlayerIds: readonly PlayerId[]
}

export const MAX_FLAGGED_PLAYERS = 3
const PACE_ADJUSTMENTS: readonly PaceAdjustment[] = [-2, -1, 0, 1, 2]

/** Stable, deterministic identity: one report per (teamId, gameId). */
export function oppositionScoutingReportId(teamId: TeamId, gameId: GameId): string {
  return `opposition-scouting:${teamId}:${gameId}`
}

export function createOppositionScoutingReport(input: OppositionScoutingReport): OppositionScoutingReport {
  if (input.teamId === input.opponentTeamId) throw new RangeError('Opposition scouting report team and opponent must differ')
  if (!Number.isInteger(input.qualityScore) || input.qualityScore < 0 || input.qualityScore > 100) throw new RangeError('Opposition scouting report quality score must be an integer from 0 to 100')
  if (input.recommendedPaceAdjustment !== undefined && !PACE_ADJUSTMENTS.includes(input.recommendedPaceAdjustment)) throw new RangeError('Opposition scouting report pace adjustment is invalid')
  if (input.recommendedDefensiveEmphasis !== undefined && input.recommendedDefensiveEmphasis !== 'interior' && input.recommendedDefensiveEmphasis !== 'perimeter') throw new RangeError('Opposition scouting report defensive emphasis is invalid')
  if (input.flaggedPlayerIds.length > MAX_FLAGGED_PLAYERS) throw new RangeError(`Opposition scouting report may flag at most ${MAX_FLAGGED_PLAYERS} players`)
  if (new Set(input.flaggedPlayerIds).size !== input.flaggedPlayerIds.length) throw new RangeError('Opposition scouting report flagged players must be unique')
  return {
    id: requireNonEmptyString(input.id, 'Opposition scouting report id'),
    teamId: requireNonEmptyString(input.teamId, 'Opposition scouting report team') as TeamId,
    opponentTeamId: requireNonEmptyString(input.opponentTeamId, 'Opposition scouting report opponent') as TeamId,
    gameId: requireNonEmptyString(input.gameId, 'Opposition scouting report game') as GameId,
    authoredByStaffId: requireNonEmptyString(input.authoredByStaffId, 'Opposition scouting report author') as StaffPersonId,
    generatedOn: parseGameDate(input.generatedOn),
    qualityScore: input.qualityScore,
    ...(input.recommendedDefensiveEmphasis === undefined ? {} : { recommendedDefensiveEmphasis: input.recommendedDefensiveEmphasis }),
    ...(input.recommendedPaceAdjustment === undefined ? {} : { recommendedPaceAdjustment: input.recommendedPaceAdjustment }),
    flaggedPlayerIds: [...input.flaggedPlayerIds],
  }
}
