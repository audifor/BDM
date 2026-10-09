import { describe, expect, it } from 'vitest'

import { createAcbTestGame, createNewGame, PROTOTYPE_GAME_CONFIGURATION } from '@/app/game'
import { getAccountBalanceAsOfDate } from '@/domain/finance/FinancialQueries'
import { getCashBalancesByCurrency } from '@/domain/finance/CashFlowQueries'
import {
  createFinancialTransaction,
  ensureCanonicalFinanceFoundation,
  evaluateOrganizationFinancialCommitment,
  findOrganizationOpeningEconomicState,
  getFinanceActivationReport,
  getOpeningEconomicStateReport,
  getOrganizationFinanceAccounts,
  getOrganizationOpeningEconomicStateStatus,
  legacyMajorUnitsToMoney,
  materializeOrganizationOpeningEconomicState,
  SHIPPED_OPENING_SOURCE_CLASSIFICATION,
  type OpeningEconomicStateSource,
} from '@/domain/finance'
import { organizationIdFromString, type OrganizationId } from '@/domain/ids'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { generateWorld } from '@/engine/world'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'

/**
 * BS16H certifies the opening economic state. A club only gets cash when a real economic fact explains where it
 * came from, so these tests prove both halves: shipped careers (which have no such authority) keep truthful zero
 * cash, and an explicitly supplied legitimate source materializes exactly one balanced opening posting.
 */
const SAVED_AT = '2026-09-20T00:00:00.000Z'
const eur = (minorUnits: number) => ({ currencyCode: 'EUR', minorUnits })

function clubWorld(): GameWorld {
  return createAcbTestGame()
}

function organizationIdsOf(world: GameWorld): readonly OrganizationId[] {
  return [...new Set(Object.values(world.teams).map((team) => team.organizationId))].sort((left, right) => String(left).localeCompare(String(right)))
}

function ownerCapital(organizationId: OrganizationId | string, minorUnits = 25_000_000, overrides: Partial<OpeningEconomicStateSource> = {}): OpeningEconomicStateSource {
  return {
    sourceAuthority: 'OWNERSHIP',
    sourceEntityId: 'owner:acb-0001',
    organizationId,
    currencyCode: 'EUR',
    effectiveOn: '2026-09-19',
    cashMinorUnits: minorUnits,
    counterpartKind: 'OWNER_CAPITAL',
    counterpartId: 'person:owner-0001',
    ...overrides,
  }
}

function cashOf(world: GameWorld, organizationId: OrganizationId | string, asOfDate?: string): number {
  return getCashBalancesByCurrency(world, organizationId, asOfDate ?? world.currentDate).reduce((sum, row) => sum + row.totalCashMinorUnits, 0)
}

describe('BS16H shipped opening economic sources', () => {
  it('classifies every audited shipped candidate and materializes none of them', () => {
    expect(SHIPPED_OPENING_SOURCE_CLASSIFICATION.length).toBeGreaterThan(0)
    expect(SHIPPED_OPENING_SOURCE_CLASSIFICATION.every((entry) => entry.materialized === false)).toBe(true)
    // No shipped candidate is a real opening balance, revenue, capital or debt authority.
    expect(SHIPPED_OPENING_SOURCE_CLASSIFICATION.filter((entry) => entry.classification === 'REAL_OPENING_BALANCE_AUTHORITY')).toEqual([])
    expect(SHIPPED_OPENING_SOURCE_CLASSIFICATION.filter((entry) => ['REVENUE_AUTHORITY', 'CAPITAL_FUNDING_AUTHORITY', 'DEBT_AUTHORITY'].includes(entry.classification))).toEqual([])
    // The club money facts that do exist are spending authorizations.
    expect(SHIPPED_OPENING_SOURCE_CLASSIFICATION.filter((entry) => entry.source.startsWith('TeamFinances')).map((entry) => entry.classification)).toEqual(['SPENDING_AUTHORIZATION_ONLY', 'SPENDING_AUTHORIZATION_ONLY'])
  })

  it('never converts a salary budget or an approval into cash', () => {
    for (const world of [createNewGame(), clubWorld(), generateWorld({ ...PROTOTYPE_GAME_CONFIGURATION, includeNbaLike: true })]) {
      const activated = ensureCanonicalFinanceFoundation(world)
      const report = getFinanceActivationReport(activated)
      const authorized = report.organizations.filter((entry) => entry.budgetId !== null)

      expect(authorized.length).toBeGreaterThan(0)
      expect(Object.keys(activated.financialBudgetsById).length).toBeGreaterThan(0)
      // Authorization exists; liquidity does not, and no opening fact was invented for any organization.
      // Activation adds no ledger facts; existing date-zero payroll is not opening cash.
      expect(activated.financialTransactionsById).toEqual(world.financialTransactionsById)
      expect(getOpeningEconomicStateReport(activated, organizationIdsOf(activated)).every((entry) => entry.status === 'FINANCE_PROFILE_UNAVAILABLE' || entry.cashMinorUnits === 0)).toBe(true)
      // Organizations whose currency does not resolve have no profile to hold a position; every other one
      // reports the audited absence of an opening source rather than a materialized position.
      for (const entry of report.organizations.filter((entry) => entry.openingEconomicState !== 'FINANCE_PROFILE_UNAVAILABLE')) {
        const hasHistory = Object.values(world.financialTransactionsById).some(transaction => transaction.organizationId === entry.organizationId)
        expect(entry.openingEconomicState).toBe(hasHistory ? 'EXISTING_FINANCE_HISTORY_PRESERVED' : 'OPENING_ECONOMIC_STATE_UNAVAILABLE')
      }
      expect(report.organizations.some((entry) => entry.openingEconomicState === 'MATERIALIZED' || entry.openingEconomicState === 'ALREADY_MATERIALIZED')).toBe(false)
    }
  })

  it('keeps every shipped club at truthful zero cash with an explicit report', () => {
    const world = ensureCanonicalFinanceFoundation(clubWorld())
    const report = getOpeningEconomicStateReport(world, organizationIdsOf(world))

    expect(report).toHaveLength(18)
    expect(report.every((entry) => entry.status === 'OPENING_ECONOMIC_STATE_UNAVAILABLE')).toBe(true)
    expect(report.every((entry) => entry.cashMinorUnits === 0 && entry.transactionId === null)).toBe(true)
  })
})

