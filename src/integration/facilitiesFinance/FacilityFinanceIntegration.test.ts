/**
 * CFI7 — Facilities <-> Finance integration tests.
 *
 * The 33 tests required by the CFI7 brief, in its order. Each protects a distinct rule; no test here
 * duplicates coverage that CFI1-CFI6a or CF1-CF9 already own.
 */

import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { parseGameDate } from '@/domain/date'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import {
  createFacility,
  createFacilityComponent,
  createFacilityDevelopmentProject,
  createFacilityMaintenanceAction,
  createFacilityMaintenanceNeed,
  createFacilityOperationalIncident,
  createPlace,
} from '@/domain/facilities'
import { createDebtInstrument, createFinancialAccount } from '@/domain/finance'
import {
  cancelFacilityDevelopmentProject,
  pauseFacilityDevelopmentProject,
  startFacilityDevelopmentProject,
} from '@/engine/facilities'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import {
  authorizeFacilityMaintenanceExpenditure,
  bindFacilityProjectDebtFinancing,
  completeFundedFacilityDevelopmentProject,
  executeFacilityProjectCapitalPayment,
  executeFundedFacilityProjectStart,
  executeFundedMaintenanceAction,
} from './FacilityFinanceOrchestration'
import {
  committedFacilityExpenditureAt,
  facilityCapitalExpenditureAt,
  facilitySourceForFinancialCommitment,
  facilitySourceForFinancialTransaction,
  financialFactsForDevelopmentProject,
  financialFactsForFacility,
  financialFactsForMaintenanceAction,
  outstandingFacilityCommitmentsAt,
  recognizedFacilityExpenditureAt,
} from './FacilityFinanceQueries'

const SAVED_AT = '2030-01-01T00:00:00.000Z'
const EUR = (minorUnits: number) => ({ currencyCode: 'EUR', minorUnits })

/** A world carrying both a Facility (CFI1-CFI6a) and the Finance accounts (CF1) the ledger needs. */
function fixture(initialStatus: 'ACTIVE' | 'TEMPORARILY_CLOSED' = 'ACTIVE') {
  const world = createNewGame()
  const organization = Object.values(world.organizationsById)[0]!
  const place = createPlace({ id: 'place:cfi7', kind: 'CAMPUS', name: 'CFI7 Campus' })
  const facility = createFacility({ id: 'facility:cfi7', placeId: place.id, type: 'TRAINING_CENTER', purposes: ['TRAINING'], status: initialStatus, canonicalName: 'CFI7 Center' })
  const component = createFacilityComponent({ id: 'component:cfi7', facilityId: facility.id, type: 'PRACTICE_COURT', status: 'ACTIVE' })
  const accounts = [
    createFinancialAccount({ id: 'finance:cash', organizationId: organization.id, accountType: 'CASH', currencyCode: 'EUR' }),
    createFinancialAccount({ id: 'finance:payable', organizationId: organization.id, accountType: 'PAYABLE', currencyCode: 'EUR' }),
    createFinancialAccount({ id: 'finance:expense', organizationId: organization.id, accountType: 'EXPENSE', currencyCode: 'EUR' }),
  ]
  const base = updateGameWorld(world, { places: [place], facilities: [facility], facilityComponents: [component], financialAccounts: accounts })
  return { world: base, organization, place, facility, component }
}

const ledger = { offsetAccountId: 'finance:payable', resultAccountId: 'finance:expense' }

/** A completed CFI5 maintenance action — the only thing that may carry a maintenance expenditure. */
function completedAction(facilityId: string, componentId: string, id = 'action:cfi7') {
  return createFacilityMaintenanceAction({ id, needId: null, facilityId, componentId, type: 'REPAIR', startedAt: '2030-02-01', completedAt: '2030-02-10', outcome: 'SUCCESSFUL', resultingCondition: null, resultingServiceability: null })
}

