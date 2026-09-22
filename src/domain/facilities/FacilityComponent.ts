import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import { facilityComponentIdFromString, facilityIdFromString, type FacilityComponentId, type FacilityId } from '@/domain/ids'
import { requireNonEmptyString } from '@/domain/validation'

/**
 * Extensible, non-exhaustive catalog of functional parts of a Facility. No Facility is assumed
 * to contain every kind, and this list is deliberately open-ended via `OTHER`.
 */
export const FACILITY_COMPONENT_TYPES = [
  'MAIN_COURT',
  'PRACTICE_COURT',
  'GYM',
  'WEIGHT_ROOM',
  'RECOVERY_ROOM',
  'HYDROTHERAPY',
  'LOCKER_ROOM',
  'MEDICAL_ROOM',
  'VIDEO_ROOM',
  'COACHES_OFFICE',
  'SCOUTING_OFFICE',
  'ACADEMY_COURT',
  'MEDIA_ROOM',
  'HOSPITALITY_AREA',
  'VIP_BOX',
  'MERCHANDISE_STORE',
  'PARKING',
  'FAN_ZONE',
  'DORMITORY_ROOM',
  'OTHER',
] as const

export type FacilityComponentType = (typeof FACILITY_COMPONENT_TYPES)[number]

export function isFacilityComponentType(value: unknown): value is FacilityComponentType {
  return typeof value === 'string' && (FACILITY_COMPONENT_TYPES as readonly string[]).includes(value)
}

export const FACILITY_COMPONENT_STATUSES = ['PLANNED', 'ACTIVE', 'CLOSED'] as const
export type FacilityComponentStatus = (typeof FACILITY_COMPONENT_STATUSES)[number]

export interface FacilityComponent {
  readonly id: FacilityComponentId
  readonly facilityId: FacilityId
  readonly type: FacilityComponentType
  readonly name: string | null
  readonly status: FacilityComponentStatus
  readonly capacity: number | null
  readonly quantity: number | null
  readonly openedAt: GameDate | null
  readonly closedAt: GameDate | null
}

export interface CreateFacilityComponentInput {
  readonly id: FacilityComponentId | string
  readonly facilityId: FacilityId | string
  readonly type: FacilityComponentType
  readonly name?: string | null
  readonly status: FacilityComponentStatus
  readonly capacity?: number | null
  readonly quantity?: number | null
  readonly openedAt?: GameDate | string | null
  readonly closedAt?: GameDate | string | null
}

export function createFacilityComponent(input: CreateFacilityComponentInput): FacilityComponent {
  if (!isFacilityComponentType(input.type)) throw new TypeError(`Facility component type is invalid: ${String(input.type)}`)
  if (!FACILITY_COMPONENT_STATUSES.includes(input.status)) throw new TypeError(`Facility component status is invalid: ${String(input.status)}`)
  const capacity = nonNegativeIntegerOrNull(input.capacity, 'Facility component capacity')
  const quantity = nonNegativeIntegerOrNull(input.quantity, 'Facility component quantity')
  const openedAt = input.openedAt === undefined || input.openedAt === null ? null : parseGameDate(input.openedAt)
  const closedAt = input.closedAt === undefined || input.closedAt === null ? null : parseGameDate(input.closedAt)
  if (openedAt !== null && closedAt !== null && compareGameDates(closedAt, openedAt) < 0) {
    throw new RangeError('Facility component closedAt cannot precede openedAt')
  }
  if (input.status === 'CLOSED' && closedAt === null) throw new RangeError('Facility component status CLOSED requires a closedAt date')
  if (input.status === 'PLANNED' && closedAt !== null) throw new RangeError('Facility component status PLANNED cannot already have a closedAt date')
  return Object.freeze({
    id: facilityComponentIdFromString(input.id),
    facilityId: facilityIdFromString(input.facilityId),
    type: input.type,
    name: input.name === undefined || input.name === null ? null : requireNonEmptyString(input.name, 'Facility component name'),
    status: input.status,
    capacity,
    quantity,
    openedAt,
    closedAt,
  })
}

function nonNegativeIntegerOrNull(value: number | null | undefined, label: string): number | null {
  if (value === undefined || value === null) return null
  if (!Number.isInteger(value) || value < 0) throw new RangeError(`${label} must be a non-negative integer or null`)
  return value
}