describe('BS16H canonical opening economic state materialization', () => {
  it('posts a legitimate owner-capital position as one balanced double-entry transaction', () => {
    const world = clubWorld()
    const organizationId = organizationIdsOf(world)[0]!
    const activated = ensureCanonicalFinanceFoundation(world, { openingEconomicStates: [ownerCapital(organizationId)] })

    const opening = findOrganizationOpeningEconomicState(activated, organizationId)!
    expect(opening.transactionType).toBe('OPENING_BALANCE')
    expect(opening.provenance.kind).toBe('OPENING_ECONOMIC_STATE')
    expect(opening.provenance.id).toBe('OWNERSHIP:owner:acb-0001')
    expect(opening.amount).toEqual(eur(25_000_000))
    // Balanced double entry: cash is debited, its legitimate counterpart credited, for the same amount.
    const accounts = getOrganizationFinanceAccounts(activated, organizationId, 'EUR')
    expect(opening.postings.map((posting) => [String(posting.accountId), posting.direction, posting.amount.minorUnits])).toEqual([
      [String(accounts.cashOperating.id), 'DEBIT', 25_000_000],
      [String(accounts.equityControl.id), 'CREDIT', 25_000_000],
    ])
    // Balances are derived from the posting, never written into a cash field. Equity is a credit account, so
    // its canonical signed balance is negative while the cash asset is positive.
    expect(cashOf(activated, organizationId)).toBe(25_000_000)
    expect(getAccountBalanceAsOfDate(activated, accounts.cashOperating.id, activated.currentDate)).toMatchObject({ debitMinorUnits: 25_000_000, creditMinorUnits: 0, balanceMinorUnits: 25_000_000 })
    expect(getAccountBalanceAsOfDate(activated, accounts.equityControl.id, activated.currentDate)).toMatchObject({ debitMinorUnits: 0, creditMinorUnits: 25_000_000, balanceMinorUnits: -25_000_000 })
    expect(getAccountBalanceAsOfDate(activated, accounts.debtLiability.id, activated.currentDate).balanceMinorUnits).toBe(0)
    expect(getOrganizationOpeningEconomicStateStatus(activated, organizationId)).toBe('ALREADY_MATERIALIZED')
  })

  it('posts a liability counterpart as debt instead of equity', () => {
    const world = clubWorld()
    const organizationId = organizationIdsOf(world)[0]!
    const activated = ensureCanonicalFinanceFoundation(world, {
      openingEconomicStates: [ownerCapital(organizationId, 8_000_000, { counterpartKind: 'LIABILITY', counterpartId: 'institution:bank-0001', sourceEntityId: 'loan:acb-0001' })],
    })

    const accounts = getOrganizationFinanceAccounts(activated, organizationId, 'EUR')
    // A liability is a credit account: cash is the positive asset, the debt the negative signed balance.
    expect(getAccountBalanceAsOfDate(activated, accounts.debtLiability.id, activated.currentDate)).toMatchObject({ creditMinorUnits: 8_000_000, balanceMinorUnits: -8_000_000 })
    expect(getAccountBalanceAsOfDate(activated, accounts.equityControl.id, activated.currentDate).balanceMinorUnits).toBe(0)
  })

  it('requires a counterpart identity whenever the source semantics need one', () => {
    const world = clubWorld()
    const organizationId = organizationIdsOf(world)[0]!

    for (const counterpartKind of ['OWNER_CAPITAL', 'LIABILITY'] as const) {
      const result = materializeOrganizationOpeningEconomicState(world, ownerCapital(organizationId, 1_000_000, { counterpartKind, counterpartId: null }))
      expect(result.status).toBe('COUNTERPART_UNAVAILABLE')
      expect(result.world).toBe(world)
      expect(Object.keys(result.world.financialTransactionsById)).toEqual([])
    }
    // Retained net assets is the one posture that needs no counterparty identity.
    expect(materializeOrganizationOpeningEconomicState(world, ownerCapital(organizationId, 1_000_000, { counterpartKind: 'RETAINED_NET_ASSETS', counterpartId: null })).status).toBe('MATERIALIZED')
  })

  it('refuses unsupported currencies and invalid amounts', () => {
    const activated = ensureCanonicalFinanceFoundation(clubWorld())
    const organizationId = organizationIdsOf(activated)[0]!

    const foreign = materializeOrganizationOpeningEconomicState(activated, ownerCapital(organizationId, 1_000_000, { currencyCode: 'USD' }))
    expect(foreign.status).toBe('CURRENCY_MISMATCH')
    expect(foreign.world).toBe(activated)

    for (const cashMinorUnits of [0, -1, 1.5]) {
      expect(materializeOrganizationOpeningEconomicState(activated, ownerCapital(organizationId, cashMinorUnits)).status).toBe('INVALID_OPENING_AMOUNT')
    }
    expect(Object.keys(activated.financialTransactionsById)).toEqual([])
  })

  it('is idempotent by provenance and never posts a second opening fact for one organization', () => {
    const world = clubWorld()
    const organizationId = organizationIdsOf(world)[0]!
    const first = ensureCanonicalFinanceFoundation(world, { openingEconomicStates: [ownerCapital(organizationId)] })
    const transactionIds = Object.keys(first.financialTransactionsById)

    expect(transactionIds).toHaveLength(1)
    const replay = ensureCanonicalFinanceFoundation(first, { openingEconomicStates: [ownerCapital(organizationId)] })
    expect(replay).toBe(first)
    expect(Object.keys(replay.financialTransactionsById)).toEqual(transactionIds)
    expect(materializeOrganizationOpeningEconomicState(first, ownerCapital(organizationId)).status).toBe('ALREADY_MATERIALIZED')
    // A different source cannot seed a second opening position into a club that already has one.
    expect(materializeOrganizationOpeningEconomicState(first, ownerCapital(organizationId, 5_000_000, { sourceEntityId: 'owner:acb-0002' })).status).toBe('ALREADY_MATERIALIZED')
    expect(Object.keys(first.financialTransactionsById)).toEqual(transactionIds)
  })

  it('preserves existing canonical ledger history instead of seeding an opening position', () => {
    const world = clubWorld()
    const organizationId = organizationIdsOf(world)[0]!
    const accounts = getOrganizationFinanceAccounts(world, organizationId, 'EUR')
    const withHistory = updateGameWorld(world, {
      financialTransactions: [createFinancialTransaction({
        id: 'finance:bs16h-existing-history',
        organizationId,
        effectiveOn: world.currentDate,
        transactionType: 'OPERATING_EXPENSE',
        amount: eur(1_000),
        postings: [
          { accountId: accounts.expenseOperating.id, direction: 'DEBIT', amount: eur(1_000) },
          { accountId: accounts.payableControl.id, direction: 'CREDIT', amount: eur(1_000) },
        ],
        provenance: { kind: 'TEST_HISTORY', id: 'bs16h' },
      })],
    })

    const result = materializeOrganizationOpeningEconomicState(withHistory, ownerCapital(organizationId))
    expect(result.status).toBe('EXISTING_FINANCE_HISTORY_PRESERVED')
    expect(Object.keys(result.world.financialTransactionsById)).toEqual(['finance:bs16h-existing-history'])
    expect(cashOf(result.world, organizationId)).toBe(0)
  })
})

