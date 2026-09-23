/**
 * Extensible, non-exhaustive catalog of Facility types. A Facility may serve multiple
 * purposes at once (see FacilityPurpose); `FacilityType` is a broad classification hook
 * for presentation and future rules, never a rigid single-function label.
 */
export const FACILITY_TYPES = [
  'ARENA',
  'STADIUM',
  'TRAINING_CENTER',
  'PRACTICE_FACILITY',
  'PERFORMANCE_CENTER',
  'MEDICAL_CENTER',
  'ACADEMY_CENTER',
  'YOUTH_CENTER',
  'HEADQUARTERS',
  'ADMINISTRATIVE_OFFICE',
  'DORMITORY',
  'MULTI_SPORT_COMPLEX',
  'COMMUNITY_CENTER',
  'STORAGE',
  'OTHER',
] as const

export type FacilityType = (typeof FACILITY_TYPES)[number]

/**
 * What a Facility is actually used for. Independent from `FacilityType`: an ARENA-typed
 * Facility may simultaneously carry MATCH_HOSTING and TRAINING purposes (e.g. a small club
 * that trains where it plays).
 */
export const FACILITY_PURPOSES = [
  'MATCH_HOSTING',
  'TRAINING',
  'ACADEMY_DEVELOPMENT',
  'MEDICAL_TREATMENT',
  'ADMINISTRATION',
  'LODGING',
  'COMMUNITY_ENGAGEMENT',
  'STORAGE',
  'OTHER',
] as const

export type FacilityPurpose = (typeof FACILITY_PURPOSES)[number]

/**
 * A discrete, world-truth capability a Facility can offer (independent of its declared
 * type/purpose labels). Capabilities are additive facts, never a derived rating.
 */
export const FACILITY_CAPABILITIES = [
  'HOSTS_COMPETITIVE_MATCHES',
  'HOSTS_TRAINING_SESSIONS',
  'HOSTS_MEDICAL_TREATMENT',
  'HOSTS_ACADEMY_PROGRAMS',
  'HOSTS_ADMINISTRATIVE_STAFF',
  'HOSTS_LODGING',
  'HOSTS_MEDIA_OPERATIONS',
  'HOSTS_HOSPITALITY',
] as const

export type FacilityCapability = (typeof FACILITY_CAPABILITIES)[number]

export function isFacilityType(value: unknown): value is FacilityType {
  return typeof value === 'string' && (FACILITY_TYPES as readonly string[]).includes(value)
}

export function isFacilityPurpose(value: unknown): value is FacilityPurpose {
  return typeof value === 'string' && (FACILITY_PURPOSES as readonly string[]).includes(value)
}

export function isFacilityCapability(value: unknown): value is FacilityCapability {
  return typeof value === 'string' && (FACILITY_CAPABILITIES as readonly string[]).includes(value)
}
