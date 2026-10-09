import { describe, expect, it } from 'vitest'

import { createAcbTestGame, createNewGame } from '@/app/game'
import { createGameDate } from '@/domain/date'
import {
  createOperatingCostSource,
  ECONOMIC_SOURCES_EXCLUDED_FROM_BS16K,
  getCashBalancesByCurrency,
  getCashFlowTotalsBetween,
  getEconomicSourceAuthorityReport,
  getEligibleDuePayablesForDate,
  getOpenPayables,
  getTrialBalanceAsOfDate,
  getUngroundedEconomicSources,
  isMaterializableShippedEconomicSource,
  legacyMajorUnitsToMoney,
  MISSING_ECONOMIC_SOURCE_AUTHORITY_REGISTER,
  MISSING_ECONOMIC_SOURCE_AUTHORITIES,
  OPERATING_COST_CATEGORIES,
  SHIPPED_ECONOMIC_SOURCE_CLASSIFICATION,
  economicSourceCandidate,
} from '@/domain/finance'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { advanceDayWithTrace } from '@/engine/calendar'

/**
 * BS16K certifies the shipped economic source authority, not a fabricated economy. The audit found no shipped
 * data that supplies a defensible recurring revenue or operating cost amount together with its timing, so these
 * tests prove the classification is honest and guarded: nothing may materialize, shipped careers carry zero
 * unauthorized sources, authorizations and physical drivers are never money, and the 90-day ledger stays
 * explainable with no revenue at all.
 */
const EUR = 'EUR'

function organizationIdsOf(world: GameWorld): readonly string[] {
  return [...new Set(Object.values(world.teams).map((team) => String(team.organizationId)))].sort()
}

function cashOf(world: GameWorld, organizationId: string, asOfDate?: string): number {
  return getCashBalancesByCurrency(world, organizationId, asOfDate ?? world.currentDate).reduce((sum, row) => sum + row.totalCashMinorUnits, 0)
}

