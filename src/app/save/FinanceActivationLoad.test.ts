import { describe, expect, it } from 'vitest'
import { createAcbTestGame, createNewGame } from '@/app/game'
import { updateGameWorld } from '@/domain/world'
import { createOrganizationFinancialProfile, getFinanceActivationReport, getOrganizationFinancialAuthorization, legacyTeamFinanceAmountToMoney } from '@/domain/finance'
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
    const base = createNewGame()
    const userTeam = Object.values(base.teams).find((team) => team.coachId === base.userCoachId)!
    const organizationId = userTeam.organizationId
    const legacy = base.teamFinancesByTeamId[userTeam.id]!
    const provisioned = updateGameWorld(base, { organizationFinancialProfiles: [createOrganizationFinancialProfile({ organizationId, baseCurrencyCode: 'EUR', fiscalYearStartMonth: 7 })] })

    expect(getFinanceActivationReport(provisioned).organizations.find((entry) => entry.organizationId === organizationId)?.status).toBe('ACTIVATED')
    const repo = repository()
    await saveCurrentGame(provisioned, repo, provisioned.currentDate)

    const loaded = await loadSavedGame(repo)
    const authorization = getOrganizationFinancialAuthorization(loaded, { organizationId, currencyCode: 'EUR', asOfDate: loaded.currentDate })

    expect(authorization.state).toBe('ACTIVE')
    expect(authorization.lines.filter((line) => line.teamId === String(userTeam.id)).map((line) => [line.category, line.authorizedMinorUnits])).toEqual([
      ['PLAYER_SALARY', legacyTeamFinanceAmountToMoney(legacy.playerSalaryBudget, 'EUR').minorUnits],
      ['STAFF_SALARY', legacyTeamFinanceAmountToMoney(legacy.staffSalaryBudget, 'EUR').minorUnits],
    ])
    const periodsForOrganization = (world: typeof loaded) => Object.values(world.fiscalPeriodsById).filter((period) => String(period.organizationId) === String(organizationId))
    const budgetsForOrganization = (world: typeof loaded) => Object.values(world.financialBudgetsById).filter((budget) => budget.organizationId === String(organizationId))
    expect(periodsForOrganization(loaded)).toHaveLength(1)
    expect(budgetsForOrganization(loaded)).toHaveLength(1)

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

  it('provisions only the policy-resolvable organizations of a career and stays idempotent across save/load', async () => {
    const base = createNewGame()
    const repo = repository()
    await saveCurrentGame(base, repo, base.currentDate)
    const loaded = await loadSavedGame(repo)

    const report = getFinanceActivationReport(loaded)
    const provisioned = report.organizations.filter((entry) => entry.currencyCode !== null)
    const unavailable = report.organizations.filter((entry) => entry.status === 'FINANCE_CURRENCY_UNAVAILABLE')

    // The prototype career is a fictional universe (Virelia): its NBA-like/WNBA-like ecosystems are the
    // shipped US-mapped ones, while the rest has no approved currency and must stay unprovisioned.
    expect(provisioned.length).toBeGreaterThan(0)
    expect(provisioned.every((entry) => entry.currencyCode === 'USD')).toBe(true)
    expect(unavailable.length).toBeGreaterThan(0)
    expect(unavailable.every((entry) => entry.currencyCode === null)).toBe(true)
    expect(Object.keys(loaded.organizationFinancialProfilesById)).toHaveLength(provisioned.length)
    expect(loaded.financialTransactionsById).toEqual(base.financialTransactionsById)

    // Reloading never duplicates canonical finance facts.
    const second = repository()
    await saveCurrentGame(loaded, second, loaded.currentDate)
    const reloaded = await loadSavedGame(second)
    expect(Object.keys(reloaded.organizationFinancialProfilesById)).toEqual(Object.keys(loaded.organizationFinancialProfilesById))
    expect(Object.keys(reloaded.fiscalPeriodsById)).toEqual(Object.keys(loaded.fiscalPeriodsById))
    expect(Object.keys(reloaded.financialBudgetsById)).toEqual(Object.keys(loaded.financialBudgetsById))
    expect(reloaded.financialTransactionsById).toEqual(loaded.financialTransactionsById)
  })
})
