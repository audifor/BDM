import { parseGameDate, type GameDate } from '@/domain/date'
import { facilityComponentIdFromString, facilityIdFromString, facilityInspectionIdFromString, facilityMaintenanceNeedIdFromString, type FacilityComponentId, type FacilityId, type FacilityInspectionId, type FacilityMaintenanceNeedId } from '@/domain/ids'
import type { FacilityServiceability } from './FacilityCondition'

/**
 * A lightweight observation/operation, never a regulatory license or homologation act (that
 * remains `FacilityCompetitionApproval`'s and a future regulatory layer's domain). An inspection
 * records what was found on a given date and, when relevant, what it produced: nothing (`NO_ISSUE`),
 * a new maintenance need it opened, an observed condition update, and/or a serviceability
 * restriction it identified. `producedNeedId` cross-references the need it opened (if any) rather
 * than duplicating the need's own fields here.
 */
export const FACILITY_INSPECTION_FINDINGS = ['NO_ISSUE', 'MAINTENANCE_NEED_IDENTIFIED', 'SERVICEABILITY_RESTRICTION_IDENTIFIED'] as const
export type FacilityInspectionFinding = (typeof FACILITY_INSPECTION_FINDINGS)[number]

export function isFacilityInspectionFinding(value: unknown): value is FacilityInspectionFinding {
  return typeof value === 'string' && (FACILITY_INSPECTION_FINDINGS as readonly string[]).includes(value)
}

export interface FacilityInspection {
  readonly id: FacilityInspectionId
  readonly facilityId: FacilityId
  readonly componentId: FacilityComponentId | null
  readonly inspectedAt: GameDate
  readonly finding: FacilityInspectionFinding
  readonly observedCondition: number | null
  readonly observedServiceability: FacilityServiceability | null
  readonly producedNeedId: FacilityMaintenanceNeedId | null
}

export interface CreateFacilityInspectionInput {
  readonly id: FacilityInspectionId | string
  readonly facilityId: FacilityId | string
  readonly componentId?: FacilityComponentId | string | null
  readonly inspectedAt: GameDate | string
  readonly finding: FacilityInspectionFinding
  readonly observedCondition?: number | null
  readonly observedServiceability?: FacilityServiceability | null
  readonly producedNeedId?: FacilityMaintenanceNeedId | string | null
}

export function createFacilityInspection(input: CreateFacilityInspectionInput): FacilityInspection {
  if (!isFacilityInspectionFinding(input.finding)) throw new TypeError(`Facility inspection finding is invalid: ${String(input.finding)}`)
  const observedCondition = input.observedCondition === undefined || input.observedCondition === null ? null : input.observedCondition
  if (observedCondition !== null && (!Number.isFinite(observedCondition) || observedCondition < 0 || observedCondition > 100)) {
    throw new RangeError('Facility inspection observedCondition must be null or between 0 and 100')
  }
  if (input.finding === 'MAINTENANCE_NEED_IDENTIFIED' && (input.producedNeedId === undefined || input.producedNeedId === null)) {
    throw new RangeError('Facility inspection finding MAINTENANCE_NEED_IDENTIFIED requires a producedNeedId')
  }
  if (input.finding !== 'MAINTENANCE_NEED_IDENTIFIED' && input.producedNeedId !== undefined && input.producedNeedId !== null) {
    throw new RangeError('Facility inspection producedNeedId is only valid for finding MAINTENANCE_NEED_IDENTIFIED')
  }
  return Object.freeze({
    id: facilityInspectionIdFromString(input.id),
    facilityId: facilityIdFromString(input.facilityId),
    componentId: input.componentId === undefined || input.componentId === null ? null : facilityComponentIdFromString(input.componentId),
    inspectedAt: parseGameDate(input.inspectedAt),
    finding: input.finding,
    observedCondition,
    observedServiceability: input.observedServiceability === undefined || input.observedServiceability === null ? null : input.observedServiceability,
    producedNeedId: input.producedNeedId === undefined || input.producedNeedId === null ? null : facilityMaintenanceNeedIdFromString(input.producedNeedId),
  })
}
