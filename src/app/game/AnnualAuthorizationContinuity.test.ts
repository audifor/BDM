import { describe, expect, it } from 'vitest'

import { createGameDate } from '@/domain/date'
import {
  authorizationRenewalBudgetIdFor,
  financeFiscalPeriodIdFor,
  financeFiscalPeriodsOf,
  getFinanceActivationReport,
  getOrganizationFinancialAuthorization,
  listFinanceBearingOrganizationIds,
} from '@/domain/finance'
import { createGameWorld, type GameWorld } from '@/domain/world'
import { createValidGameWorldInput } from '@/domain/world/testFixtures'
import { advanceClubFinanceForDate } from '@/engine/finance/ClubFinanceLifecycle'

import { BDM_ANNUAL_AUTHORIZATION_CONTINUITY_POLICY_V1 } from './AnnualAuthorizationContinuityPolicy'
import { createAcbTestGame } from './createAcbTestGame'
import { createNewGame } from './createNewGame'

/**
 * BS16N-R. BDM Annual Authorization Continuity Policy V1 in the shipped worlds.
 *
 * The policy is product data assigned explicitly by the entry point that owns each universe, so only Prototype,
 * ACB Demo and World DB Spain receive it; every other world keeps the truthful `RENEWAL_NOT_MODELLED` answer.
 * These cases certify the shipped rollover behavior itself: period truth for every club, the previous approved
 * limits renewed into the new fiscal year, no invented money, and the demo competition's revenue and operating
 * cost still following only their own economic-source authority.
 */
const CURRENCY_EUR = 'EUR'
/** Prototype clubs are provisioned with the Season start month, so the rollover is the first 2033-10 date. */
const PROTOTYPE_ROLLOVER = createGameDate(2033, 10, 2)
/** ACB Demo clubs are provisioned with the ACB season start month, so the rollover is the first 2027-09 date. */
const ACB_ROLLOVER = createGameDate(2027, 9, 2)
/** ACB staff payroll is anchored on the canonical Season start, so its anniversary is 2027-09-26. */
const ACB_AFTER_PAYROLL = createGameDate(2027, 9, 26)

function budgetIdsOf(world: GameWorld, organizationId: string) {
  return Object.keys(world.financialBudgetsById).filter((id) => world.financialBudgetsById[id]!.organizationId === organizationId)
}

function limitsOf(world: GameWorld, budgetId: string) {
  return Object.values(world.budgetLinesById)
    .filter((line) => line.budgetId === budgetId)
    .map((line) => ({ category: line.category, minorUnits: line.amount.minorUnits, teamId: line.teamId }))
    .sort((left, right) => `${left.teamId ?? ''}|${left.category}`.localeCompare(`${right.teamId ?? ''}|${right.category}`))
}

