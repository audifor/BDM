import { describe, expect, it, vi } from 'vitest'
import { evaluateOrganizationFinancialCommitment, getOrganizationFinancialAuthorization, getCashBalancesByCurrency, getPayableSettledAmount } from '@/domain/finance'
import { processClubFinanceForDate } from '@/engine/finance/ClubFinanceLifecycle'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { parseGameDate } from '@/domain/date'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import {
  completeFacilityMaintenanceWork, openFacilityMaintenanceProposal, recordFacilityMaintenanceDecisionEvent, requestFacilityMaintenanceDecision, reserveAndContractFacilityMaintenance, selectFacilityMaintenanceOffer, startFacilityMaintenanceWork,
} from './FacilityMaintenanceCommands'
import { FM_BOARD, advance, approved, completed, contracted, createFacilityMaintenanceScenario, inspectionFor, must, working } from './testFixtures'
import { buildFacilityMaintenanceOperationView } from './FacilityMaintenanceReadModel'

const SAVED_AT = '2033-01-01T00:00:00.000Z'
const facilityReservations = (world: GameWorld) => Object.values(world.financialReservationsById).filter((r) => r.sourceAuthority === 'FACILITY')
const facilityExpenses = (world: GameWorld) => Object.values(world.expenseRecognitionsById).filter((e) => e.category === 'FACILITY')

function secondOperation(world: GameWorld, s: ReturnType<typeof createFacilityMaintenanceScenario>) {
  const opened = openFacilityMaintenanceProposal(world, { teamId: s.teamId, needId: s.secondNeedId, interventionType: 'ROUTINE_MAINTENANCE' })
  let current = must(selectFacilityMaintenanceOffer(opened.world, { teamId: s.teamId, operationId: opened.operationId!, offerId: s.secondOffer.id }))
  const request = requestFacilityMaintenanceDecision(current, { teamId: s.teamId, operationId: opened.operationId! })
  current = must(recordFacilityMaintenanceDecisionEvent(must(request), { teamId: s.teamId, decisionId: request.decisionId!, kind: 'APPROVED', bodyId: FM_BOARD }))
  return reserveAndContractFacilityMaintenance(current, { teamId: s.teamId, operationId: opened.operationId! })
}

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 })

