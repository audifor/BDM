import { describe, expect, it } from 'vitest'
import { createGameWorld, canTeamAffordAdditionalSalary, updateGameWorld, type GameWorld } from '@/domain/world'
import { createValidGameWorldInput } from '@/domain/world/testFixtures'
import { teamIdFromString } from '@/domain/ids'
import {
  createBudgetLine,
  createBudgetRevision,
  createFinancialAccount,
  createFinancialBudget,
  createFinancialCommitment,
  createFinancialTransaction,
  createForecastAssumption,
  createOrganizationFinancialProfile,
  createTeamFinances,
  evaluateOrganizationFinancialCommitment,
  getCategoryAuthorizedHeadroom,
  getEffectiveAuthorizedHeadroomMinorUnits,
  getOrganizationFinancialAuthorization,
  releaseFinancialReservation,
  reserveFinancialCommitment,
  type FinancialReservation,
} from '@/domain/finance'

const organizationId = 'team-home'
const PERIOD = { kind: 'DATE_RANGE', startsOn: '2032-07-01', endsOn: '2033-06-30' } as const
const AS_OF = '2032-10-01'
const NEXT_PERIOD_DATE = '2033-08-01'

const profile = createOrganizationFinancialProfile({ organizationId, baseCurrencyCode: 'EUR' })
const approval = { authorityKind: 'GOVERNANCE' as const, authorityId: 'board:1', approvedOn: '2032-06-15', provenance: { kind: 'GOVERNANCE_DECISION', id: 'decision:budget-1' } }

function eur(minorUnits: number) {
  return { currencyCode: 'EUR', minorUnits }
}

function approvedBudget(input: { readonly id: string; readonly revisionOfId?: string; readonly operations: number; readonly facilities: number; readonly createdOn?: string }) {
  const createdOn = input.createdOn ?? '2032-06-20'
  return {
    budget: createFinancialBudget({
      id: input.id,
      organizationId,
      currencyCode: 'EUR',
      period: PERIOD,
      status: 'APPROVED',
      label: 'Season authorization',
      createdOn,
      ...(input.revisionOfId === undefined ? {} : { revisionOfId: input.revisionOfId }),
      approval,
      provenance: { kind: 'BUDGET_PROPOSAL', id: input.id },
    }),
    lines: [
      createBudgetLine({ id: `${input.id}:operations`, budgetId: input.id, organizationId, category: 'OPERATIONS', direction: 'EXPENSE', amount: eur(input.operations), provenance: { kind: 'BUDGET_PROPOSAL', id: `${input.id}:operations` } }),
      createBudgetLine({ id: `${input.id}:facilities`, budgetId: input.id, organizationId, category: 'FACILITIES', direction: 'EXPENSE', amount: eur(input.facilities), provenance: { kind: 'BUDGET_PROPOSAL', id: `${input.id}:facilities` } }),
    ],
  }
}

function authorizationWorld(options: { readonly cash?: number; readonly budget?: ReturnType<typeof approvedBudget>; readonly commitments?: readonly ReturnType<typeof createFinancialCommitment>[]; readonly reservations?: readonly FinancialReservation[]; readonly withProfile?: boolean } = {}): GameWorld {
  const cash = options.cash ?? 1_000_000
  const accounts = cash === 0 ? [] : [
    createFinancialAccount({ id: 'cash:eur', organizationId, accountType: 'CASH', currencyCode: 'EUR', openedOn: '2032-07-01' }),
    createFinancialAccount({ id: 'equity:eur', organizationId, accountType: 'EQUITY', currencyCode: 'EUR', openedOn: '2032-07-01' }),
  ]
  const transactions = cash === 0 ? [] : [createFinancialTransaction({
    id: 'finance:opening',
    organizationId,
    effectiveOn: '2032-07-01',
    transactionType: 'OPENING_BALANCE',
    amount: eur(cash),
    postings: [
      { accountId: 'cash:eur', direction: 'DEBIT', amount: eur(cash) },
      { accountId: 'equity:eur', direction: 'CREDIT', amount: eur(cash) },
    ],
    provenance: { kind: 'MIGRATION', id: 'bs16d' },
  })]
  return createGameWorld({
    ...createValidGameWorldInput(),
    financialAccounts: accounts,
    financialTransactions: transactions,
    ...(options.withProfile === false ? {} : { organizationFinancialProfiles: [profile] }),
    ...(options.budget === undefined ? {} : { financialBudgets: [options.budget.budget], budgetLines: options.budget.lines }),
    ...(options.commitments === undefined ? {} : { financialCommitments: options.commitments }),
    ...(options.reservations === undefined ? {} : { financialReservations: options.reservations }),
  })
}

