import type { RelationshipDimensionKey } from '@/domain/relationships'
import type { StaffHumanEventKind } from '@/domain/staffHumanState'

/**
 * Wave 5B §10-11 — the SOLE authority mapping a `StaffHumanEventKind` to a professional
 * relationship facet vector (base deltas at MEANINGFUL importance, before the same
 * `IMPORTANCE_SCALING` used by Human State). No other module hand-rolls facet deltas.
 * `undefined` for a kind means: no relationship signal (e.g. purely systemic workload events).
 * `personalCloseness` is deliberately absent from every entry here — §12 hard rule: ordinary
 * professional decisions never move personal closeness.
 */
export type RelationshipFacetDelta = Readonly<Partial<Record<RelationshipDimensionKey, number>>>

const def = (deltas: RelationshipFacetDelta): RelationshipFacetDelta => deltas

export const STAFF_PROFESSIONAL_RELATIONSHIP_REGISTRY: Readonly<Partial<Record<StaffHumanEventKind, RelationshipFacetDelta>>> = {
  responsibilityGranted: def({ trust: 4, professionalRespect: 3, perceivedSupport: 5, professionalAlignment: 1 }),
  responsibilityRemoved: def({ perceivedSupport: -4, professionalRespect: -1 }),
  responsibilityModeIncreased: def({ trust: 5, professionalRespect: 4, perceivedSupport: 5 }),
  responsibilityModeReduced: def({ perceivedSupport: -4, trust: -1, professionalRespect: -1 }),
  responsibilityReassignedAway: def({ perceivedSupport: -4, professionalRespect: -1 }),
  responsibilityReassignedToStaff: def({ perceivedSupport: 2 }),
  responsibilityScopeExpanded: def({ trust: 2, professionalRespect: 2 }),
  responsibilityScopeReduced: def({ perceivedSupport: -2 }),

  recommendationAccepted: def({ professionalRespect: 3, communicationQuality: 2, trust: 1, professionalAlignment: 1 }),
  importantRecommendationAccepted: def({ professionalRespect: 6, communicationQuality: 4, trust: 3, professionalAlignment: 2 }),
  actionableRecommendationRejected: def({ professionalRespect: -1, professionalAlignment: -1 }),
  importantRecommendationRejected: def({ professionalRespect: -4, communicationQuality: -1, professionalAlignment: -3, trust: -1 }),
  recommendationPatternPositive: def({ trust: 4, professionalRespect: 6, communicationQuality: 3, collaboration: 3, professionalAlignment: 3 }),
  recommendationPatternNegative: def({ trust: -4, professionalRespect: -7, communicationQuality: -3, collaboration: -1, professionalAlignment: -3 }),

  professionalSuccess: def({ professionalRespect: 4, collaboration: 3, reliability: 3 }),
  professionalFailure: def({ professionalRespect: -3, reliability: -2 }),
}

export function relationshipFacetDeltasFor(kind: StaffHumanEventKind): RelationshipFacetDelta | undefined {
  return STAFF_PROFESSIONAL_RELATIONSHIP_REGISTRY[kind]
}
