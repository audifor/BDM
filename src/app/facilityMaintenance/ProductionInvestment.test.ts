import { describe, expect, it, vi } from 'vitest'
import { createConfiguredGame } from '@/app/game/createConfiguredGame'
import { componentConditionAt } from '@/domain/facilities'
import { getCashBalancesByCurrency } from '@/domain/finance'
import type { GameWorld } from '@/domain/world'
import { advanceDayWithTrace, getUserTeam } from '@/engine/calendar'
import { componentPhysicalAvailabilityAt } from '@/engine/facilities/FacilityPhysicalOperations'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { buildFacilityInvestmentOperationView, buildFacilityInvestmentRows } from './FacilityInvestmentReadModel'
import { executeFacilityMaintenanceUiCommand, type FacilityMaintenanceUiCommand } from './FacilityMaintenanceUiCommands'

vi.setConfig({ testTimeout: 900_000, hookTimeout: 900_000 })
const SAVED_AT = '2033-03-01T00:00:00.000Z'

function advance(world: GameWorld, days: number): GameWorld {
  let current = world
  for (let i = 0; i < days; i += 1) current = advanceDayWithTrace(current).world
  return current
}

describe('BS17E-B: a capital renovation is playable from a new game', () => {
  it('detects the limitation, compares offers, is approved by the Board, is paid in two milestones, changes the court and survives Save', () => {
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
    const courtId = `bdm-balance-v1:component:${organizationId}:court`

    // 1. The physical limitation is visible and justifies the option; the cost is not invented.
    const row = buildFacilityInvestmentRows(world, team.id).find((item) => item.option.kind === 'RENOVATION' && item.option.componentId === courtId)!
    expect(row.option).toMatchObject({ eligible: true, reason: 'LIMITATION_DETECTED' })
    expect(row.openAction.enabled).toBe(true)
    const conditionBefore = componentConditionAt(Object.values(world.facilityComponentConditionRecordsById), courtId as never, world.currentDate)!.physicalCondition!
    expect(buildFacilityInvestmentRows(world, team.id).find((item) => item.option.kind === 'EXPANSION')!.option.eligible).toBe(true)

    // 2. Proposal, offers, choice.
    const operationId = act({ kind: 'INVEST_OPEN', facilityId: row.option.facilityId, investment: 'RENOVATION', componentId: courtId }).operationId!
    let view = buildFacilityInvestmentOperationView(world, team.id, operationId)!
    expect(view.cost.status).toBe('UNKNOWN_COST')
    expect(view.projectStatus).toBe('PLANNED')
    act({ kind: 'INVEST_REQUEST_OFFERS', operationId })
    view = buildFacilityInvestmentOperationView(world, team.id, operationId)!
    expect(view.offers.length).toBe(3)
    expect(new Set(view.offers.map((offer) => offer.executionDays)).size).toBe(3)
    const cheapest = [...view.offers].sort((a, b) => a.amountMinorUnits - b.amountMinorUnits)[0]!
    act({ kind: 'INVEST_SELECT_OFFER', operationId, offerId: cheapest.offerId })

    // 3. Capital decision: the Board decides the next day; funds are reserved per tranche.
    act({ kind: 'INVEST_REQUEST_APPROVAL', operationId })
    expect(executeFacilityMaintenanceUiCommand(world, team.id, { kind: 'INVEST_RESERVE', operationId }).reasons).toEqual(['DECISION_NOT_APPROVED'])
    world = advance(world, 1)
    view = buildFacilityInvestmentOperationView(world, team.id, operationId)!
    expect(view.governance.state).toBe('APPROVED')
    const cashBefore = cash()
    act({ kind: 'INVEST_RESERVE', operationId })
    view = buildFacilityInvestmentOperationView(world, team.id, operationId)!
    expect(view.funding).toMatchObject({ state: 'RESERVED', openReservations: 2 })
    expect(cash()).toBe(cashBefore)

    // 4. Works start: the first milestone is recognized by Finance, the court is occupied.
    act({ kind: 'INVEST_START', operationId })
    view = buildFacilityInvestmentOperationView(world, team.id, operationId)!
    expect(view.execution.state).toBe('IN_PROGRESS')
    expect(view.tranches.map((tranche) => tranche.state)).toEqual(['PAYABLE', 'NOT_DUE'])
    expect(view.tranches[0]!.amountMinorUnits).toBe(cheapest.amountMinorUnits * 0.3)
    expect(componentPhysicalAvailabilityAt(world, courtId as never, world.currentDate).status).toBe('OUT_OF_SERVICE')
    expect(executeFacilityMaintenanceUiCommand(world, team.id, { kind: 'INVEST_ACCEPT', operationId }).reasons).toEqual(['WORK_NOT_YET_COMPLETABLE'])
    expect(view.funding).toMatchObject({ openReservations: 1, consumedReservations: 1 })

    // 5. The contract duration passes; acceptance triggers the second milestone and the physical result.
    world = advance(world, cheapest.executionDays!)
    act({ kind: 'INVEST_ACCEPT', operationId })
    const restored = componentConditionAt(Object.values(world.facilityComponentConditionRecordsById), courtId as never, world.currentDate)!
    expect(restored.physicalCondition).toBe(96)
    expect(restored.physicalCondition!).toBeGreaterThan(conditionBefore)
    view = buildFacilityInvestmentOperationView(world, team.id, operationId)!
    expect(view.projectStatus).toBe('COMPLETED')
    // The mobilization milestone fell due 30 days after the works started and Treasury already paid it; acceptance adds the second payable.
    expect(view.tranches.map((tranche) => tranche.state)).toEqual(['SETTLED', 'PAYABLE'])
    const firstTranche = cheapest.amountMinorUnits * 0.3
    expect(view.economics).toMatchObject({ recognizedMinorUnits: cheapest.amountMinorUnits, owedMinorUnits: cheapest.amountMinorUnits - firstTranche, paidMinorUnits: firstTranche })
    expect(view.funding).toMatchObject({ openReservations: 0, consumedReservations: 2 })
    expect(cash()).toBe(cashBefore - firstTranche)
    expect(componentPhysicalAvailabilityAt(world, courtId as never, world.currentDate).status).not.toBe('OUT_OF_SERVICE')
    expect(executeFacilityMaintenanceUiCommand(world, team.id, { kind: 'INVEST_CANCEL', operationId }).reasons).toEqual(['ECONOMIC_FACTS_RECORDED_CANNOT_CANCEL'])

    // 6. Save/reload, then Treasury pays both payables once.
    const reloaded = deserializeGameWorldV4(serializeGameWorldV4(deserializeGameWorldV4(serializeGameWorldV4(world, SAVED_AT)), SAVED_AT))
    expect(buildFacilityInvestmentOperationView(reloaded, team.id, operationId)).toEqual(view)
    world = advance(reloaded, 31)
    view = buildFacilityInvestmentOperationView(world, team.id, operationId)!
    expect(view.tranches.map((tranche) => tranche.state)).toEqual(['SETTLED', 'SETTLED'])
    expect(view.economics).toMatchObject({ owedMinorUnits: 0, paidMinorUnits: cheapest.amountMinorUnits })
    expect(cash()).toBe(cashBefore - cheapest.amountMinorUnits)
    expect(Object.values(world.expenseRecognitionsById).filter((item) => item.category === 'FACILITY_DEVELOPMENT')).toHaveLength(2)
  })
})
