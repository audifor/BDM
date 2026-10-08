import { describe, expect, it } from 'vitest'
import { createAcbTestGame, createNewGame } from '@/app/game'
import { createGameDate } from '@/domain/date'
import { createGameWorld, updateGameWorld, type GameWorld } from '@/domain/world'
import { createValidGameWorldInput } from '@/domain/world/testFixtures'
import { teamIdFromString } from '@/domain/ids'
import {
  authorizationBudgetIdFor,
  createBudgetRevision,
  createFinancialAccount,
  createFinancialBudget,
  createFinancialTransaction,
  createFiscalPeriod,
  createOrganizationFinancialProfile,
  createTeamFinances,
  ensureCanonicalFinanceFoundation,
  evaluateOrganizationFinancialCommitment,
  fiscalPeriodIdFor,
  getFinanceActivationReport,
  getOrganizationFinancialAuthorization,
  LEGACY_TEAM_FINANCES_ACTIVATION_PROVENANCE,
  materializeLegacyTeamFinancesAuthorization,
} from '@/domain/finance'
import { getCashBalancesByCurrency } from '@/domain/finance/CashFlowQueries'

const organizationId = 'team-home'
const otherOrganizationId = 'team-away'
const AS_OF = '2032-10-01'
const NEXT_PERIOD = createGameDate(2033, 10, 1)
const eur = (minorUnits: number) => ({ currencyCode: 'EUR', minorUnits })
const profile = createOrganizationFinancialProfile({ organizationId, baseCurrencyCode: 'EUR', fiscalYearStartMonth: 1 })

function legacyWorld(options: { readonly withProfile?: boolean; readonly withCash?: boolean; readonly playerBudget?: number; readonly staffBudget?: number } = {}): GameWorld {
  const playerBudget = options.playerBudget ?? 1_000_000
  const staffBudget = options.staffBudget ?? 500_000
  const cash = 750_000
  return createGameWorld({
    ...createValidGameWorldInput(),
    teamFinances: [
      createTeamFinances({ teamId: teamIdFromString('team-home'), playerSalaryBudget: playerBudget, staffSalaryBudget: staffBudget }),
      createTeamFinances({ teamId: teamIdFromString('team-away'), playerSalaryBudget: 400_000, staffSalaryBudget: 120_000 }),
    ],
    ...(options.withProfile === false ? {} : { organizationFinancialProfiles: [profile] }),
    ...(options.withCash === false ? {} : {
      financialAccounts: [
        createFinancialAccount({ id: 'cash:eur', organizationId, accountType: 'CASH', currencyCode: 'EUR', openedOn: '2032-01-01' }),
        createFinancialAccount({ id: 'equity:eur', organizationId, accountType: 'EQUITY', currencyCode: 'EUR', openedOn: '2032-01-01' }),
      ],
      financialTransactions: [createFinancialTransaction({
        id: 'finance:opening',
        organizationId,
        effectiveOn: '2032-01-01',
        transactionType: 'OPENING_BALANCE',
        amount: eur(cash),
        postings: [
          { accountId: 'cash:eur', direction: 'DEBIT', amount: eur(cash) },
          { accountId: 'equity:eur', direction: 'CREDIT', amount: eur(cash) },
        ],
        provenance: { kind: 'MIGRATION', id: 'bs16e' },
      })],
    }),
  })
}

function activationOf(world: GameWorld, organization = organizationId) {
  return getFinanceActivationReport(world).organizations.find((entry) => entry.organizationId === organization)!
}

