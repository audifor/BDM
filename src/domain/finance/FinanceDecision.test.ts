import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { type OrganizationId, type TeamId } from '@/domain/ids'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { canTeamAffordAdditionalSalary, canTeamAffordAdditionalStaffSalary } from '@/domain/world/finances'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { getOrganizationFinanceAccounts, listFinanceBearingOrganizationIds, provisionOrganizationFinanceFoundation } from './FinanceFoundation'
import { createFinancialAccount, createFinancialTransaction } from './FinancialLedger'
import { createExpenseRecognition, createFinancialCommitment } from './Recognition'
import { createPayable } from './Treasury'
import { consumeFinancialReservation, createFinancialReservation, financialReservationId, getOpenFinancialReservations, releaseFinancialReservation, type FinancialReservation } from './FinancialReservations'
import { BUDGET_AUTHORIZATION_NOT_MODELLED, evaluateFinancialCommitment, getFinancialCapacitySnapshot, reserveFinancialCapacity } from './FinancialDecision'
import { createMoney } from './FinancialLedger'

/** Shipped-state world (immutable; every test derives new worlds from it). */
const shippedWorld = createNewGame()
const financeBearingOrganizations = listFinanceBearingOrganizationIds(shippedWorld)
const organizationA = financeBearingOrganizations[0]!
const organizationB = financeBearingOrganizations[1]!
const teamA = organizationA as unknown as TeamId
const currencyCode = 'EUR'
const asOfDate = shippedWorld.currentDate
const savedAt = '2032-10-01T00:00:00.000Z'
const provenance = { kind: 'BS16C_TEST', id: 'financial-decision' }

function eur(minorUnits: number) {
  return { currencyCode, minorUnits }
}

function provision(world: GameWorld, organizationId: OrganizationId): GameWorld {
  return provisionOrganizationFinanceFoundation(world, organizationId, { currencyCode })
}

/** Owner funding into the canonical operating cash account: the only way cash ever appears. */
function fund(world: GameWorld, organizationId: OrganizationId, minorUnits: number): GameWorld {
  const accounts = getOrganizationFinanceAccounts(world, organizationId, currencyCode)
  const transaction = createFinancialTransaction({
    id: `financial-tx:bs16c:funding:${organizationId}`,
    organizationId,
    effectiveOn: asOfDate,
    transactionType: 'OWNER_FUNDING',
    amount: eur(minorUnits),
    provenance: { kind: 'BS16C_TEST', id: `funding:${organizationId}` },
    postings: [
      { accountId: accounts.cashOperating.id, direction: 'DEBIT', amount: eur(minorUnits) },
      { accountId: accounts.equityControl.id, direction: 'CREDIT', amount: eur(minorUnits) },
    ],
  })
  return updateGameWorld(world, { financialTransactions: [...Object.values(world.financialTransactionsById), transaction] })
}

/** Restricted cash exists on a non-canonical account id and must never fund a commitment. */
function restrictCash(world: GameWorld, organizationId: OrganizationId, minorUnits: number): GameWorld {
  const accounts = getOrganizationFinanceAccounts(world, organizationId, currencyCode)
  const account = createFinancialAccount({ id: `financial-account:bs16c:restricted:${organizationId}`, organizationId, accountType: 'CASH_RESTRICTED', currencyCode, openedOn: null })
  const transaction = createFinancialTransaction({
    id: `financial-tx:bs16c:restricted:${organizationId}`,
    organizationId,
    effectiveOn: asOfDate,
    transactionType: 'RESTRICTED_DEPOSIT',
    amount: eur(minorUnits),
    provenance: { kind: 'BS16C_TEST', id: `restricted:${organizationId}` },
    postings: [
      { accountId: account.id, direction: 'DEBIT', amount: eur(minorUnits) },
      { accountId: accounts.equityControl.id, direction: 'CREDIT', amount: eur(minorUnits) },
    ],
  })
  return updateGameWorld(world, { financialAccounts: [...Object.values(world.financialAccountsById), account], financialTransactions: [...Object.values(world.financialTransactionsById), transaction] })
}

