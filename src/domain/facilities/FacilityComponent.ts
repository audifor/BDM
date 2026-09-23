import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import { facilityComponentIdFromString, facilityIdFromString, type FacilityComponentId, type FacilityId } from '@/domain/ids'
import { requireNonEmptyString } from '@/domain/validation'
import { FACILITY_COMPONENT_CATEGORIES, isFacilityComponentCategory, type FacilityComponentCategory } from './FacilityComponentCategory'
import { createFacilityComponentSpecification, type CreateFacilityComponentSpecificationInput, type FacilityComponentSpecification } from './FacilityComponentSpecification'

/**
 * Extensible, non-exhaustive catalog of functional parts of a Facility, organized by family (see
 * `FACILITY_COMPONENT_TYPE_CATEGORY`). No Facility is assumed to contain every kind, and every
 * family keeps an `OTHER`-equivalent escape hatch via the shared `OTHER` type. CFI3 extends this
 * taxonomy in place — it is the same `FacilityComponent` model CFI1 introduced, not a parallel
 * system.
 */
export const FACILITY_COMPONENT_TYPES = [
  // BASKETBALL — a component can represent one identifiable unit (preferred whenever distinct
  // usage rights, per CFI2, might ever apply to it) or, when identity does not matter, a
  // homogeneous quantity via `quantity`.
  'MAIN_COURT',
  'PRACTICE_COURT',
  'SECONDARY_COURT',
  'HALF_COURT',
  'SHOOTING_COURT',
  'ACADEMY_COURT',
  'OUTDOOR_COURT',
  // TRAINING / PERFORMANCE
  'STRENGTH_ROOM',
  'WEIGHT_ROOM',
  'CARDIO_AREA',
  'CONDITIONING_AREA',
  'SPRINT_AREA',
  'MOVEMENT_LAB',
  'BIOMECHANICS_LAB',
  'PERFORMANCE_LAB',
  'ALTITUDE_ROOM',
  'PLAYER_DEVELOPMENT_LAB',
  'GYM',
  // MEDICAL
  'MEDICAL_CLINIC',
  'EXAMINATION_ROOM',
  'TREATMENT_ROOM',
  'PHYSIO_ROOM',
  'DIAGNOSTIC_ROOM',
  'IMAGING_ROOM',
  'REHABILITATION_ROOM',
  'MEDICAL_ROOM',
  // RECOVERY
  'RECOVERY_ROOM',
  'HYDROTHERAPY_POOL',
  'HOT_TUB',
  'COLD_TUB',
  'SAUNA',
  'STEAM_ROOM',
  'CRYOTHERAPY_ROOM',
  'MASSAGE_ROOM',
  'SLEEP_RECOVERY_ROOM',
  'HYDROTHERAPY',
  // PLAYER_SUPPORT
  'LOCKER_ROOM',
  'PLAYER_LOUNGE',
  'DINING_AREA',
  'NUTRITION_AREA',
  'KITCHEN',
  'FILM_ROOM',
  'MEETING_ROOM',
  'EQUIPMENT_ROOM',
  'LAUNDRY',
  'PLAYER_STORAGE',
  // STAFF / ADMINISTRATION
  'HEAD_COACH_OFFICE',
  'COACHES_OFFICE',
  'BASKETBALL_OPERATIONS_OFFICE',
  'SCOUTING_OFFICE',
  'FRONT_OFFICE',
  'GENERAL_OFFICE',
  'BOARD_ROOM',
  // MEDIA
  'PRESS_ROOM',
  'PRESS_CONFERENCE_ROOM',
  'MEDIA_WORKROOM',
  'BROADCAST_ROOM',
  'TV_STUDIO',
  'INTERVIEW_AREA',
  'MIXED_ZONE',
  'MEDIA_ROOM',
  // SPECTATOR / ARENA
  'SEATING_BOWL',
  'STANDING_AREA',
  'VIP_BOX',
  'PREMIUM_SEATING',
  'COURTSIDE_SEATING',
  'FAN_ZONE',
  'CONCOURSE',
  'ENTRANCE',
  'TICKET_OFFICE',
  'RESTROOM',
  'ACCESSIBLE_SEATING_AREA',
  // COMMERCIAL / HOSPITALITY
  'CLUB_STORE',
  'RETAIL_UNIT',
  'RESTAURANT',
  'CAFE',
  'BAR',
  'HOSPITALITY_LOUNGE',
  'VIP_LOUNGE',
  'SPONSOR_LOUNGE',
  'EVENT_SPACE',
  'MERCHANDISE_STORE',
  'HOSPITALITY_AREA',
  // ACADEMY (components of a larger Facility; an Academy Center may still be its own Facility)
  'ACADEMY_GYM',
  'ACADEMY_LOCKER_ROOM',
  'ACADEMY_OFFICE',
  'CLASSROOM',
  'STUDY_ROOM',
  // RESIDENTIAL
  'DORMITORY',
  'DORMITORY_ROOM',
  'PLAYER_ROOM',
  'STAFF_ROOM',
  'DINING_HALL',
  'COMMON_AREA',
  // LOGISTICS / TRANSPORT / SECURITY / COMMUNITY / UTILITIES
  'STORAGE',
  'EQUIPMENT_STORAGE',
  'LOADING_AREA',
  'WAREHOUSE',
  'MAINTENANCE_AREA',
  'PARKING',
  'TEAM_BUS_AREA',
  'OTHER',
] as const