describe('BS17E-A Finance gate', () => {
  it('reserves the exact quoted amount through the canonical gateway before any work, and starts no work without it', () => {
    const s = createFacilityMaintenanceScenario({ registerEvidence: true })
    const flow = contracted(s)
    const reservation = facilityReservations(flow.world)
    expect(reservation).toHaveLength(1)
    expect(reservation[0]).toMatchObject({ status: 'OPEN', currency: s.currencyCode, amount: { currencyCode: s.currencyCode, minorUnits: s.offer.amount.minorUnits } })
    const view = buildFacilityMaintenanceOperationView(flow.world, s.teamId, flow.operationId)!
    expect(view.funding.state).toBe('RESERVED')
    expect(view.stage).toBe('CONTRACTED')
    const beforeApproval = approved(s)
    expect(startFacilityMaintenanceWork(beforeApproval.world, { teamId: s.teamId, operationId: beforeApproval.operationId })).toMatchObject({ status: 'BLOCKED', reasons: ['OPERATION_STAGE_INVALID'] })
    expect(Object.keys(beforeApproval.world.facilityMaintenanceActionsById)).toHaveLength(0)
  })

  it('repeating the reservation or the contract is idempotent: one reservation, one contract, no second hold', () => {
    const s = createFacilityMaintenanceScenario({ registerEvidence: true })
    const flow = contracted(s)
    const again = reserveAndContractFacilityMaintenance(flow.world, { teamId: s.teamId, operationId: flow.operationId })
    expect(again.status).toBe('NO_CHANGE')
    expect(again.world).toBe(flow.world)
    expect(facilityReservations(again.world)).toHaveLength(1)
  })

  it('persists FUNDING_BLOCKED and starts nothing when authorized headroom is insufficient', () => {
    const s = createFacilityMaintenanceScenario({ registerEvidence: true, facilityBudgetMinorUnits: 1_000 })
    const flow = approved(s)
    const blocked = reserveAndContractFacilityMaintenance(flow.world, { teamId: s.teamId, operationId: flow.operationId })
    expect(blocked.status).toBe('FUNDING_BLOCKED')
    expect(blocked.canonicalReasons).toContain('INSUFFICIENT_AUTHORIZED_HEADROOM')
    expect(facilityReservations(blocked.world)).toHaveLength(0)
    expect(Object.keys(blocked.world.operatingCostFactsById)).toHaveLength(0)
    expect(Object.keys(blocked.world.facilityMaintenanceActionsById)).toHaveLength(0)
    expect(blocked.world.facilityMaintenanceNeedsById[s.needId as never]!.status).toBe('OPEN')
    const view = buildFacilityMaintenanceOperationView(blocked.world, s.teamId, flow.operationId)!
    expect(view.funding).toMatchObject({ state: 'FUNDING_BLOCKED', blockerCode: 'INSUFFICIENT_AUTHORIZED_HEADROOM' })
    expect(view.history.map((event) => event.kind)).toContain('FUNDING_BLOCKED')
    expect(view.alerts.some((alert) => alert.startsWith('FUNDING_BLOCKED:'))).toBe(true)
    // The same blocker is not re-recorded on every retry.
    const retry = reserveAndContractFacilityMaintenance(blocked.world, { teamId: s.teamId, operationId: flow.operationId })
    expect(retry.world).toBe(blocked.world)
  })

  it('when the club has no FACILITY authorization line Finance reports it as not modelled: liquidity alone decides, and the note is surfaced', () => {
    const s = createFacilityMaintenanceScenario({ registerEvidence: true, withFacilityBudget: false })
    const flow = approved(s)
    const contract = reserveAndContractFacilityMaintenance(flow.world, { teamId: s.teamId, operationId: flow.operationId })
    expect(contract.status).toBe('APPLIED')
    expect(contract.canonicalReasons).toEqual(['BUDGET_AUTHORIZATION_NOT_MODELLED'])
    expect(buildFacilityMaintenanceOperationView(contract.world, s.teamId, flow.operationId)!.funding).toMatchObject({ state: 'RESERVED', note: 'BUDGET_AUTHORIZATION_NOT_MODELLED' })
    const poor = createFacilityMaintenanceScenario({ registerEvidence: true, withFacilityBudget: false, drawdownMinorUnits: 1 })
    const poorFlow = approved(poor)
    expect(reserveAndContractFacilityMaintenance(poorFlow.world, { teamId: poor.teamId, operationId: poorFlow.operationId }).status).toBe('FUNDING_BLOCKED')
  })

  it('blocks on liquidity even when the authorization is large, and a recovered budget allows the retry', () => {
    const poor = createFacilityMaintenanceScenario({ registerEvidence: true, drawdownMinorUnits: 1 })
    const flow = approved(poor)
    const cash = getCashBalancesByCurrency(flow.world, poor.organizationId as never, flow.world.currentDate).find((row) => String(row.currencyCode) === poor.currencyCode)?.totalCashMinorUnits ?? 0
    expect(cash).toBeLessThan(poor.offer.amount.minorUnits)
    const blocked = reserveAndContractFacilityMaintenance(flow.world, { teamId: poor.teamId, operationId: flow.operationId })
    expect(blocked.status).toBe('FUNDING_BLOCKED')
    expect(blocked.canonicalReasons.some((code) => code.includes('LIQUIDITY') || code.includes('FINANCING'))).toBe(true)
    const rich = createFacilityMaintenanceScenario({ registerEvidence: true })
    expect(reserveAndContractFacilityMaintenance(approved(rich).world, { teamId: rich.teamId, operationId: approved(rich).operationId }).status).toBe('APPLIED')
  })

  it('a reservation protects the FACILITY line: a second operation that the remaining authorization cannot honour is blocked, one that fits proceeds', () => {
    const tight = createFacilityMaintenanceScenario({ registerEvidence: true, facilityBudgetMinorUnits: 1_500_000 })
    const first = contracted(tight)
    expect(secondOperation(first.world, tight).status).toBe('FUNDING_BLOCKED')
    expect(secondOperation(first.world, tight).canonicalReasons).toEqual(['FACILITY_LINE_HELD_BY_OTHER_OPERATIONS'])
    expect(Object.values(secondOperation(first.world, tight).world.financialReservationsById).filter((r) => r.sourceAuthority === 'FACILITY')).toHaveLength(1)
    const roomy = createFacilityMaintenanceScenario({ registerEvidence: true, facilityBudgetMinorUnits: 2_000_000 })
    const both = secondOperation(contracted(roomy).world, roomy)
    expect(both.status).toBe('APPLIED')
    expect(Object.values(both.world.financialReservationsById).filter((r) => r.sourceAuthority === 'FACILITY')).toHaveLength(2)
  })

  it('does not recognize, owe or pay anything because the physical work finished', () => {
    const s = createFacilityMaintenanceScenario({ registerEvidence: true })
    const flow = completed(s)
    const view = buildFacilityMaintenanceOperationView(flow.world, s.teamId, flow.operationId)!
    expect(view.execution.state).toBe('COMPLETED')
    expect(view.economics.state).toBe('COST_AUTHORIZED')
    expect(facilityExpenses(flow.world)).toHaveLength(0)
    expect(Object.values(flow.world.payablesById).filter((p) => String(p.provenance.id).includes('facility-maintenance'))).toHaveLength(0)
    // The authorized fact is already visible to Finance, so the hold was consumed in the same transition (not counted twice).
    expect(facilityReservations(flow.world)[0]!.status).toBe('CONSUMED')
  })

  it('does not complete the physical work because it was approved, reserved, recognized or paid', () => {
    const s = createFacilityMaintenanceScenario({ registerEvidence: true })
    const flow = working(s)
    const later = advance(flow.world, 40)
    expect(facilityExpenses(later)).toHaveLength(0)
    expect(later.facilityMaintenanceActionsById[`facility-maintenance-action:${flow.operationId}` as never]!.completedAt).toBeNull()
    expect(buildFacilityMaintenanceOperationView(later, s.teamId, flow.operationId)!.execution.state).toBe('IN_PROGRESS')
  })

  it('recognizes once through the single Calendar owner, creates one payable, consumes the reservation, then settles once', () => {
    const s = createFacilityMaintenanceScenario({ registerEvidence: true })
    const flow = completed(s)
    let world = advance(flow.world, 1)
    expect(facilityExpenses(world)).toHaveLength(1)
    const expense = facilityExpenses(world)[0]!
    expect(expense.amount).toEqual({ currencyCode: s.currencyCode, minorUnits: s.offer.amount.minorUnits })
    expect(expense.counterparty).toMatchObject({ kind: 'EXTERNAL', id: s.providerId })
    const payable = world.payablesById[expense.payableId as never]!
    expect(payable.amount.minorUnits).toBe(s.offer.amount.minorUnits)
    expect(facilityReservations(world)[0]!.status).toBe('CONSUMED')
    const view = buildFacilityMaintenanceOperationView(world, s.teamId, flow.operationId)!
    expect(view.economics).toMatchObject({ state: 'PAYABLE', recognizedMinorUnits: s.offer.amount.minorUnits, outstandingMinorUnits: s.offer.amount.minorUnits, settledMinorUnits: 0 })
    // Reprocessing the same date is an identity no-op.
    expect(processClubFinanceForDate(world).world).toEqual(world)
    world = advance(world, 31)
    expect(getPayableSettledAmount(world, payable.id).minorUnits).toBe(s.offer.amount.minorUnits)
    const settled = buildFacilityMaintenanceOperationView(world, s.teamId, flow.operationId)!
    expect(settled.economics).toMatchObject({ state: 'SETTLED', outstandingMinorUnits: 0, settledMinorUnits: s.offer.amount.minorUnits })
    expect(facilityExpenses(world)).toHaveLength(1)
    expect(Object.values(world.payablesById).filter((p) => p.provenance.id === String(expense.id))).toHaveLength(1)
    const settlements = Object.values(world.treasuryApplicationsById).filter((a) => String(a.id).includes(String(payable.id)))
    expect(settlements).toHaveLength(1)
  })

  it('never counts the obligation twice: at every stage the amount is held once (reserved, then committed, then recognized)', () => {
    const s = createFacilityMaintenanceScenario({ registerEvidence: true, facilityBudgetMinorUnits: 5_000_000 })
    const held = (world: GameWorld) => {
      const authorization = getOrganizationFinancialAuthorization(world, { organizationId: s.organizationId, currencyCode: s.currencyCode, asOfDate: world.currentDate })
      return { reserved: authorization.reservedMinorUnits, committed: authorization.lines.find((line) => line.category === 'FACILITY')!.committedMinorUnits }
    }
    const amount = s.offer.amount.minorUnits
    expect(held(contracted(s).world)).toEqual({ reserved: amount, committed: 0 })
    const flow = completed(s)
    expect(held(flow.world)).toEqual({ reserved: 0, committed: amount })
    const recognizedWorld = advance(flow.world, 1)
    expect(facilityExpenses(recognizedWorld)).toHaveLength(1)
    expect(held(recognizedWorld)).toEqual({ reserved: 0, committed: 0 })
    expect(facilityReservations(recognizedWorld)[0]!.status).toBe('CONSUMED')
  })

  it('keeps the ledger balanced with no duplicate entries after recognition, settlement and a double Save reload', () => {
    const s = createFacilityMaintenanceScenario({ registerEvidence: true })
    const flow = completed(s)
    const world = advance(flow.world, 33)
    const counts = (w: GameWorld) => [Object.keys(w.financialTransactionsById).length, Object.keys(w.expenseRecognitionsById).length, Object.keys(w.payablesById).length, Object.keys(w.treasuryApplicationsById).length]
    const reloaded = deserializeGameWorldV4(serializeGameWorldV4(deserializeGameWorldV4(serializeGameWorldV4(world, SAVED_AT)), SAVED_AT))
    expect(counts(reloaded)).toEqual(counts(world))
    const later = advance(reloaded, 5)
    expect(counts(later)).toEqual(counts(world))
    const postings = Object.values(world.financialTransactionsById).flatMap((t) => t.postings ?? [])
    const debit = postings.filter((p) => (p as { direction?: string }).direction === 'DEBIT').reduce((sum, p) => sum + (p as { amount: { minorUnits: number } }).amount.minorUnits, 0)
    const credit = postings.filter((p) => (p as { direction?: string }).direction === 'CREDIT').reduce((sum, p) => sum + (p as { amount: { minorUnits: number } }).amount.minorUnits, 0)
    expect(debit).toBe(credit)
  })

  it('refuses a completion before the offer\'s own execution window has elapsed, and without a real inspection', () => {
    const s = createFacilityMaintenanceScenario({ registerEvidence: true, executionDays: 3 })
    const flow = working(s)
    const day1 = advance(flow.world, 1)
    const early = completeFacilityMaintenanceWork(day1, { teamId: s.teamId, operationId: flow.operationId, inspectionId: 'inspection:none' })
    expect(early.reasons).toEqual(['WORK_NOT_YET_COMPLETABLE'])
    const day3 = advance(day1, 2)
    const noInspection = completeFacilityMaintenanceWork(day3, { teamId: s.teamId, operationId: flow.operationId, inspectionId: 'inspection:none' })
    expect(noInspection.reasons).toEqual(['COMPLETION_INSPECTION_REQUIRED'])
    const stale = inspectionFor(s, 'inspection:stale', parseGameDate('2000-01-01'))
    const withStale = updateGameWorld(day3, { facilityInspections: [stale] })
    expect(completeFacilityMaintenanceWork(withStale, { teamId: s.teamId, operationId: flow.operationId, inspectionId: stale.id }).reasons).toEqual(['COMPLETION_INSPECTION_REQUIRED'])
  })

  it('blocks contracting when the offer states no payment terms: Finance has no due date to honour', () => {
    const s = createFacilityMaintenanceScenario({ registerEvidence: true, paymentDueDays: null })
    const flow = approved(s)
    expect(reserveAndContractFacilityMaintenance(flow.world, { teamId: s.teamId, operationId: flow.operationId })).toMatchObject({ status: 'BLOCKED', reasons: ['PAYMENT_TERMS_UNKNOWN'] })
    expect(facilityReservations(flow.world)).toHaveLength(0)
  })

  it('refuses to contract under an offer that expired after approval, preserving the offer and the decision', () => {
    const s = createFacilityMaintenanceScenario({ registerEvidence: true, offerValidDays: 2 })
    const flow = approved(s)
    const late = advance(flow.world, 3)
    expect(reserveAndContractFacilityMaintenance(late, { teamId: s.teamId, operationId: flow.operationId })).toMatchObject({ status: 'BLOCKED', reasons: ['OFFER_EXPIRED'] })
    expect(late.facilityEconomyRecordsById[s.offerId]).toEqual(s.offer)
    expect(facilityReservations(late)).toHaveLength(0)
  })
})
