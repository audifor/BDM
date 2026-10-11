import { describe, expect, it } from 'vitest'

import { createGameDate } from '@/domain/date'
import { authorizationRenewalBudgetIdFor, ensureCanonicalFinanceFoundation, financeFiscalPeriodIdFor, financeFiscalPeriodsOf, getFinanceActivationReport, getFinanceFiscalYearFor, getOrganizationFinanceAccounts, getOrganizationFinancialAuthorization, resolveOrganizationCurrency } from '@/domain/finance'
import { authorizeTeamSalaryForTest } from '@/domain/finance/financeTestFixture'
import { getCashBalancesByCurrency } from '@/domain/finance/CashFlowQueries'
import { PLAYER_TRUTH_RATING_KEYS, PLAYER_TRUTH_TENDENCY_KEYS } from '@/domain/player/PlayerTruthCatalog'
import type { WorldDbGameBootstrapSelectionV1, WorldDbGameBootstrapSliceV1 } from '@/domain/worldDb/GameBootstrap'
import { advanceClubFinanceForDate } from '@/engine/finance/ClubFinanceLifecycle'

import { annualAuthorizationContinuityAuthorities, BDM_ANNUAL_AUTHORIZATION_CONTINUITY_POLICY_V1 } from './AnnualAuthorizationContinuityPolicy'
import { bootstrapGameWorldFromWorldDb } from './WorldDbGameBootstrap'

/**
 * BS16G certifies the Spain World DB finance boundary deterministically. The real career is created from a
 * Tauri-backed SQLite database that vitest cannot open, so this test feeds the canonical bootstrap slice shape
 * (the same country/team/organization rows the real DDL provides, including `place:country:ESP` with code
 * `ESP`) into the real materialization function and certifies the jurisdiction → currency → provisioning chain
 * from there. No currency field is added to World DB data: the jurisdiction identity is the canonical source.
 */
const source = { databaseId: 'real-world.db', schemaId: 'DDL-PHASE1-A' } as const
const selection: WorldDbGameBootstrapSelectionV1 = { source, ecosystemId: 'ecosystem:ESP:acb', competitionId: 'competition:ESP:liga-endesa', competitionSeasonId: 'edition:ESP:liga-endesa:2025-26', teamId: 'team:ESP:male:000' }
const season = { competitionSeasonId: selection.competitionSeasonId, seasonId: 'season:2025_26', label: '2025-26', startDate: '2025-10-01', endDate: '2026-06-30', provenance: 'DERIVED_SIMULATION_FROM_B04' } as const

function values(keys: readonly string[], value = 60): Readonly<Record<string, number>> {
  return Object.fromEntries(keys.map((key, index) => [key, value + (index % 10)]))
}