/** One payable that reached the payable subledger, the way production recognitions do. */
function withSupplierPayable(world: GameWorld, organizationId: OrganizationId, minorUnits: number): GameWorld {
  const recognitionId = `expense-recognition:bs16c:supplier:${organizationId}`
  const recognition = createExpenseRecognition({ id: recognitionId, organizationId, amount: eur(minorUnits), recognizedOn: asOfDate, category: 'SUPPLIER', provenance: { kind: 'BS16C_TEST', id: `supplier-expense:${organizationId}` }, payableId: `payable:bs16c:supplier:${organizationId}` })
  const payable = createPayable({ id: `payable:bs16c:supplier:${organizationId}`, organizationId, amount: eur(minorUnits), counterparty: { kind: 'EXTERNAL', label: 'Supplier' }, recognizedOn: asOfDate, dueOn: '2032-12-01', provenance: { kind: 'EXPENSE_RECOGNITION', id: recognitionId } })
  return updateGameWorld(world, { expenseRecognitions: [...Object.values(world.expenseRecognitionsById), recognition], payables: [...Object.values(world.payablesById), payable] })
}

function withCommitment(world: GameWorld, organizationId: OrganizationId, minorUnits: number): GameWorld {
  const commitment = createFinancialCommitment({ id: `financial-commitment:bs16c:${organizationId}`, organizationId, amount: eur(minorUnits), startsOn: asOfDate, dueOn: '2032-12-01', category: 'FACILITY_LEASE', provenance: { kind: 'BS16C_TEST', id: `commitment:${organizationId}` } })
  return updateGameWorld(world, { financialCommitments: [...Object.values(world.financialCommitmentsById), commitment] })
}

/** An expense recognition that never reached a payable subledger: still a real claim on cash. */
function withUnsubledgeredExpense(world: GameWorld, organizationId: OrganizationId, minorUnits: number): GameWorld {
  const recognition = createExpenseRecognition({ id: `expense-recognition:bs16c:direct:${organizationId}`, organizationId, amount: eur(minorUnits), recognizedOn: asOfDate, category: 'TRAVEL', provenance: { kind: 'BS16C_TEST', id: `direct-expense:${organizationId}` } })
  return updateGameWorld(world, { expenseRecognitions: [...Object.values(world.expenseRecognitionsById), recognition] })
}

function fundB(world: GameWorld): GameWorld {
  return fund(provision(world, organizationB), organizationB, 100_000)
}