describe('BS16N-R shipped annual authorization continuity', () => {
  it('assigns the policy to the shipped universes and to nothing else', () => {
    const prototype = createNewGame()
    const acb = createAcbTestGame()
    for (const world of [prototype, acb]) {
      for (const organizationId of listFinanceBearingOrganizationIds(world)) {
        expect(world.organizationFinancialProfilesById[organizationId]!.authorizationRenewalPolicy).toMatchObject({
          mode: BDM_ANNUAL_AUTHORIZATION_CONTINUITY_POLICY_V1.mode,
          provenance: BDM_ANNUAL_AUTHORIZATION_CONTINUITY_POLICY_V1.provenance,
        })
      }
    }
    // A world nobody assigns the policy to carries none: no engine, no default and no other universe inherits it.
    const unassigned = createGameWorld(createValidGameWorldInput())
    expect(Object.values(unassigned.organizationFinancialProfilesById)).toEqual([])
    expect(BDM_ANNUAL_AUTHORIZATION_CONTINUITY_POLICY_V1.version).toBe(1)
  })

  it('renews the prototype career at its fiscal rollover without inventing money', () => {
    const career = createNewGame()
    const organizations = listFinanceBearingOrganizationIds(career)
    const before = Object.fromEntries(organizations.map((organizationId) => [organizationId, budgetIdsOf(career, organizationId).length]))
    const rollover = advanceClubFinanceForDate(career, PROTOTYPE_ROLLOVER)
    const transactionsBefore = Object.keys(career.financialTransactionsById).length

    const problems: string[] = []
    for (const organizationId of organizations) {
      const periods = financeFiscalPeriodsOf(rollover, organizationId)
      // Structural period truth for every club: the fiscal year it entered exists exactly once.
      expect(periods.map((period) => String(period.id))).toEqual([
        String(financeFiscalPeriodIdFor(organizationId, '2032-10-01')),
        String(financeFiscalPeriodIdFor(organizationId, '2033-10-01')),
      ])
      const budgets = budgetIdsOf(rollover, organizationId)
      if (before[organizationId] === 0) {
        // A club with no authorization for the previous period has nothing to carry forward.
        expect(budgets).toHaveLength(0)
        continue
      }
      expect(budgets).toHaveLength(before[organizationId]! + 1)
      const renewedId = authorizationRenewalBudgetIdFor(organizationId, financeFiscalPeriodIdFor(organizationId, '2033-10-01'))
      expect(budgets).toContain(renewedId)
      // The new period's authorization repeats the previous period's approved limits, category by category.
      const previousId = budgetIdsOf(career, organizationId)[0]!
      expect(limitsOf(rollover, renewedId)).toEqual(limitsOf(career, previousId))
      const authorization = getOrganizationFinancialAuthorization(rollover, { organizationId, currencyCode: String(rollover.organizationFinancialProfilesById[organizationId]!.baseCurrencyCode), asOfDate: PROTOTYPE_ROLLOVER })
      if (authorization.state !== 'ACTIVE' || authorization.budgetId !== renewedId) problems.push(`${organizationId}|state=${authorization.state}|budgetId=${authorization.budgetId}|renewed=${renewedId}|budgets=${budgets.length}|before=${before[organizationId]}|authorized=${authorization.authorizedMinorUnits}`)
      if (getFinanceActivationReport(rollover, { asOfDate: PROTOTYPE_ROLLOVER }).organizations.find((entry) => String(entry.organizationId) === organizationId)?.status === 'RENEWAL_NOT_MODELLED') problems.push(`${organizationId}|report=RENEWAL_NOT_MODELLED`)
    }
    expect(problems).toEqual([])
    // The rollover is authorization policy: it created no ledger fact at all.
    expect(Object.keys(rollover.financialTransactionsById)).toHaveLength(transactionsBefore)
    expect(Object.keys(rollover.revenueRecognitionsById).length).toBe(Object.keys(career.revenueRecognitionsById).length)
    expect(Object.keys(rollover.expenseRecognitionsById).length).toBe(Object.keys(career.expenseRecognitionsById).length)
  })

  it('renews the ACB Demo career at its rollover while revenue and operating cost stay source-driven', () => {
    const career = createAcbTestGame()
    const organizationId = String(Object.values(career.teams)[0]!.organizationId)
    const previousBudgetId = budgetIdsOf(career, organizationId)[0]!
    const revenueBefore = Object.keys(career.revenueRecognitionsById).length
    const operatingCostBefore = Object.keys(career.expenseRecognitionsById).length

    const rolled = advanceClubFinanceForDate(career, ACB_ROLLOVER)
    const renewedId = authorizationRenewalBudgetIdFor(organizationId, financeFiscalPeriodIdFor(organizationId, '2027-09-01'))

    expect(financeFiscalPeriodsOf(rolled, organizationId).map((period) => [period.startsOn, period.endsOn])).toEqual([['2026-09-01', '2027-08-31'], ['2027-09-01', '2028-08-31']])
    expect(budgetIdsOf(rolled, organizationId)).toContain(renewedId)
    expect(limitsOf(rolled, renewedId)).toEqual(limitsOf(career, previousBudgetId))
    // Authorization becomes ACTIVE for the new period, for the club and for its opponents.
    for (const team of Object.values(rolled.teams)) {
      const organization = String(team.organizationId)
      const authorization = getOrganizationFinancialAuthorization(rolled, { organizationId: organization, currencyCode: CURRENCY_EUR, asOfDate: ACB_ROLLOVER })
      expect(authorization.state).toBe('ACTIVE')
      expect(budgetIdsOf(rolled, organization)).toHaveLength(2)
    }
    // Payroll keeps materializing after the rollover: it follows contracts, not fiscal periods.
    const afterPayroll = advanceClubFinanceForDate(rolled, ACB_AFTER_PAYROLL)
    expect(Object.keys(afterPayroll.expenseRecognitionsById).length).toBeGreaterThan(operatingCostBefore)
    // Revenue and operating cost follow their own source authority: the demo policy declares one fiscal year, so
    // renewal invents none for the period that follows.
    expect(Object.keys(afterPayroll.revenueRecognitionsById)).toHaveLength(revenueBefore)
    expect(Object.values(afterPayroll.expenseRecognitionsById).filter((entry) => String(entry.category) === 'MATCH_OPERATIONS' && String(entry.recognizedOn) >= '2027-09-01')).toEqual([])
    expect(getFinanceActivationReport(afterPayroll, { asOfDate: ACB_ROLLOVER }).organizations.find((entry) => String(entry.organizationId) === organizationId)?.status).toBe('ALREADY_PROVISIONED')
  })
})
