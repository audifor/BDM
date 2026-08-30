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

export interface DefensiveMatchupAssignment { readonly ourPlayerId:PlayerId; readonly opponentPlayerId:PlayerId }
export interface TeamTacticalPlan { readonly teamId:TeamId; readonly instructions:TeamTacticalInstructions }
export interface TeamGamePlan { readonly gameId:GameId; readonly teamId:TeamId; readonly matchups?:readonly DefensiveMatchupAssignment[]; readonly rotationOverride?:TeamRotationIntent; readonly tacticalOverride?:Partial<TeamTacticalInstructions> }
export function createDefaultTeamTacticalPlan(teamId:TeamId):TeamTacticalPlan{return{teamId,instructions:{pace:0,shotProfile:{rim:0,midRange:0,threePoint:0},defense:{interior:0,perimeter:0}}}}
export function resolveEffectiveTacticalPlan(base:TeamTacticalInstructions, plan:TeamGamePlan|undefined):TeamTacticalInstructions { if(!plan?.tacticalOverride)return base;const override=plan.tacticalOverride;return{...base,...override,shotProfile:{...base.shotProfile,...override.shotProfile},defense:{...base.defense,...override.defense}} }
export function gamePlanKey(gameId:GameId,teamId:TeamId):string{return `${gameId}:${teamId}`}