export type FacilityComponentType = (typeof FACILITY_COMPONENT_TYPES)[number]

export function isFacilityComponentType(value: unknown): value is FacilityComponentType {
  return typeof value === 'string' && (FACILITY_COMPONENT_TYPES as readonly string[]).includes(value)
}

/**
 * Derived classification only — never an independently stored field (see `FacilityComponentCategory`
 * doc comment). Every `FacilityComponentType` above maps to exactly one category; this map is the
 * single source of truth `componentCategory()` reads from, so a component's category and its type
 * can never disagree.
 */
const FACILITY_COMPONENT_TYPE_CATEGORY: Readonly<Record<FacilityComponentType, FacilityComponentCategory>> = {
  MAIN_COURT: 'BASKETBALL', PRACTICE_COURT: 'BASKETBALL', SECONDARY_COURT: 'BASKETBALL', HALF_COURT: 'BASKETBALL', SHOOTING_COURT: 'BASKETBALL', ACADEMY_COURT: 'BASKETBALL', OUTDOOR_COURT: 'BASKETBALL',
  STRENGTH_ROOM: 'TRAINING', WEIGHT_ROOM: 'TRAINING', CARDIO_AREA: 'TRAINING', CONDITIONING_AREA: 'TRAINING', SPRINT_AREA: 'TRAINING', MOVEMENT_LAB: 'PERFORMANCE', BIOMECHANICS_LAB: 'PERFORMANCE', PERFORMANCE_LAB: 'PERFORMANCE', ALTITUDE_ROOM: 'PERFORMANCE', PLAYER_DEVELOPMENT_LAB: 'PERFORMANCE', GYM: 'TRAINING',
  MEDICAL_CLINIC: 'MEDICAL', EXAMINATION_ROOM: 'MEDICAL', TREATMENT_ROOM: 'MEDICAL', PHYSIO_ROOM: 'MEDICAL', DIAGNOSTIC_ROOM: 'MEDICAL', IMAGING_ROOM: 'MEDICAL', REHABILITATION_ROOM: 'MEDICAL', MEDICAL_ROOM: 'MEDICAL',
  RECOVERY_ROOM: 'RECOVERY', HYDROTHERAPY_POOL: 'RECOVERY', HOT_TUB: 'RECOVERY', COLD_TUB: 'RECOVERY', SAUNA: 'RECOVERY', STEAM_ROOM: 'RECOVERY', CRYOTHERAPY_ROOM: 'RECOVERY', MASSAGE_ROOM: 'RECOVERY', SLEEP_RECOVERY_ROOM: 'RECOVERY', HYDROTHERAPY: 'RECOVERY',
  LOCKER_ROOM: 'PLAYER_SUPPORT', PLAYER_LOUNGE: 'PLAYER_SUPPORT', DINING_AREA: 'PLAYER_SUPPORT', NUTRITION_AREA: 'PLAYER_SUPPORT', KITCHEN: 'PLAYER_SUPPORT', FILM_ROOM: 'PLAYER_SUPPORT', MEETING_ROOM: 'PLAYER_SUPPORT', EQUIPMENT_ROOM: 'PLAYER_SUPPORT', LAUNDRY: 'PLAYER_SUPPORT', PLAYER_STORAGE: 'PLAYER_SUPPORT',
  HEAD_COACH_OFFICE: 'STAFF', COACHES_OFFICE: 'STAFF', BASKETBALL_OPERATIONS_OFFICE: 'STAFF', SCOUTING_OFFICE: 'STAFF', FRONT_OFFICE: 'ADMINISTRATION', GENERAL_OFFICE: 'ADMINISTRATION', BOARD_ROOM: 'ADMINISTRATION',
  PRESS_ROOM: 'MEDIA', PRESS_CONFERENCE_ROOM: 'MEDIA', MEDIA_WORKROOM: 'MEDIA', BROADCAST_ROOM: 'MEDIA', TV_STUDIO: 'MEDIA', INTERVIEW_AREA: 'MEDIA', MIXED_ZONE: 'MEDIA', MEDIA_ROOM: 'MEDIA',
  SEATING_BOWL: 'SPECTATOR', STANDING_AREA: 'SPECTATOR', VIP_BOX: 'SPECTATOR', PREMIUM_SEATING: 'SPECTATOR', COURTSIDE_SEATING: 'SPECTATOR', FAN_ZONE: 'SPECTATOR', CONCOURSE: 'SPECTATOR', ENTRANCE: 'SPECTATOR', TICKET_OFFICE: 'SPECTATOR', RESTROOM: 'SPECTATOR', ACCESSIBLE_SEATING_AREA: 'SPECTATOR',
  CLUB_STORE: 'COMMERCIAL', RETAIL_UNIT: 'COMMERCIAL', RESTAURANT: 'HOSPITALITY', CAFE: 'HOSPITALITY', BAR: 'HOSPITALITY', HOSPITALITY_LOUNGE: 'HOSPITALITY', VIP_LOUNGE: 'HOSPITALITY', SPONSOR_LOUNGE: 'HOSPITALITY', EVENT_SPACE: 'HOSPITALITY', MERCHANDISE_STORE: 'COMMERCIAL', HOSPITALITY_AREA: 'HOSPITALITY',
  ACADEMY_GYM: 'ACADEMY', ACADEMY_LOCKER_ROOM: 'ACADEMY', ACADEMY_OFFICE: 'ACADEMY', CLASSROOM: 'ACADEMY', STUDY_ROOM: 'ACADEMY',
  DORMITORY: 'RESIDENTIAL', DORMITORY_ROOM: 'RESIDENTIAL', PLAYER_ROOM: 'RESIDENTIAL', STAFF_ROOM: 'RESIDENTIAL', DINING_HALL: 'RESIDENTIAL', COMMON_AREA: 'RESIDENTIAL',
  STORAGE: 'LOGISTICS', EQUIPMENT_STORAGE: 'LOGISTICS', LOADING_AREA: 'LOGISTICS', WAREHOUSE: 'LOGISTICS', MAINTENANCE_AREA: 'LOGISTICS', PARKING: 'TRANSPORT', TEAM_BUS_AREA: 'TRANSPORT',
  OTHER: 'OTHER',
}

