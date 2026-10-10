import { describe, expect, it } from 'vitest'

import { createPlayerContract } from '@/domain/contract'
import { compareGameDates, createGameDate } from '@/domain/date'
import {
  authorizeTeamSalaryForTest,
  fundOrganizationWithOpeningCapital,
} from '@/domain/finance/financeTestFixture'
import {
  applyAuthorizationRenewal,
  authorizationRenewalBudgetIdFor,
  createFinancialAuthorizationRenewalPolicy,
  createFinancialBudget,
  createOrganizationFinancialProfile,
  ensureCanonicalFinanceFoundation,
  ensureFinanceFiscalPeriodForDate,
  evaluateOrganizationFinancialCommitment,
  financeFiscalPeriodIdFor,
  financeFiscalPeriodsOf,
  getBudgetComparison,
  getContractFinancialSchedule,
  getFinanceActivationReport,
  getOrganizationFinancialAuthorization,
  planAuthorizationRenewal,
  provisionOrganizationFinanceFoundation,
  createFinancialReservation,
  type FinancialAuthorizationRenewalPolicy,
} from '@/domain/finance'
import { contractIdFromString, playerIdFromString, teamIdFromString } from '@/domain/ids'
import { createPlayer } from '@/domain/player'
import { createTestBasketballProfile, createTestPlayerBio } from '@/domain/player/testFixtures'
import { createGameWorld, updateGameWorld, type GameWorld } from '@/domain/world'
import { createValidGameWorldInput } from '@/domain/world/testFixtures'
import { processClubFinanceForDate } from '@/engine/finance/ClubFinanceLifecycle'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'

/**
 * BS16N-R. Annual fiscal and authorization renewal.
 *
 * Two facts are certified apart from each other: the next `FiscalPeriod` is structural (the calendar moved, so
 * the fiscal year containing the first processed GameDate exists exactly once, with no cash, revenue, expense,
 * authorization, debt or capital attached), while the next period's *authorization* is an explicit
 * per-Organization policy decision. A policy that carries the previous approved limits forward never carries
 * usage, and an Organization nobody assigned a policy to keeps the truthful `RENEWAL_NOT_MODELLED` answer.
 *
 * Fiscal year = September..August, so the fixture can prove exactly which fiscal year each contract, obligation
 * and occurrence belongs to.
 */
const CURRENCY = 'EUR'
const HOME_ORGANIZATION = 'team-home'
const AWAY_ORGANIZATION = 'team-away'
const HOME_TEAM = teamIdFromString('team-home')
const AWAY_TEAM = teamIdFromString('team-away')
const FISCAL_YEAR_START_MONTH = 9
/** Career opening date, and the payroll anniversary of the multi-year and the expiring contract. */
const START = createGameDate(2032, 9, 1)
/** First processed GameDate of fiscal year 2033-09-01..2034-08-31: the rollover. */
const ROLLOVER = createGameDate(2033, 9, 5)
/** The retention successor's first payroll anniversary, inside the new fiscal year. */
const NEXT_PAYROLL = createGameDate(2033, 10, 1)
const FY_2032_START = '2032-09-01'
const FY_2033_START = '2033-09-01'
const PLAYER_SALARY_LIMIT = 4_000_000_000
const STAFF_SALARY_LIMIT = 1_000_000_000
const AWAY_PLAYER_SALARY_LIMIT = 2_000_000_000
const AWAY_STAFF_SALARY_LIMIT = 500_000_000
/** One contract year each: the whole-year rule keeps every service window aligned with the fiscal year. */
const MULTI_YEAR_SALARY_MINOR_UNITS = 12_000_000
const EXPIRING_SALARY_MINOR_UNITS = 6_000_000
const SUCCESSOR_SALARY_MINOR_UNITS = 15_000_000
const RESERVATION_MINOR_UNITS = 100_000_000

const CONTINUITY_POLICY = createFinancialAuthorizationRenewalPolicy({
  mode: 'CARRY_FORWARD_PREVIOUS_APPROVED_LIMITS',
  provenance: { kind: 'TEST_POLICY', id: 'bs16n-r-continuity', description: 'BS16N-R continuity test policy' },
})
const NONE_POLICY = createFinancialAuthorizationRenewalPolicy({
  mode: 'NONE',
  provenance: { kind: 'TEST_POLICY', id: 'bs16n-r-none', description: 'BS16N-R no-renewal test policy' },
})

