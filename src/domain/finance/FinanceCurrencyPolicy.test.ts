import { describe, expect, it } from 'vitest'
import { createGameWorld, updateGameWorld, type GameWorld } from '@/domain/world'
import { createValidGameWorldInput } from '@/domain/world/testFixtures'
import { createCompetition } from '@/domain/competition'
import { createCountry } from '@/domain/country'
import { DEFAULT_FIBA_LIKE_ECOSYSTEM_ID } from '@/domain/ecosystem'
import { competitionIdFromString, countryIdFromString, ecosystemIdFromString, organizationIdFromString, teamIdFromString } from '@/domain/ids'
import { createTeam } from '@/domain/team'
import { createTeamFinances } from './TeamFinances'
import {
  COUNTRY_CURRENCY_POLICY,
  SHIPPED_ECOSYSTEM_CURRENCY_POLICY,
  SHIPPED_NBA_LIKE_ECOSYSTEM_ID,
  SHIPPED_WNBA_LIKE_ECOSYSTEM_ID,
  SUPPORTED_CURRENCY_MINOR_UNITS_PER_MAJOR_UNIT,
  getCountryCurrencyPolicy,
  getEcosystemCurrencyPolicy,
  legacyTeamFinanceAmountToMoney,
  resolveOrganizationCurrency,
} from './FinanceCurrencyPolicy'

const SPAIN = createCountry({ id: countryIdFromString('country:ESP'), name: 'Spain', code: 'ESP' })
const UNITED_STATES = createCountry({ id: countryIdFromString('country:USA'), name: 'United States', code: 'USA' })
const VIRELIA = createCountry({ id: countryIdFromString('country:VIR'), name: 'Virelia', code: 'VIR' })

function worldWith(teams: readonly ReturnType<typeof createTeam>[], countries: readonly ReturnType<typeof createCountry>[], ecosystemId: string) {
  const base = createValidGameWorldInput()
  return createGameWorld({
    ...base,
    countries: [...(base.countries ?? []), ...countries],
    teams: [...(base.teams ?? []), ...teams],
    competitions: [...(base.competitions ?? []), createCompetition({ id: competitionIdFromString('competition:policy'), name: 'Policy Competition', gender: 'male', participantTeamIds: teams.map((team) => team.id), ecosystemId: ecosystemIdFromString(ecosystemId) })],
    teamFinances: teams.map((team) => createTeamFinances({ teamId: team.id, playerSalaryBudget: 1_000_000, staffSalaryBudget: 500_000 })),
  })
}

