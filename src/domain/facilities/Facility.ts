import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import { facilityIdFromString, placeIdFromString, type FacilityId, type PlaceId } from '@/domain/ids'
import { requireNonEmptyString } from '@/domain/validation'
import { FACILITY_STATUSES, isFacilityStatus, type FacilityStatus } from './FacilityLifecycle'
import { isFacilityCapability, isFacilityPurpose, isFacilityType, type FacilityCapability, type FacilityPurpose, type FacilityType } from './FacilityType'

/**
 * World-truth physical characteristics only. Composition over a megastructure: every field is
 * independently optional/null because not every Facility (a municipal gym, a fictional academy)
 * has a meaningful value for it. None of these are gameplay ratings.
 */
export interface FacilityPhysicalProfile {
  readonly openedOn: GameDate | null
  readonly totalCapacity: number | null
  readonly seatedCapacity: number | null
  readonly standingCapacity: number | null
  readonly courtCount: number | null
  readonly hasAccessibilityProvision: boolean | null
}

export interface Facility {
  readonly id: FacilityId
  readonly placeId: PlaceId
  readonly type: FacilityType
  /** A Facility may serve more than one purpose at once; never a single rigid classification. */
  readonly purposes: readonly FacilityPurpose[]
  readonly capabilities: readonly FacilityCapability[]
  readonly status: FacilityStatus
  readonly canonicalName: string
  readonly physical: FacilityPhysicalProfile
  readonly closedOn: GameDate | null
}

export interface CreateFacilityPhysicalProfileInput {
  readonly openedOn?: GameDate | string | null
  readonly totalCapacity?: number | null
  readonly seatedCapacity?: number | null
  readonly standingCapacity?: number | null
  readonly courtCount?: number | null
  readonly hasAccessibilityProvision?: boolean | null
}

export interface CreateFacilityInput {
  readonly id: FacilityId | string
  readonly placeId: PlaceId | string
  readonly type: FacilityType
  readonly purposes: readonly FacilityPurpose[]
  readonly capabilities?: readonly FacilityCapability[]
  readonly status: FacilityStatus
  readonly canonicalName: string
  readonly physical?: CreateFacilityPhysicalProfileInput
  readonly closedOn?: GameDate | string | null
}

const EMPTY_PHYSICAL_PROFILE: FacilityPhysicalProfile = Object.freeze({
  openedOn: null,
  totalCapacity: null,
  seatedCapacity: null,
  standingCapacity: null,
  courtCount: null,
  hasAccessibilityProvision: null,
})

export function createFacility(input: CreateFacilityInput): Facility {
  const id = facilityIdFromString(input.id)
  if (!isFacilityType(input.type)) throw new TypeError(`Facility type is invalid: ${String(input.type)}`)
  if (!isFacilityStatus(input.status)) throw new TypeError(`Facility status is invalid: ${String(input.status)}`)
  if (input.purposes.length === 0) throw new RangeError('Facility requires at least one purpose')
  for (const purpose of input.purposes) if (!isFacilityPurpose(purpose)) throw new TypeError(`Facility purpose is invalid: ${String(purpose)}`)
  if (new Set(input.purposes).size !== input.purposes.length) throw new RangeError('Facility purposes must not contain duplicates')
  const capabilities = input.capabilities ?? []
  for (const capability of capabilities) if (!isFacilityCapability(capability)) throw new TypeError(`Facility capability is invalid: ${String(capability)}`)
  if (new Set(capabilities).size !== capabilities.length) throw new RangeError('Facility capabilities must not contain duplicates')

  const physical = createFacilityPhysicalProfile(input.physical)
  const closedOn = input.closedOn === undefined || input.closedOn === null ? null : parseGameDate(input.closedOn)
  if (closedOn !== null && physical.openedOn !== null && compareGameDates(closedOn, physical.openedOn) < 0) {
    throw new RangeError('Facility closedOn cannot precede its openedOn')
  }
  assertFacilityLifecycleConsistency(input.status, physical.openedOn, closedOn)

  return Object.freeze({
    id,
    placeId: placeIdFromString(input.placeId),
    type: input.type,
    purposes: Object.freeze([...input.purposes]),
    capabilities: Object.freeze([...capabilities]),
    status: input.status,
    canonicalName: requireNonEmptyString(input.canonicalName, 'Facility canonical name'),
    physical,
    closedOn,
  })
}

function createFacilityPhysicalProfile(input: CreateFacilityPhysicalProfileInput | undefined): FacilityPhysicalProfile {
  if (input === undefined) return EMPTY_PHYSICAL_PROFILE
  const openedOn = input.openedOn === undefined || input.openedOn === null ? null : parseGameDate(input.openedOn)
  const totalCapacity = nonNegativeIntegerOrNull(input.totalCapacity, 'Facility total capacity')
  const seatedCapacity = nonNegativeIntegerOrNull(input.seatedCapacity, 'Facility seated capacity')
  const standingCapacity = nonNegativeIntegerOrNull(input.standingCapacity, 'Facility standing capacity')
  const courtCount = nonNegativeIntegerOrNull(input.courtCount, 'Facility court count')
  if (totalCapacity !== null && seatedCapacity !== null && standingCapacity !== null && seatedCapacity + standingCapacity > totalCapacity) {
    throw new RangeError('Facility seated plus standing capacity cannot exceed total capacity')
  }
  return Object.freeze({
    openedOn,
    totalCapacity,
    seatedCapacity,
    standingCapacity,
    courtCount,
    hasAccessibilityProvision: input.hasAccessibilityProvision ?? null,
  })
}

function nonNegativeIntegerOrNull(value: number | null | undefined, label: string): number | null {
  if (value === undefined || value === null) return null
  if (!Number.isInteger(value) || value < 0) throw new RangeError(`${label} must be a non-negative integer or null`)
  return value
}

/** Blocks temporally/logically impossible lifecycle combinations (e.g. DEMOLISHED with no closedOn, PLANNED with an openedOn already in the past relative to closedOn ordering). CFI1 keeps this intentionally conservative: it rejects only combinations that can never be true, not every stylistic mismatch. */
function assertFacilityLifecycleConsistency(status: FacilityStatus, openedOn: GameDate | null, closedOn: GameDate | null): void {
  if (!FACILITY_STATUSES.includes(status)) throw new TypeError(`Facility status is invalid: ${String(status)}`)
  const requiresClosure = status === 'DECOMMISSIONED' || status === 'DEMOLISHED'
  if (requiresClosure && closedOn === null) {
    throw new RangeError(`Facility status ${status} requires a closedOn date`)
  }
  if (status === 'PLANNED' && closedOn !== null) {
    throw new RangeError('Facility status PLANNED cannot already have a closedOn date')
  }
}