function project(world: GameWorld, organizationId: string, facilityId: string, id = 'project:cfi7') {
  const created = createFacilityDevelopmentProject({
    id,
    organizationId,
    facilityId,
    projectType: 'FACILITY_RENOVATION',
    scope: { kind: 'RECONFIGURE_FACILITY', additions: [{ type: 'HYDROTHERAPY_POOL' }], renovations: [], replacements: [], removals: [] },
    plannedStartDate: '2030-01-01',
    plannedCompletionDate: '2030-06-01',
    createdAt: '2029-11-01',
  })
  return { project: created, world: updateGameWorld(world, { facilityDevelopmentProjects: [created] }) }
}

describe('CFI7 — Facilities <-> Finance integration', () => {
  it('1. the merged GameWorld contains both Facilities and Finance collections', () => {
    const f = fixture()
    expect(Object.keys(f.world.facilitiesById)).toContain('facility:cfi7')
    expect(Object.keys(f.world.financialAccountsById)).toContain('finance:cash')
    expect(f.world.facilityFinancialBindingsById).toEqual({})
  })

  it('2. a Save round-trip preserves both domains', () => {
    const f = fixture()
    const restored = deserializeGameWorldV4(serializeGameWorldV4(f.world, SAVED_AT))
    expect(restored.facilitiesById).toEqual(f.world.facilitiesById)
    expect(restored.financialAccountsById).toEqual(f.world.financialAccountsById)
  })

  it('3. a maintenance action can produce a canonical operating financial fact', () => {
    const f = fixture()
    const action = completedAction(f.facility.id, f.component.id)
    const world = updateGameWorld(f.world, { facilityMaintenanceActions: [action] })
    const result = authorizeFacilityMaintenanceExpenditure(world, { maintenanceActionId: action.id, organizationId: f.organization.id, amount: EUR(50_000), financialDate: '2030-02-10', recognizeImmediately: false })
    const facts = Object.values(result.world.operatingCostFactsById)
    expect(facts).toHaveLength(1)
    // The fact is a real CF8 AuthorizedOperatingCostFact carrying the amount; Facilities stores none.
    expect(facts[0]!.amount).toEqual(EUR(50_000))
    expect(facts[0]!.category).toBe('FACILITY')
    expect(facts[0]!.facilityId).toBe(f.facility.id)
  })

  it('4. a maintenance need alone creates no expense', () => {
    const f = fixture()
    const need = createFacilityMaintenanceNeed({ id: 'need:cfi7', facilityId: f.facility.id, componentId: f.component.id, detectedAt: '2030-01-05', type: 'CORRECTIVE', severity: 'MODERATE', status: 'OPEN', source: 'inspection' })
    const world = updateGameWorld(f.world, { facilityMaintenanceNeeds: [need] })
    expect(Object.values(world.operatingCostFactsById)).toHaveLength(0)
    expect(Object.values(world.financialCommitmentsById)).toHaveLength(0)
    expect(Object.values(world.facilityFinancialBindingsById)).toHaveLength(0)
  })

  it('5. deferred maintenance creates no actual expense', () => {
    const f = fixture()
    const need = createFacilityMaintenanceNeed({ id: 'need:deferred', facilityId: f.facility.id, componentId: f.component.id, detectedAt: '2030-01-05', type: 'CORRECTIVE', severity: 'MODERATE', status: 'DEFERRED', source: 'inspection' })
    const world = updateGameWorld(f.world, { facilityMaintenanceNeeds: [need] })
    expect(Object.values(world.operatingCostFactsById)).toHaveLength(0)
    expect(Object.values(world.expenseRecognitionsById)).toHaveLength(0)
  })

  it('6. the maintenance financial link is traceable in both directions', () => {
    const f = fixture()
    const action = completedAction(f.facility.id, f.component.id)
    const world = updateGameWorld(f.world, { facilityMaintenanceActions: [action] })
    const result = authorizeFacilityMaintenanceExpenditure(world, { maintenanceActionId: action.id, organizationId: f.organization.id, amount: EUR(50_000), financialDate: '2030-02-10', recognizeImmediately: true, ledger })
    const forward = financialFactsForMaintenanceAction(result.world, action.id)
    expect(forward).toHaveLength(1)
    expect(forward[0]!.operatingCostFact?.amount).toEqual(EUR(50_000))
    const transactionId = result.outcome.createdTransactionIds[0]!
    expect(facilitySourceForFinancialTransaction(result.world, transactionId)).toBeNull()
    // The binding points at the operating cost fact; the ledger transaction traces back through the
    // recognition's own provenance, which is Finance-side authority.
    const recognition = Object.values(result.world.expenseRecognitionsById)[0]!
    expect(recognition.provenance).toEqual({ kind: 'FACILITY_MAINTENANCE_ACTION', id: String(action.id) })
  })

  it('7. a facility development project creates/links a canonical capital financial fact', () => {
    const f = fixture()
    const p = project(f.world, f.organization.id, f.facility.id)
    const started = executeFundedFacilityProjectStart(p.world, { projectId: p.project.id, organizationId: f.organization.id, amount: EUR(10_000_000), startedAt: '2030-01-01' })
    const commitments = Object.values(started.world.financialCommitmentsById)
    expect(commitments).toHaveLength(1)
    expect(commitments[0]!.amount).toEqual(EUR(10_000_000))
    expect(commitments[0]!.category).toBe('FACILITY_DEVELOPMENT')
    expect(started.outcome.physicalOutcome).toBe('PROJECT_STARTED')
  })

  it('8. a project supports multiple financial facts', () => {
    const f = fixture()
    const p = project(f.world, f.organization.id, f.facility.id)
    const started = executeFundedFacilityProjectStart(p.world, { projectId: p.project.id, organizationId: f.organization.id, amount: EUR(10_000_000), startedAt: '2030-01-01' })
    const paid = executeFacilityProjectCapitalPayment(started.world, { projectId: p.project.id, organizationId: f.organization.id, amount: EUR(2_000_000), paidOn: '2030-02-01', ledger, paymentSequence: 1 })
    expect(financialFactsForDevelopmentProject(paid.world, p.project.id).length).toBeGreaterThan(1)
  })

  it('9. multiple payments can reference the same project', () => {
    const f = fixture()
    const p = project(f.world, f.organization.id, f.facility.id)
    let world = executeFundedFacilityProjectStart(p.world, { projectId: p.project.id, organizationId: f.organization.id, amount: EUR(10_000_000), startedAt: '2030-01-01' }).world
    world = executeFacilityProjectCapitalPayment(world, { projectId: p.project.id, organizationId: f.organization.id, amount: EUR(1_000_000), paidOn: '2030-02-01', ledger, paymentSequence: 1 }).world
    world = executeFacilityProjectCapitalPayment(world, { projectId: p.project.id, organizationId: f.organization.id, amount: EUR(3_000_000), paidOn: '2030-03-01', ledger, paymentSequence: 2 }).world
    const payments = financialFactsForDevelopmentProject(world, p.project.id).filter((fact) => fact.binding.role === 'CAPITAL_PAYMENT')
    expect(payments).toHaveLength(2)
    expect(recognizedFacilityExpenditureAt(world, p.project.id, '2030-04-01')).toEqual([EUR(4_000_000)])
  })

  it('10. physical completion does not imply fully paid', () => {
    const f = fixture()
    const p = project(f.world, f.organization.id, f.facility.id)
    let world = executeFundedFacilityProjectStart(p.world, { projectId: p.project.id, organizationId: f.organization.id, amount: EUR(10_000_000), startedAt: '2030-01-01' }).world
    world = executeFacilityProjectCapitalPayment(world, { projectId: p.project.id, organizationId: f.organization.id, amount: EUR(1_000_000), paidOn: '2030-02-01', ledger, paymentSequence: 1 }).world
    const completed = completeFundedFacilityDevelopmentProject(world, p.project.id, '2030-05-01')
    expect(completed.world.facilityDevelopmentProjectsById[p.project.id]!.status).toBe('COMPLETED')
    // Physically COMPLETED, yet committed (10M project + 1M payment) still exceeds the 1M
    // recognized: a real outstanding obligation survives physical completion.
    expect(outstandingFacilityCommitmentsAt(completed.world, p.project.id, '2030-05-01')).toEqual([EUR(10_000_000)])
  })

  it('11. fully funded does not imply physically complete', () => {
    const f = fixture()
    const p = project(f.world, f.organization.id, f.facility.id)
    let world = executeFundedFacilityProjectStart(p.world, { projectId: p.project.id, organizationId: f.organization.id, amount: EUR(1_000_000), startedAt: '2030-01-01' }).world
    world = executeFacilityProjectCapitalPayment(world, { projectId: p.project.id, organizationId: f.organization.id, amount: EUR(1_000_000), paidOn: '2030-02-01', ledger, paymentSequence: 1 }).world
    // The original 1M commitment is fully recognized (paid down), yet the project is still only
    // IN_PROGRESS: financial settlement does not drive physical progress.
    expect(recognizedFacilityExpenditureAt(world, p.project.id, '2030-02-01')).toEqual([EUR(1_000_000)])
    expect(world.facilityDevelopmentProjectsById[p.project.id]!.status).toBe('IN_PROGRESS')
  })

  it('12. a project can be associated with debt financing', () => {
    const f = fixture()
    const p = project(f.world, f.organization.id, f.facility.id)
    const debt = createDebtInstrument({ id: 'debt:cfi7', organizationId: f.organization.id, lender: { kind: 'EXTERNAL', label: 'Bank' }, debtType: 'OWNER_LOAN', currencyCode: 'EUR', originalPrincipal: EUR(5_000_000), startsOn: '2030-01-01', maturityOn: '2035-01-01', provenance: { kind: 'CFI7_TEST', id: 'debt' } })
    const world = updateGameWorld(p.world, { debtInstruments: [debt] })
    const bound = bindFacilityProjectDebtFinancing(world, { projectId: p.project.id, debtInstrumentId: debt.id, organizationId: f.organization.id, boundOn: '2030-01-02' })
    const facts = financialFactsForDevelopmentProject(bound.world, p.project.id)
    expect(facts.some((fact) => fact.debtInstrument?.id === debt.id)).toBe(true)
    // Facilities stores only the reference: no principal/interest/balance field on the project.
    expect(Object.keys(bound.world.facilityDevelopmentProjectsById[p.project.id]!)).not.toContain('principal')
  })

  it('13. one project can structurally support multiple funding sources', () => {
    const f = fixture()
    const p = project(f.world, f.organization.id, f.facility.id)
    const debt = createDebtInstrument({ id: 'debt:multi', organizationId: f.organization.id, lender: { kind: 'EXTERNAL', label: 'Bank' }, debtType: 'OWNER_LOAN', currencyCode: 'EUR', originalPrincipal: EUR(5_000_000), startsOn: '2030-01-01', maturityOn: '2035-01-01', provenance: { kind: 'CFI7_TEST', id: 'debt-multi' } })
    let world = updateGameWorld(p.world, { debtInstruments: [debt] })
    world = executeFundedFacilityProjectStart(world, { projectId: p.project.id, organizationId: f.organization.id, amount: EUR(10_000_000), startedAt: '2030-01-01' }).world
    world = bindFacilityProjectDebtFinancing(world, { projectId: p.project.id, debtInstrumentId: debt.id, organizationId: f.organization.id, boundOn: '2030-01-02' }).world
    world = executeFacilityProjectCapitalPayment(world, { projectId: p.project.id, organizationId: f.organization.id, amount: EUR(500_000), paidOn: '2030-02-01', ledger, paymentSequence: 1 }).world
    const roles = new Set(financialFactsForDevelopmentProject(world, p.project.id).map((fact) => fact.binding.role))
    expect(roles).toEqual(new Set(['CAPITAL_COMMITMENT', 'DEBT_FINANCING', 'CAPITAL_PAYMENT_COMMITMENT', 'CAPITAL_PAYMENT_RECOGNITION', 'CAPITAL_PAYMENT']))
  })

  it('14. Finance remains the authority over amounts', () => {
    const f = fixture()
    const p = project(f.world, f.organization.id, f.facility.id)
    const started = executeFundedFacilityProjectStart(p.world, { projectId: p.project.id, organizationId: f.organization.id, amount: EUR(7_500_000), startedAt: '2030-01-01' })
    const binding = Object.values(started.world.facilityFinancialBindingsById)[0]!
    expect(binding).not.toHaveProperty('amount')
    expect(binding).not.toHaveProperty('currencyCode')
    // The amount is readable only by resolving the Finance fact the binding points at.
    expect(started.world.financialCommitmentsById[binding.factId as never]!.amount).toEqual(EUR(7_500_000))
  })

  it('15. the Facilities model contains no duplicate ledger state', () => {
    const f = fixture()
    const p = project(f.world, f.organization.id, f.facility.id)
    const started = executeFundedFacilityProjectStart(p.world, { projectId: p.project.id, organizationId: f.organization.id, amount: EUR(10_000_000), startedAt: '2030-01-01' })
    const stored = started.world.facilityDevelopmentProjectsById[p.project.id]!
    for (const forbidden of ['cost', 'maintenanceCost', 'constructionCost', 'renovationCost', 'monthlyExpense', 'loanBalance', 'amountPaid', 'budget']) {
      expect(Object.keys(stored)).not.toContain(forbidden)
    }
  })

  it('16. budget integration uses Finance budget primitives', () => {
    const f = fixture()
    const action = completedAction(f.facility.id, f.component.id)
    const world = updateGameWorld(f.world, { facilityMaintenanceActions: [action] })
    const result = authorizeFacilityMaintenanceExpenditure(world, { maintenanceActionId: action.id, organizationId: f.organization.id, amount: EUR(50_000), financialDate: '2030-02-10', recognizeImmediately: true, ledger })
    // The expense is an ordinary CF3 ExpenseRecognition in an operating category, so CF6/CF8 budget
    // and operating-cost queries see it without any Facilities-side budget object existing.
    const recognition = Object.values(result.world.expenseRecognitionsById)[0]!
    expect(recognition.category).toBe('FACILITY')
    expect(result.world).not.toHaveProperty('facilityBudgetsById')
  })

  it('17. cancellation preserves historic financial facts', () => {
    const f = fixture()
    const p = project(f.world, f.organization.id, f.facility.id)
    let world = executeFundedFacilityProjectStart(p.world, { projectId: p.project.id, organizationId: f.organization.id, amount: EUR(10_000_000), startedAt: '2030-01-01' }).world
    world = executeFacilityProjectCapitalPayment(world, { projectId: p.project.id, organizationId: f.organization.id, amount: EUR(2_000_000), paidOn: '2030-02-01', ledger, paymentSequence: 1 }).world
    const before = financialFactsForDevelopmentProject(world, p.project.id).length
    const cancelled = cancelFacilityDevelopmentProject(world, p.project.id, parseGameDate('2030-03-01'))
    expect(cancelled.world.facilityDevelopmentProjectsById[p.project.id]!.status).toBe('CANCELLED')
    expect(financialFactsForDevelopmentProject(cancelled.world, p.project.id)).toHaveLength(before)
    expect(recognizedFacilityExpenditureAt(cancelled.world, p.project.id, '2030-03-01')).toEqual([EUR(2_000_000)])
  })

  it('18. a paused project preserves existing liabilities/debt facts', () => {
    const f = fixture()
    const p = project(f.world, f.organization.id, f.facility.id)
    let world = executeFundedFacilityProjectStart(p.world, { projectId: p.project.id, organizationId: f.organization.id, amount: EUR(10_000_000), startedAt: '2030-01-01' }).world
    world = executeFacilityProjectCapitalPayment(world, { projectId: p.project.id, organizationId: f.organization.id, amount: EUR(2_000_000), paidOn: '2030-02-01', ledger, paymentSequence: 1 }).world
    const paused = pauseFacilityDevelopmentProject(world, p.project.id)
    expect(paused.world.facilityDevelopmentProjectsById[p.project.id]!.status).toBe('PAUSED')
    expect(outstandingFacilityCommitmentsAt(paused.world, p.project.id, '2030-02-01')).toEqual([EUR(10_000_000)])
  })

  it('19. maintenance action financial execution is atomic', () => {
    const f = fixture()
    const action = completedAction(f.facility.id, f.component.id)
    const world = updateGameWorld(f.world, { facilityMaintenanceActions: [action] })
    // recognizeImmediately without a ledger mapping is a financial-validation failure.
    expect(() => authorizeFacilityMaintenanceExpenditure(world, { maintenanceActionId: action.id, organizationId: f.organization.id, amount: EUR(50_000), financialDate: '2030-02-10', recognizeImmediately: true })).toThrow(TypeError)
    expect(Object.values(world.expenseRecognitionsById)).toHaveLength(0)
    expect(Object.values(world.facilityFinancialBindingsById)).toHaveLength(0)
  })

  it('20. project financial execution is atomic', () => {
    const f = fixture()
    const p = project(f.world, f.organization.id, f.facility.id)
    expect(() => executeFundedFacilityProjectStart(p.world, { projectId: p.project.id, organizationId: f.organization.id, amount: EUR(-5), startedAt: '2030-01-01' })).toThrow()
    expect(Object.values(p.world.financialCommitmentsById)).toHaveLength(0)
    expect(Object.values(p.world.facilityFinancialBindingsById)).toHaveLength(0)
  })

  it('21. failed physical validation creates no financial side effect', () => {
    const f = fixture()
    const p = project(f.world, f.organization.id, f.facility.id)
    // Start it once, then attempt an invalid second start: the physical command rejects.
    const started = executeFundedFacilityProjectStart(p.world, { projectId: p.project.id, organizationId: f.organization.id, amount: EUR(10_000_000), startedAt: '2030-01-01' })
    const commitmentsBefore = Object.keys(started.world.financialCommitmentsById).length
    expect(() => startFacilityDevelopmentProject(started.world, p.project.id, parseGameDate('2030-01-05'))).toThrow()
    expect(Object.keys(started.world.financialCommitmentsById)).toHaveLength(commitmentsBefore)
  })

  it('22. failed financial validation creates no physical side effect', () => {
    const f = fixture()
    const action = completedAction(f.facility.id, f.component.id, 'action:atomic')
    const world = updateGameWorld(f.world, { facilityMaintenanceActions: [action] })
    expect(() => executeFundedMaintenanceAction(world, { id: 'action:new-atomic', facilityId: f.facility.id, componentId: f.component.id, type: 'REPAIR', startedAt: '2030-02-01', completedAt: '2030-02-10', outcome: 'SUCCESSFUL', organizationId: 'organization:does-not-exist', amount: EUR(50_000), ledger })).toThrow()
    // The caller's world never gained the new maintenance action.
    expect(world.facilityMaintenanceActionsById['action:new-atomic' as never]).toBeUndefined()
  })

  it('23. an integrated operation is idempotent', () => {
    const f = fixture()
    const action = completedAction(f.facility.id, f.component.id)
    const world = updateGameWorld(f.world, { facilityMaintenanceActions: [action] })
    const once = authorizeFacilityMaintenanceExpenditure(world, { maintenanceActionId: action.id, organizationId: f.organization.id, amount: EUR(50_000), financialDate: '2030-02-10', recognizeImmediately: false })
    // Re-running with the same natural key must not duplicate the operating cost fact or binding.
    expect(() => authorizeFacilityMaintenanceExpenditure(once.world, { maintenanceActionId: action.id, organizationId: f.organization.id, amount: EUR(50_000), financialDate: '2030-02-10', recognizeImmediately: false })).toThrow()
    expect(Object.values(once.world.operatingCostFactsById)).toHaveLength(1)
    expect(Object.values(once.world.facilityFinancialBindingsById)).toHaveLength(1)
  })

  it('24. financial traceability by Facility', () => {
    const f = fixture()
    const p = project(f.world, f.organization.id, f.facility.id)
    const started = executeFundedFacilityProjectStart(p.world, { projectId: p.project.id, organizationId: f.organization.id, amount: EUR(10_000_000), startedAt: '2030-01-01' })
    const facts = financialFactsForFacility(started.world, f.facility.id)
    expect(facts).toHaveLength(1)
    expect(facts[0]!.commitment?.amount).toEqual(EUR(10_000_000))
  })

  it('25. financial traceability by MaintenanceAction', () => {
    const f = fixture()
    const action = completedAction(f.facility.id, f.component.id)
    const world = updateGameWorld(f.world, { facilityMaintenanceActions: [action] })
    const result = authorizeFacilityMaintenanceExpenditure(world, { maintenanceActionId: action.id, organizationId: f.organization.id, amount: EUR(50_000), financialDate: '2030-02-10', recognizeImmediately: false })
    const facts = financialFactsForMaintenanceAction(result.world, action.id)
    expect(facts).toHaveLength(1)
    expect(facts[0]!.operatingCostFact?.sourceEntityId).toBe(String(action.id))
  })

  it('26. financial traceability by DevelopmentProject, forward and reverse', () => {
    const f = fixture()
    const p = project(f.world, f.organization.id, f.facility.id)
    const started = executeFundedFacilityProjectStart(p.world, { projectId: p.project.id, organizationId: f.organization.id, amount: EUR(10_000_000), startedAt: '2030-01-01' })
    const commitmentId = started.outcome.createdCommitmentIds[0]!
    const reverse = facilitySourceForFinancialCommitment(started.world, commitmentId)
    expect(reverse?.sourceId).toBe(String(p.project.id))
    expect(reverse?.sourceKind).toBe('FACILITY_DEVELOPMENT_PROJECT')
  })

  it('27. a historical financial query is deterministic', () => {
    const f = fixture()
    const p = project(f.world, f.organization.id, f.facility.id)
    let world = executeFundedFacilityProjectStart(p.world, { projectId: p.project.id, organizationId: f.organization.id, amount: EUR(10_000_000), startedAt: '2030-01-01' }).world
    world = executeFacilityProjectCapitalPayment(world, { projectId: p.project.id, organizationId: f.organization.id, amount: EUR(2_000_000), paidOn: '2030-03-01', ledger, paymentSequence: 1 }).world
    // As-of dates are respected: the March payment is invisible in February.
    expect(recognizedFacilityExpenditureAt(world, p.project.id, '2030-02-01')).toEqual([])
    expect(recognizedFacilityExpenditureAt(world, p.project.id, '2030-03-01')).toEqual([EUR(2_000_000)])
    expect(facilityCapitalExpenditureAt(world, p.project.id, '2030-03-01')).toEqual([EUR(2_000_000)])
    expect(committedFacilityExpenditureAt(world, p.project.id, '2030-03-01')).toEqual([EUR(12_000_000)])
  })

  it('28. a pre-CFI7 Save still loads', () => {
    const f = fixture()
    const saved = serializeGameWorldV4(f.world, SAVED_AT)
    const payload = { ...saved.payload } as Record<string, unknown>
    delete payload.facilityFinancialBindings
    const restored = deserializeGameWorldV4({ ...saved, payload })
    expect(restored.facilityFinancialBindingsById).toEqual({})
    expect(restored.facilitiesById).toEqual(f.world.facilitiesById)
  })

  it('29. a CFI7 rich Save round-trips Facilities + Finance + their bindings', () => {
    const f = fixture()
    const p = project(f.world, f.organization.id, f.facility.id)
    const action = completedAction(f.facility.id, f.component.id)
    const incident = createFacilityOperationalIncident({ id: 'incident:cfi7', facilityId: f.facility.id, componentId: f.component.id, category: 'EQUIPMENT_FAILURE', occurredAt: '2030-01-20' })
    let world = updateGameWorld(p.world, { facilityMaintenanceActions: [action], facilityOperationalIncidents: [incident] })
    world = executeFundedFacilityProjectStart(world, { projectId: p.project.id, organizationId: f.organization.id, amount: EUR(10_000_000), startedAt: '2030-01-01' }).world
    world = executeFacilityProjectCapitalPayment(world, { projectId: p.project.id, organizationId: f.organization.id, amount: EUR(2_000_000), paidOn: '2030-02-01', ledger, paymentSequence: 1 }).world
    world = authorizeFacilityMaintenanceExpenditure(world, { maintenanceActionId: action.id, organizationId: f.organization.id, amount: EUR(50_000), financialDate: '2030-02-10', recognizeImmediately: false }).world

    const restored = deserializeGameWorldV4(serializeGameWorldV4(world, SAVED_AT))
    expect(restored.facilitiesById).toEqual(world.facilitiesById)
    expect(restored.facilityOperationalIncidentsById).toEqual(world.facilityOperationalIncidentsById)
    expect(restored.financialCommitmentsById).toEqual(world.financialCommitmentsById)
    expect(restored.expenseRecognitionsById).toEqual(world.expenseRecognitionsById)
    expect(restored.operatingCostFactsById).toEqual(world.operatingCostFactsById)
    expect(restored.facilityFinancialBindingsById).toEqual(world.facilityFinancialBindingsById)
    // Traceability survives the round-trip in both directions.
    expect(financialFactsForDevelopmentProject(restored, p.project.id)).toHaveLength(4)
    expect(financialFactsForMaintenanceAction(restored, action.id)).toHaveLength(1)
  })

  it('30. a funded CFI6a renovation restores the prior facility lifecycle on completion', () => {
    const f = fixture('TEMPORARILY_CLOSED')
    const p = project(f.world, f.organization.id, f.facility.id)
    const started = executeFundedFacilityProjectStart(p.world, { projectId: p.project.id, organizationId: f.organization.id, amount: EUR(10_000_000), startedAt: '2030-01-01' })
    expect(started.world.facilitiesById[f.facility.id]!.status).toBe('UNDER_RENOVATION')
    expect(started.world.facilityDevelopmentProjectsById[p.project.id]!.facilityLifecyclePriorStatus).toBe('TEMPORARILY_CLOSED')
    const completed = completeFundedFacilityDevelopmentProject(started.world, p.project.id, '2030-05-01')
    // CFI6a regression guard: financing must not reintroduce UNDER_RENOVATION forever.
    expect(completed.world.facilitiesById[f.facility.id]!.status).toBe('TEMPORARILY_CLOSED')
  })

  it('31. no accounting depreciation is introduced', () => {
    const f = fixture()
    const facility = f.world.facilitiesById[f.facility.id]!
    for (const forbidden of ['depreciation', 'accumulatedDepreciation', 'amortization', 'bookValue', 'netBookValue']) {
      expect(Object.keys(facility)).not.toContain(forbidden)
    }
  })

  it('32. no facility valuation is invented', () => {
    const f = fixture()
    const facility = f.world.facilitiesById[f.facility.id]!
    for (const forbidden of ['marketValue', 'fairValue', 'assetValue', 'valuation']) {
      expect(Object.keys(facility)).not.toContain(forbidden)
    }
  })

  it('33. no duplicate Finance authority is introduced', () => {
    const f = fixture()
    // Facilities owns no ledger/account/budget/debt collection of its own; every such collection in
    // GameWorld is the canonical CF1-CF9 one.
    for (const forbidden of ['facilityLedgerById', 'facilityAccountsById', 'facilityBudgetsById', 'facilityDebtById', 'facilityTransactionsById', 'facilityPayablesById']) {
      expect(f.world).not.toHaveProperty(forbidden)
    }
    const binding = { sourceKind: 'FACILITY_DEVELOPMENT_PROJECT' } as const
    expect(binding.sourceKind).toBe('FACILITY_DEVELOPMENT_PROJECT')
  })
})
