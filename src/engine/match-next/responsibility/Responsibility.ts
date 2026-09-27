import type { PlayerId, TeamId } from '@/domain/ids'
import type { OffensiveSlotName } from '../structure/FiveOutStructure'

export type OffensiveResponsibilityKind = 'BALL' | 'SPACE' | 'ADVANCE'
export type DefensiveResponsibilityKind = 'ON_BALL' | 'GAP' | 'HELP' | 'LOW_MAN' | 'ROTATE' | 'X_OUT' | 'RECOVER'
export type TemporaryResponsibilityKind =
  | 'BOX_OUT' | 'CRASH_REBOUND' | 'PURSUE_REBOUND' | 'SECURE_REBOUND' | 'RETREAT'
  | 'BALL_ADVANCE' | 'LANE_LEFT' | 'LANE_RIGHT' | 'RIM_RUN' | 'TRAIL'
  | 'STOP_BALL' | 'PROTECT_RIM' | 'MATCH'
  | 'PERIOD_RESTART'
export type ResponsibilityKind = OffensiveResponsibilityKind | DefensiveResponsibilityKind
  | TemporaryResponsibilityKind
export type ResponsibilityOwner = 'offensiveStructure' | 'defensiveStructure' | 'possession'

export interface PlayerResponsibility {
  readonly id: string
  readonly playerId: PlayerId
  readonly teamId: TeamId
  readonly kind: ResponsibilityKind
  readonly owner: ResponsibilityOwner
  readonly startedT: number
  readonly reason: string
  readonly endCondition: { readonly kind: 'possessionEnds' | 'ballOwnerChanges' | 'phaseChanges' | 'slotChanges' }
  readonly slot?: OffensiveSlotName
  readonly recoveryTarget?: 'GAP' | 'HELP'
}

export type OffensiveDecisionKind = 'OCCUPY_SLOT' | 'ADVANCE_BALL' | 'HOLD_STRUCTURE'
export type DefensiveDecisionKind = 'GUARD_BALL' | 'GUARD_GAP' | 'HELP_POSITION' | 'ROTATE_TO_HELP_MAN' | 'X_OUT_TWO_MAN' | 'RECOVER_TO_MAN' | 'RETREAT_TO_DEFENSE'
export type StructuralDecisionKind = OffensiveDecisionKind | DefensiveDecisionKind | TemporaryResponsibilityKind

export interface StructuralDecision {
  readonly id: string
  readonly playerId: PlayerId
  readonly responsibilityId: string
  readonly kind: StructuralDecisionKind
  readonly owner: ResponsibilityOwner
  readonly startedT: number
  readonly reason: string
}
