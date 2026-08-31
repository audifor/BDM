/**
 * Wave 4A minimal Staff Reputation model (docs/STAFF_SYSTEM_V2.md §22-ish, per Issue #19 §7).
 * Deliberately narrower than `CoachReputation`: no event log, no autonomous evolution — Wave 4A's
 * only consumer is job-market candidate ranking (`rankStaffCandidates`). A richer, event-sourced
 * model is left to a future wave if/when a concrete career-event producer needs it.
 */
export const STAFF_REPUTATION_DIMENSIONS = ['competence', 'reliability', 'publicStanding'] as const
export type StaffReputationDimension = typeof STAFF_REPUTATION_DIMENSIONS[number]

export const STAFF_REPUTATION_MIN = 0
export const STAFF_REPUTATION_MAX = 1000
export const STAFF_REPUTATION_DEFAULT = 200

export interface StaffReputationProfile {
  readonly values: Readonly<Record<StaffReputationDimension, number>>
}

export function createDefaultStaffReputationProfile(): StaffReputationProfile {
  return { values: { competence: STAFF_REPUTATION_DEFAULT, reliability: STAFF_REPUTATION_DEFAULT, publicStanding: STAFF_REPUTATION_DEFAULT } }
}

export function createStaffReputationProfile(profile: StaffReputationProfile): StaffReputationProfile {
  const values = {} as Record<StaffReputationDimension, number>
  for (const dimension of STAFF_REPUTATION_DIMENSIONS) {
    const value = profile.values[dimension]
    if (!Number.isFinite(value) || value < STAFF_REPUTATION_MIN || value > STAFF_REPUTATION_MAX) throw new RangeError(`Invalid Staff reputation value for ${dimension}`)
    values[dimension] = value
  }
  return { values }
}

export function clampStaffReputationValue(value: number): number {
  if (!Number.isFinite(value)) throw new RangeError('Invalid Staff reputation value')
  return Math.max(STAFF_REPUTATION_MIN, Math.min(STAFF_REPUTATION_MAX, value))
}

/** Aggregate score used by job-market candidate ranking — a simple unweighted mean, kept separate from role-fit proficiency (see `rankStaffCandidates`). */
export function staffReputationScore(profile: StaffReputationProfile): number {
  return STAFF_REPUTATION_DIMENSIONS.reduce((sum, dimension) => sum + profile.values[dimension], 0) / STAFF_REPUTATION_DIMENSIONS.length
}