describe('BS16F currency provisioning policy', () => {
  it('states the approved country policy explicitly and has no arbitrary default', () => {
    expect(COUNTRY_CURRENCY_POLICY.map((entry) => [entry.identity, String(entry.currencyCode)])).toEqual([['ESP', 'EUR'], ['USA', 'USD']])
    expect(getCountryCurrencyPolicy('ESP')).toBe('EUR')
    expect(getCountryCurrencyPolicy('USA')).toBe('USD')
    expect(getCountryCurrencyPolicy('VIR')).toBeNull()
    expect(getCountryCurrencyPolicy('')).toBeNull()
  })

  it('maps only the shipped NBA-like and WNBA-like ecosystems, derived from canonical ids', () => {
    expect(SHIPPED_NBA_LIKE_ECOSYSTEM_ID).toBe(DEFAULT_FIBA_LIKE_ECOSYSTEM_ID === SHIPPED_NBA_LIKE_ECOSYSTEM_ID ? DEFAULT_FIBA_LIKE_ECOSYSTEM_ID : SHIPPED_NBA_LIKE_ECOSYSTEM_ID)
    expect(SHIPPED_ECOSYSTEM_CURRENCY_POLICY.map((entry) => [entry.identity, String(entry.currencyCode)])).toEqual([
      [String(SHIPPED_NBA_LIKE_ECOSYSTEM_ID), 'USD'],
      [String(SHIPPED_WNBA_LIKE_ECOSYSTEM_ID), 'USD'],
    ])
    expect(getEcosystemCurrencyPolicy(String(SHIPPED_NBA_LIKE_ECOSYSTEM_ID))).toBe('USD')
    expect(getEcosystemCurrencyPolicy(String(SHIPPED_WNBA_LIKE_ECOSYSTEM_ID))).toBe('USD')
    // The FIBA-like and NCAA-like shipped ecosystems are not approved currencies.
    expect(getEcosystemCurrencyPolicy(String(DEFAULT_FIBA_LIKE_ECOSYSTEM_ID))).toBeNull()
  })

  it('resolves an organization currency from its canonical country first', () => {
    const team = createTeam({ id: teamIdFromString('team:esp'), name: 'Club Baloncesto', gender: 'male', countryId: SPAIN.id, rosterPlayerIds: [], organizationId: organizationIdFromString('organization:esp') })
    const world = worldWith([team], [SPAIN], String(DEFAULT_FIBA_LIKE_ECOSYSTEM_ID))

    expect(resolveOrganizationCurrency(world, 'organization:esp')).toEqual({ status: 'RESOLVED', currencyCode: 'EUR', source: 'COUNTRY', identity: 'ESP' })
  })

  it('falls back to the shipped ecosystem policy only when the jurisdiction is unresolved', () => {
    const team = createTeam({ id: teamIdFromString('team:vir-nba'), name: 'Orinthian Comets', gender: 'male', countryId: VIRELIA.id, rosterPlayerIds: [], organizationId: organizationIdFromString('organization:vir-nba') })
    const world = worldWith([team], [VIRELIA], String(SHIPPED_NBA_LIKE_ECOSYSTEM_ID))

    expect(resolveOrganizationCurrency(world, 'organization:vir-nba')).toEqual({ status: 'RESOLVED', currencyCode: 'USD', source: 'ECOSYSTEM', identity: String(SHIPPED_NBA_LIKE_ECOSYSTEM_ID) })
  })

  it('never infers currency from club or league names', () => {
    const named = createTeam({ id: teamIdFromString('team:named'), name: 'NBA United States Dollar FC', gender: 'male', countryId: VIRELIA.id, rosterPlayerIds: [], organizationId: organizationIdFromString('organization:named') })
    const world = worldWith([named], [VIRELIA], String(DEFAULT_FIBA_LIKE_ECOSYSTEM_ID))
    const competition = Object.values(world.competitions)[0]!
    const renamed = updateGameWorld(world, { competitions: [createCompetition({ ...competition, name: 'NBA España USD EUR League' })] })

    expect(resolveOrganizationCurrency(world, 'organization:named')).toEqual({ status: 'FINANCE_CURRENCY_UNAVAILABLE', reason: 'ECOSYSTEM_UNKNOWN' })
    expect(resolveOrganizationCurrency(renamed, 'organization:named')).toEqual({ status: 'FINANCE_CURRENCY_UNAVAILABLE', reason: 'ECOSYSTEM_UNKNOWN' })
  })

  it('reports ambiguity and unknown jurisdiction instead of guessing', () => {
    const spainTeam = createTeam({ id: teamIdFromString('team:mixed-esp'), name: 'Mixed A', gender: 'male', countryId: SPAIN.id, rosterPlayerIds: [], organizationId: organizationIdFromString('organization:mixed') })
    const usTeam = createTeam({ id: teamIdFromString('team:mixed-usa'), name: 'Mixed B', gender: 'male', countryId: UNITED_STATES.id, rosterPlayerIds: [], organizationId: organizationIdFromString('organization:mixed') })
    const mixed = worldWith([spainTeam, usTeam], [SPAIN, UNITED_STATES], String(DEFAULT_FIBA_LIKE_ECOSYSTEM_ID))
    const noTeams: GameWorld = createGameWorld(createValidGameWorldInput())

    expect(resolveOrganizationCurrency(mixed, 'organization:mixed')).toEqual({ status: 'FINANCE_CURRENCY_UNAVAILABLE', reason: 'JURISDICTION_AMBIGUOUS' })
    expect(resolveOrganizationCurrency(noTeams, 'organization:unknown')).toEqual({ status: 'FINANCE_CURRENCY_UNAVAILABLE', reason: 'NO_FINANCE_BEARING_TEAM' })
  })
})

describe('BS16F legacy money conversion boundary', () => {
  it('converts legacy major units into canonical minor units exactly', () => {
    expect(SUPPORTED_CURRENCY_MINOR_UNITS_PER_MAJOR_UNIT).toEqual({ EUR: 100, USD: 100 })
    expect(legacyTeamFinanceAmountToMoney(11_600_000, 'EUR')).toEqual({ currencyCode: 'EUR', minorUnits: 1_160_000_000 })
    expect(legacyTeamFinanceAmountToMoney(5_000_000, 'USD')).toEqual({ currencyCode: 'USD', minorUnits: 500_000_000 })
    expect(legacyTeamFinanceAmountToMoney(0, 'EUR')).toEqual({ currencyCode: 'EUR', minorUnits: 0 })
    // €5,000,000 must never become €50,000: the two scales are explicitly related.
    expect(legacyTeamFinanceAmountToMoney(5_000_000, 'EUR').minorUnits).toBeGreaterThan(50_000)
  })

  it('refuses unsupported currencies and invalid amounts instead of inventing precision', () => {
    expect(() => legacyTeamFinanceAmountToMoney(1_000, 'JPY')).toThrow(/minor-unit precision/)
    expect(() => legacyTeamFinanceAmountToMoney(1_000, 'eur')).toThrow()
    expect(() => legacyTeamFinanceAmountToMoney(-1, 'EUR')).toThrow(/non-negative safe integer/)
    expect(() => legacyTeamFinanceAmountToMoney(1.5, 'EUR')).toThrow(/non-negative safe integer/)
    expect(() => legacyTeamFinanceAmountToMoney(Number.MAX_SAFE_INTEGER, 'EUR')).toThrow(/safe integer range/)
  })
})