function spainSlice(): WorldDbGameBootstrapSliceV1 {
  const teams = [0, 1].map((index) => ({
    teamId: `team:ESP:male:${String(index).padStart(3, '0')}`,
    name: `ACB Club ${index}`,
    gender: 'male' as const,
    countryId: 'place:country:ESP',
    organizationId: `organization:${index}`,
    organizationSectionId: `section:${index}`,
  }))
  const organizations = teams.map((team) => ({ organizationId: team.organizationId, entityId: `entity:${team.organizationId}`, legalName: `Legal ${team.organizationId}`, foundedYear: 1900, dissolvedYear: null, primaryPlaceId: 'place:country:ESP', website: null }))
  const organizationSections = teams.map((team) => ({ sectionId: team.organizationSectionId, organizationId: team.organizationId, sport: 'BASKETBALL', gender: 'MALE', categoryScope: null, canonicalName: team.name, validFrom: '1900-01-01', validTo: null }))
  const players = teams.flatMap((team) => ['PG', 'SG', 'SF', 'PF', 'C'].map((position, positionIndex) => ({
    playerId: `${team.teamId}:person:${positionIndex}`,
    personId: `${team.teamId}:person:${positionIndex}`,
    primaryPosition: position as 'PG' | 'SG' | 'SF' | 'PF' | 'C',
    secondaryPositions: [],
    dominantHand: 'RIGHT' as const,
    ratings: values(PLAYER_TRUTH_RATING_KEYS),
    tendencies: values(PLAYER_TRUTH_TENDENCY_KEYS),
    development: ['SHOOTING', 'FINISHING', 'BALL_HANDLING', 'PLAYMAKING', 'OFF_BALL_OFFENSE', 'DEFENSE_REBOUNDING', 'PHYSICAL', 'MENTAL'].map((dimensionCode) => ({ dimensionCode, ceiling: 85, growthRate: 50, declineSensitivity: 20 })),
  })))
  const staffProfiles = teams.map((team) => ({ staffId: `staff:${team.teamId}:head`, personId: `${team.teamId}:head-coach`, attributes: Object.fromEntries(Array.from({ length: 80 }, (_, index) => [`STAFF_ATTRIBUTE_${String(index + 1).padStart(2, '0')}`, 60])), specialismIds: ['TACTICS'] }))
  const persons = [
    ...players.map((player) => ({ personId: player.personId, firstName: 'Player', lastName: 'One', gender: 'male' as const, dateOfBirth: '1998-01-01', nationalityIds: ['place:country:ESP'], physical: { heightCm: 190, weightKg: 90, wingspanCm: 195, standingReachCm: 245 } })),
    ...staffProfiles.map((staff) => ({ personId: staff.personId, firstName: 'Head', lastName: 'Coach', gender: 'male' as const, dateOfBirth: '1980-01-01', nationalityIds: ['place:country:ESP'], physical: { heightCm: 180, weightKg: 80, wingspanCm: 180, standingReachCm: 230 } })),
  ]
  return {
    schemaVersion: 1,
    source,
    ecosystem: { ecosystemId: selection.ecosystemId, name: 'Spain ACB Ecosystem', kind: 'fibaLike', category: 'men' },
    competition: { competitionId: selection.competitionId, name: 'Liga Endesa', gender: 'male', ecosystemId: selection.ecosystemId },
    season,
    countries: [{ countryId: 'place:country:ESP', name: 'ESP', code: 'ESP' }],
    organizations,
    organizationSections,
    organizationOwnership: [],
    teams,
    persons,
    players,
    staffProfiles,
    staffAssignments: teams.map((team) => ({ assignmentId: `${team.teamId}:head-assignment`, staffId: `staff:${team.teamId}:head`, teamId: team.teamId, roleCode: 'headCoach', assignedOn: '2025-10-01' })),
    rosterAssignments: players.map((player) => ({ rosterId: `roster:${player.playerId.split(':').slice(0, 4).join(':')}`, teamId: player.playerId.split(':').slice(0, 4).join(':'), playerId: player.playerId, status: 'ACTIVE' })),
    matches: [],
  }
}

function spainWorld() {
  return bootstrapGameWorldFromWorldDb(spainSlice(), selection, { contentId: 'bdm-phase1-competition-runtime-v1', contentHash: 'a'.repeat(64), worldDbSchema: 'DDL-PHASE1-A' })
}