describe('BS16H opening economic state persistence', () => {
  it('round-trips a materialized opening position and never duplicates it after load', () => {
    const world = clubWorld()
    const organizationId = organizationIdsOf(world)[0]!
    const activated = ensureCanonicalFinanceFoundation(world, { openingEconomicStates: [ownerCapital(organizationId)] })
    const restored = deserializeGameWorldV4(serializeGameWorldV4(activated, SAVED_AT))

    expect(restored.financialTransactionsById).toEqual(activated.financialTransactionsById)
    expect(cashOf(restored, organizationId, restored.currentDate)).toBe(25_000_000)
    const reactivated = ensureCanonicalFinanceFoundation(restored, { openingEconomicStates: [ownerCapital(organizationId)] })
    expect(Object.keys(reactivated.financialTransactionsById)).toEqual(Object.keys(activated.financialTransactionsById))
    expect(ensureCanonicalFinanceFoundation(restored)).toBe(restored)
  })

  it('keeps a zero-source club at zero cash across save/load and a legacy budget-only save', () => {
    const loaded = deserializeGameWorldV4(serializeGameWorldV4(clubWorld(), SAVED_AT))
    expect(Object.keys(loaded.financialTransactionsById)).toEqual([])
    expect(getOpeningEconomicStateReport(loaded, organizationIdsOf(loaded)).every((entry) => entry.cashMinorUnits === 0)).toBe(true)
    // Reactivation neither invents cash nor duplicates facts.
    expect(ensureCanonicalFinanceFoundation(loaded)).toBe(loaded)

    // A pre-BS16B save carries budgets only: canonical authorization may be materialized, cash stays zero.
    const legacyEnvelope = serializeGameWorldV4(clubWorld(), SAVED_AT)
    const legacyPayload = { ...legacyEnvelope.payload } as Record<string, unknown>
    for (const key of ['organizationFinancialProfiles', 'financialAccounts', 'financialTransactions', 'fiscalPeriods', 'financialBudgets', 'budgetLines']) delete legacyPayload[key]
    const activated = ensureCanonicalFinanceFoundation(deserializeGameWorldV4({ ...legacyEnvelope, payload: legacyPayload }))

    expect(Object.keys(activated.financialTransactionsById)).toEqual([])
    expect(Object.keys(activated.financialBudgetsById).length).toBeGreaterThan(0)
    expect(getOpeningEconomicStateReport(activated, organizationIdsOf(activated)).every((entry) => entry.cashMinorUnits === 0)).toBe(true)
  })
})

