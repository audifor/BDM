import type { CourtPosition } from '@/domain/court'
import type { PlayerId } from '@/domain/ids'

export type MovementUrgency = 'walk' | 'jog' | 'run' | 'sprint'
export type MovementFacing =
  | { readonly kind: 'BALL' }
  | { readonly kind: 'BASKET' }
  | { readonly kind: 'TRAVEL' }
  | { readonly kind: 'POINT'; readonly position: CourtPosition }

export interface MovementIntent {
  readonly playerId: PlayerId
  readonly target: CourtPosition
  readonly urgency: MovementUrgency
  readonly facing: MovementFacing
  /** BT6: a defender in his stance keeps this share of his top speed sliding backward or sideways (his footwork); omitted: the generic backpedal. */
  readonly stanceSlide?: number
  readonly provenance: {
    readonly responsibilityId: string
    readonly decisionId: string
    readonly owner: 'offensiveStructure' | 'defensiveStructure' | 'possession' | 'action'
  }
}

export const MOVEMENT_URGENCY_FACTORS: Readonly<Record<MovementUrgency, number>> = {
  walk: 0.35,
  jog: 0.55,
  run: 0.8,
  sprint: 1,
}