describe('BS16G World DB Spain finance boundary', () => {
  it('resolves the Spain jurisdiction to EUR through canonical identity, with no league-name inference', () => {
    const world = spainWorld()
    const organizationId = Object.values(world.teams)[0]!.organizationId
    const resolution = resolveOrganizationCurrency(world, organizationId)

    expect(resolution).toMatchObject({ status: 'RESOLVED', currencyCode: 'EUR', source: 'COUNTRY' })
    // The identity is the canonical Country row of the World DB slice, not the club, competition or ecosystem.
    expect(String(world.countries[Object.values(world.teams)[0]!.countryId]!.code)).toBe('ESP')
    const report = getFinanceActivationReport(world).organizations.find((entry) => entry.organizationId === organizationId)!
    expect(report.currencyCode).toBe('EUR')
    expect(report.currencySource).toBe('COUNTRY')
    // No currency is stored in the World DB data and no club/league name participates in the decision.
    expect(Object.keys(world.organizationFinancialProfilesById)).toEqual([])
  })

  it('provisions the canonical foundation in EUR and creates no money and no budget authority', () => {
    const world = spainWorld()
    const organizationId = Object.values(world.teams)[0]!.organizationId
    const activated = ensureCanonicalFinanceFoundation(world)
    const profile = activated.organizationFinancialProfilesById[organizationId]!

    expect(String(profile.baseCurrencyCode)).toBe('EUR')
    expect(String(getOrganizationFinanceAccounts(activated, organizationId, 'EUR').cashOperating.currencyCode)).toBe('EUR')
    const periods = financeFiscalPeriodsOf(activated, organizationId)
    expect(periods).toHaveLength(1)
    const fiscalYear = getFinanceFiscalYearFor(profile, activated.currentDate)
    expect(String(periods[0]!.id)).toBe(String(financeFiscalPeriodIdFor(organizationId, fiscalYear.startsOn)))
    expect(periods[0]!.startsOn <= activated.currentDate && periods[0]!.endsOn >= activated.currentDate).toBe(true)

    // A World DB career carries no legacy TeamFinances authority yet, so status is an explicit report rather
    // than an invented budget; the currency/profile/period truth is nevertheless provisioned.
    const report = getFinanceActivationReport(activated).organizations.find((entry) => entry.organizationId === organizationId)!
    expect(report.status).toBe('NO_LEGACY_BUDGET_SOURCE')
    expect(Object.values(activated.financialBudgetsById).filter((budget) => budget.organizationId === String(organizationId))).toEqual([])

    // Zero fake cash, zero ledger facts, and idempotent activation.
    expect(Object.keys(activated.financialTransactionsById)).toEqual([])
    expect(getCashBalancesByCurrency(activated, organizationId, activated.currentDate).every((row) => row.totalCashMinorUnits === 0)).toBe(true)
    expect(ensureCanonicalFinanceFoundation(activated)).toBe(activated)
  })

  it('receives the annual renewal policy only when its universe explicitly assigns it', () => {
    const world = spainWorld()
    const team = Object.values(world.teams)[0]!
    const organizationId = team.organizationId

    // Activation without an assignment: the profile records no policy, and the fiscal rollover therefore grants
    // no authorization at all. Nothing about the Spain boundary is implicit.
    const unassigned = authorizeTeamSalaryForTest(ensureCanonicalFinanceFoundation(world), team.id, { currencyCode: 'EUR', playerSalaryMinorUnits: 1_000_000_000, staffSalaryMinorUnits: 200_000_000 })
    const profile = unassigned.organizationFinancialProfilesById[organizationId]!
    const rolloverDate = createGameDate(Number(getFinanceFiscalYearFor(profile, unassigned.currentDate).startsOn.slice(0, 4)) + 1, profile.fiscalYearStartMonth, 2)
    expect(profile.authorizationRenewalPolicy).toBeNull()
    const rolledUnassigned = advanceClubFinanceForDate(unassigned, rolloverDate)
    expect(financeFiscalPeriodsOf(rolledUnassigned, organizationId)).toHaveLength(2)
    expect(getOrganizationFinancialAuthorization(rolledUnassigned, { organizationId, currencyCode: 'EUR', asOfDate: rolloverDate }).state).toBe('NOT_PROVISIONED')

    // The same world with the shipped explicit assignment (exactly what WorldDbSpainGame.ts passes) renews the
    // approved limits into the new fiscal year, and nothing else.
    const assigned = authorizeTeamSalaryForTest(
      ensureCanonicalFinanceFoundation(world, { authorizationRenewalPolicies: annualAuthorizationContinuityAuthorities(world) }),
      team.id,
      { currencyCode: 'EUR', playerSalaryMinorUnits: 1_000_000_000, staffSalaryMinorUnits: 200_000_000 },
    )
    expect(assigned.organizationFinancialProfilesById[organizationId]!.authorizationRenewalPolicy).toMatchObject({ mode: BDM_ANNUAL_AUTHORIZATION_CONTINUITY_POLICY_V1.mode })
    expect(Object.values(assigned.organizationFinancialProfilesById).every((entry) => entry.authorizationRenewalPolicy !== null)).toBe(true)

    const rolled = advanceClubFinanceForDate(assigned, rolloverDate)
    const nextFiscalYearStart = `${Number(getFinanceFiscalYearFor(profile, unassigned.currentDate).startsOn.slice(0, 4)) + 1}-${String(profile.fiscalYearStartMonth).padStart(2, '0')}-01`
    const renewedId = authorizationRenewalBudgetIdFor(organizationId, financeFiscalPeriodIdFor(organizationId, nextFiscalYearStart))
    const renewed = getOrganizationFinancialAuthorization(rolled, { organizationId, currencyCode: 'EUR', asOfDate: rolloverDate })

    expect(renewed).toMatchObject({ state: 'ACTIVE', budgetId: renewedId, authorizedMinorUnits: 1_200_000_000 })
    expect(Object.values(rolled.budgetLinesById).filter((line) => line.budgetId === renewedId).map((line) => [line.category, line.amount.minorUnits]).sort()).toEqual([['PLAYER_SALARY', 1_000_000_000], ['STAFF_SALARY', 200_000_000]])
    // Renewal creates no money and no ledger fact: it is authorization policy only.
    expect(Object.keys(rolled.financialTransactionsById)).toEqual(Object.keys(assigned.financialTransactionsById))
    expect(getCashBalancesByCurrency(rolled, organizationId, rolloverDate).every((row) => row.totalCashMinorUnits === 0)).toBe(true)
  })
})