function operationsCommitment(id: string, minorUnits: number) {
  return createFinancialCommitment({
    id,
    organizationId,
    amount: eur(minorUnits),
    startsOn: '2032-08-01',
    dueOn: '2032-12-31',
    category: 'OPERATIONS',
    provenance: { kind: 'OPERATING_AUTHORIZED_EVENT', id },
  })
}

function authorizationOf(world: GameWorld, asOfDate: string = AS_OF) {
  return getOrganizationFinancialAuthorization(world, { organizationId, currencyCode: 'EUR', asOfDate })
}

describe('BS16D authorization authority', () => {
  it('derives authorization from the canonical approved budget fact and exposes its provenance', () => {
    const authorization = authorizationOf(authorizationWorld({ budget: approvedBudget({ id: 'budget:a1', operations: 400_000, facilities: 600_000 }) }))

    expect(authorization.state).toBe('ACTIVE')
    expect(authorization.budgetId).toBe('budget:a1')
    expect(authorization.organizationId).toBe(organizationId)
    expect(authorization.currencyCode).toBe('EUR')
    expect(authorization.period).toEqual(PERIOD)
    expect(authorization.approval).toEqual(approval)
    expect(authorization.authorizedMinorUnits).toBe(1_000_000)
    expect(authorization.lines.map((line) => line.category)).toEqual(['FACILITIES', 'OPERATIONS'])
  })

  it('resolves deterministically for the same world and effective date', () => {
    const world = authorizationWorld({ budget: approvedBudget({ id: 'budget:a1', operations: 400_000, facilities: 600_000 }) })

    expect(authorizationOf(world)).toEqual(authorizationOf(world))
    expect(Object.keys(world.financialBudgetsById)).toEqual(['budget:a1'])
  })

  it('keeps authorization distinct from money, forecasts and informational budgets', () => {
    const budget = approvedBudget({ id: 'budget:a1', operations: 400_000, facilities: 600_000 })
    const world = updateGameWorld(authorizationWorld({ budget }), {
      forecastAssumptions: [createForecastAssumption({ id: 'assumption:optimistic', organizationId, scenario: 'UPSIDE', kind: 'EXPENSE', amount: eur(5_000_000), period: PERIOD, category: 'OPERATIONS', explanation: 'Optimistic operations plan', provenance: { kind: 'FORECAST', id: 'assumption:optimistic' } })],
    })

    // A 5M forecast assumption grants no spending permission, and approving a budget moved no cash.
    expect(authorizationOf(world).authorizedMinorUnits).toBe(1_000_000)
    expect(Object.keys(world.financialTransactionsById)).toEqual(['finance:opening'])
    expect(Object.keys(world.financialAccountsById)).toEqual(['cash:eur', 'equity:eur'])
  })

  it('does not turn a draft, proposed or informational budget into spending permission', () => {
    const draft = createFinancialBudget({ id: 'budget:draft', organizationId, currencyCode: 'EUR', period: PERIOD, status: 'PROPOSED', label: 'Proposed authorization', createdOn: '2032-06-20', provenance: { kind: 'BUDGET_PROPOSAL', id: 'budget:draft' } })
    const world = createGameWorld({
      ...createValidGameWorldInput(),
      organizationFinancialProfiles: [profile],
      financialBudgets: [draft],
      budgetLines: [createBudgetLine({ id: 'budget:draft:operations', budgetId: 'budget:draft', organizationId, category: 'OPERATIONS', direction: 'EXPENSE', amount: eur(900_000), provenance: { kind: 'BUDGET_PROPOSAL', id: 'budget:draft:operations' } })],
    })

    const authorization = authorizationOf(world)
    const decision = evaluateOrganizationFinancialCommitment(world, { organizationId, currency: 'EUR', amount: eur(10_000), category: 'OPERATIONS', asOfDate: AS_OF })

    expect(authorization.state).toBe('NOT_PROVISIONED')
    expect(authorization.authorizedMinorUnits).toBe(0)
    expect(decision.reasonCodes).toContain('BUDGET_AUTHORIZATION_NOT_MODELLED')
    expect(decision.reasonCodes).not.toContain('INSUFFICIENT_AUTHORIZED_HEADROOM')
  })

  it('computes headroom as authorization minus in-scope commitments minus OPEN reservations', () => {
    const budget = approvedBudget({ id: 'budget:a1', operations: 400_000, facilities: 600_000 })
    const held = reserveFinancialCommitment({
      organizationFinancialProfile: profile,
      organizationId,
      amount: eur(150_000),
      currentCash: eur(1_000_000),
      sourceAuthority: 'FACILITY',
      sourceEntityId: 'facility:1',
      createdOn: '2032-08-01',
    })
    const world = authorizationWorld({ budget, commitments: [operationsCommitment('commitment:ops', 100_000)], reservations: held.reservations })
    const authorization = authorizationOf(world)

    expect(authorization.authorizedMinorUnits).toBe(1_000_000)
    expect(authorization.committedMinorUnits).toBe(100_000)
    expect(authorization.reservedMinorUnits).toBe(150_000)
    expect(authorization.availableHeadroomMinorUnits).toBe(750_000)
    expect(authorization.overAuthorized).toBe(false)
    expect(getCategoryAuthorizedHeadroom(authorization, 'OPERATIONS')).toMatchObject({ authorizedMinorUnits: 400_000, committedMinorUnits: 100_000, availableHeadroomMinorUnits: 300_000 })
    // Reservations are organization-scoped, so a category decision never exceeds the organization headroom.
    expect(getEffectiveAuthorizedHeadroomMinorUnits(authorization, 'OPERATIONS')).toBe(300_000)
    expect(getEffectiveAuthorizedHeadroomMinorUnits(authorization)).toBe(750_000)
  })

  it('restores headroom when a reservation is released and stops counting a consumed one', () => {
    const budget = approvedBudget({ id: 'budget:a1', operations: 400_000, facilities: 600_000 })
    const held = reserveFinancialCommitment({ organizationFinancialProfile: profile, organizationId, amount: eur(150_000), currentCash: eur(1_000_000), sourceAuthority: 'FACILITY', sourceEntityId: 'facility:1', createdOn: '2032-08-01' })
    const released = held.reservations.map((reservation) => releaseFinancialReservation(reservation))

    expect(authorizationOf(authorizationWorld({ budget, reservations: held.reservations })).availableHeadroomMinorUnits).toBe(850_000)
    expect(authorizationOf(authorizationWorld({ budget, reservations: released })).availableHeadroomMinorUnits).toBe(1_000_000)
  })

  it('reports unattributed commitment categories instead of guessing their authorization', () => {
    const budget = approvedBudget({ id: 'budget:a1', operations: 400_000, facilities: 600_000 })
    const misc = createFinancialCommitment({ id: 'commitment:misc', organizationId, amount: eur(25_000), startsOn: '2032-08-01', dueOn: '2032-09-30', category: 'MEDICAL', provenance: { kind: 'OPERATING_AUTHORIZED_EVENT', id: 'commitment:misc' } })
    const authorization = authorizationOf(authorizationWorld({ budget, commitments: [misc] }))

    expect(authorization.unattributedCommitmentCategories).toEqual(['MEDICAL'])
    expect(authorization.committedMinorUnits).toBe(0)
    expect(authorization.reservationScopeAttribution).toBe('ORGANIZATION_ONLY')
  })

  it('isolates organizations, currencies and fiscal periods', () => {
    const budget = approvedBudget({ id: 'budget:a1', operations: 400_000, facilities: 600_000 })
    const world = authorizationWorld({ budget })
    const otherOrg = createOrganizationFinancialProfile({ organizationId: 'team-away', baseCurrencyCode: 'USD' })
    const otherBudget = createFinancialBudget({ id: 'budget:b1', organizationId: 'team-away', currencyCode: 'USD', period: PERIOD, status: 'APPROVED', label: 'Other club authorization', createdOn: '2032-06-20', approval, provenance: { kind: 'BUDGET_PROPOSAL', id: 'budget:b1' } })
    const withOther = updateGameWorld(world, { organizationFinancialProfiles: [profile, otherOrg], financialBudgets: [budget.budget, otherBudget] })

    // No cross-organization and no cross-currency authorization.
    expect(getOrganizationFinancialAuthorization(withOther, { organizationId: 'team-away', currencyCode: 'USD', asOfDate: AS_OF }).authorizedMinorUnits).toBe(0)
    expect(getOrganizationFinancialAuthorization(withOther, { organizationId: 'team-away', currencyCode: 'EUR', asOfDate: AS_OF }).state).toBe('NOT_PROVISIONED')
    expect(getOrganizationFinancialAuthorization(withOther, { organizationId, currencyCode: 'USD', asOfDate: AS_OF }).state).toBe('NOT_PROVISIONED')
    expect(evaluateOrganizationFinancialCommitment(withOther, { organizationId, currency: 'USD', amount: eur(10_000), asOfDate: AS_OF }).status).toBe('CURRENCY_MISMATCH')

    // Period N authorization never governs period N+1 without explicit rollover: once its period has
    // ended the organization is simply not provisioned for the new period (no silent carry-forward).
    const outside = authorizationOf(withOther, NEXT_PERIOD_DATE)
    expect(outside.state).toBe('NOT_PROVISIONED')
    expect(outside.availableHeadroomMinorUnits).toBe(0)
    const outsideDecision = evaluateOrganizationFinancialCommitment(withOther, { organizationId, currency: 'EUR', amount: eur(10_000), asOfDate: NEXT_PERIOD_DATE })
    expect(outsideDecision.reasonCodes).toContain('BUDGET_AUTHORIZATION_NOT_MODELLED')
    expect(outsideDecision.reasonCodes).not.toContain('AUTHORIZATION_OUT_OF_PERIOD')

    // An authorization that has not started yet is distinct from a lapsed one.
    const futureBudget = createFinancialBudget({ id: 'budget:future', organizationId, currencyCode: 'EUR', period: { kind: 'DATE_RANGE', startsOn: '2034-07-01', endsOn: '2035-06-30' }, status: 'APPROVED', label: 'Future authorization', createdOn: '2033-01-01', approval, provenance: { kind: 'BUDGET_PROPOSAL', id: 'budget:future' } })
    const withFuture = authorizationWorld({ budget: { budget: futureBudget, lines: [] } })
    expect(authorizationOf(withFuture).state).toBe('OUT_OF_PERIOD')
    expect(evaluateOrganizationFinancialCommitment(withFuture, { organizationId, currency: 'EUR', amount: eur(10_000), asOfDate: AS_OF }).reasonCodes).toEqual(expect.arrayContaining(['BUDGET_AUTHORIZATION_NOT_MODELLED', 'AUTHORIZATION_OUT_OF_PERIOD']))
  })

  it('distinguishes authorization blockers from liquidity blockers', () => {
    const budget = approvedBudget({ id: 'budget:a1', operations: 400_000, facilities: 600_000 })
    const rich = authorizationWorld({ budget, cash: 1_000_000 })
    const poor = authorizationWorld({ budget, cash: 100_000 })

    const both = evaluateOrganizationFinancialCommitment(rich, { organizationId, currency: 'EUR', amount: eur(300_000), category: 'OPERATIONS', asOfDate: AS_OF })
    const authorizationShort = evaluateOrganizationFinancialCommitment(rich, { organizationId, currency: 'EUR', amount: eur(500_000), category: 'OPERATIONS', asOfDate: AS_OF })
    const liquidityShort = evaluateOrganizationFinancialCommitment(poor, { organizationId, currency: 'EUR', amount: eur(300_000), category: 'OPERATIONS', asOfDate: AS_OF })

    expect(both.status).toBe('AFFORDABLE_NOW')
    expect(both.reasonCodes).not.toContain('BUDGET_AUTHORIZATION_NOT_MODELLED')
    expect(both.availableAuthorizedHeadroom).toEqual(eur(400_000))
    expect(authorizationShort.status).toBe('INSUFFICIENT_AUTHORIZED_HEADROOM')
    expect(authorizationShort.reasonCodes).not.toContain('INSUFFICIENT_LIQUIDITY')
    expect(liquidityShort.status).toBe('INSUFFICIENT_LIQUIDITY')
    expect(liquidityShort.liquidity.fundingGap).toEqual(eur(200_000))
  })

  it('keeps authorization precedence deterministic when both capacities are short', () => {
    const budget = approvedBudget({ id: 'budget:a1', operations: 400_000, facilities: 600_000 })
    const decision = evaluateOrganizationFinancialCommitment(authorizationWorld({ budget, cash: 10_000 }), { organizationId, currency: 'EUR', amount: eur(500_000), category: 'OPERATIONS', asOfDate: AS_OF })

    // Precedence: profile -> currency -> authorization -> liquidity -> financing.
    expect(decision.status).toBe('INSUFFICIENT_AUTHORIZED_HEADROOM')
  })

  it('treats missing authorization explicitly instead of as zero spending permission', () => {
    const world = authorizationWorld({ cash: 1_000_000 })
    const decision = evaluateOrganizationFinancialCommitment(world, { organizationId, currency: 'EUR', amount: eur(250_000), asOfDate: AS_OF })

    expect(authorizationOf(world).state).toBe('NOT_PROVISIONED')
    expect(decision.status).toBe('AFFORDABLE_NOW')
    expect(decision.availableAuthorizedHeadroom).toBeNull()
    expect(decision.reasonCodes).toEqual(expect.arrayContaining(['BUDGET_AUTHORIZATION_NOT_MODELLED', 'AFFORDABLE_NOW']))
    expect(decision.reasonCodes).not.toContain('INSUFFICIENT_AUTHORIZED_HEADROOM')
  })

  it('exposes over-authorized truth when a newer approval lowers the limit without deleting obligations', () => {
    const first = approvedBudget({ id: 'budget:a1', operations: 400_000, facilities: 600_000 })
    const lowered = approvedBudget({ id: 'budget:a2', revisionOfId: 'budget:a1', operations: 50_000, facilities: 0, createdOn: '2032-09-01' })
    const world = authorizationWorld({ budget: first, commitments: [operationsCommitment('commitment:ops', 100_000)] })
    const revised = updateGameWorld(world, {
      financialBudgets: [first.budget, lowered.budget],
      budgetLines: [...first.lines, ...lowered.lines],
      budgetRevisions: [createBudgetRevision({ id: 'revision:1', organizationId, budgetId: 'budget:a2', supersedesBudgetId: 'budget:a1', revisionNumber: 1, createdOn: '2032-09-01', reason: 'Board lowered the authorization', provenance: { kind: 'GOVERNANCE_DECISION', id: 'decision:budget-2' } })],
    })
    const authorization = authorizationOf(revised)

    expect(authorization.state).toBe('ACTIVE')
    expect(authorization.budgetId).toBe('budget:a2')
    expect(authorization.authorizedMinorUnits).toBe(50_000)
    expect(authorization.committedMinorUnits).toBe(100_000)
    expect(authorization.availableHeadroomMinorUnits).toBe(-50_000)
    expect(authorization.overAuthorized).toBe(true)
    expect(authorization.lines.find((line) => line.category === 'OPERATIONS')?.overAuthorized).toBe(true)
    // The obligation survives the authorization change and no accounting fact is rewritten.
    expect(Object.keys(revised.financialCommitmentsById)).toEqual(['commitment:ops'])
    expect(Object.keys(revised.financialTransactionsById)).toEqual(['finance:opening'])
    expect(evaluateOrganizationFinancialCommitment(revised, { organizationId, currency: 'EUR', amount: eur(1), category: 'OPERATIONS', asOfDate: AS_OF }).status).toBe('INSUFFICIENT_AUTHORIZED_HEADROOM')
  })

  it('lets a reservation consume both capacities and restores them on release', () => {
    // Scenario 1 (§8): authorization and cash are both 100; a 60 reservation blocks the next 50 request.
    // The derivation consumes the reservation from the authorization headroom, so the authorization gate
    // (which precedes the capacity/liquidity gate) reports the blocker, and release restores it.
    const tightBudget = approvedBudget({ id: 'budget:a1', operations: 100_000, facilities: 0 })
    const tight = authorizationWorld({ budget: tightBudget, cash: 100_000 })
    const first = reserveFinancialCommitment({
      organizationFinancialProfile: profile,
      organizationId,
      amount: eur(60_000),
      currentCash: eur(100_000),
      authorizedHeadroom: eur(100_000),
      sourceAuthority: 'FACILITY',
      sourceEntityId: 'facility:project-1',
      createdOn: '2032-08-01',
    })
    const reserved = updateGameWorld(tight, { financialReservations: first.reservations })
    const blocked = evaluateOrganizationFinancialCommitment(reserved, { organizationId, currency: 'EUR', amount: eur(50_000), category: 'OPERATIONS', asOfDate: AS_OF })
    const released = updateGameWorld(reserved, { financialReservations: first.reservations.map((reservation) => releaseFinancialReservation(reservation)) })
    const afterRelease = evaluateOrganizationFinancialCommitment(released, { organizationId, currency: 'EUR', amount: eur(50_000), category: 'OPERATIONS', asOfDate: AS_OF })

    expect(first.outcome).toBe('CREATED')
    expect(getOrganizationFinancialAuthorization(reserved, { organizationId, currencyCode: 'EUR', asOfDate: AS_OF }).reservedMinorUnits).toBe(60_000)
    expect(blocked.status).toBe('INSUFFICIENT_AUTHORIZED_HEADROOM')
    expect(afterRelease.status).toBe('AFFORDABLE_NOW')

    // Scenario 2: with ample authorization the same reservation blocks liquidity instead, and BS16C's
    // RESERVED_CAPACITY_CONFLICT distinction applies because the shortfall is attributable to the hold.
    const ample = authorizationWorld({ budget: approvedBudget({ id: 'budget:a2', operations: 500_000, facilities: 0 }), cash: 100_000, reservations: first.reservations })
    const liquidityBlocked = evaluateOrganizationFinancialCommitment(ample, { organizationId, currency: 'EUR', amount: eur(50_000), category: 'OPERATIONS', asOfDate: AS_OF })
    const liquidityReleased = updateGameWorld(ample, { financialReservations: first.reservations.map((reservation) => releaseFinancialReservation(reservation)) })
    const liquidityAfterRelease = evaluateOrganizationFinancialCommitment(liquidityReleased, { organizationId, currency: 'EUR', amount: eur(50_000), category: 'OPERATIONS', asOfDate: AS_OF })

    expect(liquidityBlocked.status).toBe('RESERVED_CAPACITY_CONFLICT')
    expect(liquidityBlocked.liquidity.reservedCapacity).toEqual(eur(60_000))
    expect(liquidityAfterRelease.status).toBe('AFFORDABLE_NOW')
  })

  it('leaves the legacy TeamFinances authority untouched and unwired', () => {
    const teamId = teamIdFromString('team-home')
    const world = createGameWorld({
      ...createValidGameWorldInput(),
      teamFinances: [createTeamFinances({ teamId, playerSalaryBudget: 1_000_000, staffSalaryBudget: 500_000 })],
    })
    const before = world.teamFinancesByTeamId

    const authorization = authorizationOf(world)

    // Canonical authorization exists independently of the legacy budget pools and writes nothing.
    expect(authorization.state).toBe('NOT_PROVISIONED')
    expect(world.teamFinancesByTeamId).toBe(before)
    expect(canTeamAffordAdditionalSalary(world, teamId, 250_000)).toBe(true)
  })
})
