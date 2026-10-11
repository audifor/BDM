/*
 * BS ALL FINAL INTEGRATION — the compacted sporting-operation evidence decides exactly what the full evidence decided.
 *
 * With BDM_GAME_BALANCE_V1 every club owns a facility, so the full evidence listed every court in the world (NO_ACCESS) on every
 * Training attempt. The resolver now records only usable resources (or, when none exists, the denied ones that explain the block).
 * The reference below is the pre-compaction resolver, verbatim.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createConfiguredGame } from '@/app/game/createConfiguredGame'
import { addDays, type GameDate } from '@/domain/date'
import { componentTypeSupportsCapability, componentSupportsCapability } from '@/domain/facilities/FacilityComponentCapability'
import type { SportingPhysicalAttempt, SportingPhysicalRequirement, PhysicalResourceEvidence } from '@/domain/facilities/SportingOperationPhysical'
import type { TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { advanceDayWithTrace } from '@/engine/calendar'
import { componentPhysicalAvailabilityAt } from '@/engine/facilities/FacilityPhysicalOperations'
import { resolveSportingOperation } from './SportingOperationResolver'

vi.setConfig({ testTimeout: 900_000, hookTimeout: 900_000 })

function referenceResolveSportingOperation(world: GameWorld, input: {
  readonly teamId: TeamId
  readonly date: GameDate
  readonly operationId: string
  readonly requirements: readonly SportingPhysicalRequirement[]
  readonly interval?: { readonly startTime: string; readonly durationMinutes: number }
  /** An explicitly chosen resource; alternatives remain a consumer choice. */
  readonly componentId?: string
  readonly demand?: { readonly amount: number; readonly unit: string }
}): SportingPhysicalAttempt {
  const resources: PhysicalResourceEvidence[] = []
  const statuses = input.requirements.map((requirement) => {
    const candidates = Object.values(world.facilityComponentsById).filter(component => input.componentId === undefined || component.id === input.componentId).sort((a, b) => a.id.localeCompare(b.id)).flatMap((component) => {
      const capability = requirement.capabilities.find((value) => componentTypeSupportsCapability(component.type, value)) ?? (input.componentId === component.id ? requirement.capabilities[0] : undefined)
      if (capability === undefined) return []
      const physical = componentPhysicalAvailabilityAt(world, component.id, input.date, input.teamId)
      const specification = component.specification
      const incompatible = !componentSupportsCapability(component, capability) || requirement.fullCourt === true && specification?.kind === 'COURT' && !specification.isFullCourt
      const unknownCourt = requirement.fullCourt === true && specification?.kind !== 'COURT'
      const status = !physical.access || physical.status === 'OUT_OF_SERVICE' || incompatible ? 'VERIFIED_UNAVAILABLE'
        : physical.status === 'UNKNOWN' || unknownCourt ? 'UNVERIFIED_PHYSICAL_CONTEXT'
          : physical.status === 'LIMITED' ? 'VERIFIED_LIMITED' : 'VERIFIED_AVAILABLE'
      return [{ facilityId: component.facilityId, componentId: component.id, capability, status,
        reason: !physical.access ? 'NO_ACCESS' : physical.affectedProjectIds.length > 0 ? 'PHYSICAL_WORK' : physical.status === 'OUT_OF_SERVICE' ? 'OUT_OF_SERVICE' : incompatible ? !componentTypeSupportsCapability(component.type, capability) ? 'INCOMPATIBLE_CAPABILITY' : 'INCOMPATIBLE_COURT' : status === 'UNVERIFIED_PHYSICAL_CONTEXT' ? 'UNKNOWN_PHYSICAL_SPECIFICATION' : status === 'VERIFIED_LIMITED' ? 'LIMITED_COMPATIBLE' : 'AVAILABLE',
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


const REQUIREMENT_SETS: readonly (readonly SportingPhysicalRequirement[])[] = [
  [], [{ capabilities: ['BASKETBALL_TRAINING'] }] as never, [{ capabilities: ['BASKETBALL_TRAINING'], fullCourt: true }] as never,
  [{ capabilities: ['STRENGTH_TRAINING'] }] as never, [{ capabilities: ['PHYSIOTHERAPY'] }] as never,
]

describe('compacted sporting-operation evidence', () => {
  let worlds: GameWorld[]
  beforeAll(() => {
    let world = createConfiguredGame({ universeId: 'prototype' })
    worlds = [world]
    for (let day = 1; day <= 45; day += 1) { world = advanceDayWithTrace(world).world; if (day % 15 === 0) worlds.push(world) }
  })

  it('keeps every status and keeps exactly the usable resources (or the denied ones when nothing is usable)', () => {
    let compared = 0
    let compacted = 0
    for (const world of worlds) {
      for (const teamId of Object.keys(world.teams).sort() as TeamId[]) {
        for (const offset of [0, 10]) {
          const date = addDays(world.currentDate, offset) as GameDate
          for (const requirements of REQUIREMENT_SETS) {
            const input = { teamId, date, operationId: 'equivalence', requirements }
            const reference = referenceResolveSportingOperation(world, input)
            const actual = resolveSportingOperation(world, input)
            expect(actual.status, `${teamId} ${date}`).toBe(reference.status)
            const usable = reference.resources.filter((resource) => resource.hasAccess)
            expect(actual.resources).toEqual(usable.length > 0 ? usable : reference.resources)
            if (actual.resources.length < reference.resources.length) compacted += 1
            compared += 1
          }
        }
        const componentId = Object.keys(world.facilityComponentsById).sort()[0]!
        const single = { teamId, date: world.currentDate, operationId: 'equivalence', requirements: REQUIREMENT_SETS[1]!, componentId }
        expect(resolveSportingOperation(world, single)).toEqual(referenceResolveSportingOperation(world, single))
      }
    }
    expect(compared).toBeGreaterThan(1_000)
    expect(compacted).toBeGreaterThan(0)
  })
})