export function componentCategory(type: FacilityComponentType): FacilityComponentCategory {
  return FACILITY_COMPONENT_TYPE_CATEGORY[type]
}

export const FACILITY_COMPONENT_STATUSES = ['PLANNED', 'ACTIVE', 'CLOSED'] as const
export type FacilityComponentStatus = (typeof FACILITY_COMPONENT_STATUSES)[number]

/**
 * Physical part of a Facility. Composition, not a mega-interface: `specification` is the opt-in
 * richer layer (court dimensions, capacity semantics) for components where it has clear future
 * utility; most components (an office, a storage room) need nothing beyond type/status/capacity.
 *
 * `parentComponentId` supports an optional, shallow-by-convention hierarchy (e.g. a Performance
 * Center component containing a Recovery Area component containing a Cold Tub component) without
 * forcing every component into a tree — a component with no parent is a root component.
 *
 * `equipmentTags` is the minimal seam for a future Equipment system (CFI4+): free-form but
 * validated non-empty strings identifying notable equipment this component is known to host (e.g.
 * `'MRI'`, `'FORCE_PLATES'`, `'SHOT_TRACKING_CAMERAS'`). CFI3 deliberately does not model Equipment
 * as its own entity — that would be significant scope beyond "what exists" — but this keeps the
 * seam open so a real Equipment domain can attach to specific components later without a
 * `FacilityComponent` schema change.
 */
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
  readonly parentComponentId: FacilityComponentId | null
  readonly specification: FacilityComponentSpecification | null
  readonly equipmentTags: readonly string[]
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
  readonly parentComponentId?: FacilityComponentId | string | null
  readonly specification?: CreateFacilityComponentSpecificationInput | FacilityComponentSpecification | null
  readonly equipmentTags?: readonly string[]
}

