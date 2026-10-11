import { describe, expect, it } from 'vitest'
import { createAcbTestGame, createNewGame } from '@/app/game'
import { financeFiscalPeriodIdFor, getFinanceActivationReport, getFinanceFiscalYearFor, getOrganizationFinancialAuthorization, legacyTeamFinanceAmountToMoney } from '@/domain/finance'
import { loadSavedGame, saveCurrentGame } from './GameSaveService'
import type { GameSaveRepository } from './GameSaveRepository'

function repository(initial = ''): GameSaveRepository & { value: string } {
  return {
    value: initial,
    async save(value) { this.value = value },
    async load() { return this.value },
    async getInfo() { return null },
  }
}

/**
 * BS16E certifies activation through the real production load seam: a career saved with only the legacy
 * TeamFinances authority (and a provisioned finance profile) activates canonical authorization on load,
 * and repeated save/load cycles never duplicate it.
 */
/**
 * BS16F certifies the migration path: a career saved before BS16B carries no canonical finance collection at
 * all, and the production load seam must provision the canonical foundation and authorization from the legacy
 * TeamFinances authority without duplicating anything.
 */
const CANONICAL_FINANCE_COLLECTIONS = [
  'organizationFinancialProfiles',
  'financialAccounts',
  'financialTransactions',
  'fiscalPeriods',
  'financialReservations',
  'financialBudgets',
  'budgetLines',
  'budgetRevisions',
  'budgetAllocations',
  'forecastAssumptions',
] as const

/** Drops the canonical finance collections from a saved career: the exact shape a pre-BS16B save has. */
function stripCanonicalFinance(save: string): string {
  const envelope = JSON.parse(save) as { payload: Record<string, unknown> }
  for (const key of CANONICAL_FINANCE_COLLECTIONS) delete envelope.payload[key]
  return JSON.stringify(envelope)
}

/**
 * The inverse shape BS16E migrates: one Organization keeps its canonical financial profile, but none of the
 * activation output that profile would have produced yet. Only that Organization's period, budget and lines
 * are dropped, so the rest of the career stays exactly as saved.
 */
function withoutActivationFor(save: string, organizationId: string, fiscalYearStartMonth: number): string {
  const envelope = JSON.parse(save) as { payload: Record<string, unknown> }
  for (const key of ['fiscalPeriods', 'financialBudgets', 'budgetLines']) {
    const collection = envelope.payload[key]
    if (Array.isArray(collection)) envelope.payload[key] = collection.filter((entry) => String((entry as { organizationId?: string }).organizationId) !== organizationId)
  }
  envelope.payload.organizationFinancialProfiles = (envelope.payload.organizationFinancialProfiles as readonly { organizationId: string }[])
    .map((profile) => profile.organizationId === organizationId ? { ...profile, fiscalYearStartMonth } : profile)
  return JSON.stringify(envelope)
}

describe('BS16F pre-BS16B save migration through the load seam', () => {
  it('provisions a legacy save that carries only the TeamFinances authority and stays duplicate-free', async () => {
    const career = createAcbTestGame()
    const repo = repository()
    await saveCurrentGame(career, repo, career.currentDate)
    const legacyRepo = repository(stripCanonicalFinance(repo.value))

    const loaded = await loadSavedGame(legacyRepo)
    const organizationIds = [...new Set(Object.values(loaded.teams).map((team) => String(team.organizationId)))].sort()

    expect(organizationIds).toHaveLength(18)
    expect(Object.keys(loaded.organizationFinancialProfilesById).sort()).toEqual(organizationIds)
    // Provisioning creates profile, catalog, period and authorization in EUR — never money.
    expect(loaded.financialTransactionsById).toEqual({})
    for (const organizationId of organizationIds) {
      const profile = loaded.organizationFinancialProfilesById[organizationId as never]!
      expect(String(profile.baseCurrencyCode)).toBe('EUR')
      expect(Object.values(loaded.fiscalPeriodsById).filter((period) => String(period.organizationId) === organizationId)).toHaveLength(1)
      expect(Object.values(loaded.financialBudgetsById).filter((budget) => budget.organizationId === organizationId)).toHaveLength(1)
    }
    // The legacy gameplay authority is untouched, and re-saving the activated career duplicates nothing.
    expect(loaded.teamFinancesByTeamId).toEqual(career.teamFinancesByTeamId)
    const second = repository()
    await saveCurrentGame(loaded, second, loaded.currentDate)
    const reloaded = await loadSavedGame(second)
    expect(Object.keys(reloaded.organizationFinancialProfilesById)).toEqual(Object.keys(loaded.organizationFinancialProfilesById))
    expect(Object.keys(reloaded.fiscalPeriodsById)).toEqual(Object.keys(loaded.fiscalPeriodsById))
    expect(Object.keys(reloaded.financialBudgetsById)).toEqual(Object.keys(loaded.financialBudgetsById))
    expect(Object.keys(reloaded.financialAccountsById)).toEqual(Object.keys(loaded.financialAccountsById))
    expect(Object.keys(reloaded.financialTransactionsById)).toEqual([])
  })
})

