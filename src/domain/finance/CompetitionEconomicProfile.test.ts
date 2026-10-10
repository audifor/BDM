import { describe, expect, it } from 'vitest'

import { createGameDate } from '@/domain/date'
import {
  applicableEconomicProfile,
  competitionEconomicProfileIdFor,
  COMPETITION_ECONOMIC_PROFILE_VERSION,
  createCompetitionEconomicProfile,
  createCompetitionOperatingCostPolicy,
  createCompetitionRevenuePolicy,
  ECONOMIC_POLICY_PROVENANCE_KIND,
  legacyMajorUnitsToMoney,
  operatingCostPolicyOf,
  revenuePolicyOf,
} from '@/domain/finance'
import { competitionIdFromString } from '@/domain/ids'

/**
 * BDM DEMO ECONOMIC POLICY V1 as a data authority: identity is deterministic, the approved total is an invariant
 * of the data, amounts are canonical Money in the profile currency, and no policy can express payroll or derive an
 * amount from a budget. The demo competition is the only competition V1 covers; anything else resolves to no
 * profile and therefore to no source.
 */
const COMPETITION = competitionIdFromString('fixture-competition-economics')
const EUR = 'EUR'
const provenance = { kind: ECONOMIC_POLICY_PROVENANCE_KIND, id: 'fixture-policy-v1', description: 'Fixture policy V1' }

function installments(count: number, startMonth: number, perInstallmentMinorUnits: number) {
  return Array.from({ length: count }, (_, index) => {
    const monthIndex = startMonth - 1 + index
    const date = createGameDate(2026 + Math.floor(monthIndex / 12), (monthIndex % 12) + 1, 1)
    return { recognitionOn: date, dueOn: date, amount: { currencyCode: EUR, minorUnits: perInstallmentMinorUnits } }
  })
}

function participationProfile(perInstallmentMinorUnits = 20_000_000, count = 12, startMonth = 9) {
  return createCompetitionEconomicProfile({
    competitionId: COMPETITION,
    fiscalYearStartMonth: startMonth,
    currencyCode: EUR,
    label: 'Fixture competition profile',
    approvedPolicyLabel: 'Fixture Economic Policy V1',
    revenuePolicies: [createCompetitionRevenuePolicy({ code: 'COMPETITION_PARTICIPATION_DISTRIBUTION', category: 'COMPETITION', currencyCode: EUR, annualAmount: { currencyCode: EUR, minorUnits: perInstallmentMinorUnits * count }, installments: installments(count, startMonth, perInstallmentMinorUnits), provenance })],
    operatingCostPolicies: [createCompetitionOperatingCostPolicy({ code: 'MATCH_OPERATIONS', category: 'MATCH_OPERATIONS', currencyCode: EUR, perEventAmount: legacyMajorUnitsToMoney(25_000, EUR), provenance })],
  })
}

