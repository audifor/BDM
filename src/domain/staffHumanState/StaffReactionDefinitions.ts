import type { StaffExpectationDimension, StaffHumanEventImportance, StaffHumanEventKind, StaffHumanStateDelta } from './StaffHumanState'

/**
 * Wave 5A §10 — the SOLE authority for "what does event kind X do to Human State". No engine or
 * app module may hand-roll `frustration += ...` — every reaction routes through
 * `reactionDefinitionFor(kind)` and the shared scaling/modulation pipeline in
 * `StaffHumanReactionEngine`.
 */
export interface StaffReactionDefinition {
  readonly kind: StaffHumanEventKind
  /** Base per-dimension delta at MEANINGFUL importance, before importance/personality/relationship/pattern modulation. */
  readonly baseDelta: StaffHumanStateDelta
  /** Expectation dimensions this event is evidence for — used by the Appraisal Engine to bias current-expectation adaptation, not by the reaction pipeline directly. */
  readonly relevantExpectations: readonly StaffExpectationDimension[]
  /** Whether this event kind can carry a real attributable actor (vs. always-systemic events like workload bands). */
  readonly attributable: boolean
}

function def(kind: StaffHumanEventKind, baseDelta: StaffHumanStateDelta, relevantExpectations: readonly StaffExpectationDimension[], attributable: boolean): StaffReactionDefinition {
  return { kind, baseDelta, relevantExpectations, attributable }
}

export const STAFF_REACTION_REGISTRY: Readonly<Record<StaffHumanEventKind, StaffReactionDefinition>> = {
  // Responsibilities
  responsibilityGranted: def('responsibilityGranted', { responsibilitySatisfaction: 6, recognitionSatisfaction: 3, professionalFulfillment: 2 }, ['responsibility', 'recognition'], true),
  responsibilityRemoved: def('responsibilityRemoved', { responsibilitySatisfaction: -6, recognitionSatisfaction: -2, frustration: 3 }, ['responsibility'], true),
  responsibilityModeIncreased: def('responsibilityModeIncreased', { autonomySatisfaction: 7, influenceSatisfaction: 3 }, ['autonomy', 'influence'], true),
  responsibilityModeReduced: def('responsibilityModeReduced', { autonomySatisfaction: -6, influenceSatisfaction: -2, frustration: 2 }, ['autonomy'], true),
  responsibilityReassignedAway: def('responsibilityReassignedAway', { responsibilitySatisfaction: -8, recognitionSatisfaction: -3, frustration: 4 }, ['responsibility', 'recognition'], true),
  responsibilityReassignedToStaff: def('responsibilityReassignedToStaff', { responsibilitySatisfaction: 5, recognitionSatisfaction: 2 }, ['responsibility'], true),
  responsibilityScopeExpanded: def('responsibilityScopeExpanded', { responsibilitySatisfaction: 4, professionalFulfillment: 3 }, ['responsibility', 'professionalChallenge'], true),
  responsibilityScopeReduced: def('responsibilityScopeReduced', { responsibilitySatisfaction: -4, frustration: 2 }, ['responsibility'], true),

  // Advisory / professional voice
  recommendationAccepted: def('recommendationAccepted', { influenceSatisfaction: 3, recognitionSatisfaction: 2 }, ['influence', 'decisionAccess'], true),
  actionableRecommendationRejected: def('actionableRecommendationRejected', { influenceSatisfaction: -3, frustration: 2 }, ['influence', 'decisionAccess'], true),
  importantRecommendationAccepted: def('importantRecommendationAccepted', { influenceSatisfaction: 6, recognitionSatisfaction: 4, professionalFulfillment: 3 }, ['influence', 'recognition', 'decisionAccess'], true),
  importantRecommendationRejected: def('importantRecommendationRejected', { influenceSatisfaction: -6, frustration: 5 }, ['influence', 'decisionAccess'], true),
  recommendationPatternPositive: def('recommendationPatternPositive', { influenceSatisfaction: 5, organizationalCommitment: 2 }, ['influence', 'decisionAccess'], true),
  recommendationPatternNegative: def('recommendationPatternNegative', { influenceSatisfaction: -8, frustration: 6, organizationalCommitment: -3 }, ['influence', 'decisionAccess'], true),

  // Role / professional standing
  staffAppointed: def('staffAppointed', { roleSatisfaction: 8, organizationalCommitment: 4 }, ['roleStature', 'jobSecurity'], true),
  staffRoleImproved: def('staffRoleImproved', { roleSatisfaction: 7, recognitionSatisfaction: 4, professionalFulfillment: 3 }, ['roleStature', 'progression'], true),
  staffRoleReduced: def('staffRoleReduced', { roleSatisfaction: -8, frustration: 4, organizationalCommitment: -3 }, ['roleStature', 'progression'], true),
  professionalStandingImproved: def('professionalStandingImproved', { recognitionSatisfaction: 5, professionalFulfillment: 3 }, ['recognition', 'progression'], true),
  professionalStandingReduced: def('professionalStandingReduced', { recognitionSatisfaction: -5, frustration: 3 }, ['recognition'], true),

  // Workload (systemic — never a person's "fault")
  sustainedUnderutilization: def('sustainedUnderutilization', { workloadSatisfaction: -4, professionalFulfillment: -3 }, ['workload', 'professionalChallenge'], false),
  sustainedHealthyWorkload: def('sustainedHealthyWorkload', { workloadSatisfaction: 3, stress: -2 }, ['workload'], false),
  sustainedHeavyWorkload: def('sustainedHeavyWorkload', { workloadSatisfaction: -3, stress: 4 }, ['workload'], false),
  sustainedOverload: def('sustainedOverload', { workloadSatisfaction: -6, stress: 8, frustration: 3 }, ['workload'], false),
  workloadRelief: def('workloadRelief', { workloadSatisfaction: 4, stress: -6 }, ['workload'], false),

  // Contract
  contractSituationImproved: def('contractSituationImproved', { contractSatisfaction: 8, organizationalCommitment: 3 }, ['compensation', 'jobSecurity'], true),
  contractSituationDeteriorated: def('contractSituationDeteriorated', { contractSatisfaction: -8, frustration: 3 }, ['compensation', 'jobSecurity'], true),
  contractRecognitionGapOpened: def('contractRecognitionGapOpened', { contractSatisfaction: -5, recognitionSatisfaction: -3 }, ['compensation', 'recognition'], true),
  contractSecurityRestored: def('contractSecurityRestored', { contractSatisfaction: 5, stress: -3 }, ['jobSecurity'], true),

  // Professional outcome
  professionalSuccess: def('professionalSuccess', { professionalFulfillment: 7, recognitionSatisfaction: 4, organizationalCommitment: 2 }, ['recognition', 'progression'], true),
  professionalFailure: def('professionalFailure', { professionalFulfillment: -6, frustration: 3, stress: 3 }, ['recognition', 'progression'], true),
}

export function reactionDefinitionFor(kind: StaffHumanEventKind): StaffReactionDefinition {
  const definition = STAFF_REACTION_REGISTRY[kind]
  if (definition === undefined) throw new RangeError(`Unknown Staff human event kind: ${kind}`)
  return definition
}

/** §12 — non-linear importance scaling, centralized. CRITICAL weighs sensibly more than IMPORTANT, IMPORTANT more than MEANINGFUL, ROUTINE limited. */
export const IMPORTANCE_SCALING: Readonly<Record<StaffHumanEventImportance, number>> = {
  ROUTINE: 0.5,
  MEANINGFUL: 1.0,
  IMPORTANT: 1.6,
  CRITICAL: 2.4,
}
