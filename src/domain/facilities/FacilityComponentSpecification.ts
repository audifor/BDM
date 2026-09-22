/**
 * A basketball-specific physical specification, attachable to any court-family
 * FacilityComponent. Deliberately does not encode NBA/FIBA homologation rules — dimensions and
 * surface are world-truth physical facts; whether they satisfy a given competition's minimums
 * belongs to a future regulatory layer (`FacilityCompetitionApproval` and beyond), not here.
 */
export const COURT_SURFACE_TYPES = ['HARDWOOD', 'SYNTHETIC', 'CONCRETE', 'ASPHALT', 'RUBBER', 'OTHER'] as const
export type CourtSurfaceType = (typeof COURT_SURFACE_TYPES)[number]

export function isCourtSurfaceType(value: unknown): value is CourtSurfaceType {
  return typeof value === 'string' && (COURT_SURFACE_TYPES as readonly string[]).includes(value)
}

export interface CourtSpecification {
  readonly kind: 'COURT'
  readonly isFullCourt: boolean
  readonly isIndoor: boolean
  /** World-truth physical dimensions in metres. Null when unknown — never a falsified default. */
  readonly lengthMeters: number | null
  readonly widthMeters: number | null
  readonly surface: CourtSurfaceType | null
  readonly basketCount: number | null
  /** Whether this court is presently usable for sanctioned competitive play, as opposed to training/shooting-only. This is a physical/administrative fact recorded here, not a regulatory homologation decision. */
  readonly competitionCapable: boolean
  readonly spectatorCapacity: number | null
  readonly hasCompetitionLighting: boolean | null
  readonly hasShotTrackingTechnology: boolean | null
  readonly hasVideoTrackingTechnology: boolean | null
}

export interface CreateCourtSpecificationInput {
  readonly kind: 'COURT'
  readonly isFullCourt: boolean
  readonly isIndoor: boolean
  readonly lengthMeters?: number | null
  readonly widthMeters?: number | null
  readonly surface?: CourtSurfaceType | null
  readonly basketCount?: number | null
  readonly competitionCapable?: boolean
  readonly spectatorCapacity?: number | null
  readonly hasCompetitionLighting?: boolean | null
  readonly hasShotTrackingTechnology?: boolean | null
  readonly hasVideoTrackingTechnology?: boolean | null
}

/**
 * The distinct capacity semantics a component can carry, keyed by an explicit unit so a locker
 * count is never confused with a bed count or a parking-space count. This is deliberately not a
 * single generic `capacity: number` — CFI2S/CFI1's simple `FacilityComponent.capacity` remains
 * available for components with no meaningful richer semantics; this specification is the opt-in
 * richer layer for components where the unit matters.
 */
export const CAPACITY_UNITS = [
  'SIMULTANEOUS_PLAYERS',
  'LOCKERS',
  'TREATMENT_STATIONS',
  'SEATS',
  'BEDS',
  'PARKING_SPACES',
  'SPECTATORS',
  'OTHER',
] as const
export type CapacityUnit = (typeof CAPACITY_UNITS)[number]

export function isCapacityUnit(value: unknown): value is CapacityUnit {
  return typeof value === 'string' && (CAPACITY_UNITS as readonly string[]).includes(value)
}

export interface CapacitySpecification {
  readonly kind: 'CAPACITY'
  readonly unit: CapacityUnit
  readonly amount: number
}

export interface CreateCapacitySpecificationInput {
  readonly kind: 'CAPACITY'
  readonly unit: CapacityUnit
  readonly amount: number
}

/**
 * A component's optional specification. `null`/absent means no richer specification is recorded
 * — this must never be treated as "zero" or "none available"; it means the data is simply
 * unspecified, exactly like every other optional field in this domain.
 */
export type FacilityComponentSpecification = CourtSpecification | CapacitySpecification

export type CreateFacilityComponentSpecificationInput = CreateCourtSpecificationInput | CreateCapacitySpecificationInput

export function createFacilityComponentSpecification(input: CreateFacilityComponentSpecificationInput): FacilityComponentSpecification {
  if (input.kind === 'COURT') return createCourtSpecification(input)
  if (input.kind === 'CAPACITY') return createCapacitySpecification(input)
  throw new TypeError('Facility component specification kind is invalid')
}

export function createCourtSpecification(input: CreateCourtSpecificationInput): CourtSpecification {
  const lengthMeters = nonNegativeFiniteOrNull(input.lengthMeters, 'Court specification lengthMeters')
  const widthMeters = nonNegativeFiniteOrNull(input.widthMeters, 'Court specification widthMeters')
  const basketCount = nonNegativeIntegerOrNull(input.basketCount, 'Court specification basketCount')
  const spectatorCapacity = nonNegativeIntegerOrNull(input.spectatorCapacity, 'Court specification spectatorCapacity')
  const surface = input.surface === undefined || input.surface === null ? null : input.surface
  if (surface !== null && !isCourtSurfaceType(surface)) throw new TypeError(`Court specification surface is invalid: ${String(surface)}`)
  return Object.freeze({
    kind: 'COURT',
    isFullCourt: input.isFullCourt,
    isIndoor: input.isIndoor,
    lengthMeters,
    widthMeters,
    surface,
    basketCount,
    competitionCapable: input.competitionCapable ?? false,
    spectatorCapacity,
    hasCompetitionLighting: input.hasCompetitionLighting ?? null,
    hasShotTrackingTechnology: input.hasShotTrackingTechnology ?? null,
    hasVideoTrackingTechnology: input.hasVideoTrackingTechnology ?? null,
  })
}

export function createCapacitySpecification(input: CreateCapacitySpecificationInput): CapacitySpecification {
  if (!isCapacityUnit(input.unit)) throw new TypeError(`Capacity specification unit is invalid: ${String(input.unit)}`)
  if (!Number.isInteger(input.amount) || input.amount < 0) throw new RangeError('Capacity specification amount must be a non-negative integer')
  return Object.freeze({ kind: 'CAPACITY', unit: input.unit, amount: input.amount })
}

function nonNegativeFiniteOrNull(value: number | null | undefined, label: string): number | null {
  if (value === undefined || value === null) return null
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${label} must be a non-negative finite number or null`)
  return value
}

function nonNegativeIntegerOrNull(value: number | null | undefined, label: string): number | null {
  if (value === undefined || value === null) return null
  if (!Number.isInteger(value) || value < 0) throw new RangeError(`${label} must be a non-negative integer or null`)
  return value
}