describe('CompetitionEconomicProfile data authority', () => {
  it('derives one deterministic profile identity per competition and version', () => {
    const first = participationProfile()
    const second = participationProfile()

    expect(first.profileId).toBe(second.profileId)
    expect(first.profileId).toBe(competitionEconomicProfileIdFor(COMPETITION, COMPETITION_ECONOMIC_PROFILE_VERSION))
    expect(first.version).toBe(COMPETITION_ECONOMIC_PROFILE_VERSION)
    expect(first.provenance).toEqual({ kind: ECONOMIC_POLICY_PROVENANCE_KIND, id: first.profileId })
    expect(applicableEconomicProfile([first], COMPETITION)?.profileId).toBe(first.profileId)
    // A different competition resolves to no profile at all — there is no fallback economy.
    expect(applicableEconomicProfile([first], competitionIdFromString('other-competition'))).toBeUndefined()
  })

  it('keeps the approved annual total an invariant of the declared installments', () => {
    const profile = participationProfile()
    const policy = revenuePolicyOf(profile, 'COMPETITION_PARTICIPATION_DISTRIBUTION')!

    expect(policy.installments).toHaveLength(12)
    expect(policy.installments.every((installment) => installment.amount.minorUnits === 20_000_000)).toBe(true)
    expect(policy.installments.reduce((sum, installment) => sum + installment.amount.minorUnits, 0)).toBe(policy.annualAmount.minorUnits)
    expect(policy.annualAmount.minorUnits).toBe(240_000_000)
    expect(policy.currencyCode).toBe(EUR)
    expect(policy.generationPolicy).toBe('EXPLICIT_SCHEDULE')
    expect(policy.recipientScope).toBe('PARTICIPATING_ORGANIZATIONS')
    expect(policy.sourceAuthority).toBe('COMPETITION')

    // A policy whose installments do not add up to the approved total is rejected: the total is never recomputed.
    expect(() => createCompetitionRevenuePolicy({ code: 'COMPETITION_PARTICIPATION_DISTRIBUTION', category: 'COMPETITION', currencyCode: EUR, annualAmount: { currencyCode: EUR, minorUnits: 240_000_001 }, installments: installments(12, 9, 20_000_000), provenance })).toThrow(/sum to the annual amount/)
  })

  it('requires explicit increasing installment dates and canonical currency agreement', () => {
    expect(() => createCompetitionRevenuePolicy({ code: 'COMPETITION_PARTICIPATION_DISTRIBUTION', category: 'COMPETITION', currencyCode: EUR, annualAmount: { currencyCode: EUR, minorUnits: 20_000_000 }, installments: [{ recognitionOn: '2026-10-01', dueOn: '2026-10-01', amount: { currencyCode: 'USD', minorUnits: 20_000_000 } }], provenance })).toThrow(/currency/)
    expect(() => createCompetitionRevenuePolicy({ code: 'COMPETITION_PARTICIPATION_DISTRIBUTION', category: 'COMPETITION', currencyCode: EUR, annualAmount: { currencyCode: EUR, minorUnits: 40_000_000 }, installments: [{ recognitionOn: '2026-10-01', amount: { currencyCode: EUR, minorUnits: 20_000_000 } }, { recognitionOn: '2026-10-01', amount: { currencyCode: EUR, minorUnits: 20_000_000 } }], provenance })).toThrow(/increasing/)
    expect(() => createCompetitionEconomicProfile({ competitionId: COMPETITION, fiscalYearStartMonth: 9, currencyCode: EUR, label: 'x', approvedPolicyLabel: 'y', revenuePolicies: [], operatingCostPolicies: [] })).toThrow(/at least one economic policy/)
  })

  it('carries the approved collection policy as data, defaulting to no collection at all', () => {
    // Without an explicit decision a source owns its receivable: collection is never assumed.
    const defaultPolicy = revenuePolicyOf(participationProfile(), 'COMPETITION_PARTICIPATION_DISTRIBUTION')!
    expect(defaultPolicy.collectionPolicy).toBe('NONE')

    const collecting = createCompetitionRevenuePolicy({
      code: 'COMPETITION_PARTICIPATION_DISTRIBUTION',
      category: 'COMPETITION',
      currencyCode: EUR,
      annualAmount: { currencyCode: EUR, minorUnits: 40_000_000 },
      collectionPolicy: 'COLLECT_ON_DUE_DATE',
      installments: [
        { recognitionOn: '2026-10-01', dueOn: '2026-10-01', amount: { currencyCode: EUR, minorUnits: 20_000_000 } },
        { recognitionOn: '2026-11-01', dueOn: '2026-11-01', amount: { currencyCode: EUR, minorUnits: 20_000_000 } },
      ],
      provenance,
    })
    expect(collecting.collectionPolicy).toBe('COLLECT_ON_DUE_DATE')
    // The approved rule for a collected family: recognition and the contractual payment date are the same date.
    expect(collecting.installments.every((installment) => installment.recognitionOn === installment.dueOn)).toBe(true)
    expect(() => createCompetitionRevenuePolicy({ code: 'COMPETITION_PARTICIPATION_DISTRIBUTION', category: 'COMPETITION', currencyCode: EUR, annualAmount: { currencyCode: EUR, minorUnits: 20_000_000 }, collectionPolicy: 'AUTO_COLLECT_ALL' as never, installments: [{ recognitionOn: '2026-10-01', amount: { currencyCode: EUR, minorUnits: 20_000_000 } }], provenance })).toThrow(/collection policy/)
  })

  it('cannot express payroll and cannot reach an unrelated cost family', () => {
    // The category list itself has no payroll concept, so no policy can duplicate BS16I contract payroll.
    expect(() => createCompetitionOperatingCostPolicy({ code: 'MATCH_OPERATIONS', category: 'PLAYER_SALARY' as never, currencyCode: EUR, perEventAmount: legacyMajorUnitsToMoney(1, EUR), provenance })).toThrow()
    expect(() => createCompetitionOperatingCostPolicy({ code: 'MATCH_OPERATIONS', category: 'FACILITY' as never, currencyCode: EUR, perEventAmount: legacyMajorUnitsToMoney(1, EUR), provenance })).toThrow(/MATCH_OPERATIONS category/)
    const profile = participationProfile()
    const cost = operatingCostPolicyOf(profile, 'MATCH_OPERATIONS')!
    expect(cost.category).toBe('MATCH_OPERATIONS')
    expect(cost.costNature).toBe('OPERATING')
    expect(cost.bearer).toBe('HOME_ORGANIZATION')
    expect(cost.timingAuthority).toBe('HOME_GAME_SCHEDULE')
    expect(cost.perEventAmount.minorUnits).toBe(2_500_000)
  })

  it('keeps a profile for a USD competition representable without any code change', () => {
    const usd = createCompetitionEconomicProfile({
      competitionId: competitionIdFromString('fixture-competition-usd'),
      fiscalYearStartMonth: 10,
      currencyCode: 'USD',
      label: 'USD fixture competition profile',
      approvedPolicyLabel: 'Fixture Economic Policy USD',
      revenuePolicies: [createCompetitionRevenuePolicy({ code: 'COMPETITION_PARTICIPATION_DISTRIBUTION', category: 'COMPETITION', currencyCode: 'USD', annualAmount: { currencyCode: 'USD', minorUnits: 40_000_000 }, installments: [{ recognitionOn: '2026-11-01', dueOn: '2026-11-01', amount: { currencyCode: 'USD', minorUnits: 40_000_000 } }], provenance })],
    })

    expect(usd.currencyCode).toBe('USD')
    expect(revenuePolicyOf(usd, 'COMPETITION_PARTICIPATION_DISTRIBUTION')?.installments[0]!.recognitionOn).toBe('2026-11-01')
    expect(operatingCostPolicyOf(usd, 'MATCH_OPERATIONS')).toBeUndefined()
    // Installments are explicit dates: nothing is derived from a cadence guess.
    expect(revenuePolicyOf(usd, 'COMPETITION_PARTICIPATION_DISTRIBUTION')?.installments[0]!.dueOn).toBe(createGameDate(2026, 11, 1))
  })
})
