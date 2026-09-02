/**
 * Wave 5A — 40 canonical Consequence Signals. These are DERIVED read-only projections over
 * `StaffHumanState`/`StaffExpectationProfile`/`StaffReactionRecord` history — never a persisted
 * 40-boolean bag on the Staff person. `getStaffConsequenceSignals(...)` (in
 * `@/engine/staff/StaffHumanAppraisalEngine`) is the sole producer; this module only defines the
 * canonical vocabulary and severity so downstream Waves (5D Conflict, 5E Career Autonomy, 5F
 * Organizational Politics) have a stable contract to read. Signals are INPUTS for future systems,
 * never actions taken by 5A itself (no auto sick-leave/resign/confrontation).
 */

export const STAFF_CONSEQUENCE_SIGNAL_KINDS = [
  'chronicFrustration',
  'acuteFrustrationSpike',
  'sustainedHighStress',
  'extremeStressRisk',
  'emotionalRecovery',
  'professionalBurnoutRisk',

  'roleExpectationMismatch',
  'responsibilityExpectationMismatch',
  'sustainedUnderutilization',
  'responsibilityOverextension',
  'roleStatusErosion',
  'roleStatusGrowth',
  'responsibilityRecognition',
  'professionalChallengeDeficit',
  'professionalChallengeFit',

  'autonomyDeficit',
  'autonomyFulfilled',
  'influenceDeficit',
  'influenceGrowth',
  'decisionAccessDeficit',
  'informationAccessDeficit',
  'professionalVoiceValidated',
  'repeatedProfessionalDisregard',

  'recognitionDeficit',
  'recognitionSurplus',
  'professionalFulfillmentDeficit',
  'highProfessionalFulfillment',
  'successAttributionPositive',
  'successAttributionDeficit',

  'sustainedHeavyWorkload',
  'sustainedOverload',
  'workloadRecovery',
  'resourceSupportDeficit',
  'resourceSupportStrong',

  'contractMismatch',
  'jobSecurityConcern',
  'developmentStagnation',
  'developmentMomentum',

  'lowOrganizationalCommitment',
  'organizationalAmbitionMismatch',
] as const
export type StaffConsequenceSignalKind = typeof STAFF_CONSEQUENCE_SIGNAL_KINDS[number]

export interface StaffConsequenceSignal {
  readonly kind: StaffConsequenceSignalKind
  /** 1 (mild) .. 3 (severe) — a coarse severity band, not a raw score; downstream consumers should branch on this, not re-derive their own thresholds. */
  readonly severity: 1 | 2 | 3
}