function renewalWorld(options: { readonly homePolicy?: FinancialAuthorizationRenewalPolicy | null; readonly awayPolicy?: FinancialAuthorizationRenewalPolicy | null; readonly fundingMinorUnits?: number } = {}): GameWorld {
  const input = createValidGameWorldInput()
  const successor = createPlayer({
    id: playerIdFromString('player-successor'),
    firstName: 'Suc',
    lastName: 'Cessor',
    gender: 'female',
    nationalityId: input.countries[0]!.id,
    basketball: createTestBasketballProfile(),
    bio: createTestPlayerBio(),
  })
  const expiring = createPlayer({
    id: playerIdFromString('player-expiring'),
    firstName: 'Exp',
    lastName: 'Iring',
    gender: 'female',
    nationalityId: input.countries[0]!.id,
    basketball: createTestBasketballProfile(),
    bio: createTestPlayerBio(),
  })
  const base = createGameWorld({
    ...input,
    currentDate: START,
    players: [...input.players, successor, expiring],
    teams: input.teams.map((team) => team.id === HOME_TEAM ? { ...team, rosterPlayerIds: [...team.rosterPlayerIds, successor.id, expiring.id] } : team),
  })
  const contracts = [
    // Fiscal-year aligned service windows: one contract year per fiscal year, ten of them.
    createPlayerContract({ id: contractIdFromString('contract:home-multi-year'), playerId: playerIdFromString('player-home'), teamId: HOME_TEAM, kind: 'standard', term: { startsOn: createGameDate(2032, 9, 1), expiresOn: createGameDate(2042, 9, 1) }, compensation: { annualSalary: 120_000 } }),
    // Reaches its final scheduled occurrence on the career opening date and ends with fiscal year 2032.
    createPlayerContract({ id: contractIdFromString('contract:home-expiring'), playerId: expiring.id, teamId: HOME_TEAM, kind: 'standard', term: { startsOn: createGameDate(2031, 9, 1), expiresOn: createGameDate(2033, 9, 1) }, compensation: { annualSalary: 60_000 } }),
    // A retention successor signed now whose term only begins inside the next fiscal year.
    createPlayerContract({ id: contractIdFromString('contract:home-successor'), playerId: successor.id, teamId: HOME_TEAM, kind: 'standard', term: { startsOn: NEXT_PAYROLL, expiresOn: createGameDate(2036, 10, 1) }, compensation: { annualSalary: 150_000 } }),
  ]
  let world = updateGameWorld(base, { contracts: [...Object.values(base.contractsById), ...contracts] })
  world = provisionOrganizationFinanceFoundation(world, HOME_ORGANIZATION, { currencyCode: CURRENCY, asOfDate: START, fiscalYearStartMonth: FISCAL_YEAR_START_MONTH, authorizationRenewalPolicy: options.homePolicy ?? null })
  world = provisionOrganizationFinanceFoundation(world, AWAY_ORGANIZATION, { currencyCode: CURRENCY, asOfDate: START, fiscalYearStartMonth: FISCAL_YEAR_START_MONTH, authorizationRenewalPolicy: options.awayPolicy ?? null })
  world = authorizeTeamSalaryForTest(world, HOME_TEAM, { currencyCode: CURRENCY, playerSalaryMinorUnits: PLAYER_SALARY_LIMIT, staffSalaryMinorUnits: STAFF_SALARY_LIMIT })
  world = authorizeTeamSalaryForTest(world, AWAY_TEAM, { currencyCode: CURRENCY, playerSalaryMinorUnits: AWAY_PLAYER_SALARY_LIMIT, staffSalaryMinorUnits: AWAY_STAFF_SALARY_LIMIT })
  // The career's opening date is processed exactly like the shipped product does it, so the previous period
  // owns real spending that must not travel into the next one.
  const opened = processClubFinanceForDate(world, START).world
  return options.fundingMinorUnits === undefined ? opened : fundOrganizationWithOpeningCapital(opened, HOME_ORGANIZATION, { currencyCode: CURRENCY, cashMinorUnits: options.fundingMinorUnits, effectiveOn: START })
}

function budgetsOf(world: GameWorld, organizationId: string) {
  return Object.values(world.financialBudgetsById).filter((budget) => budget.organizationId === organizationId)
}

function linesOf(world: GameWorld, budgetId: string) {
  return Object.values(world.budgetLinesById).filter((line) => line.budgetId === budgetId)
}

function authorizationAt(world: GameWorld, organizationId: string, asOfDate: string) {
  return getOrganizationFinancialAuthorization(world, { organizationId, currencyCode: CURRENCY, asOfDate })
}