describe('BS16H canonical affordability after a legitimate opening position', () => {
  it('moves from insufficient liquidity to affordable only when authorization and liquidity both permit', () => {
    const world = ensureCanonicalFinanceFoundation(clubWorld())
    const team = Object.values(world.teams)[0]!
    const organizationId = team.organizationId
    const salary = legacyMajorUnitsToMoney(1_000_000, 'EUR')

    const before = evaluateOrganizationFinancialCommitment(world, { organizationId, currency: 'EUR', amount: salary, category: 'PLAYER_SALARY', asOfDate: world.currentDate })
    expect(before.status).toBe('INSUFFICIENT_LIQUIDITY')
    expect(before.reasonCodes).not.toContain('BUDGET_AUTHORIZATION_NOT_MODELLED')

    const funded = ensureCanonicalFinanceFoundation(world, { openingEconomicStates: [ownerCapital(organizationId, legacyMajorUnitsToMoney(2_000_000, 'EUR').minorUnits)] })
    const after = evaluateOrganizationFinancialCommitment(funded, { organizationId, currency: 'EUR', amount: salary, category: 'PLAYER_SALARY', asOfDate: funded.currentDate })
    expect(after.status).toBe('AFFORDABLE_NOW')
    expect(cashOf(funded, organizationId)).toBe(200_000_000)

    // Liquidity alone is not permission: a scope the approval does not model stays unauthorized.
    const unauthorizedScope = evaluateOrganizationFinancialCommitment(funded, { organizationId, currency: 'EUR', amount: salary, category: 'OPERATIONS', asOfDate: funded.currentDate })
    expect(unauthorizedScope.reasonCodes).toContain('BUDGET_AUTHORIZATION_NOT_MODELLED')
    expect(unauthorizedScope.availableAuthorizedHeadroom).toBeNull()
  })

  it('leaves every other club of the same career untouched', () => {
    const world = clubWorld()
    const organizationId = organizationIdsOf(world)[0]!
    const funded = ensureCanonicalFinanceFoundation(world, { openingEconomicStates: [ownerCapital(organizationId)] })

    expect(Object.keys(funded.financialTransactionsById)).toHaveLength(1)
    for (const other of organizationIdsOf(funded).filter((candidate) => candidate !== organizationId)) {
      expect(cashOf(funded, other)).toBe(0)
      expect(findOrganizationOpeningEconomicState(funded, other)).toBeUndefined()
    }
    expect(getOrganizationOpeningEconomicStateStatus(funded, organizationIdFromString(organizationIdsOf(funded)[1]!))).toBe('OPENING_ECONOMIC_STATE_UNAVAILABLE')
  })
})
