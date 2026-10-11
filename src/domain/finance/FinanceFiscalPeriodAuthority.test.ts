import { describe, expect, it } from 'vitest'

import { createGameDate } from '@/domain/date'
import {
  createFiscalPeriod,
  createOrganizationFinancialProfile,
  createTeamFinances,
  ensureCanonicalFinanceFoundation,
  evaluateOrganizationFinancialCommitment,
  financeFiscalPeriodIdFor,
  financeFiscalPeriodsOf,
  getFinanceActivationReport,
  getFinanceFiscalYearFor,
  getOrganizationFinancialAuthorization,
} from '@/domain/finance'
import { teamIdFromString } from '@/domain/ids'
import { createGameWorld, updateGameWorld, type GameWorld } from '@/domain/world'
import { createValidGameWorldInput } from '@/domain/world/testFixtures'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'

/**
 * BS16G: a Finance fiscal period is the fiscal year containing the effective GameDate — derived from
 * `OrganizationFinancialProfile.fiscalYearStartMonth` — and never a competition season. The fixture world's
 * Season runs 2032-10-01..2033-05-31, so a career date of 2032-09-19 is preseason and must still be inside a
 * valid fiscal period.
 */
const ORGANIZATION_ID = 'team-home'
const PLAYER_TEAM_ID = teamIdFromString('team-home')
const PRESEASON = createGameDate(2032, 9, 19)
const SAVED_AT = '2033-09-05T00:00:00.000Z'

function fiscalWorld(options: { readonly fiscalYearStartMonth?: number; readonly currentDate?: ReturnType<typeof createGameDate>; readonly withLegacyPeriod?: boolean } = {}): GameWorld {
  const fiscalYearStartMonth = options.fiscalYearStartMonth ?? 9
  const legacyPeriod = createFiscalPeriod({
    id: financeFiscalPeriodIdFor(ORGANIZATION_ID, '2032-10-01'),
    organizationId: ORGANIZATION_ID,
    label: '2032-33 season',
    startsOn: '2032-10-01',
    endsOn: '2033-05-31',
  })
  return createGameWorld({
    ...createValidGameWorldInput(),
    currentDate: options.currentDate ?? PRESEASON,
    teamFinances: [createTeamFinances({ teamId: PLAYER_TEAM_ID, playerSalaryBudget: 1_000_000, staffSalaryBudget: 500_000 })],
    organizationFinancialProfiles: [createOrganizationFinancialProfile({ organizationId: ORGANIZATION_ID, baseCurrencyCode: 'EUR', fiscalYearStartMonth })],
    ...(options.withLegacyPeriod === true ? { fiscalPeriods: [legacyPeriod] } : {}),
  })
}

const eur = (minorUnits: number) => ({ currencyCode: 'EUR', minorUnits })

describe('BS16G fiscal period derivation', () => {
  it('derives the fiscal year containing the date from the profile start month', () => {
    const profile = { fiscalYearStartMonth: 9 }
    expect(getFinanceFiscalYearFor(profile, '2032-09-01').startsOn).toBe('2032-09-01')
    expect(getFinanceFiscalYearFor(profile, '2032-09-19')).toMatchObject({ startsOn: '2032-09-01', endsOn: '2033-08-31' })
    expect(getFinanceFiscalYearFor(profile, '2033-03-15').startsOn).toBe('2032-09-01')
    expect(getFinanceFiscalYearFor(profile, '2033-08-31').startsOn).toBe('2032-09-01')
    expect(getFinanceFiscalYearFor(profile, '2033-09-01').startsOn).toBe('2033-09-01')
    // A calendar-year fiscal profile covers exactly the calendar year.
    expect(getFinanceFiscalYearFor({ fiscalYearStartMonth: 1 }, '2033-03-15')).toMatchObject({ startsOn: '2033-01-01', endsOn: '2033-12-31' })
  })

  it('identifies a period deterministically from the organization and the fiscal-year boundary', () => {
    expect(financeFiscalPeriodIdFor(ORGANIZATION_ID, '2032-09-01')).toBe(financeFiscalPeriodIdFor(ORGANIZATION_ID, createGameDate(2032, 9, 1)))
    expect(financeFiscalPeriodIdFor(ORGANIZATION_ID, '2032-09-01')).not.toBe(financeFiscalPeriodIdFor(ORGANIZATION_ID, '2033-09-01'))
    expect(financeFiscalPeriodIdFor(ORGANIZATION_ID, '2032-09-01')).not.toBe(financeFiscalPeriodIdFor('team-away', '2032-09-01'))
  })
})

