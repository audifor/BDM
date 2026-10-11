import { describe, expect, it, vi } from 'vitest'
import { createNewGame } from '@/app/game'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { getPayableSettledAmount } from '@/domain/finance'
import {
  completeFacilityMaintenanceWork, openFacilityMaintenanceProposal, recordFacilityMaintenanceDecisionEvent, registerFacilityEconomyRecord, requestFacilityMaintenanceDecision,
  reserveAndContractFacilityMaintenance, selectFacilityMaintenanceOffer, startFacilityMaintenanceWork,
} from './FacilityMaintenanceCommands'
import { FM_BOARD, advance, createFacilityMaintenanceScenario, inspectionFor, must } from './testFixtures'
import { buildFacilityMaintenanceNeedRows, buildFacilityMaintenanceOperationView } from './FacilityMaintenanceReadModel'

const SAVED_AT = '2033-01-01T00:00:00.000Z'

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 })

describe('BS17E-A authorized maintenance & repair: end to end from production commands', () => {
  it('runs source -> offer -> Governance -> Finance -> work -> recognition -> payable -> settlement, and survives Save at every point', () => {
    const s = createFacilityMaintenanceScenario()
    let world: GameWorld = must(registerFacilityEconomyRecord(s.world, s.provider))
    world = must(registerFacilityEconomyRecord(world, s.offer))
    const opened = openFacilityMaintenanceProposal(world, { teamId: s.teamId, needId: s.needId, interventionType: 'REPAIR' })
    const operationId = opened.operationId!
    world = must(selectFacilityMaintenanceOffer(opened.world, { teamId: s.teamId, operationId, offerId: s.offerId }))
    const requested = requestFacilityMaintenanceDecision(world, { teamId: s.teamId, operationId })
    world = must(recordFacilityMaintenanceDecisionEvent(must(requested), { teamId: s.teamId, decisionId: requested.decisionId!, kind: 'APPROVED', bodyId: FM_BOARD }))
    world = must(reserveAndContractFacilityMaintenance(world, { teamId: s.teamId, operationId }))
    world = must(startFacilityMaintenanceWork(world, { teamId: s.teamId, operationId }))
    world = advance(world, 1)
    const inspection = inspectionFor(s, 'inspection:fm:e2e', world.currentDate)
    world = updateGameWorld(world, { facilityInspections: [...Object.values(world.facilityInspectionsById), inspection] })
    world = must(completeFacilityMaintenanceWork(world, { teamId: s.teamId, operationId, inspectionId: inspection.id }))
    const midflow = deserializeGameWorldV4(serializeGameWorldV4(world, SAVED_AT))
    world = advance(midflow, 1)
    const view = buildFacilityMaintenanceOperationView(world, s.teamId, operationId)!
    expect(view.economics.state).toBe('PAYABLE')
    world = advance(world, 31)
    const settled = buildFacilityMaintenanceOperationView(world, s.teamId, operationId)!
    expect(settled.economics).toMatchObject({ state: 'SETTLED', settledMinorUnits: s.offer.amount.minorUnits, outstandingMinorUnits: 0 })
    expect(getPayableSettledAmount(world, settled.economics.payableId!).minorUnits).toBe(s.offer.amount.minorUnits)
    expect(settled.stage).toBe('WORK_COMPLETED')
    expect(settled.history.map((event) => event.kind)).toEqual(['PROPOSAL_CREATED', 'OFFER_SELECTED', 'APPROVAL_REQUESTED', 'FUNDS_RESERVED', 'CONTRACT_ACCEPTED', 'WORK_STARTED', 'WORK_COMPLETED', 'COST_FACT_AUTHORIZED'])
    const reloaded = deserializeGameWorldV4(serializeGameWorldV4(world, SAVED_AT))
    expect(buildFacilityMaintenanceOperationView(reloaded, s.teamId, operationId)).toEqual(settled)
    expect(buildFacilityMaintenanceNeedRows(reloaded, s.teamId).find((row) => row.needId === s.needId)!.needStatus).toBe('COMPLETED')
  }, 180_000)

  it('production reachability: the shipped universe has no need, institution, FACILITY authorization or sourced cost, so no operation can be started there', () => {
    const shipped = createNewGame()
    const team = Object.values(shipped.teams).find((item) => item.coachId === shipped.userCoachId)!
    expect(buildFacilityMaintenanceNeedRows(shipped, team.id)).toHaveLength(0)
    expect(openFacilityMaintenanceProposal(shipped, { teamId: team.id, needId: 'need:anything', interventionType: 'REPAIR' }).reasons).toEqual(['NEED_NOT_FOUND'])
    expect(Object.keys(shipped.governanceInstitutionsById)).toHaveLength(0)
    expect(Object.values(shipped.budgetLinesById).some((line) => line.category === 'FACILITY')).toBe(false)
  }, 60_000)
})
