import { describe, expect, it } from 'vitest'
import { PROTOTYPE_GAME_CONFIGURATION, createAcbTestGame, createNewGame } from '@/app/game'
import { createCompetition } from '@/domain/competition'
import { createCountry } from '@/domain/country'
import { createGameDate } from '@/domain/date'
import { createFiscalPeriod, createOrganizationFinancialProfile, createTeamFinances, ensureCanonicalFinanceFoundation, evaluateFinancialCommitment, evaluateOrganizationFinancialCommitment, getFinanceActivationReport, getOrganizationFinanceAccounts, getOrganizationFinancialAuthorization, legacyTeamFinanceAmountToMoney, organizationFinanceFiscalPeriodId, provisionOrganizationFinanceFoundation } from '@/domain/finance'
import { getCashBalancesByCurrency } from '@/domain/finance/CashFlowQueries'
import { competitionIdFromString, countryIdFromString, organizationIdFromString, organizationSectionIdFromString, seasonIdFromString, teamIdFromString } from '@/domain/ids'
import { createOrganization, createOrganizationSection } from '@/domain/organization'
import { createTeam } from '@/domain/team'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { generateWorld } from '@/engine/world'

const eur = (minorUnits: number) => ({ currencyCode: 'EUR', minorUnits })

function organizationIdsOf(world: GameWorld): readonly string[] {
  return [...new Set(Object.values(world.teams).map((team) => String(team.organizationId)))].sort()
}

function provisionedOrganizationIds(world: GameWorld): readonly string[] {
  return Object.keys(world.organizationFinancialProfilesById).sort()
}

