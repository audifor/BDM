import type { FacilityComponentCategory } from './FacilityComponentCategory'
import type { FacilityComponentType } from './FacilityComponent'
import type { FacilityServiceability } from './FacilityCondition'

/**
 * A small, explicit wear-rate family, per the brief's explicit instruction not to hand-author
 * ninety arbitrary per-type constants. Every `FacilityComponentType` maps to exactly one profile
 * via `FACILITY_COMPONENT_WEAR_PROFILE` below, grouped by category with a handful of documented
 * per-type overrides (e.g. an outdoor court wears faster than an indoor one of the same family).
 */
export const FACILITY_WEAR_PROFILES = ['LOW', 'NORMAL', 'HIGH', 'VERY_HIGH'] as const
export type FacilityWearProfile = (typeof FACILITY_WEAR_PROFILES)[number]

export function isFacilityWearProfile(value: unknown): value is FacilityWearProfile {
  return typeof value === 'string' && (FACILITY_WEAR_PROFILES as readonly string[]).includes(value)
}

/**
 * Base monthly deterioration rate (physical-condition points lost per elapsed calendar month at
 * zero utilization), one number per wear profile. Units: `PhysicalCondition` points per month.
 * These are CFI5's own first, explicitly provisional constants — not a sporting/finance rule and
 * not calibrated against any real-world data; a later wave may replace them once real gameplay
 * feedback exists, without requiring any schema change here.
 */
export const BASE_MONTHLY_DETERIORATION_RATE: Readonly<Record<FacilityWearProfile, number>> = Object.freeze({
  LOW: 0.15,
  NORMAL: 0.4,
  HIGH: 0.75,
  VERY_HIGH: 1.2,
})

/**
 * Category-level default wear profile. A category groups many component types (see
 * `FacilityComponentCategory`), so this is the coarse default; `FACILITY_COMPONENT_TYPE_OVERRIDE`
 * below refines specific types that wear faster or slower than their category's typical member
 * (e.g. `OUTDOOR_COURT` vs. the BASKETBALL category's otherwise-indoor default).
 */
const FACILITY_COMPONENT_CATEGORY_WEAR_PROFILE: Readonly<Record<FacilityComponentCategory, FacilityWearProfile>> = Object.freeze({
  BASKETBALL: 'HIGH',
  TRAINING: 'HIGH',
  PERFORMANCE: 'NORMAL',
  MEDICAL: 'LOW',
  RECOVERY: 'NORMAL',
  PLAYER_SUPPORT: 'NORMAL',
  STAFF: 'LOW',
  ADMINISTRATION: 'LOW',
  MEDIA: 'LOW',
  SPECTATOR: 'NORMAL',
  COMMERCIAL: 'NORMAL',
  HOSPITALITY: 'NORMAL',
  ACADEMY: 'NORMAL',
  RESIDENTIAL: 'LOW',
  LOGISTICS: 'LOW',
  TRANSPORT: 'NORMAL',
  SECURITY: 'LOW',
  COMMUNITY: 'NORMAL',
  UTILITIES: 'NORMAL',
  OTHER: 'NORMAL',
})

/**
 * Explicit per-type overrides where a type's real-world exposure clearly differs from its
 * category's typical member. Anything not listed here uses its category's default — this stays a
 * small, documented, reviewable list rather than ninety independent constants.
 */
const FACILITY_COMPONENT_TYPE_OVERRIDE: Readonly<Partial<Record<FacilityComponentType, FacilityWearProfile>>> = Object.freeze({
  // Outdoor exposure wears faster than the same functional family indoors.
  OUTDOOR_COURT: 'VERY_HIGH',
  // Parking is a slow-wear paved surface, not comparable to an indoor training/logistics space.
  PARKING: 'LOW',
  // Specialist medical imaging equipment degrades on a technical-obsolescence timeline distinct
  // from ordinary MEDICAL-category rooms.
  IMAGING_ROOM: 'NORMAL',
  DIAGNOSTIC_ROOM: 'NORMAL',
})

export function wearProfileForComponentType(type: FacilityComponentType, category: FacilityComponentCategory): FacilityWearProfile {
  return FACILITY_COMPONENT_TYPE_OVERRIDE[type] ?? FACILITY_COMPONENT_CATEGORY_WEAR_PROFILE[category]
}

