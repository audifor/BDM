import { describe, expect, it, vi } from 'vitest'
import { createConfiguredGame } from '@/app/game/createConfiguredGame'
import { componentConditionAt } from '@/domain/facilities'
import { getCashBalancesByCurrency } from '@/domain/finance'
import type { GameWorld } from '@/domain/world'
import { advanceDayWithTrace, getUserTeam } from '@/engine/calendar'
import { componentPhysicalAvailabilityAt } from '@/engine/facilities/FacilityPhysicalOperations'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { buildFacilityMaintenanceNeedRows, buildFacilityMaintenanceOperationView } from './FacilityMaintenanceReadModel'
import { executeFacilityMaintenanceUiCommand, type FacilityMaintenanceUiCommand } from './FacilityMaintenanceUiCommands'

vi.setConfig({ testTimeout: 900_000, hookTimeout: 900_000 })
const SAVED_AT = '2033-03-01T00:00:00.000Z'

function advance(world: GameWorld, days: number): GameWorld {
  let current = world
  for (let i = 0; i < days; i += 1) current = advanceDayWithTrace(current).world
  return current
}

describe('BS17E-A FINAL: maintenance is playable from a new game, with no hand-built data', () => {
  it('need -> offers -> proposal -> Board -> Finance -> work -> physical consequence -> recognition -> payment -> Save, from the production new-game entry', () => {
    let world = createConfiguredGame({ universeId: 'prototype' })
    const team = getUserTeam(world)!
    const organizationId = String(team.organizationId)
    const act = (command: FacilityMaintenanceUiCommand) => {
      const result = executeFacilityMaintenanceUiCommand(world, team.id, command)
      expect(result.status, JSON.stringify([command.kind, result.reasons, result.canonicalReasons])).toBe('APPLIED')
      world = result.world
      return result
    }
    const cash = () => getCashBalancesByCurrency(world, organizationId as never, world.currentDate).reduce((sum, row) => sum + row.totalCashMinorUnits, 0)

    // The shipped new game now carries a simulated club economy and facility: nothing is inserted by this test.
    expect(cash()).toBeGreaterThan(0)
    expect(buildFacilityMaintenanceNeedRows(world, team.id).length).toBeGreaterThanOrEqual(0)

    // 1. Real deterioration, processed by the Calendar, opens a real need.
    let needId: string | undefined
    for (let day = 0; day < 150 && needId === undefined; day += 1) {
      world = advance(world, 1)
      needId = buildFacilityMaintenanceNeedRows(world, team.id).find((row) => row.needStatus === 'OPEN' && row.active === null)?.needId
    }
    expect(needId, 'the first season produces a real maintenance need for the user club').toBeDefined()
    const need = world.facilityMaintenanceNeedsById[needId as never]!
    const componentId = need.componentId!
    const conditionBefore = componentConditionAt(Object.values(world.facilityComponentConditionRecordsById), componentId, world.currentDate)!.physicalCondition!

    // 2. Manager flow: proposal, quotes, choice.
    const opened = act({ kind: 'OPEN_PROPOSAL', needId: needId!, interventionType: 'REPAIR' })
    const operationId = opened.operationId!
    expect(buildFacilityMaintenanceOperationView(world, team.id, operationId)!.cost.status).toBe('UNKNOWN_COST')
    act({ kind: 'REQUEST_OFFERS', operationId })
    let view = buildFacilityMaintenanceOperationView(world, team.id, operationId)!
    expect(view.offers.length).toBeGreaterThanOrEqual(3)
    expect(view.offers.every((offer) => offer.providerIdentity === 'SYNTHETIC_SIMULATED' && offer.sourceKind === 'SIMULATED_MODEL')).toBe(true)
    expect(new Set(view.offers.map((offer) => offer.amountMinorUnits)).size).toBeGreaterThan(1)
    const cheapest = [...view.offers].sort((a, b) => a.amountMinorUnits - b.amountMinorUnits || a.offerId.localeCompare(b.offerId)).find((offer) => offer.blockedReason === null)!
    act({ kind: 'SELECT_OFFER', operationId, offerId: cheapest.offerId })
    // Quotes are persisted: asking again changes nothing.
    expect(executeFacilityMaintenanceUiCommand(world, team.id, { kind: 'REQUEST_OFFERS', operationId }).status).toBe('NO_CHANGE')

    // 3. Governance: the manager proposes; the simulated Board decides on the next day.
    act({ kind: 'REQUEST_APPROVAL', operationId })
    view = buildFacilityMaintenanceOperationView(world, team.id, operationId)!
    expect(view.governance.state).toBe('PENDING')
    expect(view.actions.find((action) => action.id === 'APPROVE')?.enabled).toBe(false)
    expect(view.actions.find((action) => action.id === 'RESERVE_AND_CONTRACT')?.enabled).toBe(false)
    world = advance(world, 1)
    view = buildFacilityMaintenanceOperationView(world, team.id, operationId)!
    expect(view.governance.state).toBe('APPROVED')

    // 4. Finance gate and contract, then physical work.
    const cashBeforeWork = cash()
    act({ kind: 'RESERVE_AND_CONTRACT', operationId })
    expect(cash()).toBe(cashBeforeWork)
    act({ kind: 'START_WORK', operationId })
    expect(componentPhysicalAvailabilityAt(world, componentId, world.currentDate).status).toBe('OUT_OF_SERVICE')

    // 5. The contract's own execution window gates acceptance; the Calendar passes the days.
    const earlyAcceptance = executeFacilityMaintenanceUiCommand(world, team.id, { kind: 'COMPLETE_WORK', operationId })
    expect(earlyAcceptance.reasons).toEqual(['WORK_NOT_YET_COMPLETABLE'])
    world = advance(world, cheapest.executionDays!)
    expect(componentPhysicalAvailabilityAt(world, componentId, world.currentDate).status).toBe('OUT_OF_SERVICE')
    act({ kind: 'COMPLETE_WORK', operationId })
    const restored = componentConditionAt(Object.values(world.facilityComponentConditionRecordsById), componentId, world.currentDate)!
    expect(restored.physicalCondition).toBe(cheapest.resultingCondition)
    expect(restored.physicalCondition!).toBeGreaterThan(conditionBefore)
    expect(componentPhysicalAvailabilityAt(world, componentId, world.currentDate).status).not.toBe('OUT_OF_SERVICE')
    expect(world.facilityMaintenanceNeedsById[needId as never]!.status).toBe('COMPLETED')

    // 6. Physical completion is not payment: recognition and settlement come from the Calendar only.
    expect(Object.values(world.expenseRecognitionsById).filter((item) => item.category === 'FACILITY' && String(item.organizationId) === organizationId)).toHaveLength(0)
    expect(cash()).toBe(cashBeforeWork)
    world = advance(world, 1)
    view = buildFacilityMaintenanceOperationView(world, team.id, operationId)!
    expect(view.economics).toMatchObject({ state: 'PAYABLE', recognizedMinorUnits: cheapest.amountMinorUnits })

    // 7. Save/reload mid-flow, twice, then the remaining days pay it exactly once.
    const reloaded = deserializeGameWorldV4(serializeGameWorldV4(deserializeGameWorldV4(serializeGameWorldV4(world, SAVED_AT)), SAVED_AT))
    expect(buildFacilityMaintenanceOperationView(reloaded, team.id, operationId)).toEqual(view)
    world = advance(reloaded, 31)
    view = buildFacilityMaintenanceOperationView(world, team.id, operationId)!
    expect(view.economics).toMatchObject({ state: 'SETTLED', settledMinorUnits: cheapest.amountMinorUnits, outstandingMinorUnits: 0 })
    expect(cash()).toBe(cashBeforeWork - cheapest.amountMinorUnits)
    expect(Object.values(world.expenseRecognitionsById).filter((item) => item.category === 'FACILITY' && String(item.organizationId) === organizationId)).toHaveLength(1)
  })
})