describe('BS16K shipped economic source authority', () => {
  it('classifies every audited candidate honestly and materializes none of them', () => {
    expect(SHIPPED_ECONOMIC_SOURCE_CLASSIFICATION.length).toBeGreaterThan(10)
    for (const candidate of SHIPPED_ECONOMIC_SOURCE_CLASSIFICATION) {
      expect(candidate.meaning.length).toBeGreaterThan(0)
      expect(candidate.evidence.length).toBeGreaterThan(0)
      expect(candidate.materialized).toBe(false)
      expect(isMaterializableShippedEconomicSource(candidate.source)).toBe(false)
    }
    // Both families were audited, and no candidate reaches the only classification that may ship.
    expect(SHIPPED_ECONOMIC_SOURCE_CLASSIFICATION.some((candidate) => candidate.kind === 'REVENUE')).toBe(true)
    expect(SHIPPED_ECONOMIC_SOURCE_CLASSIFICATION.some((candidate) => candidate.kind === 'OPERATING_COST')).toBe(true)
    expect(SHIPPED_ECONOMIC_SOURCE_CLASSIFICATION.filter((candidate) => candidate.classification === 'SHIPPED_ECONOMIC_SOURCE')).toEqual([])
  })

  it('reports that no revenue or operating-cost source is producible yet', () => {
    const report = getEconomicSourceAuthorityReport()

    expect(report.candidates).toBe(SHIPPED_ECONOMIC_SOURCE_CLASSIFICATION.length)
    expect(report.materializableSources).toEqual([])
    expect(report.revenueSourceProducible).toBe(false)
    expect(report.operatingCostSourceProducible).toBe(false)
    expect(report.missingAuthorities).toEqual([...MISSING_ECONOMIC_SOURCE_AUTHORITIES])
  })

  it('records each missing authority with the exact product decision it needs', () => {
    expect(MISSING_ECONOMIC_SOURCE_AUTHORITY_REGISTER.map((entry) => entry.code)).toEqual([...MISSING_ECONOMIC_SOURCE_AUTHORITIES])
    expect(new Set(MISSING_ECONOMIC_SOURCE_AUTHORITY_REGISTER.map((entry) => entry.code)).size).toBe(MISSING_ECONOMIC_SOURCE_AUTHORITY_REGISTER.length)
    for (const entry of MISSING_ECONOMIC_SOURCE_AUTHORITY_REGISTER) {
      expect(entry.requiredDecision.length).toBeGreaterThan(20)
      expect(entry.evidence.length).toBeGreaterThan(20)
    }
    expect(MISSING_ECONOMIC_SOURCE_AUTHORITY_REGISTER.some((entry) => entry.kind === 'REVENUE')).toBe(true)
    expect(MISSING_ECONOMIC_SOURCE_AUTHORITY_REGISTER.some((entry) => entry.kind === 'OPERATING_COST')).toBe(true)
    // The audited gaps the milestone named explicitly are all present.
    for (const code of ['TICKETING_PRICE_AUTHORITY_NOT_MODELLED', 'MEDIA_REVENUE_AUTHORITY_NOT_MODELLED', 'COMMERCIAL_REVENUE_AUTHORITY_NOT_MODELLED', 'COMPETITION_DISTRIBUTION_SOURCE_NOT_MODELLED', 'FACILITY_OPEX_AUTHORITY_NOT_MODELLED'] as const) {
      expect(MISSING_ECONOMIC_SOURCE_AUTHORITIES).toContain(code)
    }
  })

  it('keeps shipped careers free of any unauthorized revenue, operating cost or distribution source', () => {
    for (const world of [createNewGame(), createAcbTestGame()]) {
      expect(Object.keys(world.revenueSourcesById)).toEqual([])
      expect(Object.keys(world.operatingCostSourcesById)).toEqual([])
      expect(Object.keys(world.operatingCostFactsById)).toEqual([])
      expect(Object.keys(world.competitionDistributionFactsById)).toEqual([])
      expect(getUngroundedEconomicSources(world)).toEqual([])
    }
  })

  it('never treats a spending authorization as revenue', () => {
    const budgets = SHIPPED_ECONOMIC_SOURCE_CLASSIFICATION.filter((candidate) => candidate.classification === 'AUTHORIZATION_ONLY')
    expect(budgets.map((candidate) => candidate.source)).toEqual(expect.arrayContaining([
      'TeamFinances.playerSalaryBudget / staffSalaryBudget',
      'FinancialBudget (APPROVED)',
      'Salary rules / salary cap',
    ]))
    for (const candidate of budgets) {
      expect(candidate.amountAuthority).toBe(false)
      expect(candidate.timingAuthority).toBe(false)
    }
    // A shipped club holds large salary budgets and still owns no cash: permission never became money.
    const career = createAcbTestGame()
    const organizationId = organizationIdsOf(career)[0]!
    expect(cashOf(career, organizationId, career.currentDate)).toBe(0)
    expect(Object.keys(career.revenueSourcesById)).toEqual([])
  })

  it('keeps the legacy money scale and the canonical scale distinct', () => {
    // The only shipped legacy monetary values (salary budgets) cross the BS16G boundary; canonical facts are
    // already minor units and must never be converted again.
    expect(economicSourceCandidate('TeamFinances.playerSalaryBudget / staffSalaryBudget')?.moneyScale).toBe('LEGACY_MAJOR_UNITS')
    expect(economicSourceCandidate('FinancialBudget (APPROVED)')?.moneyScale).toBe('MINOR_UNITS')
    expect(legacyMajorUnitsToMoney(1_500_000, EUR).minorUnits).toBe(150_000_000)
  })

  it('never treats a physical driver or a soft rating as money', () => {
    for (const source of ['Facility capacity', 'FacilityUsageRight / team_facility_usage', 'TicketRevenueFact + attendance']) {
      const candidate = economicSourceCandidate(source)!
      expect(candidate.classification).toBe('PHYSICAL_DRIVER_ONLY')
      expect(candidate.amountAuthority).toBe(false)
      expect(candidate.timingAuthority).toBe(false)
      expect(candidate.moneyScale).toBeNull()
    }
    for (const source of ['Media audience / credibility snapshots', 'Sponsor / branding records', 'Competition runtime bundle']) {
      const candidate = economicSourceCandidate(source)!
      expect(candidate.classification).toBe('INSUFFICIENT_SEMANTICS')
      expect(candidate.amountAuthority).toBe(false)
      expect(candidate.moneyScale).toBeNull()
    }
  })

  it('records the World DB economic tables as canonical types with no shipped rows', () => {
    for (const source of ['World DB revenue_stream', 'World DB expense_commitment', 'World DB budget', 'World DB facility_development_project.cost_amount']) {
      const candidate = economicSourceCandidate(source)!
      expect(candidate.canonicalTypeExists).toBe(true)
      expect(candidate.shippedData).toBe(false)
      expect(candidate.amountAuthority).toBe(false)
      expect(candidate.timingAuthority).toBe(false)
    }
    // Forecasts and advisory projections are not facts either.
    expect(economicSourceCandidate('BudgetForecasting / FinanceAI')?.classification).toBe('FORECAST_ONLY')
  })

  it('records the payroll exclusion and keeps payroll out of the operating-cost source boundary', () => {
    expect(ECONOMIC_SOURCES_EXCLUDED_FROM_BS16K.map((entry) => entry.source)).toEqual(['CONTRACT_PAYROLL', 'OPENING_ECONOMIC_STATE', 'FINANCING_AND_CAPITAL', 'DEBT_SERVICE'])
    expect(ECONOMIC_SOURCES_EXCLUDED_FROM_BS16K.find((entry) => entry.source === 'CONTRACT_PAYROLL')?.reason).toContain('BS16I')
    // The canonical OPEX category list cannot express payroll at all, so no BS16K source can duplicate BS16I.
    expect(OPERATING_COST_CATEGORIES.filter((category) => /PAYROLL|SALARY/.test(category))).toEqual([])
    for (const category of ['PAYROLL', 'PLAYER_SALARY', 'STAFF_SALARY']) {
      expect(() => createOperatingCostSource({ id: `source:${category}`, organizationId: organizationIdsOf(createAcbTestGame())[0]!, category: category as never, currencyCode: EUR, amount: { currencyCode: EUR, minorUnits: 1_000 }, startsOn: '2026-09-26', endsOn: '2027-06-30', sourceAuthority: 'ORGANIZATION', costNature: 'OPERATING', generationPolicy: 'ANNUAL', dueDatePolicy: 'ON_RECOGNITION', provenance: { kind: 'TEST', id: category } })).toThrow()
    }
  })

  it('keeps a 90-day shipped career ledger explainable with no revenue and no unauthorized fact', { timeout: 180_000 }, () => {
    const organizationId = organizationIdsOf(createAcbTestGame())[0]!
    let world = updateGameWorld(createAcbTestGame(), { currentDate: createGameDate(2026, 9, 25) })
    const openingCash = cashOf(world, organizationId)
    for (let day = 0; day < 90; day += 1) {
      const advanced = advanceDayWithTrace(world)
      expect(advanced.status).toBe('COMPLETED')
      world = advanced.world
    }

    // Nothing unauthorized appeared during three months of simulation.
    expect(getUngroundedEconomicSources(world)).toEqual([])
    expect(Object.keys(world.revenueSourcesById)).toEqual([])
    expect(Object.keys(world.operatingCostSourcesById)).toEqual([])
    expect(Object.keys(world.expenseRecognitionsById).every((id) => world.expenseRecognitionsById[id as never]!.category === 'CONTRACT_PLAYER_SALARY_DUE' || world.expenseRecognitionsById[id as never]!.category === 'STAFF_CONTRACT_EXPENSE_DUE')).toBe(true)
    // Cash identity: opening cash + inflows - outflows = ending cash, and there are no inflows or outflows at all.
    const totals = getCashFlowTotalsBetween(world, organizationId, '2026-09-25', world.currentDate)
    expect(totals).toEqual([])
    const endingCash = cashOf(world, organizationId)
    expect(openingCash + 0 - 0).toBe(endingCash)
    expect(endingCash).toBe(0)
    // The ledger is still balanced: every debit has a matching credit.
    const trial = getTrialBalanceAsOfDate(world, world.currentDate)
    expect(trial.reduce((sum, row) => sum + row.debitMinorUnits, 0)).toBe(trial.reduce((sum, row) => sum + row.creditMinorUnits, 0))
    // Obligations are outstanding and truthfully unfunded; nothing was settled because there is no liquidity.
    expect(getOpenPayables(world, organizationId, world.currentDate).length).toBeGreaterThan(0)
    expect(getEligibleDuePayablesForDate(world, { organizationId, currencyCode: EUR, date: world.currentDate }).length).toBeGreaterThan(0)
    expect(Object.keys(world.treasuryApplicationsById)).toEqual([])
  })
})
