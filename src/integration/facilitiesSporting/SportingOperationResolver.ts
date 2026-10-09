import type { TeamId } from '@/domain/ids'
import type { GameDate } from '@/domain/date'
import type { GameWorld } from '@/domain/world'
import { componentTypeSupportsCapability, componentSupportsCapability } from '@/domain/facilities/FacilityComponentCapability'
import type { SportingPhysicalAttempt, SportingPhysicalRequirement, PhysicalResourceEvidence } from '@/domain/facilities/SportingOperationPhysical'
import { componentPhysicalAvailabilityAt } from '@/engine/facilities/FacilityPhysicalOperations'

/** CFI anatomy, rights and BS17C physical truth. This adapter never computes sporting effects. */
export function resolveSportingOperation(world: GameWorld, input: {
  readonly teamId: TeamId
  readonly date: GameDate
  readonly operationId: string
  readonly requirements: readonly SportingPhysicalRequirement[]
  readonly interval?: { readonly startTime: string; readonly durationMinutes: number }
  readonly demand?: { readonly amount: number; readonly unit: string }
}): SportingPhysicalAttempt {
  const resources: PhysicalResourceEvidence[] = []
  const statuses = input.requirements.map((requirement) => {
    const candidates = Object.values(world.facilityComponentsById).sort((a, b) => a.id.localeCompare(b.id)).flatMap((component) => {
      const capability = requirement.capabilities.find((value) => componentTypeSupportsCapability(component.type, value))
      if (capability === undefined) return []
      const physical = componentPhysicalAvailabilityAt(world, component.id, input.date, input.teamId)
      const specification = component.specification
      const incompatible = !componentSupportsCapability(component, capability) || requirement.fullCourt === true && specification?.kind === 'COURT' && !specification.isFullCourt
      const unknownCourt = requirement.fullCourt === true && specification?.kind !== 'COURT'
      const status = !physical.access || physical.status === 'OUT_OF_SERVICE' || incompatible ? 'VERIFIED_UNAVAILABLE'
        : physical.status === 'UNKNOWN' || unknownCourt ? 'UNVERIFIED_PHYSICAL_CONTEXT'
          : physical.status === 'LIMITED' ? 'VERIFIED_LIMITED' : 'VERIFIED_AVAILABLE'
      return [{ facilityId: component.facilityId, componentId: component.id, capability, status,
        reason: !physical.access ? 'NO_ACCESS' : physical.affectedProjectIds.length > 0 ? 'PHYSICAL_WORK' : physical.status === 'OUT_OF_SERVICE' ? 'OUT_OF_SERVICE' : incompatible ? 'INCOMPATIBLE_COURT' : status === 'UNVERIFIED_PHYSICAL_CONTEXT' ? 'UNKNOWN_PHYSICAL_SPECIFICATION' : status === 'VERIFIED_LIMITED' ? 'LIMITED_COMPATIBLE' : 'AVAILABLE',
        hasAccess: physical.access === true, nominalCapacity: physical.nominalCapacity, capacityUnit: physical.capacityUnit, operationalCapacity: null,
      } satisfies PhysicalResourceEvidence]
    })
    resources.push(...candidates)
    // Exhaust all legitimate alternatives before blocking. A known denied resource cannot be
    // made usable by the absence of additional data elsewhere in the world.
    if (candidates.some((c) => c.status === 'VERIFIED_AVAILABLE')) return 'VERIFIED_AVAILABLE'
    if (candidates.some((c) => c.status === 'VERIFIED_LIMITED')) return 'VERIFIED_LIMITED'
    if (candidates.length === 0 || candidates.some((c) => c.status === 'UNVERIFIED_PHYSICAL_CONTEXT')) return 'UNVERIFIED_PHYSICAL_CONTEXT'
    return 'VERIFIED_UNAVAILABLE'
  })
  const status = statuses.length === 0 ? 'NOT_REQUIRED' : statuses.includes('VERIFIED_UNAVAILABLE') ? 'VERIFIED_UNAVAILABLE'
    : statuses.includes('UNVERIFIED_PHYSICAL_CONTEXT') ? 'UNVERIFIED_PHYSICAL_CONTEXT'
      : statuses.includes('VERIFIED_LIMITED') ? 'VERIFIED_LIMITED' : 'VERIFIED_AVAILABLE'
  // No allocation authority exists for interval/demand yet. Nominal capacity cannot become
  // operational capacity or a reservation merely because those optional inputs are supplied.
  return { policyVersion: 'BS17D-P0-v1', attemptedOn: input.date, operationId: input.operationId, status, resources }
}
