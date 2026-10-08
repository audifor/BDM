import { describe, expect, it } from 'vitest'

import { createPlayerContract } from '@/domain/contract'
import {
  createOrganizationFinancialProfile,
  createTeamFinances,
  ensureCanonicalFinanceFoundation,
  evaluateOrganizationFinancialCommitment,
  financeFiscalPeriodIdFor,
  financeFiscalPeriodsOf,
  getContractFinancialSchedule,
  getFinanceActivationReport,
  getFinanceFiscalYearFor,
  getOrganizationFinancialAuthorization,
  legacyMajorUnitsToMoney,
  legacyTeamFinanceAmountToMoney,
  SUPPORTED_CURRENCY_MINOR_UNITS_PER_MAJOR_UNIT,
} from '@/domain/finance'
import { getMinorUnitsPerMajorUnit } from '@/domain/finance/FinanceCurrencyPolicy'
import { contractIdFromString, teamIdFromString } from '@/domain/ids'
import { createGameWorld, updateGameWorld, type GameWorld } from '@/domain/world'
import { createValidGameWorldInput } from '@/domain/world/testFixtures'

/**
 * BS16G certifies the monetary boundary. Legacy gameplay money (TeamFinances pools, contract salaries, agent
 * fees, buyouts) is stored in whole major currency units, canonical `Money` is minor units, and every crossing
 * goes through the one boundary below — never a 1:1 cast and never a second, ad-hoc scale.
 */
function salaryWorld(annualSalary: number): GameWorld {
  const input = createValidGameWorldInput()
  const team = input.teams![0]!
  const player = input.players![0]!
  return createGameWorld({
    ...input,
    contracts: [createPlayerContract({
      id: contractIdFromString('contract:bs16g-money'),
      playerId: player.id,
      teamId: team.id,
      kind: 'standard',
      term: { startsOn: '2032-10-01' as never, expiresOn: '2033-10-01' as never },
      compensation: { annualSalary, years: [{ cashSalary: annualSalary, capHit: annualSalary, guaranteedAmount: annualSalary }] },
    })],
  })
}

describe('BS16G legacy money boundary', () => {
  it('converts legacy major units into canonical minor units exactly, for every supported currency', () => {
    expect(legacyMajorUnitsToMoney(25_000, 'EUR')).toEqual({ currencyCode: 'EUR', minorUnits: 2_500_000 })
    expect(legacyMajorUnitsToMoney(25_000, 'USD')).toEqual({ currencyCode: 'USD', minorUnits: 2_500_000 })
    expect(legacyMajorUnitsToMoney(1, 'EUR').minorUnits).toBe(SUPPORTED_CURRENCY_MINOR_UNITS_PER_MAJOR_UNIT.EUR)
    expect(legacyMajorUnitsToMoney(0, 'EUR').minorUnits).toBe(0)
  })

  it('is one single conversion authority, with a single precision authority behind it', () => {
    // The BS16F name and the BS16G name are the same function: there is exactly one implementation and no
    // second conversion path to drift.
    expect(legacyTeamFinanceAmountToMoney).toBe(legacyMajorUnitsToMoney)
    expect(getMinorUnitsPerMajorUnit('EUR')).toBe(100)
    expect(getMinorUnitsPerMajorUnit('USD')).toBe(100)
    // An unsupported currency has no canonical precision, so nothing can silently convert it.
    expect(getMinorUnitsPerMajorUnit('GBP')).toBeNull()
  })

  it('refuses invalid amounts and unsupported currencies instead of inventing precision', () => {
    expect(() => legacyMajorUnitsToMoney(-1, 'EUR')).toThrow(RangeError)
    expect(() => legacyMajorUnitsToMoney(1.5, 'EUR')).toThrow(RangeError)
    expect(() => legacyMajorUnitsToMoney(Number.MAX_SAFE_INTEGER, 'EUR')).toThrow(RangeError)
    expect(() => legacyMajorUnitsToMoney(25_000, 'GBP')).toThrow(RangeError)
    expect(() => legacyMajorUnitsToMoney(25_000, 'XYZ')).toThrow(RangeError)
  })

  it('carries a legacy contract amount into the canonical schedule exactly once', () => {
    const world = salaryWorld(25_000)
    const team = Object.values(world.teams)[0]!
    const entries = getContractFinancialSchedule(world, { organizationId: team.organizationId, currencyCode: 'EUR' })

    expect(entries.map((entry) => entry.amount.minorUnits)).toEqual([2_500_000])
    // Exactly one crossing: a second one would produce 250,000,000.
    expect(entries.map((entry) => entry.amount.minorUnits)).not.toContain(250_000_000)
  })

  it('keeps the contract schedule economically equal to the legacy major-unit amount at any scale', () => {
    for (const major of [25_000, 1_000_000, 3_500_000]) {
      const world = salaryWorld(major)
      const team = Object.values(world.teams)[0]!
      const entries = getContractFinancialSchedule(world, { organizationId: team.organizationId, currencyCode: 'USD' })
      expect(entries.map((entry) => entry.amount.minorUnits)).toEqual([major * 100])
      expect(entries.every((entry) => entry.amount.currencyCode === 'USD')).toBe(true)
    }
  })
})