describe('BS16G fiscal period authority', () => {
  it('gives a preseason career a valid fiscal period and an active authorization', () => {
    const activated = ensureCanonicalFinanceFoundation(fiscalWorld())
    const periods = financeFiscalPeriodsOf(activated, ORGANIZATION_ID)

    expect(periods).toHaveLength(1)
    expect(String(periods[0]!.id)).toBe(String(financeFiscalPeriodIdFor(ORGANIZATION_ID, '2032-09-01')))
    expect(periods[0]!.startsOn).toBe('2032-09-01')
    expect(periods[0]!.endsOn).toBe('2033-08-31')
    // The date precedes the Season start and is inside the fiscal period, so authority exists before the first
    // game: no OUT_OF_PERIOD merely because the competition has not begun.
    expect(activated.seasons[activated.currentSeasonId]!.startDate).toBe('2032-10-01')
    const authorization = getOrganizationFinancialAuthorization(activated, { organizationId: ORGANIZATION_ID, currencyCode: 'EUR', asOfDate: PRESEASON })
    expect(authorization.state).toBe('ACTIVE')
    expect(String(authorization.fiscalPeriodId)).toBe(String(periods[0]!.id))

    const decision = evaluateOrganizationFinancialCommitment(activated, { organizationId: ORGANIZATION_ID, currency: 'EUR', amount: eur(10_000), category: 'PLAYER_SALARY', asOfDate: PRESEASON })
    expect(decision.reasonCodes).not.toContain('AUTHORIZATION_OUT_OF_PERIOD')
    expect(decision.reasonCodes).not.toContain('BUDGET_AUTHORIZATION_NOT_MODELLED')
  })

  it('keeps one period for one fiscal year and one period per fiscal year, never overlapping', () => {
    const activated = ensureCanonicalFinanceFoundation(fiscalWorld())
    // A second date inside the same fiscal year resolves the identical period and materializes nothing.
    const sameYearWorld = updateGameWorld(activated, { currentDate: createGameDate(2033, 3, 15) })
    const sameYear = ensureCanonicalFinanceFoundation(sameYearWorld)
    expect(sameYear).toBe(sameYearWorld)
    expect(financeFiscalPeriodsOf(sameYear, ORGANIZATION_ID)).toHaveLength(1)
    expect(getFinanceActivationReport(sameYear).organizations.find((entry) => entry.organizationId === ORGANIZATION_ID)?.status).toBe('ALREADY_PROVISIONED')

    // Crossing the fiscal boundary creates the next period without copying the previous authorization, and the
    // two periods never overlap.
    const nextYear = ensureCanonicalFinanceFoundation(updateGameWorld(sameYear, { currentDate: createGameDate(2033, 9, 5) }))
    const periods = financeFiscalPeriodsOf(nextYear, ORGANIZATION_ID)
    expect(periods.map((period) => String(period.id))).toEqual([
      String(financeFiscalPeriodIdFor(ORGANIZATION_ID, '2032-09-01')),
      String(financeFiscalPeriodIdFor(ORGANIZATION_ID, '2033-09-01')),
    ])
    for (const [index, period] of periods.entries()) {
      const next = periods[index + 1]
      if (next !== undefined) expect(period.endsOn < next.startsOn).toBe(true)
    }
    expect(getOrganizationFinancialAuthorization(nextYear, { organizationId: ORGANIZATION_ID, currencyCode: 'EUR', asOfDate: createGameDate(2033, 9, 5) }).state).toBe('NOT_PROVISIONED')
    expect(evaluateOrganizationFinancialCommitment(nextYear, { organizationId: ORGANIZATION_ID, currency: 'EUR', amount: eur(10_000), asOfDate: createGameDate(2033, 9, 5) }).reasonCodes).toContain('BUDGET_AUTHORIZATION_NOT_MODELLED')
  })

  it('preserves a pre-BS16G period, reuses it for its fiscal year and never duplicates or rewrites it', () => {
    const world = fiscalWorld({ withLegacyPeriod: true })
    const legacyBefore = financeFiscalPeriodsOf(world, ORGANIZATION_ID)[0]!
    const activated = ensureCanonicalFinanceFoundation(world)

    // The historical period keeps its identity and dates: activation resolves it as this fiscal year's period
    // authority instead of minting a second, overlapping one.
    const after = financeFiscalPeriodsOf(activated, ORGANIZATION_ID)
    expect(after).toHaveLength(1)
    expect(after[0]).toEqual(legacyBefore)
    expect(getFinanceActivationReport(activated).organizations.find((entry) => entry.organizationId === ORGANIZATION_ID)?.fiscalPeriodId).toBe(String(legacyBefore.id))
    // Its authorization binds to the preserved period, so the truth about the dates is unchanged: the season
    // period does not cover the preseason date.
    expect(getOrganizationFinancialAuthorization(activated, { organizationId: ORGANIZATION_ID, currencyCode: 'EUR', asOfDate: PRESEASON }).state).toBe('OUT_OF_PERIOD')
    expect(getOrganizationFinancialAuthorization(activated, { organizationId: ORGANIZATION_ID, currencyCode: 'EUR', asOfDate: '2033-01-10' }).state).toBe('ACTIVE')
    expect(ensureCanonicalFinanceFoundation(activated)).toBe(activated)
  })

  it('round-trips the fiscal periods through Save V4 without duplicating or reinterpreting them', () => {
    const activated = ensureCanonicalFinanceFoundation(fiscalWorld({ withLegacyPeriod: true }))
    const restored = deserializeGameWorldV4(serializeGameWorldV4(activated, SAVED_AT))

    expect(financeFiscalPeriodsOf(restored, ORGANIZATION_ID)).toEqual(financeFiscalPeriodsOf(activated, ORGANIZATION_ID))
    expect(Object.keys(restored.financialBudgetsById)).toEqual(Object.keys(activated.financialBudgetsById))
    // Replaying activation after load is a no-op: no second period, no second authorization.
    expect(ensureCanonicalFinanceFoundation(restored)).toBe(restored)
    expect(financeFiscalPeriodsOf(restored, ORGANIZATION_ID)).toHaveLength(1)
  })

  it('keeps a season-anchored world truthful when the career date is inside the season', () => {
    // The same world inside the season resolves the preserved period as active, proving the migration keeps
    // historical date semantics rather than silently re-dating the period to the fiscal year.
    const activated = ensureCanonicalFinanceFoundation(updateGameWorld(fiscalWorld({ withLegacyPeriod: true }), { currentDate: createGameDate(2033, 1, 10) }))
    const periods = financeFiscalPeriodsOf(activated, ORGANIZATION_ID)

    expect(periods).toHaveLength(1)
    expect(periods[0]!.startsOn).toBe('2032-10-01')
    expect(periods[0]!.endsOn).toBe('2033-05-31')
    expect(getOrganizationFinancialAuthorization(activated, { organizationId: ORGANIZATION_ID, currencyCode: 'EUR', asOfDate: '2033-01-10' }).state).toBe('ACTIVE')
  })
})