describe('BS16E authorization activation', () => {
  it('materializes a canonical authorization from the legacy TeamFinances gameplay authority', () => {
    const world = ensureCanonicalFinanceFoundation(legacyWorld())
    const budget = Object.values(world.financialBudgetsById)[0]!

    expect(budget.status).toBe('APPROVED')
    expect(budget.currencyCode).toBe('EUR')
    expect(budget.organizationId).toBe(organizationId)
    expect(budget.fiscalPeriodId).toBe(fiscalPeriodIdFor(organizationId, '2032-01-01'))
    expect(budget.approval).toMatchObject({ authorityKind: 'MANUAL_SYSTEM_ACTION', authorityId: 'system:legacy-team-finances-activation' })
    expect(budget.provenance).toEqual(LEGACY_TEAM_FINANCES_ACTIVATION_PROVENANCE)
    expect(Object.values(world.budgetLinesById).map((line) => [line.category, line.amount.minorUnits, line.teamId]).sort()).toEqual([
      ['PLAYER_SALARY', 1_000_000, 'team-home'],
      ['STAFF_SALARY', 500_000, 'team-home'],
    ])
    expect(activationOf(world, organizationId).status).toBe('ALREADY_PROVISIONED')
    expect(getFinanceActivationReport(legacyWorld()).organizations.find((entry) => entry.organizationId === organizationId)?.status).toBe('ACTIVATED')
  })

  it('classifies organizations instead of faking a currency and leaves them unauthorized', () => {
    const world = legacyWorld({ withProfile: false })
    const unchanged = ensureCanonicalFinanceFoundation(world)
    const report = getFinanceActivationReport(world)

    expect(report.organizations.map((entry) => entry.status)).toEqual(['FINANCE_PROFILE_UNAVAILABLE', 'FINANCE_PROFILE_UNAVAILABLE'])
    // No profile: nothing canonical is created, and the legacy authority keeps governing.
    expect(unchanged).toBe(world)
    expect(Object.keys(unchanged.financialBudgetsById)).toEqual([])
    expect(Object.keys(unchanged.fiscalPeriodsById)).toEqual([])
  })

  it('reports no legacy budget source when an organization has a profile but no TeamFinances', () => {
    const world = createGameWorld({ ...createValidGameWorldInput(), organizationFinancialProfiles: [profile] })

    expect(activationOf(world).status).toBe('NO_LEGACY_BUDGET_SOURCE')
    expect(ensureCanonicalFinanceFoundation(world)).toBe(world)
    expect(getOrganizationFinancialAuthorization(world, { organizationId, currencyCode: 'EUR', asOfDate: AS_OF }).state).toBe('NOT_PROVISIONED')
  })

  it('is deterministic and idempotent, and never rewrites existing canonical facts', () => {
    const first = ensureCanonicalFinanceFoundation(legacyWorld())
    const second = ensureCanonicalFinanceFoundation(first)

    expect(second).toBe(first)
    expect(Object.keys(first.fiscalPeriodsById)).toHaveLength(1)
    expect(Object.keys(first.financialBudgetsById)).toHaveLength(1)
    expect(Object.keys(first.budgetLinesById)).toHaveLength(2)
    expect(Object.keys(second.fiscalPeriodsById)).toHaveLength(1)

    // A changed legacy value inside the same period never silently re-baselines canonical authorization.
    const changedLegacy = createGameWorld({
      ...createValidGameWorldInput(),
      teamFinances: [createTeamFinances({ teamId: teamIdFromString('team-home'), playerSalaryBudget: 9_000_000, staffSalaryBudget: 500_000 })],
      organizationFinancialProfiles: [profile],
      fiscalPeriods: Object.values(first.fiscalPeriodsById),
      financialBudgets: Object.values(first.financialBudgetsById),
      budgetLines: Object.values(first.budgetLinesById),
    })
    const afterChange = ensureCanonicalFinanceFoundation(changedLegacy)
    expect(Object.values(afterChange.budgetLinesById).map((line) => line.amount.minorUnits).sort((left, right) => left - right)).toEqual([500_000, 1_000_000])
    expect(activationOf(afterChange).status).toBe('ALREADY_PROVISIONED')
  })

  it('binds the authorization to the canonical FiscalPeriod authority and keeps supersession auditable', () => {
    const activated = ensureCanonicalFinanceFoundation(legacyWorld())
    const fiscalPeriod = Object.values(activated.fiscalPeriodsById)[0]!
    const authorization = getOrganizationFinancialAuthorization(activated, { organizationId, currencyCode: 'EUR', asOfDate: AS_OF })

    expect(fiscalPeriod).toMatchObject({ startsOn: '2032-01-01', endsOn: '2032-12-31', status: 'OPEN' })
    expect(authorization.state).toBe('ACTIVE')
    expect(authorization.fiscalPeriodId).toBe(fiscalPeriod.id)
    expect(authorization.authorizedMinorUnits).toBe(1_500_000)
    expect(authorization.period).toEqual({ kind: 'FISCAL_YEAR', startsOn: '2032-01-01', endsOn: '2032-12-31' })

    // The fiscal period owns the effective dates: a budget whose fiscal period does not contain the
    // effective date is not in effect even when its planning metadata would have covered it.
    const stalePeriod = createFiscalPeriod({ id: fiscalPeriod.id, organizationId, label: '2040', startsOn: '2040-01-01', endsOn: '2040-12-31' })
    const mismatched = createGameWorld({
      ...createValidGameWorldInput(),
      teamFinances: [createTeamFinances({ teamId: teamIdFromString('team-home'), playerSalaryBudget: 1_000_000, staffSalaryBudget: 500_000 })],
      organizationFinancialProfiles: [profile],
      fiscalPeriods: [stalePeriod],
      financialBudgets: [createFinancialBudget({ id: 'budget:stale', organizationId, currencyCode: 'EUR', period: { kind: 'FISCAL_YEAR', startsOn: '2032-01-01', endsOn: '2032-12-31' }, fiscalPeriodId: stalePeriod.id, status: 'APPROVED', label: 'Stale', createdOn: '2032-01-01', approval: { authorityKind: 'MANUAL_SYSTEM_ACTION', authorityId: 'system:x', approvedOn: '2032-01-01', provenance: LEGACY_TEAM_FINANCES_ACTIVATION_PROVENANCE }, provenance: LEGACY_TEAM_FINANCES_ACTIVATION_PROVENANCE })],
    })
    expect(getOrganizationFinancialAuthorization(mismatched, { organizationId, currencyCode: 'EUR', asOfDate: AS_OF }).state).toBe('OUT_OF_PERIOD')

    // Same-period supersession: the revision becomes the active authority, the original stays auditable.
    const revision = createFinancialBudget({ id: 'budget:revision', organizationId, currencyCode: 'EUR', period: { kind: 'FISCAL_YEAR', startsOn: '2032-01-01', endsOn: '2032-12-31' }, fiscalPeriodId: fiscalPeriod.id, status: 'APPROVED', label: 'Revised', createdOn: '2032-09-01', revisionOfId: Object.keys(activated.financialBudgetsById)[0]!, approval: { authorityKind: 'MANUAL_SYSTEM_ACTION', authorityId: 'system:y', approvedOn: '2032-09-01', provenance: LEGACY_TEAM_FINANCES_ACTIVATION_PROVENANCE }, provenance: LEGACY_TEAM_FINANCES_ACTIVATION_PROVENANCE })
    const revised = updateGameWorld(activated, {
      financialBudgets: [...Object.values(activated.financialBudgetsById), revision],
      budgetRevisions: [createBudgetRevision({ id: 'revision:1', organizationId, budgetId: revision.id, supersedesBudgetId: Object.keys(activated.financialBudgetsById)[0]!, revisionNumber: 1, createdOn: '2032-09-01', reason: 'Source authority changed', provenance: LEGACY_TEAM_FINANCES_ACTIVATION_PROVENANCE })],
    })
    const revisedAuthorization = getOrganizationFinancialAuthorization(revised, { organizationId, currencyCode: 'EUR', asOfDate: AS_OF })

    expect(revisedAuthorization.budgetId).toBe(revision.id)
    // The revision has no lines of its own, so the superseded original no longer authorizes anything.
    expect(revisedAuthorization.authorizedMinorUnits).toBe(0)
    expect(Object.keys(revised.financialBudgetsById)).toHaveLength(2)
  })

  it('leaves a later fiscal period unauthorized without inventing a renewal policy', () => {
    const activated = ensureCanonicalFinanceFoundation(legacyWorld())
    const nextYear = updateGameWorld(activated, { currentDate: NEXT_PERIOD })
    const nextReport = getFinanceActivationReport(nextYear).organizations.find((entry) => entry.organizationId === organizationId)!

    expect(nextReport.status).toBe('RENEWAL_NOT_MODELLED')
    expect(ensureCanonicalFinanceFoundation(nextYear)).toBe(nextYear)
    // The previous period's authorization has ended, so the new period is simply not provisioned.
    expect(getOrganizationFinancialAuthorization(nextYear, { organizationId, currencyCode: 'EUR', asOfDate: NEXT_PERIOD }).state).toBe('NOT_PROVISIONED')
    const decision = evaluateOrganizationFinancialCommitment(nextYear, { organizationId, currency: 'EUR', amount: eur(10_000), asOfDate: NEXT_PERIOD })
    expect(decision.reasonCodes).toContain('BUDGET_AUTHORIZATION_NOT_MODELLED')
    expect(decision.reasonCodes).not.toContain('AUTHORIZATION_OUT_OF_PERIOD')
    // Only the earlier period's authorization exists, and it was not copied forward.
    expect(Object.keys(nextYear.financialBudgetsById)).toEqual([authorizationBudgetIdFor(organizationId, fiscalPeriodIdFor(organizationId, '2032-01-01'))])
  })

  it('keeps unmodelled categories unauthorized while the mapped scopes work', () => {
    const world = ensureCanonicalFinanceFoundation(legacyWorld())
    const authorization = getOrganizationFinancialAuthorization(world, { organizationId, currencyCode: 'EUR', asOfDate: AS_OF })

    expect(authorization.lines.map((line) => line.category)).toEqual(['PLAYER_SALARY', 'STAFF_SALARY'])
    expect(authorization.unattributedCommitmentCategories).toEqual([])

    const mapped = evaluateOrganizationFinancialCommitment(world, { organizationId, currency: 'EUR', amount: eur(300_000), category: 'PLAYER_SALARY', asOfDate: AS_OF })
    const unmapped = evaluateOrganizationFinancialCommitment(world, { organizationId, currency: 'EUR', amount: eur(300_000), category: 'OPERATIONS', asOfDate: AS_OF })
    const unspecified = evaluateOrganizationFinancialCommitment(world, { organizationId, currency: 'EUR', amount: eur(300_000), asOfDate: AS_OF })

    expect(mapped.status).toBe('AFFORDABLE_NOW')
    expect(mapped.availableAuthorizedHeadroom).toEqual(eur(1_000_000))
    expect(unmapped.status).toBe('AFFORDABLE_NOW')
    expect(unmapped.availableAuthorizedHeadroom).toBeNull()
    expect(unmapped.reasonCodes).toContain('BUDGET_AUTHORIZATION_NOT_MODELLED')
    expect(unspecified.availableAuthorizedHeadroom).toEqual(eur(1_500_000))
    // Liquidity still binds: cash 750_000 - 0 obligations - 0 reservations.
    expect(evaluateOrganizationFinancialCommitment(world, { organizationId, currency: 'EUR', amount: eur(800_000), category: 'PLAYER_SALARY', asOfDate: AS_OF }).status).toBe('INSUFFICIENT_LIQUIDITY')
  })

  it('creates no cash, account, ledger, obligation or reservation fact', () => {
    const world = legacyWorld()
    const before = { cash: getCashBalancesByCurrency(world, organizationId, AS_OF), transactions: Object.keys(world.financialTransactionsById), accounts: Object.keys(world.financialAccountsById) }
    const activated = ensureCanonicalFinanceFoundation(world)

    expect(getCashBalancesByCurrency(activated, organizationId, AS_OF)).toEqual(before.cash)
    expect(Object.keys(activated.financialTransactionsById)).toEqual(before.transactions)
    expect(Object.keys(activated.financialAccountsById)).toEqual(before.accounts)
    expect(activated.financialCommitmentsById).toEqual({})
    expect(activated.financialReservationsById).toEqual({})
    expect(activated.payablesById).toEqual({})
    expect(activated.receivablesById).toEqual({})
  })

  it('keeps canonical authorization parity with the legacy TeamFinances pools', () => {
    for (const world of [createNewGame(), createAcbTestGame()]) {
      const activated = ensureCanonicalFinanceFoundation(updateGameWorld(world, {
        organizationFinancialProfiles: Object.values(world.teams).map((team) => createOrganizationFinancialProfile({ organizationId: team.organizationId, baseCurrencyCode: 'EUR', fiscalYearStartMonth: 7 })),
      }))
      const compared = { teams: 0, player: 0, staff: 0 }
      for (const team of Object.values(activated.teams)) {
        const legacy = world.teamFinancesByTeamId[team.id]
        const lines = Object.values(activated.budgetLinesById).filter((line) => line.teamId === String(team.id))
        const player = lines.filter((line) => line.category === 'PLAYER_SALARY').reduce((sum, line) => sum + line.amount.minorUnits, 0)
        const staff = lines.filter((line) => line.category === 'STAFF_SALARY').reduce((sum, line) => sum + line.amount.minorUnits, 0)
        expect(player).toBe(legacy?.playerSalaryBudget ?? 0)
        expect(staff).toBe(legacy?.staffSalaryBudget ?? 0)
        compared.teams += 1
        compared.player += player
        compared.staff += staff
      }
      expect(compared.teams).toBeGreaterThan(0)
      expect(compared.player).toBeGreaterThan(0)
      expect(compared.staff).toBeGreaterThan(0)
    }
  })

  it('audits shipped create paths: amounts exist, currency does not, so nothing is invented', () => {
    for (const world of [createNewGame(), createAcbTestGame()]) {
      expect(Object.keys(world.teamFinancesByTeamId).length).toBeGreaterThan(0)
      expect(Object.keys(world.organizationFinancialProfilesById)).toEqual([])
      expect(Object.keys(world.fiscalPeriodsById)).toEqual([])
      const report = getFinanceActivationReport(world)
      const organizationIds = [...new Set(Object.values(world.teams).map((team) => team.organizationId))]
      expect(report.organizations).toHaveLength(organizationIds.length)
      expect(report.organizations.every((entry) => entry.status === 'FINANCE_PROFILE_UNAVAILABLE')).toBe(true)
      // The activation seam is a no-op rather than a guess, so shipped play keeps TeamFinances.
      expect(ensureCanonicalFinanceFoundation(world)).toBe(world)
    }
  })

  it('materializes the fiscal year that contains the effective date, per profile start month', () => {
    const julyProfile = createOrganizationFinancialProfile({ organizationId, baseCurrencyCode: 'EUR', fiscalYearStartMonth: 7 })
    const world = createGameWorld({ ...createValidGameWorldInput(), teamFinances: [createTeamFinances({ teamId: teamIdFromString('team-home'), playerSalaryBudget: 1_000, staffSalaryBudget: 0 })], organizationFinancialProfiles: [julyProfile] })
    const activated = ensureCanonicalFinanceFoundation(world, { asOfDate: '2032-10-01' })
    const fiscalPeriod = Object.values(activated.fiscalPeriodsById)[0]!

    expect(fiscalPeriod.startsOn).toBe('2032-07-01')
    expect(fiscalPeriod.endsOn).toBe('2033-06-30')
    expect(Object.values(activated.budgetLinesById).map((line) => line.category)).toEqual(['PLAYER_SALARY'])
    const materialized = materializeLegacyTeamFinancesAuthorization(activated, { organizationId, fiscalPeriodId: fiscalPeriod.id, asOfDate: '2032-10-01' })
    expect(materialized.budget.currencyCode).toBe('EUR')
  })
})
