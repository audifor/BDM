import type { PlayerId, TeamId } from '@/domain/ids'
import type { OffensiveSlotName } from '../structure/FiveOutStructure'

export type ResponsibilityKind = 'BALL' | 'SPACE' | 'ADVANCE'
export type ResponsibilityOwner = 'offensiveStructure' | 'possession'

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
}

export type StructuralDecisionKind = 'OCCUPY_SLOT' | 'ADVANCE_BALL' | 'HOLD_STRUCTURE'

export interface StructuralDecision {
  readonly id: string
  readonly playerId: PlayerId
  readonly responsibilityId: string
  readonly kind: StructuralDecisionKind
  readonly owner: ResponsibilityOwner
  readonly startedT: number
  readonly reason: string
}
