import { describe, expect, it, vi } from 'vitest'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { createFacilityInspection } from '@/domain/facilities'
import { componentPhysicalAvailabilityAt } from '@/engine/facilities/FacilityPhysicalOperations'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import {
  cancelFacilityMaintenanceOperation, openFacilityMaintenanceProposal, recordFacilityMaintenanceDecisionEvent, requestFacilityMaintenanceDecision, selectFacilityMaintenanceOffer,
  completeFacilityMaintenanceWork, startFacilityMaintenanceWork,
} from './FacilityMaintenanceCommands'
import { FM_BOARD, advance, approved, completed, contracted, createFacilityMaintenanceScenario, must, requested, working } from './testFixtures'
import { buildFacilityMaintenanceNeedRows, buildFacilityMaintenanceOperationView } from './FacilityMaintenanceReadModel'

const SAVED_AT = '2033-01-01T00:00:00.000Z'
const facilityReservations = (world: GameWorld) => Object.values(world.financialReservationsById).filter((r) => r.sourceAuthority === 'FACILITY')
const roundTrip = (world: GameWorld) => deserializeGameWorldV4(serializeGameWorldV4(world, SAVED_AT))

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 })

describe('BS17E-A cancellation matrix', () => {
  it('A. cancels a proposal with no cost: history kept, the need stays open', () => {
    const s = createFacilityMaintenanceScenario({ registerEvidence: true })
    const opened = openFacilityMaintenanceProposal(s.world, { teamId: s.teamId, needId: s.needId, interventionType: 'REPAIR' })
    const cancelled = must(cancelFacilityMaintenanceOperation(opened.world, { teamId: s.teamId, operationId: opened.operationId! }))
    const view = buildFacilityMaintenanceOperationView(cancelled, s.teamId, opened.operationId!)!
    expect(view.stage).toBe('CANCELLED')
    expect(view.history.map((event) => event.kind)).toEqual(['PROPOSAL_CREATED', 'CANCELLED'])
    expect(cancelled.facilityMaintenanceNeedsById[s.needId as never]!.status).toBe('OPEN')
    // A new attempt is a new operation; the cancelled one stays in history.
    const retry = openFacilityMaintenanceProposal(cancelled, { teamId: s.teamId, needId: s.needId, interventionType: 'REPAIR' })
    expect(retry.status).toBe('APPLIED')
    expect(retry.operationId).not.toBe(opened.operationId)
    expect(buildFacilityMaintenanceNeedRows(retry.world, s.teamId).find((row) => row.needId === s.needId)!.operations).toHaveLength(2)
  })

  it('withdraws a pending decision and cancels; the withdrawn decision stays as history', () => {
    const s = createFacilityMaintenanceScenario({ registerEvidence: true })
    const flow = requested(s)
    const cancelled = must(cancelFacilityMaintenanceOperation(flow.world, { teamId: s.teamId, operationId: flow.operationId }))
    const kinds = Object.values(cancelled.governanceDecisionEventsById).filter((event) => event.decisionId === flow.decisionId).map((event) => event.kind).sort()
    expect(kinds).toEqual(['PROPOSED', 'WITHDRAWN'])
    expect(cancelled.governanceDecisionsById[flow.decisionId!]).toBeDefined()
    expect(facilityReservations(cancelled)).toHaveLength(0)
  })

  it('B. after approval and before any contract, cancellation needs an approved linked cancellation decision; the original decision is untouched', () => {
    const s = createFacilityMaintenanceScenario({ registerEvidence: true })
    const flow = approved(s)
    expect(cancelFacilityMaintenanceOperation(flow.world, { teamId: s.teamId, operationId: flow.operationId })).toMatchObject({ status: 'BLOCKED', reasons: ['CANCELLATION_DECISION_REQUIRED'] })
    const asked = requestFacilityMaintenanceDecision(flow.world, { teamId: s.teamId, operationId: flow.operationId, purpose: 'CANCELLATION' })
    expect(asked.status).toBe('APPLIED')
    expect(asked.decisionId).not.toBe(flow.decisionId)
    expect(cancelFacilityMaintenanceOperation(asked.world, { teamId: s.teamId, operationId: flow.operationId }).reasons).toEqual(['CANCELLATION_DECISION_REQUIRED'])
    const decided = must(recordFacilityMaintenanceDecisionEvent(asked.world, { teamId: s.teamId, decisionId: asked.decisionId!, kind: 'APPROVED', bodyId: FM_BOARD }))
    const originalEventsBefore = Object.values(decided.governanceDecisionEventsById).filter((event) => event.decisionId === flow.decisionId)
    const cancelled = must(cancelFacilityMaintenanceOperation(decided, { teamId: s.teamId, operationId: flow.operationId }))
    expect(Object.values(cancelled.governanceDecisionEventsById).filter((event) => event.decisionId === flow.decisionId)).toEqual(originalEventsBefore)
    expect(buildFacilityMaintenanceOperationView(cancelled, s.teamId, flow.operationId)!.stage).toBe('CANCELLED')
  })

  it('a rejected cancellation decision leaves the approved operation alive', () => {
    const s = createFacilityMaintenanceScenario({ registerEvidence: true })
    const flow = approved(s)
    const asked = requestFacilityMaintenanceDecision(flow.world, { teamId: s.teamId, operationId: flow.operationId, purpose: 'CANCELLATION' })
    const rejected = must(recordFacilityMaintenanceDecisionEvent(asked.world, { teamId: s.teamId, decisionId: asked.decisionId!, kind: 'REJECTED', bodyId: FM_BOARD }))
    expect(cancelFacilityMaintenanceOperation(rejected, { teamId: s.teamId, operationId: flow.operationId }).reasons).toEqual(['CANCELLATION_DECISION_REQUIRED'])
  })

  it('C/D. cancelling with a reservation and an accepted contract releases only the open reservation and invents no penalty', () => {
    const s = createFacilityMaintenanceScenario({ registerEvidence: true })
    const flow = contracted(s)
    const asked = requestFacilityMaintenanceDecision(flow.world, { teamId: s.teamId, operationId: flow.operationId, purpose: 'CANCELLATION' })
    const decided = must(recordFacilityMaintenanceDecisionEvent(asked.world, { teamId: s.teamId, decisionId: asked.decisionId!, kind: 'APPROVED', bodyId: FM_BOARD }))
    const cancelled = must(cancelFacilityMaintenanceOperation(decided, { teamId: s.teamId, operationId: flow.operationId }))
    expect(facilityReservations(cancelled).map((reservation) => reservation.status)).toEqual(['RELEASED'])
    expect(Object.keys(cancelled.operatingCostFactsById)).toHaveLength(0)
    expect(Object.keys(cancelled.expenseRecognitionsById).filter((id) => id.includes('facility'))).toHaveLength(0)
    expect(Object.values(cancelled.financialCommitmentsById).filter((c) => c.category === 'FACILITY')).toHaveLength(0)
    const settled = advance(cancelled, 3)
    expect(Object.values(settled.expenseRecognitionsById).filter((e) => e.category === 'FACILITY')).toHaveLength(0)
  })

  it('E. cancelling after partial execution keeps the started action as history, reopens the need and recognizes nothing', () => {
    const s = createFacilityMaintenanceScenario({ registerEvidence: true })
    const flow = working(s)
    expect(flow.world.facilityMaintenanceNeedsById[s.needId as never]!.status).toBe('IN_PROGRESS')
    const asked = requestFacilityMaintenanceDecision(flow.world, { teamId: s.teamId, operationId: flow.operationId, purpose: 'CANCELLATION' })
    const decided = must(recordFacilityMaintenanceDecisionEvent(asked.world, { teamId: s.teamId, decisionId: asked.decisionId!, kind: 'APPROVED', bodyId: FM_BOARD }))
    const cancelled = must(cancelFacilityMaintenanceOperation(decided, { teamId: s.teamId, operationId: flow.operationId }))
    expect(cancelled.facilityMaintenanceNeedsById[s.needId as never]!.status).toBe('OPEN')
    const stopped = cancelled.facilityMaintenanceActionsById[`facility-maintenance-action:${flow.operationId}` as never]!
    expect(stopped).toMatchObject({ outcome: 'UNSUCCESSFUL', completedAt: cancelled.currentDate, resultingCondition: null })
    expect(componentPhysicalAvailabilityAt(flow.world, s.base.physioComponentId as never, flow.world.currentDate).status).toBe('OUT_OF_SERVICE')
    expect(componentPhysicalAvailabilityAt(cancelled, s.base.physioComponentId as never, cancelled.currentDate).status).not.toBe('OUT_OF_SERVICE')
    expect(facilityReservations(cancelled)[0]!.status).toBe('RELEASED')
    expect(Object.values(advance(cancelled, 3).expenseRecognitionsById).filter((e) => e.category === 'FACILITY')).toHaveLength(0)
  })

  it('F/G. after the cost is authorized, recognized, payable or settled, cancellation is refused and every Finance fact is preserved', () => {
    const s = createFacilityMaintenanceScenario({ registerEvidence: true })
    const done = completed(s)
    for (const days of [0, 1, 33]) {
      const world = advance(done.world, days)
      const before = { facts: world.operatingCostFactsById, expenses: world.expenseRecognitionsById, payables: world.payablesById, applications: world.treasuryApplicationsById, reservations: world.financialReservationsById }
      const refused = cancelFacilityMaintenanceOperation(world, { teamId: s.teamId, operationId: done.operationId })
      expect(refused).toMatchObject({ status: 'BLOCKED', reasons: ['ECONOMIC_FACTS_RECORDED_CANNOT_CANCEL'] })
      expect(requestFacilityMaintenanceDecision(world, { teamId: s.teamId, operationId: done.operationId, purpose: 'CANCELLATION' }).reasons).toEqual(['ECONOMIC_FACTS_RECORDED_CANNOT_CANCEL'])
      expect(refused.world).toBe(world)
      expect({ facts: world.operatingCostFactsById, expenses: world.expenseRecognitionsById, payables: world.payablesById, applications: world.treasuryApplicationsById, reservations: world.financialReservationsById }).toEqual(before)
    }
  })

  it('survives Save/reload after cancellation with the same history', () => {
    const s = createFacilityMaintenanceScenario({ registerEvidence: true })
    const flow = requested(s)
    const cancelled = must(cancelFacilityMaintenanceOperation(flow.world, { teamId: s.teamId, operationId: flow.operationId }))
    const reloaded = roundTrip(roundTrip(cancelled))
    expect(reloaded.facilityEconomyRecordsById).toEqual(cancelled.facilityEconomyRecordsById)
    expect(buildFacilityMaintenanceOperationView(reloaded, s.teamId, flow.operationId)!.stage).toBe('CANCELLED')
  })
})