describe('BS16E activation through the save/load seam', () => {
  it('activates canonical authorization for a provisioned organization on load and stays idempotent', async () => {
    const career = createNewGame()
    const userTeam = Object.values(career.teams).find((team) => team.coachId === career.userCoachId)!
    const organizationId = String(userTeam.organizationId)
    const legacy = career.teamFinancesByTeamId[userTeam.id]!

    // The load seam must materialize the authorization of an Organization whose profile exists but whose
    // activation output does not yet; the profile's own fiscal year is what the period must follow.
    const repo = repository()
    await saveCurrentGame(career, repo, career.currentDate)
    const awaitingActivation = repository(withoutActivationFor(repo.value, organizationId, 7))

    const loaded = await loadSavedGame(awaitingActivation)
    const profile = loaded.organizationFinancialProfilesById[organizationId as never]!
    const currencyCode = String(profile.baseCurrencyCode)
    expect(profile.fiscalYearStartMonth).toBe(7)
    const authorization = getOrganizationFinancialAuthorization(loaded, { organizationId, currencyCode, asOfDate: loaded.currentDate })

    expect(authorization.state).toBe('ACTIVE')
    expect(authorization.lines.filter((line) => line.teamId === String(userTeam.id)).map((line) => [line.category, line.authorizedMinorUnits])).toEqual([
      ['PLAYER_SALARY', legacyTeamFinanceAmountToMoney(legacy.playerSalaryBudget, currencyCode).minorUnits],
      ['STAFF_SALARY', legacyTeamFinanceAmountToMoney(legacy.staffSalaryBudget, currencyCode).minorUnits],
    ])
    const periodsForOrganization = (world: typeof loaded) => Object.values(world.fiscalPeriodsById).filter((period) => String(period.organizationId) === String(organizationId))
    const budgetsForOrganization = (world: typeof loaded) => Object.values(world.financialBudgetsById).filter((budget) => budget.organizationId === String(organizationId))
    expect(periodsForOrganization(loaded)).toHaveLength(1)
    expect(budgetsForOrganization(loaded)).toHaveLength(1)
    // The materialized period is the fiscal year the profile's own starting month defines.
    const fiscalYear = getFinanceFiscalYearFor(profile, loaded.currentDate)
    expect(String(periodsForOrganization(loaded)[0]!.id)).toBe(String(financeFiscalPeriodIdFor(organizationId, fiscalYear.startsOn)))

    // Save → load → activate again never duplicates canonical facts.
    const second = repository()
    await saveCurrentGame(loaded, second, loaded.currentDate)
    const reloaded = await loadSavedGame(second)
    expect(Object.keys(reloaded.fiscalPeriodsById)).toEqual(Object.keys(loaded.fiscalPeriodsById))
    expect(Object.keys(reloaded.financialBudgetsById)).toEqual(Object.keys(loaded.financialBudgetsById))
    expect(Object.keys(reloaded.budgetLinesById)).toHaveLength(Object.keys(loaded.budgetLinesById).length)
    expect(reloaded.teamFinancesByTeamId).toEqual(loaded.teamFinancesByTeamId)
    // Legacy gameplay authority is untouched: no dual write and no cash created.
    expect(reloaded.financialTransactionsById).toEqual(loaded.financialTransactionsById)
    expect(reloaded.financialAccountsById).toEqual(loaded.financialAccountsById)
  })

  it('provisions every finance-bearing organization of a career and stays idempotent across save/load', async () => {
    const base = createNewGame()
    const repo = repository()
    await saveCurrentGame(base, repo, base.currentDate)
    const loaded = await loadSavedGame(repo)

    const report = getFinanceActivationReport(loaded)
    const provisioned = report.organizations.filter((entry) => entry.currencyCode !== null)
    const unavailable = report.organizations.filter((entry) => entry.status === 'FINANCE_CURRENCY_UNAVAILABLE')

    // The prototype career is a fictional universe (Virelia): its NBA-like/WNBA-like ecosystems keep the
    // shipped USD, and BS16M-B2's prototype finance policy provisions the rest in EUR, so nothing is left
    // without a canonical currency.
    expect(provisioned).toHaveLength(48)
    expect(unavailable).toEqual([])
    expect([...new Set(provisioned.map((entry) => String(entry.currencyCode)))].sort()).toEqual(['EUR', 'USD'])
    expect(Object.keys(loaded.organizationFinancialProfilesById)).toHaveLength(provisioned.length)
    // The provisioned clubs now carry the canonical payroll facts their contract schedules derive, so the
    // career is no longer an empty accounting world; reloading it must neither duplicate nor drop one.
    expect(Object.keys(loaded.financialTransactionsById).length).toBeGreaterThan(0)
    expect(loaded.financialTransactionsById).toEqual(base.financialTransactionsById)

    // Reloading never duplicates canonical finance facts.
    const second = repository()
    await saveCurrentGame(loaded, second, loaded.currentDate)
    const reloaded = await loadSavedGame(second)
    expect(Object.keys(reloaded.organizationFinancialProfilesById)).toEqual(Object.keys(loaded.organizationFinancialProfilesById))
    expect(Object.keys(reloaded.fiscalPeriodsById)).toEqual(Object.keys(loaded.fiscalPeriodsById))
    expect(Object.keys(reloaded.financialBudgetsById)).toEqual(Object.keys(loaded.financialBudgetsById))
    expect(reloaded.financialTransactionsById).toEqual(loaded.financialTransactionsById)
    expect(reloaded.teamFinancesByTeamId).toEqual(loaded.teamFinancesByTeamId)
  })
})
