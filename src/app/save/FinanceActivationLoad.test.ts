import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { updateGameWorld } from '@/domain/world'
import { createOrganizationFinancialProfile, getFinanceActivationReport, getOrganizationFinancialAuthorization } from '@/domain/finance'
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
      ['PLAYER_SALARY', legacy.playerSalaryBudget],
      ['STAFF_SALARY', legacy.staffSalaryBudget],
    ])
    expect(Object.keys(loaded.fiscalPeriodsById)).toHaveLength(1)
    expect(Object.keys(loaded.financialBudgetsById)).toHaveLength(1)

    // Save → load → activate again never duplicates canonical facts.
    const second = repository()
    await saveCurrentGame(loaded, second, loaded.currentDate)
    const reloaded = await loadSavedGame(second)
    expect(Object.keys(reloaded.fiscalPeriodsById)).toHaveLength(1)
    expect(Object.keys(reloaded.financialBudgetsById)).toHaveLength(1)
    expect(Object.keys(reloaded.budgetLinesById)).toHaveLength(Object.keys(loaded.budgetLinesById).length)
    expect(reloaded.teamFinancesByTeamId).toEqual(loaded.teamFinancesByTeamId)
    // Legacy gameplay authority is untouched: no dual write and no cash created.
    expect(reloaded.financialTransactionsById).toEqual(loaded.financialTransactionsById)
    expect(reloaded.financialAccountsById).toEqual(loaded.financialAccountsById)
  })

  it('leaves a career without a provisioned finance profile untouched by the activation seam', async () => {
    const base = createNewGame()
    const repo = repository()
    await saveCurrentGame(base, repo, base.currentDate)
    const loaded = await loadSavedGame(repo)

    expect(Object.keys(loaded.fiscalPeriodsById)).toEqual([])
    expect(Object.keys(loaded.financialBudgetsById)).toEqual([])
    expect(getFinanceActivationReport(loaded).organizations.every((entry) => entry.status === 'FINANCE_PROFILE_UNAVAILABLE')).toBe(true)
  })
})
