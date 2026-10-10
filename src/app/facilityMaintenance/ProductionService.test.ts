import { describe, expect, it, vi } from 'vitest'
import { createConfiguredGame } from '@/app/game/createConfiguredGame'
import { componentConditionAt } from '@/domain/facilities'
import { facilityEconomyRecordsOfKind } from '@/domain/facilityEconomy'
import type { GameWorld } from '@/domain/world'
import { advanceDayWithTrace, getUserTeam } from '@/engine/calendar'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { executeFacilityMaintenanceUiCommand, type FacilityMaintenanceUiCommand } from './FacilityMaintenanceUiCommands'
import { buildFacilityServiceOperationView, buildFacilityServiceRows } from './FacilityServiceReadModel'
import { serviceFactId } from './FacilityServiceCommands'

vi.setConfig({ testTimeout: 900_000, hookTimeout: 900_000 })
const SAVED_AT = '2033-03-01T00:00:00.000Z'

function advance(world: GameWorld, days: number): GameWorld {
  let current = world
  for (let i = 0; i < days; i += 1) current = advanceDayWithTrace(current).world
  return current
}

describe('BS17E-C: a recurring conservation service is playable from a new game', () => {
  it('is proposed, approved, signed, billed once per period, restores components, can be terminated and survives Save', () => {
    let world = createConfiguredGame({ universeId: 'prototype' })
    const team = getUserTeam(world)!
    const act = (command: FacilityMaintenanceUiCommand) => {
      const result = executeFacilityMaintenanceUiCommand(world, team.id, command)
      expect(result.status, JSON.stringify([command.kind, result.reasons, result.canonicalReasons])).toBe('APPLIED')
      world = result.world
      return result
    }
    // Owning a facility never creates a recurring charge.
    expect(facilityEconomyRecordsOfKind(world, 'SERVICE_OFFER')).toHaveLength(0)
    expect(Object.keys(world.operatingCostFactsById).filter((id) => id.includes('facility-service'))).toHaveLength(0)

    const row = buildFacilityServiceRows(world, team.id)[0]!
    expect(row.option.eligible).toBe(true)
    const operationId = act({ kind: 'SERVICE_OPEN', facilityId: row.option.facilityId }).operationId!
    act({ kind: 'SERVICE_REQUEST_OFFERS', operationId })
    let view = buildFacilityServiceOperationView(world, team.id, operationId)!
    expect(view.offers).toHaveLength(3)
    expect(view.contract).toBeNull()
    const cheapest = [...view.offers].sort((a, b) => a.amountPerPeriodMinorUnits - b.amountPerPeriodMinorUnits)[0]!
    act({ kind: 'SERVICE_SELECT_OFFER', operationId, offerId: cheapest.offerId })
    act({ kind: 'SERVICE_REQUEST_APPROVAL', operationId })
    expect(executeFacilityMaintenanceUiCommand(world, team.id, { kind: 'SERVICE_SIGN', operationId }).reasons).toEqual(['DECISION_NOT_APPROVED'])
    world = advance(world, 1)
    view = buildFacilityServiceOperationView(world, team.id, operationId)!
    expect(view.governance.state).toBe('APPROVED')
    act({ kind: 'SERVICE_SIGN', operationId })
    const signedOn = world.currentDate
    view = buildFacilityServiceOperationView(world, team.id, operationId)!
    expect(view.stage).toBe('CONTRACTED')
    expect(view.contract).toMatchObject({ startsOn: signedOn, termPeriods: 12, amountPerPeriodMinorUnits: cheapest.amountPerPeriodMinorUnits })

    // Period 0 is processed by the Calendar on the next day, exactly once.
    const conditionTotal = (w: GameWorld) => Object.values(w.facilityComponentsById).reduce((sum, c) => sum + (componentConditionAt(Object.values(w.facilityComponentConditionRecordsById), c.id, w.currentDate)?.physicalCondition ?? 0), 0)
    const before = conditionTotal(world)
    world = advance(world, 1)
    view = buildFacilityServiceOperationView(world, team.id, operationId)!
    expect(view.periods.processed).toBe(1)
    expect(world.operatingCostFactsById[serviceFactId(operationId, 0) as never]).toBeDefined()
    expect(conditionTotal(world)).toBeGreaterThan(before)
    world = advance(world, 5)
    expect(buildFacilityServiceOperationView(world, team.id, operationId)!.periods.processed).toBe(1)

    // Save/reload never renews or duplicates.
    const reloaded = deserializeGameWorldV4(serializeGameWorldV4(world, SAVED_AT))
    expect(buildFacilityServiceOperationView(reloaded, team.id, operationId)!.periods.processed).toBe(1)
    expect(Object.keys(reloaded.operatingCostFactsById).filter((id) => id.includes('facility-service'))).toHaveLength(1)

    // Period 1 falls due 30 days after the signature.
    world = advance(reloaded, 30)
    view = buildFacilityServiceOperationView(world, team.id, operationId)!
    expect(view.periods.processed).toBe(2)
    expect(view.periods.billedMinorUnits).toBe(2 * cheapest.amountPerPeriodMinorUnits)
    expect(Object.keys(world.operatingCostFactsById).filter((id) => id.includes('facility-service'))).toHaveLength(2)

    // Termination takes effect after the notice, never earlier, and billing stops.
    act({ kind: 'SERVICE_TERMINATE', operationId })
    view = buildFacilityServiceOperationView(world, team.id, operationId)!
    expect(view.contract!.terminationNoticedEffectiveOn).not.toBeNull()
    world = advance(world, 35)
    view = buildFacilityServiceOperationView(world, team.id, operationId)!
    expect(view.contract!.ended).toBe(true)
    expect(view.periods.processed).toBe(3)
    const factsAtEnd = Object.keys(world.operatingCostFactsById).filter((id) => id.includes('facility-service')).length
    world = advance(world, 60)
    expect(Object.keys(world.operatingCostFactsById).filter((id) => id.includes('facility-service'))).toHaveLength(factsAtEnd)
  })
})
