import { parseGameDate, type GameDate } from '@/domain/date'
import { facilityComponentIdFromString, facilityIdFromString, facilityMaintenanceNeedIdFromString, facilityOperationalIncidentIdFromString, type FacilityComponentId, type FacilityId, type FacilityMaintenanceNeedId, type FacilityOperationalIncidentId } from '@/domain/ids'
import type { FacilityServiceability } from './FacilityCondition'

/**
 * A minimal seam for discrete physical/operational failures (plumbing, electrical, surface damage,
 * equipment failure, roof leak, ...), kept deliberately small: a category enum, what it affected,
 * when it happened, what it produced. CFI5 does not model root-cause diagnostics or a taxonomy of
 * failure modes beyond this coarse category — that level of detail can be added later without
 * breaking this shape. An incident never itself generates news/RPG content; it only optionally
 * cross-references the maintenance need it opened, exactly like `FacilityInspection`.
 */
export const FACILITY_OPERATIONAL_INCIDENT_CATEGORIES = ['PLUMBING', 'ELECTRICAL', 'STRUCTURAL', 'SURFACE_DAMAGE', 'EQUIPMENT_FAILURE', 'ENVELOPE_FAILURE', 'OTHER'] as const
export type FacilityOperationalIncidentCategory = (typeof FACILITY_OPERATIONAL_INCIDENT_CATEGORIES)[number]

export function isFacilityOperationalIncidentCategory(value: unknown): value is FacilityOperationalIncidentCategory {
  return typeof value === 'string' && (FACILITY_OPERATIONAL_INCIDENT_CATEGORIES as readonly string[]).includes(value)
}

export interface FacilityOperationalIncident {
  readonly id: FacilityOperationalIncidentId
  readonly facilityId: FacilityId
  readonly componentId: FacilityComponentId | null
  readonly category: FacilityOperationalIncidentCategory
  readonly occurredAt: GameDate
  readonly resultingServiceability: FacilityServiceability | null
  readonly producedNeedId: FacilityMaintenanceNeedId | null
}

export interface CreateFacilityOperationalIncidentInput {
  readonly id: FacilityOperationalIncidentId | string
  readonly facilityId: FacilityId | string
  readonly componentId?: FacilityComponentId | string | null
  readonly category: FacilityOperationalIncidentCategory
  readonly occurredAt: GameDate | string
  readonly resultingServiceability?: FacilityServiceability | null
  readonly producedNeedId?: FacilityMaintenanceNeedId | string | null
}

export function createFacilityOperationalIncident(input: CreateFacilityOperationalIncidentInput): FacilityOperationalIncident {
  if (!isFacilityOperationalIncidentCategory(input.category)) throw new TypeError(`Facility operational incident category is invalid: ${String(input.category)}`)
  return Object.freeze({
    id: facilityOperationalIncidentIdFromString(input.id),
    facilityId: facilityIdFromString(input.facilityId),
    componentId: input.componentId === undefined || input.componentId === null ? null : facilityComponentIdFromString(input.componentId),
    category: input.category,
    occurredAt: parseGameDate(input.occurredAt),
    resultingServiceability: input.resultingServiceability === undefined || input.resultingServiceability === null ? null : input.resultingServiceability,
    producedNeedId: input.producedNeedId === undefined || input.producedNeedId === null ? null : facilityMaintenanceNeedIdFromString(input.producedNeedId),
  })
}