export function createFacilityComponent(input: CreateFacilityComponentInput): FacilityComponent {
  const id = facilityComponentIdFromString(input.id)
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
  const parentComponentId = input.parentComponentId === undefined || input.parentComponentId === null ? null : facilityComponentIdFromString(input.parentComponentId)
  if (parentComponentId !== null && parentComponentId === id) throw new RangeError('Facility component cannot be its own parent')
  const specification = input.specification === undefined || input.specification === null ? null : ('kind' in input.specification ? createFacilityComponentSpecification(input.specification as CreateFacilityComponentSpecificationInput) : input.specification)
  const equipmentTags = input.equipmentTags ?? []
  for (const tag of equipmentTags) requireNonEmptyString(tag, 'Facility component equipment tag')
  if (new Set(equipmentTags).size !== equipmentTags.length) throw new RangeError('Facility component equipment tags must not contain duplicates')
  return Object.freeze({
    id,
    facilityId: facilityIdFromString(input.facilityId),
    type: input.type,
    name: input.name === undefined || input.name === null ? null : requireNonEmptyString(input.name, 'Facility component name'),
    status: input.status,
    capacity,
    quantity,
    openedAt,
    closedAt,
    parentComponentId,
    specification,
    equipmentTags: Object.freeze([...equipmentTags]),
  })
}

function nonNegativeIntegerOrNull(value: number | null | undefined, label: string): number | null {
  if (value === undefined || value === null) return null
  if (!Number.isInteger(value) || value < 0) throw new RangeError(`${label} must be a non-negative integer or null`)
  return value
}

/**
 * Every component of a Facility that is currently ACTIVE and, if temporally bounded, open at the
 * given date. Lives here (rather than in `FacilityQueries.ts`) so both the query layer and the
 * derived-capability layer (`FacilityComponentCapability.ts`) can depend on it without a circular
 * module dependency; `FacilityQueries.ts` re-exports this under the same name it has always had.
 */
export function activeFacilityComponentsAt(components: readonly FacilityComponent[], facilityId: FacilityId, onDate: GameDate): readonly FacilityComponent[] {
  return components
    .filter((component) => component.facilityId === facilityId)
    .filter((component) => {
      if (component.openedAt !== null && component.openedAt > onDate) return false
      if (component.closedAt !== null && component.closedAt <= onDate) return false
      return component.status !== 'CLOSED'
    })
    .sort((a, b) => a.id.localeCompare(b.id))
}

export { FACILITY_COMPONENT_CATEGORIES, isFacilityComponentCategory, type FacilityComponentCategory }
