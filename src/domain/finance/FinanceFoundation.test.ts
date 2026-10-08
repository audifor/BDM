import { describe, expect, it } from 'vitest'
import { PROTOTYPE_GAME_CONFIGURATION, createNewGame } from '@/app/game'
import { generateWorld } from '@/engine/world'
import { createOrganization } from '@/domain/organization'
import { organizationIdFromString, type OrganizationId } from '@/domain/ids'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { getAccountBalanceAsOfDate } from './FinancialQueries'
import { getCashBalancesByCurrency } from './CashFlowQueries'
import { createFinancialAccount, createOrganizationFinancialProfile } from './FinancialLedger'
import { createRevenueSource, materializeRevenueForDate } from './RevenueEngine'
import { createOperatingCostSource, materializeOperatingCostsForDate } from './OperatingCostEngine'
import { createDebtInstrument, materializeDebtFinanceForDate } from './DebtEngine'
import { settleReceivable } from './Treasury'
import {
  ORGANIZATION_FINANCE_ACCOUNT_ROLES,
  getOrganizationFinanceAccounts,
  isFinanceBearingOrganization,
  listFinanceBearingOrganizationIds,
  organizationFinanceAccountId,
  financeFiscalPeriodIdFor,
  getFinanceFiscalYearFor,
  provisionOrganizationFinanceFoundation,
  resolveDebtLedgerMapping,
  resolveExpenseRecognitionAccounts,
  resolveRevenueRecognitionAccounts,
  resolveTreasurySettlementAccounts,
  type OrganizationFinanceAccountRole,
} from './FinanceFoundation'

const provenance = { kind: 'BS16B_TEST', id: 'finance-foundation' }
const savedAt = '2032-10-01T00:00:00.000Z'

/**
 * Generated-state world (immutable; every test derives new worlds from it). The engine generator produces the
 * universe without canonical finance facts, which is the provisioning precondition BS16B certifies; the shipped
 * career seams then run the BS16F activation authority on top of it.
 */
const shippedWorld = generateWorld({ ...PROTOTYPE_GAME_CONFIGURATION, includeNbaLike: true, includeNcaaLike: true })
const season = shippedWorld.seasons[shippedWorld.currentSeasonId]!
const expectedFiscalYearStartMonth = Number(season.startDate.slice(5, 7))

function clubOrganizations(world: GameWorld): readonly OrganizationId[] {
  return listFinanceBearingOrganizationIds(world)
}

function accountFor(world: GameWorld, organizationId: OrganizationId, currencyCode: string, role: OrganizationFinanceAccountRole) {
  return world.financialAccountsById[organizationFinanceAccountId(organizationId, currencyCode, role)]
}

const ROLE_ACCOUNT_TYPES: Readonly<Record<OrganizationFinanceAccountRole, string>> = {
  CASH_OPERATING: 'CASH_OPERATING_BANK',
  RECEIVABLE_CONTROL: 'RECEIVABLE',
  PAYABLE_CONTROL: 'PAYABLE',
  EQUITY_CONTROL: 'EQUITY',
  REVENUE_OPERATING: 'REVENUE',
  EXPENSE_OPERATING: 'EXPENSE',
  DEBT_LIABILITY: 'LIABILITY',
}