function previousBudget(world: GameWorld) {
  return budgetsOf(world, HOME_ORGANIZATION).find((budget) => budget.fiscalPeriodId === String(financeFiscalPeriodIdFor(HOME_ORGANIZATION, FY_2032_START)))!
}

function renewedBudgetId() {
  return authorizationRenewalBudgetIdFor(HOME_ORGANIZATION, financeFiscalPeriodIdFor(HOME_ORGANIZATION, FY_2033_START))
}

function limitsOf(world: GameWorld, budgetId: string) {
  return linesOf(world, budgetId)
    .map((line) => ({ category: line.category, minorUnits: line.amount.minorUnits, teamId: line.teamId }))
    .sort((left, right) => left.category.localeCompare(right.category))
}

describe('BS16N-R fiscal rollover materializes the next period exactly once', () => {
  it('creates exactly one new FiscalPeriod at the first processed date of the new fiscal year', () => {
    const world = renewalWorld({ homePolicy: CONTINUITY_POLICY })
    expect(financeFiscalPeriodsOf(world, HOME_ORGANIZATION).map((period) => String(period.id))).toEqual([String(financeFiscalPeriodIdFor(HOME_ORGANIZATION, FY_2032_START))])

    const rolled = processClubFinanceForDate(world, ROLLOVER).world
    const periods = financeFiscalPeriodsOf(rolled, HOME_ORGANIZATION)
    expect(periods.map((period) => String(period.id))).toEqual([
      String(financeFiscalPeriodIdFor(HOME_ORGANIZATION, FY_2032_START)),
      String(financeFiscalPeriodIdFor(HOME_ORGANIZATION, FY_2033_START)),
    ])
    expect([periods[0]!.startsOn, periods[0]!.endsOn]).toEqual(['2032-09-01', '2033-08-31'])
    expect([periods[1]!.startsOn, periods[1]!.endsOn]).toEqual(['2033-09-01', '2034-08-31'])
    expect(compareGameDates(periods[0]!.endsOn, periods[1]!.startsOn)).toBeLessThan(0)
    expect(periods[1]!.label).toBe('2033-34')
    // Structural for every profiled Organization, not only for the one carrying a renewal policy.
    expect(financeFiscalPeriodsOf(rolled, AWAY_ORGANIZATION)).toHaveLength(2)
  })

  it('is an exact no-op when the fiscal year is already materialized or the date is replayed', () => {
    const world = renewalWorld({ homePolicy: CONTINUITY_POLICY })
    const rolled = processClubFinanceForDate(world, ROLLOVER).world
    // Replaying the same processed date returns the identical world instance.
    expect(processClubFinanceForDate(rolled, ROLLOVER).world).toBe(rolled)
    expect(financeFiscalPeriodsOf(rolled, HOME_ORGANIZATION)).toHaveLength(2)
    expect(budgetsOf(rolled, HOME_ORGANIZATION)).toHaveLength(2)
    // A later date inside the same fiscal year materializes nothing either, and the producer is idempotent.
    expect(financeFiscalPeriodsOf(processClubFinanceForDate(rolled, createGameDate(2034, 3, 1)).world, HOME_ORGANIZATION)).toHaveLength(2)
    expect(ensureFinanceFiscalPeriodForDate(rolled, HOME_ORGANIZATION, ROLLOVER)).toBe(rolled)
    expect(ensureFinanceFiscalPeriodForDate(rolled, HOME_ORGANIZATION, createGameDate(2034, 3, 1))).toBe(rolled)
  })

  it('creates no cash, revenue, expense, debt or capital by materializing a period', () => {
    const world = renewalWorld({ homePolicy: null, fundingMinorUnits: 3_000_000_000 })
    const rolled = processClubFinanceForDate(world, ROLLOVER).world

    expect(financeFiscalPeriodsOf(rolled, HOME_ORGANIZATION)).toHaveLength(2)
    // Period truth is not permission and not money: with no policy the world gains periods and nothing else.
    expect(budgetsOf(rolled, HOME_ORGANIZATION)).toHaveLength(1)
    expect(rolled.financialTransactionsById).toEqual(world.financialTransactionsById)
    expect(rolled.revenueRecognitionsById).toEqual(world.revenueRecognitionsById)
    expect(rolled.expenseRecognitionsById).toEqual(world.expenseRecognitionsById)
    expect(rolled.receivablesById).toEqual(world.receivablesById)
    expect(rolled.payablesById).toEqual(world.payablesById)
    expect(rolled.debtInstrumentsById).toEqual(world.debtInstrumentsById)
    expect(rolled.capitalContributionsById).toEqual(world.capitalContributionsById)
    expect(rolled.financialReservationsById).toEqual(world.financialReservationsById)
  })
})

