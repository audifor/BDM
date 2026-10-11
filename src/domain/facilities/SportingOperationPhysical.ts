import type { FacilityComponentCapability } from './FacilityComponentCapability'

export const PHYSICAL_OPERATION_STATUSES = ['VERIFIED_AVAILABLE', 'VERIFIED_LIMITED', 'VERIFIED_UNAVAILABLE', 'UNVERIFIED_PHYSICAL_CONTEXT', 'NOT_REQUIRED'] as const
export type PhysicalOperationStatus = typeof PHYSICAL_OPERATION_STATUSES[number]
export interface SportingPhysicalRequirement {
  /** Alternatives in this list must represent the same material operation. */
  readonly capabilities: readonly FacilityComponentCapability[]
  readonly fullCourt?: boolean
}
export interface PhysicalResourceEvidence {
  readonly facilityId: string
  readonly componentId: string
  readonly capability: FacilityComponentCapability
  readonly status: PhysicalOperationStatus
  readonly reason: string
  readonly hasAccess: boolean
  readonly nominalCapacity: number | null
  readonly capacityUnit: string | null
  readonly operationalCapacity: null
}
/** A historical execution attempt, not a persisted current Facilities projection. */
export interface SportingPhysicalAttempt {
  readonly policyVersion: 'BS17D-P0-v1'
  readonly attemptedOn: string
  readonly operationId: string
  readonly status: PhysicalOperationStatus
  readonly resources: readonly PhysicalResourceEvidence[]
}