describe('BS17E-A physical lifecycle, Save and Calendar', () => {
  it('restores the component condition from the real inspection and closes the need only on a successful outcome', () => {
    const s = createFacilityMaintenanceScenario({ registerEvidence: true })
    const done = completed(s)
    expect(done.world.facilityMaintenanceNeedsById[s.needId as never]).toMatchObject({ status: 'COMPLETED' })
    const records = Object.values(done.world.facilityComponentConditionRecordsById).filter((record) => record.componentId === (s.base.physioComponentId as never))
    expect(records.some((record) => record.physicalCondition === 90 && record.serviceability === 'FULL')).toBe(true)
    const action = done.world.facilityMaintenanceActionsById[`facility-maintenance-action:${done.operationId}` as never]!
    expect(action).toMatchObject({ outcome: 'SUCCESSFUL', resultingCondition: 90 })
  })

  it('leaves the need OPEN when the inspection finds an unresolved restriction (UNSUCCESSFUL), and still authorizes the cost of the work done', () => {
    const s = createFacilityMaintenanceScenario({ registerEvidence: true })
    const flow = working(s)
    let world = advance(flow.world, 1)
    const inspection = createFacilityInspection({ id: 'inspection:fm:restriction', facilityId: s.facilityId, componentId: s.base.physioComponentId, inspectedAt: world.currentDate, finding: 'SERVICEABILITY_RESTRICTION_IDENTIFIED', observedCondition: 40, observedServiceability: 'LIMITED' })
    world = updateGameWorld(world, { facilityInspections: [inspection] })
    world = must(completeFacilityMaintenanceWork(world, { teamId: s.teamId, operationId: flow.operationId, inspectionId: inspection.id }))
    expect(world.facilityMaintenanceActionsById[`facility-maintenance-action:${flow.operationId}` as never]).toMatchObject({ outcome: 'UNSUCCESSFUL', resultingCondition: 40, resultingServiceability: 'LIMITED' })
    expect(world.facilityMaintenanceNeedsById[s.needId as never]!.status).toBe('OPEN')
    expect(Object.keys(world.operatingCostFactsById)).toHaveLength(1)
    expect(buildFacilityMaintenanceNeedRows(world, s.teamId).find((row) => row.needId === s.needId)!.openProposalAction.reason).toBe('OPERATION_ALREADY_ACTIVE')
  })

  it('does not touch Training or Medical collections while a maintenance operation runs', () => {
    const s = createFacilityMaintenanceScenario({ registerEvidence: true })
    const done = completed(s)
    const watched = ['scheduledTrainingSessionsById', 'injuriesById', 'facilityUsageRightsById', 'physicalAllocationsById'] as const
    for (const key of watched) expect((done.world as unknown as Record<string, unknown>)[key]).toEqual((s.world as unknown as Record<string, unknown>)[key])
  })

  it('round-trips every stage through Save V4 twice with identical operation views', () => {
    const s = createFacilityMaintenanceScenario({ registerEvidence: true })
    const stages = [requested(s), approved(s), contracted(s), working(s), completed(s)]
    for (const flow of stages) {
      const once = roundTrip(flow.world)
      const twice = roundTrip(once)
      expect(twice.facilityEconomyRecordsById).toEqual(flow.world.facilityEconomyRecordsById)
      expect(buildFacilityMaintenanceOperationView(twice, s.teamId, flow.operationId)).toEqual(buildFacilityMaintenanceOperationView(flow.world, s.teamId, flow.operationId))
    }
  })

  it('processes the Calendar after a mid-flow reload exactly once: the same economic result as the uninterrupted run', () => {
    const s = createFacilityMaintenanceScenario({ registerEvidence: true })
    const done = completed(s)
    const direct = advance(done.world, 33)
    const interrupted = advance(roundTrip(advance(roundTrip(done.world), 1)), 32)
    const pick = (w: GameWorld) => [Object.keys(w.expenseRecognitionsById).filter((id) => id.includes('FUTURE_COST_ENGINE')), Object.keys(w.payablesById).length, Object.keys(w.treasuryApplicationsById).length, Object.keys(w.financialTransactionsById).length]
    expect(pick(interrupted)).toEqual(pick(direct))
    expect(Object.values(interrupted.expenseRecognitionsById).filter((e) => e.category === 'FACILITY')).toHaveLength(1)
  })

  it('refuses a second active operation for the same need and a start from the wrong stage', () => {
    const s = createFacilityMaintenanceScenario({ registerEvidence: true })
    const flow = requested(s)
    expect(openFacilityMaintenanceProposal(flow.world, { teamId: s.teamId, needId: s.needId, interventionType: 'REPAIR' }).reasons).toEqual(['OPERATION_ALREADY_ACTIVE'])
    expect(startFacilityMaintenanceWork(flow.world, { teamId: s.teamId, operationId: flow.operationId }).reasons).toEqual(['OPERATION_STAGE_INVALID'])
    expect(selectFacilityMaintenanceOffer(flow.world, { teamId: s.teamId, operationId: flow.operationId, offerId: s.offerId }).status).toBe('BLOCKED')
  })

  it('refuses a rival club\'s operation: another Organization cannot act on this club\'s need', () => {
    const s = createFacilityMaintenanceScenario({ registerEvidence: true })
    const flow = requested(s)
    const rival = Object.values(s.world.teams).find((team) => team.organizationId !== s.world.teams[s.teamId]!.organizationId)!
    expect(cancelFacilityMaintenanceOperation(flow.world, { teamId: rival.id, operationId: flow.operationId }).reasons).toEqual(['NOT_CLUB_FACILITY'])
    expect(openFacilityMaintenanceProposal(s.world, { teamId: rival.id, needId: s.needId, interventionType: 'REPAIR' }).reasons).toEqual(['NOT_CLUB_FACILITY'])
  })
})
