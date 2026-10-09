import { describe, expect, it } from 'vitest'

import { createAcbTestGame, createNewGame } from '@/app/game'
import { advanceGameDay } from '@/app/game/advanceGameDay'
import { acbDemoParticipationInstallments, BDM_DEMO_ECONOMIC_POLICY_ID, BDM_DEMO_ECONOMIC_POLICY_V1_LABEL, BDM_DEMO_MATCH_OPERATIONS_PER_GAME_MAJOR_UNITS, createAcbDemoEconomicProfileV1 } from '@/app/game/AcbDemoEconomicPolicy'
import { createCompetition } from '@/domain/competition'
import { createGameDate } from '@/domain/date'
import {
  applicableEconomicProfile,
  createCompetitionEconomicProfile,
  createCompetitionRevenuePolicy,
  createOrganizationFinancialProfile,
  createRevenueSource,
  ECONOMIC_POLICY_NOT_PROVISIONED,
  ECONOMIC_POLICY_PROVENANCE_KIND,
  economicMatchOperationsSourceId,
  economicRevenueSourceId,
  getCashBalancesByCurrency,
  getUngroundedEconomicSources,
  legacyMajorUnitsToMoney,
  provisionEconomicSources,
  type CompetitionEconomicProfile,
} from '@/domain/finance'
import { competitionIdFromString, organizationIdFromString } from '@/domain/ids'
import { createGameWorld, updateGameWorld } from '@/domain/world'
import { createValidGameWorldInput } from '@/domain/world/testFixtures'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'

/**
 * BS16K-C provisioning: an approved CompetitionEconomicProfile becomes canonical RevenueSource/OperatingCostSource
 * facts deterministically and idempotently, a competition with no profile receives nothing, a second profile
 * proves the behaviour is data-driven rather than ACB-hardcoded, and an explicit source from another authority is
 * never replaced.
 */
const SECOND_COMPETITION = competitionIdFromString('fixture-second-competition')

/** The domain fixture world: competition-a with team-home (its Organization has a profile) and team-away. */
const FIXTURE_COMPETITION = competitionIdFromString('competition-a')
const FIXTURE_HOME_ORGANIZATION = 'team-home'
const FIXTURE_AWAY_ORGANIZATION = 'team-away'

function fixtureWorld(...profiles: readonly ReturnType<typeof createOrganizationFinancialProfile>[]) {
  return createGameWorld({ ...createValidGameWorldInput(), organizationFinancialProfiles: [...profiles] } as never)
}

/** A small revenue-only fixture policy: no Game schedule is needed to prove provisioning behaviour. */
function fixtureProfile(currencyCode: string, perInstallmentMinorUnits: number, count: number, startMonth = 11, year = 2032): CompetitionEconomicProfile {
  const installments = Array.from({ length: count }, (_, index) => {
    const monthIndex = startMonth - 1 + index
    const date = createGameDate(year + Math.floor(monthIndex / 12), (monthIndex % 12) + 1, 1)
    return { recognitionOn: date, dueOn: date, amount: { currencyCode, minorUnits: perInstallmentMinorUnits } }
  })
  return createCompetitionEconomicProfile({
    competitionId: FIXTURE_COMPETITION,
    fiscalYearStartMonth: startMonth,
    currencyCode,
    label: 'Fixture competition profile',
    approvedPolicyLabel: 'Fixture Economic Policy',
    revenuePolicies: [createCompetitionRevenuePolicy({ code: 'COMPETITION_PARTICIPATION_DISTRIBUTION', category: 'COMPETITION', currencyCode, annualAmount: { currencyCode, minorUnits: perInstallmentMinorUnits * count }, installments, provenance: { kind: ECONOMIC_POLICY_PROVENANCE_KIND, id: 'fixture-policy', description: 'Fixture Economic Policy' } })],
  })
}

function secondCompetitionProfile(count = 4, perInstallmentMinorUnits = 15_000_000, startMonth = 10): CompetitionEconomicProfile {
  const installments = Array.from({ length: count }, (_, index) => {
    const monthIndex = startMonth - 1 + index
    const date = createGameDate(2026 + Math.floor(monthIndex / 12), (monthIndex % 12) + 1, 15)
    return { recognitionOn: date, dueOn: date, amount: { currencyCode: 'EUR', minorUnits: perInstallmentMinorUnits } }
  })
  return createCompetitionEconomicProfile({
    competitionId: SECOND_COMPETITION,
    fiscalYearStartMonth: 9,
    currencyCode: 'EUR',
    label: 'Fixture second competition profile',
    approvedPolicyLabel: 'Fixture Second Economic Policy',
    revenuePolicies: [createCompetitionRevenuePolicy({ code: 'COMPETITION_PARTICIPATION_DISTRIBUTION', category: 'COMPETITION', currencyCode: 'EUR', annualAmount: { currencyCode: 'EUR', minorUnits: perInstallmentMinorUnits * count }, installments, provenance: { kind: ECONOMIC_POLICY_PROVENANCE_KIND, id: 'fixture-second-policy', description: 'Fixture Second Economic Policy' } })],
  })
}