describe('BS16B finance foundation provisioning', () => {
  it('generated worlds start with an empty canonical finance foundation and a canonical club-eligibility rule', () => {
    expect(Object.keys(shippedWorld.organizationFinancialProfilesById)).toHaveLength(0)
    expect(Object.keys(shippedWorld.financialAccountsById)).toHaveLength(0)
    expect(Object.keys(shippedWorld.fiscalPeriodsById)).toHaveLength(0)
    expect(Object.keys(shippedWorld.financialTransactionsById)).toHaveLength(0)

    const clubs = clubOrganizations(shippedWorld)
    expect(clubs.length).toBeGreaterThanOrEqual(2)
    for (const organizationId of clubs) {
      expect(isFinanceBearingOrganization(shippedWorld, organizationId)).toBe(true)
      expect(Object.values(shippedWorld.teams).some((team) => team.organizationId === organizationId)).toBe(true)
    }
    const userTeam = Object.values(shippedWorld.teams).find((team) => team.coachId === shippedWorld.userCoachId)!
    expect(clubs).toContain(userTeam.organizationId)

    const league = createOrganization({ id: organizationIdFromString('organization:bs16b-league'), entityId: null, legalName: 'Test League', foundedYear: null, dissolvedYear: null, primaryPlaceId: null, website: null })
    const withLeague = updateGameWorld(shippedWorld, { organizations: [...Object.values(shippedWorld.organizationsById), league] })
    expect(isFinanceBearingOrganization(withLeague, league.id)).toBe(false)
    expect(clubOrganizations(withLeague)).not.toContain(league.id)
    expect(() => provisionOrganizationFinanceFoundation(withLeague, league.id, { currencyCode: 'EUR' })).toThrow(/not finance-bearing/)
    expect(() => provisionOrganizationFinanceFoundation(shippedWorld, organizationIdFromString('organization:missing'), { currencyCode: 'EUR' })).toThrow(/Unknown Organization/)
  })

  it('provisions the canonical account catalog, financial profile and opening fiscal period without creating money', () => {
    const organizationId = clubOrganizations(shippedWorld)[0]!
    const provisioned = provisionOrganizationFinanceFoundation(shippedWorld, organizationId, { currencyCode: 'EUR' })

    const profile = provisioned.organizationFinancialProfilesById[organizationId]!
    expect(profile).toBeDefined()
    expect(profile.baseCurrencyCode).toBe('EUR')
    expect(profile.fiscalYearStartMonth).toBe(expectedFiscalYearStartMonth)
    expect(Object.keys(provisioned.organizationFinancialProfilesById)).toHaveLength(1)

    expect(Object.keys(provisioned.financialAccountsById)).toHaveLength(ORGANIZATION_FINANCE_ACCOUNT_ROLES.length)
    for (const role of ORGANIZATION_FINANCE_ACCOUNT_ROLES) {
      const account = accountFor(provisioned, organizationId, 'EUR', role)!
      expect(account).toBeDefined()
      expect(account.organizationId).toBe(organizationId)
      expect(account.currencyCode).toBe('EUR')
      expect(account.accountType).toBe(ROLE_ACCOUNT_TYPES[role])
      expect(account.openedOn).toBeNull()
    }

    const fiscalYear = getFinanceFiscalYearFor({ fiscalYearStartMonth: expectedFiscalYearStartMonth }, shippedWorld.currentDate)
    const period = provisioned.fiscalPeriodsById[financeFiscalPeriodIdFor(organizationId, fiscalYear.startsOn)]!
    expect(period).toBeDefined()
    expect(period.organizationId).toBe(organizationId)
    expect(period.label).toBe(fiscalYear.label)
    expect(period.startsOn).toBe(fiscalYear.startsOn)
    expect(period.endsOn).toBe(fiscalYear.endsOn)
    expect(period.status).toBe('OPEN')
    // BS16G: the period is the fiscal year containing the effective date, never the competition season.
    expect(period.startsOn <= shippedWorld.currentDate && period.endsOn >= shippedWorld.currentDate).toBe(true)

    expect(Object.keys(provisioned.financialTransactionsById)).toHaveLength(0)
    expect(getCashBalancesByCurrency(provisioned, organizationId)).toEqual([expect.objectContaining({ currencyCode: 'EUR', totalCashMinorUnits: 0, unrestrictedCashMinorUnits: 0, restrictedCashMinorUnits: 0 })])
    expect(getAccountBalanceAsOfDate(provisioned, accountFor(provisioned, organizationId, 'EUR', 'CASH_OPERATING')!.id).balanceMinorUnits).toBe(0)

    expect(() => updateGameWorld(provisioned, {})).not.toThrow()
  })

  it('is deterministic and idempotent, including returning the identical world on reprovision', () => {
    const organizationId = clubOrganizations(shippedWorld)[0]!
    const first = provisionOrganizationFinanceFoundation(shippedWorld, organizationId, { currencyCode: 'EUR' })
    const second = provisionOrganizationFinanceFoundation(first, organizationId, { currencyCode: 'EUR' })
    expect(second).toBe(first)

    const deterministic = provisionOrganizationFinanceFoundation(shippedWorld, organizationId, { currencyCode: 'EUR' })
    expect(deterministic.organizationFinancialProfilesById).toEqual(first.organizationFinancialProfilesById)
    expect(deterministic.financialAccountsById).toEqual(first.financialAccountsById)
    expect(deterministic.fiscalPeriodsById).toEqual(first.fiscalPeriodsById)

    expect(Object.keys(second.financialAccountsById)).toHaveLength(ORGANIZATION_FINANCE_ACCOUNT_ROLES.length)
    expect(Object.keys(second.financialTransactionsById)).toHaveLength(0)
    const periodId = financeFiscalPeriodIdFor(organizationId, getFinanceFiscalYearFor({ fiscalYearStartMonth: expectedFiscalYearStartMonth }, shippedWorld.currentDate).startsOn)
    expect(second.fiscalPeriodsById[periodId]).toEqual(first.fiscalPeriodsById[periodId])

    const accounts = getOrganizationFinanceAccounts(second, organizationId)
    expect(accounts.cashOperating.organizationId).toBe(organizationId)
    expect(accounts.cashOperating.currencyCode).toBe('EUR')
    expect(accounts.receivableControl.accountType).toBe('RECEIVABLE')
    expect(accounts.debtLiability.accountType).toBe('LIABILITY')
  })

  it('keeps multiple organizations isolated with independent profiles, accounts and periods', () => {
    const [organizationA, organizationB] = clubOrganizations(shippedWorld) as [OrganizationId, OrganizationId]
    const withA = provisionOrganizationFinanceFoundation(shippedWorld, organizationA, { currencyCode: 'EUR' })
    const withBoth = provisionOrganizationFinanceFoundation(withA, organizationB, { currencyCode: 'USD' })

    expect(Object.keys(withBoth.organizationFinancialProfilesById)).toHaveLength(2)
    expect(withBoth.organizationFinancialProfilesById[organizationA]!.baseCurrencyCode).toBe('EUR')
    expect(withBoth.organizationFinancialProfilesById[organizationB]!.baseCurrencyCode).toBe('USD')

    const accountsA = ORGANIZATION_FINANCE_ACCOUNT_ROLES.map((role) => accountFor(withBoth, organizationA, 'EUR', role)!)
    const accountsB = ORGANIZATION_FINANCE_ACCOUNT_ROLES.map((role) => accountFor(withBoth, organizationB, 'USD', role)!)
    for (const account of accountsA) expect(account.currencyCode).toBe('EUR')
    for (const account of accountsB) expect(account.currencyCode).toBe('USD')
    expect(accountsA.every((account) => account.organizationId === organizationA)).toBe(true)
    expect(accountsB.every((account) => account.organizationId === organizationB)).toBe(true)
    expect(new Set([...accountsA, ...accountsB].map((account) => account.id)).size).toBe(ORGANIZATION_FINANCE_ACCOUNT_ROLES.length * 2)
    expect(new Set(accountsA.map((account) => account.id)).size).toBe(ORGANIZATION_FINANCE_ACCOUNT_ROLES.length)
    expect(accountsB.some((account) => accountsA.some((candidate) => candidate.id === account.id))).toBe(false)

    expect(getOrganizationFinanceAccounts(withBoth, organizationA).cashOperating.currencyCode).toBe('EUR')
    expect(getOrganizationFinanceAccounts(withBoth, organizationB).cashOperating.currencyCode).toBe('USD')
    const settlementAccounts = resolveTreasurySettlementAccounts(withBoth, organizationA, 'RECEIVABLE')
    expect(withBoth.financialAccountsById[settlementAccounts.cashAccountId]!.organizationId).toBe(organizationA)
    expect(withBoth.financialAccountsById[settlementAccounts.offsetAccountId]!.organizationId).toBe(organizationA)

    const periodStartsOn = getFinanceFiscalYearFor({ fiscalYearStartMonth: expectedFiscalYearStartMonth }, shippedWorld.currentDate).startsOn
    expect(financeFiscalPeriodIdFor(organizationA, periodStartsOn)).not.toBe(financeFiscalPeriodIdFor(organizationB, periodStartsOn))
    expect(Object.keys(withBoth.fiscalPeriodsById)).toHaveLength(2)
  })

  it('never overwrites existing finance facts and rejects conflicting provisioning', () => {
    const organizationId = clubOrganizations(shippedWorld)[0]!
    const provisioned = provisionOrganizationFinanceFoundation(shippedWorld, organizationId, { currencyCode: 'EUR' })

    const cashAccountId = organizationFinanceAccountId(organizationId, 'EUR', 'CASH_OPERATING')
    const cashBefore = provisioned.financialAccountsById[cashAccountId]
    const profileBefore = provisioned.organizationFinancialProfilesById[organizationId]
    expect(() => provisionOrganizationFinanceFoundation(provisioned, organizationId, { currencyCode: 'USD' })).toThrow(/refusing to overwrite/)
    expect(() => provisionOrganizationFinanceFoundation(provisioned, organizationId, { currencyCode: 'EUR', fiscalYearStartMonth: expectedFiscalYearStartMonth === 1 ? 2 : 1 })).toThrow(/refusing to overwrite/)
    expect(provisioned.financialAccountsById[cashAccountId]).toEqual(cashBefore)
    expect(provisioned.organizationFinancialProfilesById[organizationId]).toEqual(profileBefore)
    expect(Object.keys(provisioned.financialAccountsById)).toHaveLength(ORGANIZATION_FINANCE_ACCOUNT_ROLES.length)

    const manuallyProfiled = updateGameWorld(shippedWorld, { organizationFinancialProfiles: [createOrganizationFinancialProfile({ organizationId, baseCurrencyCode: 'USD' })] })
    expect(() => provisionOrganizationFinanceFoundation(manuallyProfiled, organizationId, { currencyCode: 'EUR' })).toThrow(/refusing to overwrite/)

    const otherOrganization = clubOrganizations(shippedWorld)[1]!
    expect(() => updateGameWorld(shippedWorld, { financialAccounts: [createFinancialAccount({ id: organizationFinanceAccountId(otherOrganization, 'EUR', 'CASH_OPERATING'), organizationId: otherOrganization, accountType: 'REVENUE', currencyCode: 'EUR' })] })).toThrow(/does not match its CASH_OPERATING role shape/)
    expect(() => updateGameWorld(shippedWorld, { financialAccounts: [createFinancialAccount({ id: organizationFinanceAccountId(otherOrganization, 'EUR', 'CASH_OPERATING'), organizationId: otherOrganization, accountType: 'CASH_OPERATING_BANK', currencyCode: 'USD' })] })).toThrow(/does not match its CASH_OPERATING role shape/)

    const unrelatedAccounts = updateGameWorld(shippedWorld, { financialAccounts: [createFinancialAccount({ id: 'account:legacy-cash', organizationId: otherOrganization, accountType: 'CASH', currencyCode: 'EUR' })] })
    expect(Object.keys(unrelatedAccounts.financialAccountsById)).toHaveLength(1)
  })

  it('round-trips the foundation through Save V4 and reprovisions idempotently after load', () => {
    // A real career world is used here because it is the round-trippable save shape; the assertion stays
    // organization-scoped because shipped careers legitimately carry more than one provisioned club (BS16F).
    const career = createNewGame()
    const organizationId = clubOrganizations(career)[0]!
    const provisioned = provisionOrganizationFinanceFoundation(career, organizationId, { currencyCode: 'EUR' })
    const restored = deserializeGameWorldV4(serializeGameWorldV4(provisioned, savedAt))

    expect(restored.organizationFinancialProfilesById[organizationId]).toEqual(provisioned.organizationFinancialProfilesById[organizationId])
    expect(getOrganizationFinanceAccounts(restored, organizationId, 'EUR')).toEqual(getOrganizationFinanceAccounts(provisioned, organizationId, 'EUR'))
    expect(Object.values(restored.fiscalPeriodsById).filter((period) => String(period.organizationId) === String(organizationId))).toEqual(Object.values(provisioned.fiscalPeriodsById).filter((period) => String(period.organizationId) === String(organizationId)))
    expect(restored.financialTransactionsById).toEqual(provisioned.financialTransactionsById)
    expect(resolveRevenueRecognitionAccounts(restored, organizationId)).toEqual(resolveRevenueRecognitionAccounts(provisioned, organizationId))

    const reprovisioned = provisionOrganizationFinanceFoundation(restored, organizationId, { currencyCode: 'EUR' })
    expect(reprovisioned).toBe(restored)
    expect(Object.values(reprovisioned.fiscalPeriodsById).filter((period) => String(period.organizationId) === String(organizationId))).toHaveLength(1)
    expect(Object.keys(reprovisioned.financialTransactionsById)).toHaveLength(0)
  })

  it('supports representative existing Finance V2 operations through the mapping authority without new formulas', () => {
    const organizationId = clubOrganizations(shippedWorld)[0]!
    const recognizedOn = '2032-10-01'
    const settledOn = '2032-10-05'
    const asOf = '2032-10-06'
    let world = provisionOrganizationFinanceFoundation(shippedWorld, organizationId, { currencyCode: 'EUR' })

    const revenueSource = createRevenueSource({ id: 'foundation:revenue:sponsor', organizationId, category: 'SPONSORSHIP', currencyCode: 'EUR', amount: { currencyCode: 'EUR', minorUnits: 500_000 }, startsOn: recognizedOn, endsOn: recognizedOn, sourceAuthority: 'COMMERCIAL_CONTRACT', generationPolicy: 'ONE_OFF', dueDatePolicy: 'ON_RECOGNITION', provenance })
    world = updateGameWorld(world, { revenueSources: [revenueSource] })
    const revenue = materializeRevenueForDate(world, recognizedOn, { organizationId, ledger: resolveRevenueRecognitionAccounts(world, organizationId) })
    expect(revenue.status).toBe('accepted')
    world = revenue.world
    expect(Object.keys(world.revenueRecognitionsById)).toHaveLength(1)
    const receivable = Object.values(world.receivablesById)[0]!
    expect(getAccountBalanceAsOfDate(world, accountFor(world, organizationId, 'EUR', 'RECEIVABLE_CONTROL')!.id, asOf).balanceMinorUnits).toBe(500_000)
    expect(getAccountBalanceAsOfDate(world, accountFor(world, organizationId, 'EUR', 'REVENUE_OPERATING')!.id, asOf).balanceMinorUnits).toBe(-500_000)
    expect(getCashBalancesByCurrency(world, organizationId, asOf)[0]!.totalCashMinorUnits).toBe(0)
    const replay = materializeRevenueForDate(world, recognizedOn, { organizationId, ledger: resolveRevenueRecognitionAccounts(world, organizationId) })
    expect(replay.status).toBe('alreadyProcessed')
    expect(Object.keys(replay.world.revenueRecognitionsById)).toHaveLength(1)

    const collection = settleReceivable(world, receivable.id, { settlementId: 'foundation:settlement:1', transactionId: 'foundation:transaction:settlement:1', amount: receivable.amount, settledOn, ...resolveTreasurySettlementAccounts(world, organizationId, 'RECEIVABLE') })
    world = updateGameWorld(world, { financialTransactions: [...Object.values(world.financialTransactionsById), collection.transaction], treasuryApplications: [collection.settlement] })
    expect(getCashBalancesByCurrency(world, organizationId, asOf)[0]!.totalCashMinorUnits).toBe(500_000)

    const costSource = createOperatingCostSource({ id: 'foundation:opex:travel', organizationId, category: 'TRAVEL', currencyCode: 'EUR', amount: { currencyCode: 'EUR', minorUnits: 150_000 }, startsOn: recognizedOn, endsOn: recognizedOn, sourceAuthority: 'TRAVEL', generationPolicy: 'ONE_OFF', dueDatePolicy: 'ON_RECOGNITION', provenance })
    world = updateGameWorld(world, { operatingCostSources: [costSource] })
    const cost = materializeOperatingCostsForDate(world, recognizedOn, { organizationId, ledger: resolveExpenseRecognitionAccounts(world, organizationId) })
    expect(cost.status).toBe('accepted')
    world = cost.world
    expect(Object.keys(world.expenseRecognitionsById)).toHaveLength(1)
    expect(Object.keys(world.payablesById)).toHaveLength(1)
    expect(getAccountBalanceAsOfDate(world, accountFor(world, organizationId, 'EUR', 'EXPENSE_OPERATING')!.id, asOf).balanceMinorUnits).toBe(150_000)
    expect(getCashBalancesByCurrency(world, organizationId, asOf)[0]!.totalCashMinorUnits).toBe(500_000)

    const debt = createDebtInstrument({ id: 'foundation:debt:1', organizationId, lender: { kind: 'EXTERNAL', label: 'Foundation Bank' }, debtType: 'TERM_LOAN', currencyCode: 'EUR', originalPrincipal: { currencyCode: 'EUR', minorUnits: 1_000_000 }, startsOn: recognizedOn, maturityOn: '2033-10-01', interest: { kind: 'NONE' }, repayment: { kind: 'BULLET' }, provenance })
    world = updateGameWorld(world, { debtInstruments: [debt] })
    const drawdown = materializeDebtFinanceForDate(world, recognizedOn, { organizationId, ledger: resolveDebtLedgerMapping(world, organizationId) })
    expect(drawdown.status).toBe('accepted')
    world = drawdown.world
    expect(getCashBalancesByCurrency(world, organizationId, asOf)[0]!.totalCashMinorUnits).toBe(1_500_000)
    expect(getAccountBalanceAsOfDate(world, accountFor(world, organizationId, 'EUR', 'DEBT_LIABILITY')!.id, asOf).balanceMinorUnits).toBe(-1_000_000)
    expect(() => updateGameWorld(world, {})).not.toThrow()
  })
})
