import type { FacilityId } from '@/domain/ids'
import type { GameDate } from '@/domain/date'
import { activeFacilityComponentsAt } from './FacilityQueries'
import type { FacilityComponent, FacilityComponentType } from './FacilityComponent'

/**
 * A discrete, world-truth-derived capability a Facility can offer, resolved deterministically from
 * its currently active components. This is deliberately independent from CFI1's coarser
 * `Facility.capabilities: readonly FacilityCapability[]` field (8 broad "hosts X" facts stored
 * directly on the Facility) — that field remains untouched and is not superseded. This module adds
 * a finer-grained layer answering "what specific things can this Facility support because of what
 * physically exists in it", and is **never independently stored**: storing it would let it drift
 * from the components that justify it, and CFI3's explicit brief is to prefer deriving over
 * serializing anything computable. A future CFI4 quality/condition layer may gate a capability by
 * component condition; CFI3 only establishes presence, never a strength or quality of that
 * capability.
 */
export const FACILITY_COMPONENT_CAPABILITIES = [
  'BASKETBALL_FULL_COURT',
  'BASKETBALL_TRAINING',
  'STRENGTH_TRAINING',
  'CARDIO_TRAINING',
  'HYDROTHERAPY',
  'CRYOTHERAPY',
  'PHYSIOTHERAPY',
  'MEDICAL_EXAMINATION',
  'MEDICAL_IMAGING',
  'VIDEO_ANALYSIS',
  'PLAYER_DINING',
  'PLAYER_RESIDENTIAL',
  'PRESS_CONFERENCE',
  'LIVE_BROADCAST',
  'HOSPITALITY',
  'RETAIL',
] as const

export type FacilityComponentCapability = (typeof FACILITY_COMPONENT_CAPABILITIES)[number]

export function isFacilityComponentCapability(value: unknown): value is FacilityComponentCapability {
  return typeof value === 'string' && (FACILITY_COMPONENT_CAPABILITIES as readonly string[]).includes(value)
}

/**
 * Which component types justify which capability. A capability may depend on more than one
 * component type (any one of them present is enough) — e.g. HYDROTHERAPY is justified by either a
 * dedicated HYDROTHERAPY_POOL component or the CFI1-legacy HYDROTHERAPY type alias.
 * `BASKETBALL_FULL_COURT` specifically requires a full-court specification when one is recorded
 * (see `capabilityIsSupportedByComponent`), not merely a MAIN_COURT type — a court recorded without
 * a specification is presumed capable rather than penalized for missing data (absence of detail is
 * not evidence of absence of capability).
 */
const CAPABILITY_COMPONENT_TYPES: Readonly<Record<FacilityComponentCapability, readonly FacilityComponentType[]>> = {
  BASKETBALL_FULL_COURT: ['MAIN_COURT', 'SECONDARY_COURT'],
  BASKETBALL_TRAINING: ['PRACTICE_COURT', 'SHOOTING_COURT', 'HALF_COURT', 'ACADEMY_COURT', 'OUTDOOR_COURT'],
  STRENGTH_TRAINING: ['STRENGTH_ROOM', 'WEIGHT_ROOM'],
  CARDIO_TRAINING: ['CARDIO_AREA', 'CONDITIONING_AREA'],
  HYDROTHERAPY: ['HYDROTHERAPY_POOL', 'HYDROTHERAPY'],
  CRYOTHERAPY: ['CRYOTHERAPY_ROOM', 'COLD_TUB'],
  PHYSIOTHERAPY: ['PHYSIO_ROOM', 'TREATMENT_ROOM', 'REHABILITATION_ROOM'],
  MEDICAL_EXAMINATION: ['EXAMINATION_ROOM', 'MEDICAL_CLINIC', 'MEDICAL_ROOM'],
  MEDICAL_IMAGING: ['IMAGING_ROOM', 'DIAGNOSTIC_ROOM'],
  VIDEO_ANALYSIS: ['FILM_ROOM'],
  PLAYER_DINING: ['DINING_AREA', 'DINING_HALL', 'KITCHEN', 'NUTRITION_AREA'],
  PLAYER_RESIDENTIAL: ['DORMITORY', 'DORMITORY_ROOM', 'PLAYER_ROOM'],
  PRESS_CONFERENCE: ['PRESS_CONFERENCE_ROOM', 'PRESS_ROOM'],
  LIVE_BROADCAST: ['BROADCAST_ROOM', 'TV_STUDIO'],
  HOSPITALITY: ['HOSPITALITY_LOUNGE', 'HOSPITALITY_AREA', 'VIP_LOUNGE', 'SPONSOR_LOUNGE', 'RESTAURANT', 'BAR', 'CAFE'],
  RETAIL: ['CLUB_STORE', 'RETAIL_UNIT', 'MERCHANDISE_STORE'],
}

function componentSupportsCapability(component: FacilityComponent, capability: FacilityComponentCapability): boolean {
  if (!CAPABILITY_COMPONENT_TYPES[capability].includes(component.type)) return false
  if (capability === 'BASKETBALL_FULL_COURT' && component.specification !== null && component.specification.kind === 'COURT') {
    return component.specification.isFullCourt
  }
  return true
}

/** The full set of derived capabilities a Facility currently supports, resolved from its active components at a date. Deterministic, side-effect-free, and never persisted. */
export function capabilitiesOfFacility(components: readonly FacilityComponent[], facilityId: FacilityId, onDate: GameDate): readonly FacilityComponentCapability[] {
  const active = activeFacilityComponentsAt(components, facilityId, onDate)
  const supported = new Set<FacilityComponentCapability>()
  for (const capability of FACILITY_COMPONENT_CAPABILITIES) {
    if (active.some((component) => componentSupportsCapability(component, capability))) supported.add(capability)
  }
  return Object.freeze([...supported].sort())
}

/** Whether a specific Facility currently supports a given capability at a date. */
export function facilityHasCapability(components: readonly FacilityComponent[], facilityId: FacilityId, capability: FacilityComponentCapability, onDate: GameDate): boolean {
  return capabilitiesOfFacility(components, facilityId, onDate).includes(capability)
}

/** Every distinct Facility (by ID) that currently supports a given capability at a date, across a world's full component set. */
export function facilitiesWithCapability(components: readonly FacilityComponent[], capability: FacilityComponentCapability, onDate: GameDate): readonly FacilityId[] {
  const facilityIds = new Set<FacilityId>()
  const candidateFacilityIds = new Set(components.map((component) => component.facilityId))
  for (const facilityId of candidateFacilityIds) {
    if (facilityHasCapability(components, facilityId, capability, onDate)) facilityIds.add(facilityId)
  }
  return Object.freeze([...facilityIds].sort((a, b) => a.localeCompare(b)))
}