function organizationIdsOf(world: ReturnType<typeof createAcbTestGame>): readonly string[] {
  return [...new Set(Object.values(world.teams).map((team) => String(team.organizationId)))].sort()
}

describe('BS16K-C economic source provisioning', () => {
  it('provisions the demo profile into canonical sources for every participating Organization', () => {
    const world = createAcbTestGame()
    const profile = createAcbDemoEconomicProfileV1()
    const organizations = organizationIdsOf(world)

    expect(organizations).toHaveLength(18)
    expect(Object.keys(world.revenueSourcesById)).toHaveLength(18)
    expect(Object.keys(world.operatingCostSourcesById)).toHaveLength(18)
    expect(getUngroundedEconomicSources(world)).toEqual([])
    for (const source of Object.values(world.revenueSourcesById)) {
      expect(source.provenance.kind).toBe(ECONOMIC_POLICY_PROVENANCE_KIND)
      expect(source.provenance.id).toBe(BDM_DEMO_ECONOMIC_POLICY_ID)
      expect(source.provenance.description).toContain(BDM_DEMO_ECONOMIC_POLICY_V1_LABEL)
      expect(source.category).toBe('COMPETITION')
      expect(source.currencyCode).toBe('EUR')
      expect(source.amount.minorUnits).toBe(240_000_000)
      expect(source.paymentSchedule).toHaveLength(12)
      expect(source.paymentSchedule.every((term) => term.amount.minorUnits === 20_000_000)).toBe(true)
      expect(source.paymentSchedule.every((term) => term.recognitionOn === term.dueOn)).toBe(true)
    }
    for (const source of Object.values(world.operatingCostSourcesById)) {
      expect(source.category).toBe('MATCH_OPERATIONS')
      expect(source.costNature).toBe('OPERATING')
      expect(source.currencyCode).toBe('EUR')
      expect(source.paymentSchedule.every((term) => term.amount.minorUnits === legacyMajorUnitsToMoney(BDM_DEMO_MATCH_OPERATIONS_PER_GAME_MAJOR_UNITS, 'EUR').minorUnits)).toBe(true)
      // One declared term per real home Game, and the total is exactly per-game × home games.
      expect(source.paymentSchedule.reduce((sum, term) => sum + term.amount.minorUnits, 0)).toBe(source.amount.minorUnits)
      expect(source.paymentSchedule.length).toBeGreaterThan(0)
    }
    // The demo installments are the first date of each fiscal month, and the first one precedes the career clock.
    const installments = acbDemoParticipationInstallments()
    expect(installments.map((installment) => installment.recognitionOn)).toEqual(['2026-09-01', '2026-10-01', '2026-11-01', '2026-12-01', '2027-01-01', '2027-02-01', '2027-03-01', '2027-04-01', '2027-05-01', '2027-06-01', '2027-07-01', '2027-08-01'])
    expect(String(world.currentDate)).toBe('2026-09-19')
  })

  it('is idempotent: re-provisioning changes nothing and reports ALREADY_PROVISIONED', () => {
    const world = createAcbTestGame()
    const replay = provisionEconomicSources(world, { profiles: [createAcbDemoEconomicProfileV1()] })

    expect(replay.world).toBe(world)
    expect(replay.sourcesCreated).toBe(0)
    for (const result of replay.results) {
      if (result.profileId === null) continue
      expect(result.status).toBe('ALREADY_PROVISIONED')
      expect(result.organizations.every((entry) => entry.status === 'ALREADY_PROVISIONED' && entry.sourcesCreated === 0)).toBe(true)
    }
    expect(Object.keys(replay.world.revenueSourcesById)).toHaveLength(18)
  })

  it('provisions nothing at all for a competition with no applicable profile', () => {
    const prototype = createNewGame()
    const application = provisionEconomicSources(prototype, { profiles: [createAcbDemoEconomicProfileV1()] })

    // The prototype universe has its own competitions, none of which the ACB demo profile covers.
    expect(application.sourcesCreated).toBe(0)
    expect(application.competitionsWithoutPolicy).toBeGreaterThan(0)
    expect(application.world).toBe(prototype)
    expect(application.results.filter((result) => result.status === ECONOMIC_POLICY_NOT_PROVISIONED).length).toBe(application.competitionsWithoutPolicy)
    expect(Object.keys(prototype.revenueSourcesById)).toEqual([])
    expect(Object.keys(prototype.operatingCostSourcesById)).toEqual([])
    // No fallback economy: the prototype career keeps its truthful zero cash and no economic source.
    expect(getCashBalancesByCurrency(prototype, organizationIdsOf(prototype)[0]!, prototype.currentDate).every((row) => row.totalCashMinorUnits === 0)).toBe(true)
  })

  it('gives a second competition its own profile values instead of the demo values', () => {
    const base = createAcbTestGame()
    const participantTeamIds = Object.values(base.teams).slice(0, 2).map((team) => team.id)
    const withSecond = updateGameWorld(base, { competitions: [...Object.values(base.competitions), createCompetition({ id: SECOND_COMPETITION, name: 'Fixture Second League', gender: 'male', participantTeamIds, rules: Object.values(base.competitions)[0]!.rules, ecosystemId: Object.values(base.competitions)[0]!.ecosystemId })] })

    const application = provisionEconomicSources(withSecond, { profiles: [createAcbDemoEconomicProfileV1(), secondCompetitionProfile()] })
    const second = secondCompetitionProfile()
    const organizationIds = organizationIdsOf(base).filter((organizationId) => participantTeamIds.some((teamId) => String(base.teams[teamId]!.organizationId) === organizationId))
    expect(organizationIds).toHaveLength(2)

    for (const organizationId of organizationIds) {
      const own = application.world.revenueSourcesById[economicRevenueSourceId(second, organizationId) as never]!
      const demo = application.world.revenueSourcesById[economicRevenueSourceId(createAcbDemoEconomicProfileV1(), organizationId) as never]!
      // Each competition pays its own declared amount and cadence; neither takes the other's numbers.
      expect(own.amount.minorUnits).toBe(60_000_000)
      expect(own.paymentSchedule).toHaveLength(4)
      expect(demo.amount.minorUnits).toBe(240_000_000)
      expect(demo.paymentSchedule).toHaveLength(12)
      expect(applicableEconomicProfile([createAcbDemoEconomicProfileV1(), second], SECOND_COMPETITION)?.profileId).toBe(second.profileId)
    }
  })

  it('creates nothing when the profile currency is not the Organization base currency, and applies no FX', () => {
    // A fixture competition whose Organization holds an EUR profile, matched with a USD policy.
    const fixture = fixtureWorld(createOrganizationFinancialProfile({ organizationId: FIXTURE_HOME_ORGANIZATION, baseCurrencyCode: 'EUR', fiscalYearStartMonth: 10 }))
    const usdProfile = fixtureProfile('USD', 24_000_000, 1)
    const application = provisionEconomicSources(fixture, { profiles: [usdProfile] })
    const result = application.results.flatMap((entry) => entry.organizations)

    expect(application.sourcesCreated).toBe(0)
    expect(application.world).toBe(fixture)
    expect(result.find((entry) => String(entry.organizationId) === FIXTURE_HOME_ORGANIZATION)?.status).toBe('CURRENCY_MISMATCH')
    expect(result.find((entry) => String(entry.organizationId) === FIXTURE_HOME_ORGANIZATION)?.reason).toContain('no FX is applied')
    expect(Object.keys(application.world.revenueSourcesById)).toEqual([])
  })

  it('never replaces an explicit economic source that another authority already declared', () => {
    const fixture = fixtureWorld(createOrganizationFinancialProfile({ organizationId: FIXTURE_HOME_ORGANIZATION, baseCurrencyCode: 'EUR', fiscalYearStartMonth: 10 }))
    const foreign = createRevenueSource({
      id: 'world-db:revenue-stream:1',
      organizationId: FIXTURE_HOME_ORGANIZATION,
      category: 'COMPETITION',
      currencyCode: 'EUR',
      amount: { currencyCode: 'EUR', minorUnits: 500_000 },
      startsOn: '2032-11-01',
      endsOn: '2032-11-01',
      sourceAuthority: 'COMPETITION',
      generationPolicy: 'ONE_OFF',
      dueDatePolicy: 'ON_RECOGNITION',
      competitionId: FIXTURE_COMPETITION,
      provenance: { kind: 'WORLD_DB', id: 'revenue_stream:1', description: 'World DB revenue stream row' },
    })
    const withForeign = updateGameWorld(fixture, { revenueSources: [foreign] })
    const profile = fixtureProfile('EUR', 15_000_000, 4)
    const application = provisionEconomicSources(withForeign, { profiles: [profile] })
    const result = application.results.flatMap((entry) => entry.organizations).find((entry) => String(entry.organizationId) === FIXTURE_HOME_ORGANIZATION)!

    expect(result.status).toBe('EXPLICIT_ECONOMIC_SOURCE_PRESERVED')
    expect(result.reason).toContain('another authority')
    expect(application.world.revenueSourcesById[foreign.id]).toEqual(foreign)
    expect(application.world.revenueSourcesById[economicRevenueSourceId(profile, FIXTURE_HOME_ORGANIZATION) as never]).toBeUndefined()
  })

  it('provisions an Organization with no finance profile as unavailable instead of guessing a currency', () => {
    // Only one of the two fixture Organizations has a finance profile.
    const fixture = fixtureWorld(createOrganizationFinancialProfile({ organizationId: FIXTURE_HOME_ORGANIZATION, baseCurrencyCode: 'EUR', fiscalYearStartMonth: 10 }))
    const profile = fixtureProfile('EUR', 15_000_000, 4)
    const application = provisionEconomicSources(fixture, { profiles: [profile] })
    const results = application.results.flatMap((entry) => entry.organizations)
    const unavailable = results.find((entry) => String(entry.organizationId) === FIXTURE_AWAY_ORGANIZATION)!

    expect(unavailable.status).toBe('FINANCE_PROFILE_UNAVAILABLE')
    expect(unavailable.revenueSourceId).toBeNull()
    expect(unavailable.reason).toContain('no canonical finance profile')
    // The sibling with a real profile is provisioned, so a missing neighbour never blocks a valid Organization.
    expect(results.find((entry) => String(entry.organizationId) === FIXTURE_HOME_ORGANIZATION)?.status).toBe('PROVISIONED')
    expect(Object.keys(application.world.revenueSourcesById)).toEqual([String(economicRevenueSourceId(profile, FIXTURE_HOME_ORGANIZATION))])
  })

  it('persists the provisioned sources and their occurrences across save/load', () => {
    const world = createAcbTestGame()
    const organizationId = organizationIdsOf(world)[0]!
    const sourceId = economicRevenueSourceId(createAcbDemoEconomicProfileV1(), organizationId)
    const costId = economicMatchOperationsSourceId(createAcbDemoEconomicProfileV1(), organizationId)

    const reloaded = deserializeGameWorldV4(serializeGameWorldV4(world, '2026-09-19T00:00:00.000Z'))
    expect(reloaded.revenueSourcesById[sourceId as never]).toEqual(world.revenueSourcesById[sourceId as never])
    expect(reloaded.operatingCostSourcesById[costId as never]).toEqual(world.operatingCostSourcesById[costId as never])
    expect(Object.keys(reloaded.revenueSourcesById)).toHaveLength(18)
    expect(Object.keys(reloaded.operatingCostSourcesById)).toHaveLength(18)
    // Re-provisioning a loaded world is still a no-op, so save/load can never duplicate a source.
    expect(provisionEconomicSources(reloaded, { profiles: [createAcbDemoEconomicProfileV1()] }).world).toBe(reloaded)
  })

  it('keeps demo policy data out of the mechanism: no Finance engine knows the demo policy', async () => {
    const { readFileSync } = await import('node:fs')
    for (const file of ['src/domain/finance/CompetitionEconomicProfile.ts', 'src/domain/finance/EconomicSourceProvisioning.ts', 'src/engine/finance/ClubFinanceLifecycle.ts', 'src/engine/calendar/CalendarEngine.ts']) {
      const text = readFileSync(file, 'utf8')
      // The generic authority and the daily engine receive an approved profile as input; they never contain
      // league-specific or demo-specific economic data, so a new league is data, not engine code.
      expect(text.includes('AcbDemoEconomicPolicy')).toBe(false)
      expect(text.includes('BDM_DEMO')).toBe(false)
    }
  })

  it('runs the real application day path with the provisioned sources present', () => {
    const world = updateGameWorld(createAcbTestGame(), { currentDate: createGameDate(2026, 9, 20) })
    const advanced = advanceGameDay(world, () => 1)

    expect(advanced.currentDate).toBe(createGameDate(2026, 9, 21))
    expect(Object.keys(advanced.revenueSourcesById)).toHaveLength(18)
    expect(Object.keys(advanced.operatingCostSourcesById)).toHaveLength(18)
    expect(getUngroundedEconomicSources(advanced)).toEqual([])
    expect(organizationIdFromString(organizationIdsOf(world)[0]!)).toBeDefined()
  })
})