describe('BS16F shipped finance activation', () => {
  it('provisions exactly the policy-resolvable organizations of the prototype career and leaves the rest alone', () => {
    const career = createNewGame()
    const report = getFinanceActivationReport(career)
    const provisioned = provisionedOrganizationIds(career)
    const unavailable = report.organizations.filter((entry) => entry.status === 'FINANCE_CURRENCY_UNAVAILABLE')

    // The prototype is a fictional Virelia universe: only its shipped NBA-like and WNBA-like ecosystems are
    // approved as USD, so the FIBA-like and NCAA-like clubs must stay unprovisioned.
    expect(provisioned.length).toBeGreaterThan(0)
    expect(provisioned.length).toBeLessThan(organizationIdsOf(career).length)
    expect(unavailable.length).toBeGreaterThan(0)
    expect(unavailable.every((entry) => entry.currencyCode === null && entry.currencyUnavailableReason !== null)).toBe(true)
    for (const organizationId of provisioned) {
      const profile = career.organizationFinancialProfilesById[organizationId as never]!
      expect(String(profile.baseCurrencyCode)).toBe('USD')
      expect(Object.values(career.fiscalPeriodsById).filter((period) => String(period.organizationId) === organizationId)).toHaveLength(1)
      expect(Object.values(career.financialBudgetsById).filter((budget) => budget.organizationId === organizationId)).toHaveLength(1)
      const authorization = getOrganizationFinancialAuthorization(career, { organizationId, currencyCode: 'USD', asOfDate: career.currentDate })
      expect(authorization.state).toBe('ACTIVE')
      expect(authorization.authorizedMinorUnits).toBeGreaterThan(0)
    }
    // The career's NBA-like (men) and WNBA-like (women) halves are separate organizations with separate state.
    expect(provisioned.some((organizationId) => organizationId.startsWith('women-'))).toBe(true)
    expect(provisioned.some((organizationId) => !organizationId.startsWith('women-'))).toBe(true)
  })

  it('provisions every ACB club in EUR with profile, accounts, period and authorization but no money', () => {
    const career = createAcbTestGame()
    // The ACB career starts in the preseason gap a week before the season, while the canonical opening fiscal
    // period is the season itself (BS16B). Provisioning is therefore unconditional, and the authorization
    // state follows the period: out of period now, active once the season period starts.
    const asOfDate = career.seasons[career.currentSeasonId]!.startDate

    expect(organizationIdsOf(career)).toHaveLength(18)
    expect(provisionedOrganizationIds(career)).toEqual(organizationIdsOf(career))
    for (const organizationId of organizationIdsOf(career)) {
      const profile = career.organizationFinancialProfilesById[organizationId as never]!
      expect(String(profile.baseCurrencyCode)).toBe('EUR')
      const accounts = getOrganizationFinanceAccounts(career, organizationId, 'EUR')
      expect(String(accounts.cashOperating.currencyCode)).toBe('EUR')
      const periods = Object.values(career.fiscalPeriodsById).filter((period) => String(period.organizationId) === organizationId)
      expect(periods).toHaveLength(1)
      expect(String(periods[0]!.id)).toBe(String(organizationFinanceFiscalPeriodId(organizationId, career.currentSeasonId)))
      expect(getOrganizationFinancialAuthorization(career, { organizationId, currencyCode: 'EUR', asOfDate: career.currentDate }).state).toBe('OUT_OF_PERIOD')
      const authorization = getOrganizationFinancialAuthorization(career, { organizationId, currencyCode: 'EUR', asOfDate })
      expect(authorization.state).toBe('ACTIVE')
      expect(authorization.authorizedMinorUnits).toBeGreaterThan(0)
      expect(authorization.approval).not.toBeNull()
      expect(String(authorization.approval?.authorityKind)).toBe('MANUAL_SYSTEM_ACTION')
    }
    // No fake opening cash and no invented ledger posting anywhere in the career.
    expect(Object.keys(career.financialTransactionsById)).toEqual([])
    const balances = getCashBalancesByCurrency(career, organizationIdsOf(career)[0]!, career.currentDate)
    expect(balances.every((row) => row.totalCashMinorUnits === 0)).toBe(true)
  })

  it('keeps canonical authorization economically equal to the legacy pools and evaluation usable', () => {
    const career = createAcbTestGame()
    const team = Object.values(career.teams)[0]!
    const legacy = career.teamFinancesByTeamId[team.id]!
    const lines = Object.values(career.budgetLinesById).filter((line) => line.teamId === String(team.id))
    const player = lines.filter((line) => line.category === 'PLAYER_SALARY').reduce((sum, line) => sum + line.amount.minorUnits, 0)
    const staff = lines.filter((line) => line.category === 'STAFF_SALARY').reduce((sum, line) => sum + line.amount.minorUnits, 0)

    expect(player).toBe(legacyTeamFinanceAmountToMoney(legacy.playerSalaryBudget, 'EUR').minorUnits)
    expect(staff).toBe(legacyTeamFinanceAmountToMoney(legacy.staffSalaryBudget, 'EUR').minorUnits)

    // At the preseason career date the club is provisioned but out of period, so the decision refuses the
    // commitment for two independent, reported reasons; inside the season period only liquidity fails.
    const decision = evaluateOrganizationFinancialCommitment(career, { organizationId: team.organizationId, currency: 'EUR', amount: legacyTeamFinanceAmountToMoney(1_000_000, 'EUR'), category: 'PLAYER_SALARY', asOfDate: career.currentDate })
    expect(decision.status).not.toBe('FINANCE_PROFILE_UNAVAILABLE')
    expect(decision.status).toBe('INSUFFICIENT_LIQUIDITY')
    expect(decision.reasonCodes).toContain('AUTHORIZATION_OUT_OF_PERIOD')

    // Inside the season period the authorization is active for the modelled scope, so the only remaining
    // reason is the club's real zero cash.
    const inPeriod = evaluateOrganizationFinancialCommitment(career, { organizationId: team.organizationId, currency: 'EUR', amount: legacyTeamFinanceAmountToMoney(1_000_000, 'EUR'), category: 'PLAYER_SALARY', asOfDate: career.seasons[career.currentSeasonId]!.startDate })
    expect(inPeriod.status).toBe('INSUFFICIENT_LIQUIDITY')
    expect(inPeriod.reasonCodes).not.toContain('AUTHORIZATION_OUT_OF_PERIOD')
    expect(inPeriod.reasonCodes).not.toContain('BUDGET_AUTHORIZATION_NOT_MODELLED')
  })

  it('isolates a EUR organization from a USD organization inside one world', () => {
    const career = createAcbTestGame()
    const asOfDate = career.seasons[career.currentSeasonId]!.startDate
    const spainOrg = organizationIdsOf(career)[0]!
    const unitedStates = createCountry({ id: countryIdFromString('country:USA'), name: 'United States', code: 'USA' })
    const usOrganizationId = organizationIdFromString('us-organization-0001')
    const usSection = createOrganizationSection({ id: organizationSectionIdFromString('us-section-0001'), organizationId: usOrganizationId, sport: 'basketball', gender: 'male', categoryScope: null, canonicalName: 'United States Club', validFrom: null, validTo: null })
    const usTeam = createTeam({ id: teamIdFromString('us-team-0001'), name: 'United States Club', gender: 'male', countryId: unitedStates.id, rosterPlayerIds: [], organizationId: usOrganizationId, organizationSectionId: usSection.id })
    const withUs = updateGameWorld(career, {
      organizations: [...Object.values(career.organizationsById), createOrganization({ id: usOrganizationId, entityId: null, legalName: null, foundedYear: null, dissolvedYear: null, primaryPlaceId: null, website: null })],
      organizationSections: [...Object.values(career.organizationSectionsById), usSection],
      countries: [...Object.values(career.countries), unitedStates],
      teams: [...Object.values(career.teams), usTeam],
      competitions: [...Object.values(career.competitions), createCompetition({ id: competitionIdFromString('competition:usa'), name: 'US League', gender: 'male', participantTeamIds: [usTeam.id] })],
      teamFinances: [...Object.values(career.teamFinancesByTeamId), createTeamFinances({ teamId: usTeam.id, playerSalaryBudget: 2_000_000, staffSalaryBudget: 400_000 })],
    })
    const world = ensureCanonicalFinanceFoundation(withUs)
    const usOrg = String(usTeam.organizationId)

    expect(String(world.organizationFinancialProfilesById[spainOrg as never]!.baseCurrencyCode)).toBe('EUR')
    expect(String(world.organizationFinancialProfilesById[usOrg as never]!.baseCurrencyCode)).toBe('USD')
    const eurAuthorization = getOrganizationFinancialAuthorization(world, { organizationId: spainOrg, currencyCode: 'EUR', asOfDate })
    const usdAuthorization = getOrganizationFinancialAuthorization(world, { organizationId: usOrg, currencyCode: 'USD', asOfDate })
    expect(eurAuthorization.state).toBe('ACTIVE')
    expect(usdAuthorization.state).toBe('ACTIVE')
    expect(eurAuthorization.reservedMinorUnits).toBe(0)
    expect(usdAuthorization.reservedMinorUnits).toBe(0)
    expect(eurAuthorization.currencyCode).toBe('EUR')
    expect(usdAuthorization.currencyCode).toBe('USD')
    // The USD organization is authorized from its own legacy pools in its own currency: no shared capacity.
    expect(usdAuthorization.authorizedMinorUnits).toBe(legacyTeamFinanceAmountToMoney(2_400_000, 'USD').minorUnits)
    expect(eurAuthorization.authorizedMinorUnits).not.toBe(usdAuthorization.authorizedMinorUnits)
    // An EUR organization cannot be authorized in USD and vice versa, and no FX comparison is attempted.
    expect(getOrganizationFinancialAuthorization(world, { organizationId: spainOrg, currencyCode: 'USD', asOfDate }).state).toBe('NOT_PROVISIONED')
    expect(getOrganizationFinancialAuthorization(world, { organizationId: usOrg, currencyCode: 'EUR', asOfDate }).state).toBe('NOT_PROVISIONED')
    expect(evaluateOrganizationFinancialCommitment(world, { organizationId: usOrg, currency: 'EUR', amount: eur(1_000), asOfDate }).status).toBe('CURRENCY_MISMATCH')
    expect(Object.values(world.organizationFinancialProfilesById).map((profile) => String(profile.baseCurrencyCode)).sort()).toContain('USD')
  })

  it('never rewrites an existing canonical profile and reports the policy conflict', () => {
    const world = generateWorld({ ...PROTOTYPE_GAME_CONFIGURATION, includeNbaLike: true })
    const planned = getFinanceActivationReport(world).organizations.find((entry) => entry.status === 'ACTIVATED')!
    const organizationId = planned.organizationId
    expect(planned.currencyCode).toBe('USD')
    // A persisted profile whose currency contradicts the policy must win, and the conflict is reported.
    const conflicting = updateGameWorld(world, { organizationFinancialProfiles: [createOrganizationFinancialProfile({ organizationId, baseCurrencyCode: 'EUR', fiscalYearStartMonth: 7 })] })
    const report = getFinanceActivationReport(conflicting).organizations.find((entry) => entry.organizationId === organizationId)!

    expect(report.status).toBe('CURRENCY_POLICY_CONFLICT')
    expect(report.currencyCode).toBe('EUR')
    expect(report.policyCurrencyCode).toBe('USD')

    // A contradictory currency is never guessed: the persisted currency wins and activation materializes no
    // authorization at all, so an organization whose profile says EUR can never receive USD capacity.
    const after = ensureCanonicalFinanceFoundation(conflicting)
    expect(String(after.organizationFinancialProfilesById[organizationId]!.baseCurrencyCode)).toBe('EUR')
    expect(Object.values(after.financialBudgetsById).filter((budget) => budget.organizationId === String(organizationId))).toEqual([])
    expect(Object.values(after.fiscalPeriodsById).filter((period) => String(period.organizationId) === String(organizationId))).toEqual([])
    expect(getOrganizationFinancialAuthorization(after, { organizationId, currencyCode: 'USD', asOfDate: after.currentDate }).state).not.toBe('ACTIVE')
    // Other resolvable organizations of the same world are unaffected: only the contradictory one is withheld.
    expect(getFinanceActivationReport(after).organizations.filter((entry) => String(entry.organizationId) !== String(organizationId)).every((entry) => entry.status !== 'CURRENCY_POLICY_CONFLICT')).toBe(true)
    expect(Object.keys(after.organizationFinancialProfilesById)).toHaveLength(4)
  })

  it('is deterministic, idempotent and never creates overlapping fiscal periods', () => {
    const career = createAcbTestGame()
    const again = ensureCanonicalFinanceFoundation(career)
    const season = career.seasons[career.currentSeasonId]!

    expect(again).toBe(career)
    for (const organizationId of organizationIdsOf(career)) {
      const periods = Object.values(career.fiscalPeriodsById).filter((period) => String(period.organizationId) === organizationId)
      // The BS16B season-anchored opening period stays the only period authority: activation reuses it.
      expect(periods).toHaveLength(1)
      expect(String(periods[0]!.id)).toBe(String(organizationFinanceFiscalPeriodId(organizationId, career.currentSeasonId)))
      expect(periods[0]!.startsOn).toBe(season.startDate)
      expect(Object.values(career.financialBudgetsById).filter((budget) => budget.organizationId === organizationId)).toHaveLength(1)
    }
    // The preseason career date is covered by no period: that is the truth of a season-anchored opening period
    // rather than a silent second, overlapping period.
    expect(Object.values(career.fiscalPeriodsById).filter((period) => period.startsOn <= career.currentDate && period.endsOn >= career.currentDate)).toHaveLength(0)

    // Renewal stays unmodelled: a later canonical period is never silently authorized, even when it exists.
    const organizationId = organizationIdsOf(career)[0]!
    const laterPeriod = createFiscalPeriod({ id: organizationFinanceFiscalPeriodId(organizationId, seasonIdFromString('season-0002')), organizationId, label: '2027-28', startsOn: '2027-09-25', endsOn: '2028-05-20' })
    const later = updateGameWorld(career, { currentDate: createGameDate(2028, 1, 10), fiscalPeriods: [...Object.values(career.fiscalPeriodsById), laterPeriod] })
    const next = getFinanceActivationReport(later).organizations.find((entry) => entry.organizationId === organizationId)!
    expect(next.status).toBe('RENEWAL_NOT_MODELLED')
    expect(ensureCanonicalFinanceFoundation(later)).toBe(later)
    expect(Object.values(later.financialBudgetsById).filter((budget) => budget.organizationId === organizationId)).toHaveLength(1)
  })

  it('activates a legacy-shaped world whose clubs carry only TeamFinances and a resolvable jurisdiction', () => {
    // A generated world is the pre-BS16B shape: legacy TeamFinances budgets, no canonical finance at all.
    const world = generateWorld({ ...PROTOTYPE_GAME_CONFIGURATION, includeNbaLike: true })
    const planned = getFinanceActivationReport(world).organizations.filter((entry) => entry.currencyCode !== null)
    const activated = ensureCanonicalFinanceFoundation(world)

    expect(Object.keys(world.organizationFinancialProfilesById)).toEqual([])
    expect(planned).toHaveLength(4)
    expect(provisionedOrganizationIds(activated)).toEqual(planned.map((entry) => String(entry.organizationId)).sort())
    expect(Object.keys(activated.financialTransactionsById)).toEqual([])
    for (const entry of planned) {
      const organizationId = String(entry.organizationId)
      expect(String(activated.organizationFinancialProfilesById[organizationId as never]!.baseCurrencyCode)).toBe('USD')
      expect(Object.values(activated.fiscalPeriodsById).filter((period) => String(period.organizationId) === organizationId)).toHaveLength(1)
      expect(Object.values(activated.financialBudgetsById).filter((budget) => budget.organizationId === organizationId)).toHaveLength(1)
      // The read-only report and the activation it describes resolve the same period and the same budget.
      expect(entry.fiscalPeriodId).toBe(String(organizationFinanceFiscalPeriodId(organizationId, world.currentSeasonId)))
      expect(String(activated.financialBudgetsById[entry.budgetId!]!.fiscalPeriodId)).toBe(entry.fiscalPeriodId)
    }
    // Unresolvable jurisdictions are never guessed, and the activation stays idempotent.
    expect(getFinanceActivationReport(activated).organizations.filter((entry) => entry.status === 'FINANCE_CURRENCY_UNAVAILABLE')).toHaveLength(8)
    expect(ensureCanonicalFinanceFoundation(activated)).toBe(activated)
  })
})

describe('BS16F provisionOrganizationFinanceFoundation remains the foundation authority', () => {
  it('provisions a single organization idempotently with an explicit currency', () => {
    const career = createNewGame()
    const organizationId = provisionedOrganizationIds(career)[0]!
    const reprovisioned = provisionOrganizationFinanceFoundation(career, organizationId, { currencyCode: 'USD' })

    expect(reprovisioned).toBe(career)
    expect(evaluateFinancialCommitment({
      organizationFinancialProfile: career.organizationFinancialProfilesById[organizationId as never]!,
      organizationId,
      amount: { currencyCode: 'USD', minorUnits: 1_000 },
      currentCash: null,
    }).status).toBe('REQUIRES_FINANCING')
  })
})