describe('BS16C financial decision authority', () => {
  it('answers affordability with a structured contract instead of a boolean', () => {
    const world = fund(provision(shippedWorld, organizationA), organizationA, 1_000_000)
    const decision = evaluateFinancialCommitment(world, { organizationId: organizationA, amount: eur(400_000) })
    expect(decision).toMatchObject({
      status: 'AFFORDABLE_NOW',
      affordable: true,
      requiresFinancing: false,
      reservationConflict: false,
      currencyCode,
      asOfDate,
      requestedAmount: { currencyCode, minorUnits: 400_000 },
      fundingGapMinorUnits: 0,
      reservationBlockedMinorUnits: 0,
      requestedCategoryCommittedMinorUnits: null,
      availableAuthorizedHeadroomMinorUnits: null,
      budgetAuthorization: BUDGET_AUTHORIZATION_NOT_MODELLED,
    })
    expect(decision.reasons).toEqual(['AFFORDABLE_NOW', BUDGET_AUTHORIZATION_NOT_MODELLED])
    expect(decision.capacity?.availableCapacityMinorUnits).toBe(1_000_000)
    expect(decision.existingCommitments).toEqual([])
  })

  it('keeps cash, incurred obligations and restricted cash distinct', () => {
    let world = fund(provision(shippedWorld, organizationA), organizationA, 1_000_000)
    world = restrictCash(world, organizationA, 500_000)
    world = withSupplierPayable(world, organizationA, 200_000)
    world = withCommitment(world, organizationA, 300_000)
    world = withUnsubledgeredExpense(world, organizationA, 50_000)

    const capacity = getFinancialCapacitySnapshot(world, organizationA)
    expect(capacity).toMatchObject({
      unrestrictedCashMinorUnits: 1_000_000,
      restrictedCashMinorUnits: 500_000,
      payablesMinorUnits: 200_000,
      commitmentsMinorUnits: 300_000,
      recognizedWithoutPayableMinorUnits: 50_000,
      obligationsMinorUnits: 550_000,
      openReservationsMinorUnits: 0,
      capacityBeforeReservationsMinorUnits: 450_000,
      availableCapacityMinorUnits: 450_000,
    })

    expect(evaluateFinancialCommitment(world, { organizationId: organizationA, amount: eur(450_000), category: 'SUPPLIER' })).toMatchObject({
      status: 'AFFORDABLE_NOW',
      affordable: true,
      requestedCategoryCommittedMinorUnits: 200_000,
    })
    expect(evaluateFinancialCommitment(world, { organizationId: organizationA, amount: eur(450_001) })).toMatchObject({
      status: 'INSUFFICIENT_LIQUIDITY',
      affordable: false,
      requiresFinancing: true,
      fundingGapMinorUnits: 1,
      reservationBlockedMinorUnits: 0,
    })
    const obligations = evaluateFinancialCommitment(world, { organizationId: organizationA, amount: eur(1) }).existingCommitments
    expect(obligations.map((item) => [item.kind, item.remainingMinorUnits])).toEqual([
      ['PAYABLE', 200_000],
      ['PROGRAMMATIC_COMMITMENT', 300_000],
      ['RECOGNIZED_WITHOUT_PAYABLE', 50_000],
    ])
  })

  it('reports currency mismatch and a missing profile instead of inventing FX or defaults', () => {
    const world = fund(provision(shippedWorld, organizationA), organizationA, 1_000_000)
    const mismatch = evaluateFinancialCommitment(world, { organizationId: organizationA, amount: { currencyCode: 'USD', minorUnits: 100 } })
    expect(mismatch).toMatchObject({ status: 'CURRENCY_MISMATCH', affordable: false, currencyCode, capacity: null, fundingGapMinorUnits: 0 })
    expect(mismatch.reasons).toEqual(['CURRENCY_MISMATCH', BUDGET_AUTHORIZATION_NOT_MODELLED])

    const unavailable = evaluateFinancialCommitment(shippedWorld, { organizationId: organizationB, amount: eur(100) })
    expect(unavailable).toMatchObject({ status: 'FINANCE_PROFILE_UNAVAILABLE', affordable: false, currencyCode: null, capacity: null })
    expect(unavailable.reasons).toEqual(['FINANCE_PROFILE_UNAVAILABLE', BUDGET_AUTHORIZATION_NOT_MODELLED])
    expect(getFinancialCapacitySnapshot(shippedWorld, organizationB)).toBeNull()
    expect(getFinancialCapacitySnapshot(shippedWorld, organizationB, 'USD')).toMatchObject({ currencyCode: 'USD', unrestrictedCashMinorUnits: 0, availableCapacityMinorUnits: 0 })
  })

  it('reserves capacity, blocks later claims and never creates money', () => {
    const world = fund(provision(shippedWorld, organizationA), organizationA, 1_000_000)
    const reserved = reserveFinancialCapacity(world, { organizationId: organizationA, amount: eur(600_000), category: 'PLAYER_SALARY', sourceAuthority: 'CONTRACT', sourceEntityId: 'contract-1', createdOn: asOfDate })
    expect(reserved.status).toBe('RESERVED')
    expect(reserved.rejectionReason).toBeNull()
    expect(reserved.reservation).toMatchObject({ organizationId: organizationA, currencyCode, status: 'OPEN', resolvedOn: null, consumptionFactId: null, category: 'PLAYER_SALARY', amount: { currencyCode, minorUnits: 600_000 } })
    expect(Object.keys(reserved.world.financialTransactionsById)).toEqual(Object.keys(world.financialTransactionsById))
    expect(Object.keys(reserved.world.financialAccountsById)).toEqual(Object.keys(world.financialAccountsById))
    expect(Object.keys(reserved.world.payablesById)).toEqual(Object.keys(world.payablesById))
    expect(getFinancialCapacitySnapshot(reserved.world, organizationA)).toMatchObject({ openReservationsMinorUnits: 600_000, availableCapacityMinorUnits: 400_000, capacityBeforeReservationsMinorUnits: 1_000_000 })

    const conflict = evaluateFinancialCommitment(reserved.world, { organizationId: organizationA, amount: eur(400_001) })
    expect(conflict).toMatchObject({ status: 'RESERVED_CAPACITY_CONFLICT', reservationConflict: true, affordable: false, reservationBlockedMinorUnits: 1, fundingGapMinorUnits: 0, requiresFinancing: false })

    const blocked = reserveFinancialCapacity(reserved.world, { organizationId: organizationA, amount: eur(400_001), sourceAuthority: 'MARKET', sourceEntityId: 'negotiation-1', createdOn: asOfDate })
    expect(blocked).toMatchObject({ status: 'REJECTED', rejectionReason: 'RESERVED_CAPACITY_CONFLICT', reservation: null })
    expect(blocked.world).toBe(reserved.world)

    const fitting = reserveFinancialCapacity(reserved.world, { organizationId: organizationA, amount: eur(400_000), sourceAuthority: 'MARKET', sourceEntityId: 'negotiation-2', createdOn: asOfDate })
    expect(fitting.status).toBe('RESERVED')
    expect(getFinancialCapacitySnapshot(fitting.world, organizationA)?.availableCapacityMinorUnits).toBe(0)
    const exhausted = reserveFinancialCapacity(fitting.world, { organizationId: organizationA, amount: eur(1), sourceAuthority: 'STAFF', sourceEntityId: 'staff-1', createdOn: asOfDate })
    expect(exhausted).toMatchObject({ status: 'REJECTED', rejectionReason: 'RESERVED_CAPACITY_CONFLICT' })
    expect(getOpenFinancialReservations(fitting.world, organizationA, currencyCode)).toHaveLength(2)
  })

  it('is idempotent by provenance and rejects a conflicting reuse of one provenance', () => {
    const world = fund(provision(shippedWorld, organizationA), organizationA, 1_000_000)
    const request = { organizationId: organizationA, amount: eur(250_000), sourceAuthority: 'CONTRACT' as const, sourceEntityId: 'contract-7', createdOn: asOfDate }
    const first = reserveFinancialCapacity(world, request)
    expect(first.status).toBe('RESERVED')
    const repeat = reserveFinancialCapacity(first.world, request)
    expect(repeat).toMatchObject({ status: 'ALREADY_RESERVED', rejectionReason: null })
    expect(repeat.world).toBe(first.world)
    expect(repeat.reservation).toEqual(first.reservation)
    expect(Object.keys(repeat.world.financialReservationsById)).toHaveLength(1)
    expect(getFinancialCapacitySnapshot(repeat.world, organizationA)?.availableCapacityMinorUnits).toBe(750_000)

    const conflicting = reserveFinancialCapacity(first.world, { ...request, amount: eur(251_000) })
    expect(conflicting).toMatchObject({ status: 'REJECTED', rejectionReason: 'FINANCIAL_RESERVATION_PROVENANCE_CONFLICT', reservation: first.reservation })
    expect(conflicting.world).toBe(first.world)
  })

  it('releases capacity, consumes it permanently, and treats resolved provenance as terminal', () => {
    const world = fund(provision(shippedWorld, organizationA), organizationA, 1_000_000)
    const request = { organizationId: organizationA, amount: eur(500_000), sourceAuthority: 'STAFF' as const, sourceEntityId: 'staff-offer-1', createdOn: asOfDate }
    const reserved = reserveFinancialCapacity(world, request)
    const reservationId = String(reserved.reservation!.id)

    const released = releaseFinancialReservation(reserved.world, { reservationId, releasedOn: asOfDate })
    expect(released.reservation).toMatchObject({ status: 'RELEASED', resolvedOn: asOfDate, consumptionFactId: null })
    expect(getFinancialCapacitySnapshot(released.world, organizationA)?.availableCapacityMinorUnits).toBe(1_000_000)
    expect(getOpenFinancialReservations(released.world, organizationA, currencyCode)).toHaveLength(0)
    expect(releaseFinancialReservation(released.world, { reservationId }).world).toBe(released.world)
    expect(() => consumeFinancialReservation(released.world, { reservationId })).toThrow(/released and cannot be consumed/)
    expect(reserveFinancialCapacity(released.world, request)).toMatchObject({ status: 'REJECTED', rejectionReason: 'FINANCIAL_RESERVATION_PROVENANCE_RESOLVED' })

    const consumed = consumeFinancialReservation(reserved.world, { reservationId, consumedOn: asOfDate, consumptionFactId: 'financial-commitment:bs16c:1' })
    expect(consumed.reservation).toMatchObject({ status: 'CONSUMED', resolvedOn: asOfDate, consumptionFactId: 'financial-commitment:bs16c:1' })
    expect(consumeFinancialReservation(consumed.world, { reservationId, consumptionFactId: 'financial-commitment:bs16c:1' }).world).toBe(consumed.world)
    expect(() => consumeFinancialReservation(consumed.world, { reservationId, consumptionFactId: 'financial-commitment:bs16c:2' })).toThrow(/was consumed by/)
    expect(() => releaseFinancialReservation(consumed.world, { reservationId })).toThrow(/consumed and cannot be released/)
    // A resolved reservation no longer blocks capacity by itself: the canonical obligation that replaced it
    // carries the claim from then on.
    expect(getFinancialCapacitySnapshot(consumed.world, organizationA)?.availableCapacityMinorUnits).toBe(1_000_000)
    expect(getFinancialCapacitySnapshot(withCommitment(consumed.world, organizationA, 500_000), organizationA)?.availableCapacityMinorUnits).toBe(500_000)
  })

  it('keeps reservations append-only and immutable through canonical world updates', () => {
    const world = fund(provision(shippedWorld, organizationA), organizationA, 1_000_000)
    const reserved = reserveFinancialCapacity(world, { organizationId: organizationA, amount: eur(300_000), sourceAuthority: 'FACILITIES', sourceEntityId: 'project-1', createdOn: asOfDate })
    const reservation = reserved.reservation as FinancialReservation

    const releasedReservation = releaseFinancialReservation(reserved.world, { reservationId: String(reservation.id), releasedOn: asOfDate }).reservation
    const legalRelease = updateGameWorld(reserved.world, { financialReservations: [{ ...reservation, status: 'RELEASED', resolvedOn: asOfDate }] })
    expect(legalRelease.financialReservationsById[reservation.id]).toEqual(releasedReservation)

    expect(() => updateGameWorld(reserved.world, { financialReservations: [] })).toThrow(/cannot be removed/)
    expect(() => updateGameWorld(reserved.world, { financialReservations: [{ ...reservation, amount: createMoney(eur(1)) }] })).toThrow(/is immutable/)
    expect(() => updateGameWorld(reserved.world, { financialReservations: [{ ...reservation, sourceEntityId: 'project-2' }] })).toThrow(/does not match its provenance/)
    const consumedWorld = consumeFinancialReservation(reserved.world, { reservationId: String(reservation.id), consumedOn: asOfDate, consumptionFactId: 'fact-1' }).world
    const consumedReservation = consumedWorld.financialReservationsById[reservation.id]!
    expect(() => updateGameWorld(consumedWorld, { financialReservations: [{ ...consumedReservation, status: 'OPEN', resolvedOn: null, consumptionFactId: null }] })).toThrow(/cannot leave CONSUMED/)
    expect(() => updateGameWorld(consumedWorld, { financialReservations: [{ ...consumedReservation, consumptionFactId: 'fact-2' }] })).toThrow(/consumption reference is immutable/)
    expect(() => updateGameWorld(consumedWorld, { financialReservations: [{ ...consumedReservation, status: 'RELEASED' }] })).toThrow(/consumption fact requires CONSUMED status/)
    expect(() => updateGameWorld(reserved.world, { financialReservations: [...Object.values(reserved.world.financialReservationsById), createForeignReservation()] })).toThrow(/organization/)
  })

  it('isolates Organizations from each other and keeps decision dates explicit', () => {
    const world = fundB(fund(provision(shippedWorld, organizationA), organizationA, 1_000_000))
    const reserved = reserveFinancialCapacity(world, { organizationId: organizationA, amount: eur(1_000_000), sourceAuthority: 'TRADE', sourceEntityId: 'trade-1', createdOn: asOfDate })
    expect(reserved.status).toBe('RESERVED')
    expect(getOpenFinancialReservations(reserved.world, organizationB, currencyCode)).toHaveLength(0)
    expect(getFinancialCapacitySnapshot(reserved.world, organizationB)).toMatchObject({ openReservationsMinorUnits: 0, availableCapacityMinorUnits: 100_000 })
    expect(evaluateFinancialCommitment(reserved.world, { organizationId: organizationB, amount: eur(100_000) }).status).toBe('AFFORDABLE_NOW')
    expect(evaluateFinancialCommitment(reserved.world, { organizationId: organizationA, amount: eur(1) }).status).toBe('RESERVED_CAPACITY_CONFLICT')

    const laterReservation = reserveFinancialCapacity(reserved.world, { organizationId: organizationA, amount: eur(100), sourceAuthority: 'MANUAL_SYSTEM_ACTION', sourceEntityId: 'manual-1', createdOn: '2033-01-01' })
    expect(laterReservation).toMatchObject({ status: 'REJECTED', rejectionReason: 'RESERVED_CAPACITY_CONFLICT' })
    expect(evaluateFinancialCommitment(reserved.world, { organizationId: organizationA, amount: eur(100), asOfDate: '2033-01-01' }).status).toBe('RESERVED_CAPACITY_CONFLICT')
  })

  it('persists reservations through Save V4 and still loads pre-BS16C payloads', () => {
    const world = fund(provision(shippedWorld, organizationA), organizationA, 1_000_000)
    const reserved = reserveFinancialCapacity(world, { organizationId: organizationA, amount: eur(300_000), sourceAuthority: 'OWNERSHIP', sourceEntityId: 'capital-raise-1', createdOn: asOfDate })
    const consumed = consumeFinancialReservation(reserved.world, { reservationId: String(reserved.reservation!.id), consumedOn: asOfDate, consumptionFactId: 'fact-1' })
    const second = reserveFinancialCapacity(consumed.world, { organizationId: organizationA, amount: eur(100_000), sourceAuthority: 'ORGANIZATION', sourceEntityId: 'released-1', createdOn: asOfDate })
    expect(second.status).toBe('RESERVED')
    const released = releaseFinancialReservation(second.world, { reservationId: String(second.reservation!.id), releasedOn: asOfDate })

    const envelope = serializeGameWorldV4(released.world, savedAt)
    const restored = deserializeGameWorldV4(envelope)
    expect(restored.financialReservationsById).toEqual(released.world.financialReservationsById)
    expect(Object.values(restored.financialReservationsById).map((item) => item.status).sort()).toEqual(['CONSUMED', 'RELEASED'])

    const { financialReservations: _dropped, ...legacyPayload } = envelope.payload
    const legacy = deserializeGameWorldV4({ ...envelope, payload: legacyPayload as never })
    expect(legacy.financialReservationsById).toEqual({})
    expect(getFinancialCapacitySnapshot(legacy, organizationA)?.availableCapacityMinorUnits).toBe(1_000_000)
  })

  it('characterizes legacy budget affordability against the canonical liquidity authority', () => {
    const world = provision(shippedWorld, organizationA)
    expect(canTeamAffordAdditionalSalary(world, teamA, 1_000_000)).toBe(true)
    expect(canTeamAffordAdditionalStaffSalary(world, teamA, 1)).toBe(true)
    expect(evaluateFinancialCommitment(world, { organizationId: organizationA, amount: eur(1_000_000), category: 'PLAYER_SALARY' })).toMatchObject({
      status: 'INSUFFICIENT_LIQUIDITY',
      requiresFinancing: true,
      fundingGapMinorUnits: 1_000_000,
    })

    const fundedWorld = fund(world, organizationA, 2_000_000)
    expect(canTeamAffordAdditionalSalary(fundedWorld, teamA, 1_000_000)).toBe(true)
    expect(evaluateFinancialCommitment(fundedWorld, { organizationId: organizationA, amount: eur(1_000_000), category: 'PLAYER_SALARY' }).status).toBe('AFFORDABLE_NOW')

    // An over-budget legacy request is still affordable in cash terms; the legacy ceiling is a budget rule,
    // not a liquidity fact, and BS16C deliberately does not enforce informational budgets.
    expect(canTeamAffordAdditionalSalary(fundedWorld, teamA, 7_000_000)).toBe(false)
    expect(evaluateFinancialCommitment(fundedWorld, { organizationId: organizationA, amount: eur(1_000_000), category: 'PLAYER_SALARY' })).toMatchObject({ status: 'AFFORDABLE_NOW', availableAuthorizedHeadroomMinorUnits: null })
  })
})

function createForeignReservation(): FinancialReservation {
  return createFinancialReservation({ id: financialReservationId('CONTRACT', 'foreign'), organizationId: 'missing-organization', currencyCode, amount: eur(1), sourceAuthority: 'CONTRACT', sourceEntityId: 'foreign', createdOn: asOfDate })
}
