import type { GameId, PlayerId, TeamId } from '@/domain/ids'
export type TacticalLevel=-2|-1|0|1|2
/** Persisted counterpart of the engine's executable tactic: domain stays engine-free. */
export interface TeamTacticalInstructions { readonly pace:TacticalLevel; readonly shotProfile:{readonly rim:TacticalLevel;readonly midRange:TacticalLevel;readonly threePoint:TacticalLevel};readonly defense:{readonly interior:TacticalLevel;readonly perimeter:TacticalLevel};readonly featuredPlayerId?:PlayerId }
/**
 * minutesByPeriod is a minimal compatible extension (Issue #9): substitution-event `instructions`
 * cannot honestly represent a coach's per-period minute-allocation intent (e.g. "8 minutes in Q1"),
 * so a per-player, per-period minutes matrix is carried alongside the existing instructions rather
 * than replacing them. Period count is whatever the team's actual competition resolves to — this
 * type makes no assumption about period count/length.
 */
export interface TeamRotationIntent { readonly teamId:TeamId; readonly instructions:readonly {readonly period:number;readonly clockThresholdSeconds:number;readonly playerOutId:PlayerId;readonly playerInId:PlayerId}[]; readonly minutesByPeriod?:Readonly<Record<PlayerId, readonly number[]>> }

export const PLAYERS_ON_COURT = 5

/**
 * Canonical rotation-minutes validity check (Issue #9), used by BOTH the Rotaciones UI warning
 * and the write/domain boundary (`validateRotationMinutesOrThrow`) so an invalid allocation can
 * never be the UI's problem alone — the same rule governs what is even allowed to persist.
 *
 * A `minutesByPeriod` map is valid when, for every column (regulation period or OT) up to
 * `periodMinutesByColumn.length`, the minutes recorded for the given active player ids sum to
 * exactly `periodMinutesByColumn[column] * PLAYERS_ON_COURT` — i.e. exactly five players' worth
 * of minutes are accounted for in that column, no more and no less. Players not in `activePlayerIds`
 * are ignored (their rows are stale and must be stripped by the caller before persisting, not
 * validated here). An empty active roster is trivially valid (there is nothing to allocate).
 */
export function isValidRotationMinutes(minutesByPeriod: Readonly<Record<PlayerId, readonly number[]>>, activePlayerIds: readonly PlayerId[], periodMinutesByColumn: readonly number[]): boolean {
  if (activePlayerIds.length === 0) return true
  return periodMinutesByColumn.every((columnMinutes, column) => {
    const total = activePlayerIds.reduce((sum, playerId) => sum + (minutesByPeriod[playerId]?.[column] ?? 0), 0)
    return total === columnMinutes * PLAYERS_ON_COURT
  })
}

/** Throws with a descriptive message when `minutesByPeriod` fails `isValidRotationMinutes`. */
export function validateRotationMinutesOrThrow(minutesByPeriod: Readonly<Record<PlayerId, readonly number[]>>, activePlayerIds: readonly PlayerId[], periodMinutesByColumn: readonly number[]): void {
  if (!isValidRotationMinutes(minutesByPeriod, activePlayerIds, periodMinutesByColumn)) {
    throw new RangeError('Rotation minutes must sum to exactly periodMinutes*5 for every regulation/overtime column among the active players')
  }
}

export interface DefensiveMatchupAssignment { readonly ourPlayerId:PlayerId; readonly opponentPlayerId:PlayerId }
export interface TeamTacticalPlan { readonly teamId:TeamId; readonly instructions:TeamTacticalInstructions }
export interface TeamGamePlan { readonly gameId:GameId; readonly teamId:TeamId; readonly matchups?:readonly DefensiveMatchupAssignment[]; readonly rotationOverride?:TeamRotationIntent; readonly tacticalOverride?:Partial<TeamTacticalInstructions> }
export function createDefaultTeamTacticalPlan(teamId:TeamId):TeamTacticalPlan{return{teamId,instructions:{pace:0,shotProfile:{rim:0,midRange:0,threePoint:0},defense:{interior:0,perimeter:0}}}}
export function resolveEffectiveTacticalPlan(base:TeamTacticalInstructions, plan:TeamGamePlan|undefined):TeamTacticalInstructions { if(!plan?.tacticalOverride)return base;const override=plan.tacticalOverride;return{...base,...override,shotProfile:{...base.shotProfile,...override.shotProfile},defense:{...base.defense,...override.defense}} }
export function gamePlanKey(gameId:GameId,teamId:TeamId):string{return `${gameId}:${teamId}`}