describe('BS16N-R authorization renewal is an explicit policy decision', () => {
  it('renews exactly one authorization that carries the previous approved limits into the new period', () => {
    const world = renewalWorld({ homePolicy: CONTINUITY_POLICY })
    const previous = previousBudget(world)
    const rolled = processClubFinanceForDate(world, ROLLOVER).world
    const budgets = budgetsOf(rolled, HOME_ORGANIZATION)

    expect(budgets).toHaveLength(2)
    const renewed = budgets.find((budget) => String(budget.id) === renewedBudgetId())
    // New ids, new fiscal period, same currency, same approved limits by category.
    expect(renewed).toBeDefined()
    expect(renewed!.id).not.toBe(previous.id)
    expect(String(renewed!.currencyCode)).toBe(CURRENCY)
    expect(renewed!.status).toBe('APPROVED')
    expect(renewed!.fiscalPeriodId).toBe(String(financeFiscalPeriodIdFor(HOME_ORGANIZATION, FY_2033_START)))
    expect(renewed!.period).toMatchObject({ kind: 'FISCAL_YEAR', startsOn: '2033-09-01', endsOn: '2034-08-31' })
    expect(renewed!.createdOn).toBe(String(ROLLOVER))
    expect(limitsOf(rolled, renewed!.id)).toEqual(limitsOf(world, previous.id))
    // Deterministic provenance: the policy that decided it is recorded on the authorization itself.
    expect(renewed!.provenance).toEqual(CONTINUITY_POLICY.provenance)
    expect(renewed!.approval).toMatchObject({ authorityKind: 'MANUAL_SYSTEM_ACTION', authorityId: 'system:annual-authorization-continuity', approvedOn: String(ROLLOVER) })
    expect(renewed!.approval!.provenance).toEqual(CONTINUITY_POLICY.provenance)
    // New facts, never a rewrite of the previous period's lines.
    const renewedLineIds = linesOf(rolled, renewed!.id).map((line) => line.id)
    expect(new Set(renewedLineIds).size).toBe(renewedLineIds.length)
    expect(renewedLineIds.some((id) => linesOf(rolled, previous.id).some((line) => line.id === id))).toBe(false)
    // The new period is authorized and playable.
    expect(authorizationAt(rolled, HOME_ORGANIZATION, ROLLOVER)).toMatchObject({ state: 'ACTIVE', budgetId: renewed!.id, authorizedMinorUnits: PLAYER_SALARY_LIMIT + STAFF_SALARY_LIMIT })
    expect(evaluateOrganizationFinancialCommitment(rolled, { organizationId: HOME_ORGANIZATION, currency: CURRENCY, amount: { currencyCode: CURRENCY, minorUnits: 1_000_000 }, category: 'PLAYER_SALARY', asOfDate: ROLLOVER }).reasonCodes).not.toContain('BUDGET_AUTHORIZATION_NOT_MODELLED')
  })

  it('carries limits only: spending, commitments and reservations stay in their own period', () => {
    const world = renewalWorld({ homePolicy: CONTINUITY_POLICY, fundingMinorUnits: 3_000_000_000 })
    const previous = previousBudget(world)
    // The previous period really spent: the opening date payroll of both contracts was recognized.
    expect(getBudgetComparison(world, previous.id, START).reduce((sum, row) => sum + row.actualMinorUnits, 0)).toBe(MULTI_YEAR_SALARY_MINOR_UNITS + EXPIRING_SALARY_MINOR_UNITS)
    const reservation = createFinancialReservation({ id: 'reservation:bs16n-r:test', organizationId: HOME_ORGANIZATION, currency: CURRENCY, amount: { currencyCode: CURRENCY, minorUnits: RESERVATION_MINOR_UNITS }, sourceAuthority: 'BS16N_R_TEST', sourceEntityId: 'bs16n-r:reservation', createdOn: START })
    expect(reservation.status).toBe('OPEN')
    const withReservation = updateGameWorld(world, { financialReservations: [reservation] })

    const rolled = processClubFinanceForDate(withReservation, ROLLOVER).world
    const renewedId = renewedBudgetId()
    const renewed = authorizationAt(rolled, HOME_ORGANIZATION, ROLLOVER)

    expect(renewed.budgetId).toBe(renewedId)
    // The new period's authorization carries no recognized spending from the previous one...
    expect(getBudgetComparison(rolled, renewedId, ROLLOVER).every((row) => row.actualMinorUnits === 0)).toBe(true)
    // ...and the previous period's own history is untouched.
    expect(getBudgetComparison(rolled, previous.id, START).reduce((sum, row) => sum + row.actualMinorUnits, 0)).toBe(MULTI_YEAR_SALARY_MINOR_UNITS + EXPIRING_SALARY_MINOR_UNITS)
    // No commitment or reservation fact was created, copied or duplicated by the renewal.
    expect(Object.values(rolled.financialCommitmentsById)).toEqual(Object.values(withReservation.financialCommitmentsById))
    expect(Object.values(rolled.financialReservationsById)).toHaveLength(1)
    expect(Object.values(rolled.financialReservationsById)[0]!.id).toBe(reservation.id)
    expect(Object.values(rolled.financialReservationsById)[0]!.status).toBe('OPEN')
    // A reservation is organization-level capacity, never a period-scoped fact of the renewal.
    expect(renewed.reservationScopeAttribution).toBe('ORGANIZATION_ONLY')
    expect(renewed.reservedMinorUnits).toBe(RESERVATION_MINOR_UNITS)
    expect(renewed.availableHeadroomMinorUnits).toBe(PLAYER_SALARY_LIMIT + STAFF_SALARY_LIMIT - (MULTI_YEAR_SALARY_MINOR_UNITS + SUCCESSOR_SALARY_MINOR_UNITS) - RESERVATION_MINOR_UNITS)
  })

  it('makes contracts consume the capacity of the period their service belongs to', () => {
    const world = renewalWorld({ homePolicy: CONTINUITY_POLICY })
    const rolled = processClubFinanceForDate(world, ROLLOVER).world
    const afterPayroll = processClubFinanceForDate(rolled, NEXT_PAYROLL).world
    const renewed = authorizationAt(afterPayroll, HOME_ORGANIZATION, NEXT_PAYROLL)

    expect(renewed.budgetId).toBe(renewedBudgetId())
    // Exactly the guaranteed service windows that belong to the new fiscal year: the multi-year contract's own
    // year and the retention successor's first year. Nothing from the previous fiscal year is included.
    const playerLine = renewed.lines.find((line) => line.category === 'PLAYER_SALARY')!
    expect(playerLine.committedMinorUnits).toBe(MULTI_YEAR_SALARY_MINOR_UNITS + SUCCESSOR_SALARY_MINOR_UNITS)
    expect(playerLine.availableHeadroomMinorUnits).toBe(PLAYER_SALARY_LIMIT - MULTI_YEAR_SALARY_MINOR_UNITS - SUCCESSOR_SALARY_MINOR_UNITS)
    expect(renewed.lines.find((line) => line.category === 'STAFF_SALARY')!.committedMinorUnits).toBe(0)
  })

  it('never lets a contract that ended before the fiscal year consume the new period capacity', () => {
    const world = renewalWorld({ homePolicy: CONTINUITY_POLICY })
    const rolled = processClubFinanceForDate(world, ROLLOVER).world
    const afterPayroll = processClubFinanceForDate(rolled, NEXT_PAYROLL).world
    const expiringEntries = getContractFinancialSchedule(afterPayroll, { organizationId: HOME_ORGANIZATION, currencyCode: CURRENCY, includeConditional: true }).filter((entry) => String(entry.contractId) === 'contract:home-expiring')

    // Its last scheduled occurrence belongs to fiscal year 2032: nothing at all after that.
    expect(expiringEntries.map((entry) => entry.effectiveOn)).toEqual(['2031-09-01', '2032-09-01'])
    expect(expiringEntries.every((entry) => compareGameDates(entry.effectiveOn, ROLLOVER) < 0)).toBe(true)
    expect(Object.values(afterPayroll.expenseRecognitionsById).filter((entry) => String(entry.id).includes('contract:home-expiring'))).toHaveLength(1)
    expect(Object.values(afterPayroll.financialCommitmentsById).filter((entry) => String(entry.id).includes('contract:home-expiring') && compareGameDates(entry.dueOn, createGameDate(2033, 9, 1)) >= 0)).toEqual([])
    // The new period's authorization excludes it entirely: fiscal year 2032's 6,000,000 is not carried.
    expect(authorizationAt(afterPayroll, HOME_ORGANIZATION, NEXT_PAYROLL).lines.find((line) => line.category === 'PLAYER_SALARY')!.committedMinorUnits).toBe(MULTI_YEAR_SALARY_MINOR_UNITS + SUCCESSOR_SALARY_MINOR_UNITS)
  })

  it('puts a retention successor into the period its term belongs to', () => {
    const world = renewalWorld({ homePolicy: CONTINUITY_POLICY })
    const beforeRollover = processClubFinanceForDate(world, createGameDate(2033, 8, 31)).world
    // Signed now, but its service belongs to the next fiscal year: the current period owes exactly the contracts
    // that are still serving it.
    expect(authorizationAt(beforeRollover, HOME_ORGANIZATION, createGameDate(2033, 8, 31)).lines.find((line) => line.category === 'PLAYER_SALARY')!.committedMinorUnits).toBe(MULTI_YEAR_SALARY_MINOR_UNITS + EXPIRING_SALARY_MINOR_UNITS)
    expect(Object.values(beforeRollover.financialCommitmentsById).filter((entry) => String(entry.id).includes('contract:home-successor'))).toEqual([])

    const rolled = processClubFinanceForDate(beforeRollover, ROLLOVER).world
    // At the rollover the successor's first year is already part of the new period's authorization.
    expect(authorizationAt(rolled, HOME_ORGANIZATION, ROLLOVER).lines.find((line) => line.category === 'PLAYER_SALARY')!.committedMinorUnits).toBe(MULTI_YEAR_SALARY_MINOR_UNITS + SUCCESSOR_SALARY_MINOR_UNITS)
    // Its first occurrence lands on its own term start, inside the new fiscal year.
    const afterSuccessorPayroll = processClubFinanceForDate(rolled, NEXT_PAYROLL).world
    const successorCommitments = Object.values(afterSuccessorPayroll.financialCommitmentsById).filter((entry) => String(entry.id).includes('contract:home-successor'))
    expect(successorCommitments).toHaveLength(1)
    expect(successorCommitments[0]!.dueOn).toBe(String(NEXT_PAYROLL))
    expect(compareGameDates(successorCommitments[0]!.dueOn, createGameDate(2033, 9, 1))).toBeGreaterThanOrEqual(0)
  })

  it('never overwrites an explicit next-period authorization', () => {
    const world = renewalWorld({ homePolicy: CONTINUITY_POLICY })
    const nextPeriodId = financeFiscalPeriodIdFor(HOME_ORGANIZATION, FY_2033_START)
    const withPeriod = ensureFinanceFiscalPeriodForDate(world, HOME_ORGANIZATION, createGameDate(2033, 9, 4))
    const explicit = createFinancialBudget({
      id: `budget:governance:${HOME_ORGANIZATION}:${nextPeriodId}`,
      organizationId: HOME_ORGANIZATION,
      currencyCode: CURRENCY,
      period: { kind: 'FISCAL_YEAR', startsOn: '2033-09-01', endsOn: '2034-08-31' },
      fiscalPeriodId: String(nextPeriodId),
      status: 'APPROVED',
      label: 'Governance approved annual budget',
      createdOn: createGameDate(2033, 9, 4),
      approval: { authorityKind: 'GOVERNANCE', authorityId: 'governance:board', approvedOn: createGameDate(2033, 9, 4), provenance: { kind: 'GOVERNANCE_DECISION', id: 'governance:board:2033' } },
      provenance: { kind: 'GOVERNANCE_DECISION', id: 'governance:board:2033' },
    })
    const governed = updateGameWorld(withPeriod, { financialBudgets: [...Object.values(withPeriod.financialBudgetsById), explicit] })

    const rolled = processClubFinanceForDate(governed, ROLLOVER).world
    const forNextPeriod = budgetsOf(rolled, HOME_ORGANIZATION).filter((budget) => budget.fiscalPeriodId === String(nextPeriodId))
    expect(forNextPeriod).toHaveLength(1)
    expect(forNextPeriod[0]!.id).toBe(explicit.id)
    expect(authorizationAt(rolled, HOME_ORGANIZATION, ROLLOVER).budgetId).toBe(explicit.id)
    // The planner reports the same thing without mutating anything, so both paths agree.
    const plan = planAuthorizationRenewal(governed, { organizationId: HOME_ORGANIZATION, currencyCode: CURRENCY, fiscalPeriodId: nextPeriodId, period: { startsOn: '2033-09-01', endsOn: '2034-08-31' }, asOfDate: ROLLOVER, policy: CONTINUITY_POLICY })
    expect(plan.status).toBe('ALREADY_AUTHORIZED')
    expect(applyAuthorizationRenewal(governed, plan)).toBe(governed)
  })

  it('keeps an explicit NONE policy truthful instead of renewing by habit', () => {
    const world = renewalWorld({ homePolicy: NONE_POLICY })
    const rolled = processClubFinanceForDate(world, ROLLOVER).world
    const decision = evaluateOrganizationFinancialCommitment(rolled, { organizationId: HOME_ORGANIZATION, currency: CURRENCY, amount: { currencyCode: CURRENCY, minorUnits: 1_000_000 }, category: 'PLAYER_SALARY', asOfDate: ROLLOVER })

    expect(financeFiscalPeriodsOf(rolled, HOME_ORGANIZATION)).toHaveLength(2)
    expect(budgetsOf(rolled, HOME_ORGANIZATION)).toHaveLength(1)
    expect(authorizationAt(rolled, HOME_ORGANIZATION, ROLLOVER).state).toBe('NOT_PROVISIONED')
    // Truthful, not blocking: the reason is reported while liquidity is what it is.
    expect(decision.reasonCodes).toContain('BUDGET_AUTHORIZATION_NOT_MODELLED')
    expect(getFinanceActivationReport(rolled, { asOfDate: ROLLOVER }).organizations.find((entry) => String(entry.organizationId) === HOME_ORGANIZATION)?.status).toBe('RENEWAL_NOT_MODELLED')
  })

  it('gives no Organization a carry-forward it was never assigned', () => {
    const world = renewalWorld({ homePolicy: CONTINUITY_POLICY })
    // team-away has the same fiscal configuration and a real authorization, but no policy.
    expect(world.organizationFinancialProfilesById[AWAY_ORGANIZATION as never]!.authorizationRenewalPolicy).toBeNull()
    const rolled = processClubFinanceForDate(world, ROLLOVER).world

    expect(financeFiscalPeriodsOf(rolled, AWAY_ORGANIZATION)).toHaveLength(2)
    expect(budgetsOf(rolled, AWAY_ORGANIZATION)).toHaveLength(1)
    expect(authorizationAt(rolled, AWAY_ORGANIZATION, ROLLOVER).state).toBe('NOT_PROVISIONED')
    expect(Object.keys(rolled.financialBudgetsById).filter((id) => id.startsWith(`budget:authorization-renewal:${AWAY_ORGANIZATION}`))).toEqual([])
    // The assigned Organization is unaffected by its neighbour: exactly one new authorization, for team-home.
    expect(budgetsOf(rolled, HOME_ORGANIZATION)).toHaveLength(2)
    expect(Object.keys(rolled.financialBudgetsById).filter((id) => id.startsWith('budget:authorization-renewal:'))).toEqual([renewedBudgetId()])
    // No policy anywhere is a no-op whatever a caller imagines, and so is a plan for the unassigned Organization.
    const plan = planAuthorizationRenewal(rolled, { organizationId: AWAY_ORGANIZATION, currencyCode: CURRENCY, fiscalPeriodId: financeFiscalPeriodIdFor(AWAY_ORGANIZATION, FY_2033_START), period: { startsOn: '2033-09-01', endsOn: '2034-08-31' }, asOfDate: ROLLOVER, policy: null })
    expect(plan.status).toBe('POLICY_DISABLED')
    expect(applyAuthorizationRenewal(rolled, plan)).toBe(rolled)
    expect(planAuthorizationRenewal(rolled, { organizationId: HOME_ORGANIZATION, currencyCode: CURRENCY, fiscalPeriodId: financeFiscalPeriodIdFor(HOME_ORGANIZATION, FY_2033_START), period: { startsOn: '2033-09-01', endsOn: '2034-08-31' }, asOfDate: ROLLOVER, policy: null }).status).toBe('POLICY_DISABLED')
  })

  it('creates no cash, revenue or obligation and never touches TeamFinances', () => {
    const world = renewalWorld({ homePolicy: CONTINUITY_POLICY, fundingMinorUnits: 3_000_000_000 })
    const legacyBefore = JSON.stringify(world.teamFinancesByTeamId)
    const rolled = processClubFinanceForDate(world, ROLLOVER).world

    // Renewal is authorization policy: no money, no obligation, no ledger fact and no legacy pool change.
    expect(JSON.stringify(rolled.teamFinancesByTeamId)).toBe(legacyBefore)
    expect(rolled.financialTransactionsById).toEqual(world.financialTransactionsById)
    expect(rolled.revenueRecognitionsById).toEqual(world.revenueRecognitionsById)
    expect(rolled.expenseRecognitionsById).toEqual(world.expenseRecognitionsById)
    expect(rolled.receivablesById).toEqual(world.receivablesById)
    expect(rolled.payablesById).toEqual(world.payablesById)
    expect(rolled.treasuryApplicationsById).toEqual(world.treasuryApplicationsById)
    expect(rolled.financialCommitmentsById).toEqual(world.financialCommitmentsById)
    expect(rolled.capitalContributionsById).toEqual(world.capitalContributionsById)
    expect(rolled.financingDrawdownsById).toEqual(world.financingDrawdownsById)
    expect(rolled.debtInstrumentsById).toEqual(world.debtInstrumentsById)
    // Deterministic: the same world and date always produce the identical authorization facts.
    const twice = processClubFinanceForDate(renewalWorld({ homePolicy: CONTINUITY_POLICY, fundingMinorUnits: 3_000_000_000 }), ROLLOVER).world
    expect(twice.financialBudgetsById).toEqual(rolled.financialBudgetsById)
    expect(twice.budgetLinesById).toEqual(rolled.budgetLinesById)
  })

  it('survives save/load around the rollover and renews again on the next rollover', () => {
    const world = renewalWorld({ homePolicy: CONTINUITY_POLICY })
    const rolled = processClubFinanceForDate(world, ROLLOVER).world
    const reloaded = deserializeGameWorldV4(serializeGameWorldV4(rolled, `${ROLLOVER}T00:00:00.000Z`))

    // The assigned policy is canonical, persisted configuration: a loaded career renews the same way.
    expect(reloaded.organizationFinancialProfilesById[HOME_ORGANIZATION as never]!.authorizationRenewalPolicy).toEqual(CONTINUITY_POLICY)
    expect(reloaded.organizationFinancialProfilesById[AWAY_ORGANIZATION as never]!.authorizationRenewalPolicy).toBeNull()
    expect(financeFiscalPeriodsOf(reloaded, HOME_ORGANIZATION)).toHaveLength(2)
    expect(budgetsOf(reloaded, HOME_ORGANIZATION)).toHaveLength(2)
    expect(authorizationAt(reloaded, HOME_ORGANIZATION, ROLLOVER)).toMatchObject({ state: 'ACTIVE', budgetId: renewedBudgetId() })
    // Replaying the rollover date after a load adds nothing at all.
    const replayed = processClubFinanceForDate(reloaded, ROLLOVER).world
    expect(replayed.financialBudgetsById).toEqual(reloaded.financialBudgetsById)
    expect(financeFiscalPeriodsOf(replayed, HOME_ORGANIZATION)).toHaveLength(2)
    // The next rollover renews again, exactly once, from the authorization the previous one created.
    const nextRollover = createGameDate(2034, 9, 4)
    const twoRollovers = processClubFinanceForDate(processClubFinanceForDate(reloaded, nextRollover).world, nextRollover).world
    expect(budgetsOf(twoRollovers, HOME_ORGANIZATION)).toHaveLength(3)
    expect(financeFiscalPeriodsOf(twoRollovers, HOME_ORGANIZATION)).toHaveLength(3)
    expect(limitsOf(twoRollovers, authorizationRenewalBudgetIdFor(HOME_ORGANIZATION, financeFiscalPeriodIdFor(HOME_ORGANIZATION, '2034-09-01')))).toEqual(limitsOf(world, previousBudget(world).id))
    expect(budgetsOf(twoRollovers, AWAY_ORGANIZATION)).toHaveLength(1)
  })

  it('keeps a world that was never assigned a policy unchanged', () => {
    // A career whose profiles carry no renewal policy: the shipped truthful no-renewal behavior.
    const world = renewalWorld({ homePolicy: null })
    const rolled = processClubFinanceForDate(world, ROLLOVER).world

    expect(budgetsOf(rolled, HOME_ORGANIZATION)).toHaveLength(1)
    expect(authorizationAt(rolled, HOME_ORGANIZATION, ROLLOVER).state).toBe('NOT_PROVISIONED')
    expect(ensureCanonicalFinanceFoundation(rolled)).toBe(rolled)
    // A profile created without a policy normalizes to "no automatic renewal", never to a default.
    expect(createOrganizationFinancialProfile({ organizationId: HOME_ORGANIZATION, baseCurrencyCode: CURRENCY, fiscalYearStartMonth: FISCAL_YEAR_START_MONTH }).authorizationRenewalPolicy).toBeNull()
    expect(String(rolled.organizationFinancialProfilesById[HOME_ORGANIZATION as never]!.baseCurrencyCode)).toBe(CURRENCY)
    expect(getFinanceActivationReport(rolled, { asOfDate: ROLLOVER }).organizations.find((entry) => String(entry.organizationId) === HOME_ORGANIZATION)?.status).toBe('RENEWAL_NOT_MODELLED')
    expect(Object.values(rolled.teamFinancesByTeamId)).toEqual([])
  })
})