/**
 * Multiplies the base monthly rate by utilization. `utilizationRatio` is a caller-supplied,
 * dimensionless value in `[0, 1]` (0 = unused this period, 1 = maximally utilized) — CFI5 does not
 * yet source this from real Match/Training usage; a future wave will compute it from real
 * scheduling data and pass it in unchanged. A component with no supplied usage input deteriorates
 * at exactly its base rate (`utilizationRatio` defaults to a neutral 1.0 baseline — see
 * `FacilityUsageLoad.ts` for why 1.0, not 0, is the seam's neutral default).
 */
export function utilizationMultiplier(utilizationRatio: number): number {
  if (!Number.isFinite(utilizationRatio) || utilizationRatio < 0 || utilizationRatio > 1) throw new RangeError('Utilization ratio must be between 0 and 1')
  // Linear 1.0x (idle) to 2.0x (maximal use) — a simple, explicitly provisional model per the brief's
  // preference for a first deterministic mathematical model over a complex one.
  return 1 + utilizationRatio
}

/**
 * Centralized, documented condition thresholds that drive physical consequences. Kept in one place
 * per the brief's explicit instruction ("deben estar centralizados... no dispersarse en funciones")
 * rather than scattered magic numbers across the engine. These are provisional defaults, not a
 * regulatory or sporting rule.
 */
export interface FacilityDeteriorationThresholds {
  /** At or below this physical condition, a new MODERATE-or-above maintenance need is opened for the component if none is already open. */
  readonly maintenanceNeedCondition: number
  /** At or below this physical condition, a component's serviceability degrades to at most LIMITED. */
  readonly limitedServiceabilityCondition: number
  /** At or below this physical condition, a component's serviceability degrades to at most SEVERELY_LIMITED. */
  readonly severelyLimitedServiceabilityCondition: number
  /** At or below this physical condition, a component's serviceability becomes OUT_OF_SERVICE. */
  readonly outOfServiceCondition: number
}

export const DEFAULT_FACILITY_DETERIORATION_THRESHOLDS: FacilityDeteriorationThresholds = Object.freeze({
  maintenanceNeedCondition: 60,
  limitedServiceabilityCondition: 45,
  severelyLimitedServiceabilityCondition: 25,
  outOfServiceCondition: 10,
})

/**
 * Deterministic serviceability implied by a physical condition alone, per centralized thresholds.
 * This is a FLOOR, never an upgrade: `deriveServiceabilityFromCondition` must only ever be
 * compared against an existing serviceability to worsen it, never to improve it — an existing
 * OUT_OF_SERVICE component with a component condition that later reads as merely "LIMITED" stays
 * OUT_OF_SERVICE until an explicit maintenance/repair action restores it (see
 * `FacilityDeteriorationEngine.ts`). This function alone never decides that every condition drop
 * changes serviceability, matching the brief's explicit non-example (85 -> 78 keeps FULL).
 */
export function worstServiceabilityImpliedByCondition(physicalCondition: number, thresholds: FacilityDeteriorationThresholds = DEFAULT_FACILITY_DETERIORATION_THRESHOLDS): FacilityServiceability {
  if (physicalCondition <= thresholds.outOfServiceCondition) return 'OUT_OF_SERVICE'
  if (physicalCondition <= thresholds.severelyLimitedServiceabilityCondition) return 'SEVERELY_LIMITED'
  if (physicalCondition <= thresholds.limitedServiceabilityCondition) return 'LIMITED'
  return 'FULL'
}

const SERVICEABILITY_SEVERITY_RANK: Readonly<Record<FacilityServiceability, number>> = Object.freeze({ FULL: 0, LIMITED: 1, SEVERELY_LIMITED: 2, OUT_OF_SERVICE: 3 })

/** Whether `candidate` represents a worse (or equal) serviceability than `current` — the ordering `worstServiceabilityImpliedByCondition`'s floor rule depends on. */
export function isServiceabilityAtLeastAsSevereAs(candidate: FacilityServiceability, current: FacilityServiceability): boolean {
  return SERVICEABILITY_SEVERITY_RANK[candidate] >= SERVICEABILITY_SEVERITY_RANK[current]
}
