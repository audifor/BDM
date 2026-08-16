import { describe, expect, it } from 'vitest'

import { createPlayerContract } from '@/domain/contract'
import { parseGameDate } from '@/domain/date'
import { contractIdFromString, playerIdFromString, seasonIdFromString, teamIdFromString } from '@/domain/ids'
import { createSalaryRules } from '@/domain/salary'

import { calculateLuxuryTax, calculateTeamPayroll, calculateTeamSalaryStatus, getIncomingSalaryLimit, validateContractOffer } from './SalaryEngine'

const rules = createSalaryRules({ seasonId: seasonIdFromString('season:nba'), capModel: 'soft', capAmount: 100, salaryFloor: 80, tax: { threshold: 100, tiers: [{ upTo: 5, rate: 1 }, { upTo: null, rate: 2 }] }, aprons: [{ id: 'apron', amount: 120, restrictedTransactionKinds: ['sign'] }], minimumSalaryBands: [{ minServiceYears: 0, maxServiceYears: null, amount: 5 }], maximumSalaryBands: [{ minServiceYears: 0, maxServiceYears: null, capPercentage: .3 }], rookieScale: { contractYears: 2, entries: [{ pickOrder: 1, cashSalary: 8, capHit: 7, guaranteedAmount: 7 }, { pickOrder: 5, cashSalary: 4, capHit: 3, guaranteedAmount: 3 }] }, exceptionRules: [], contractLength: { minimumYears: 1, maximumYears: 4 }, tradeSalaryMatchingRules: [{ maximumPayroll: 100, incomingMultiplier: 1.25, incomingAllowance: 2 }, { maximumPayroll: null, incomingMultiplier: 1, incomingAllowance: 0 }] })
const date = parseGameDate('2033-06-01')
const contract = createPlayerContract({ id: contractIdFromString('contract:one'), playerId: playerIdFromString('player:one'), teamId: teamIdFromString('team:one'), kind: 'standard', term: { startsOn: parseGameDate('2033-01-01'), expiresOn: parseGameDate('2035-01-01') }, compensation: { annualSalary: 10, years: [{ cashSalary: 10, capHit: 7, guaranteedAmount: 10 }, { cashSalary: 12, capHit: 9, guaranteedAmount: 12 }] } })

describe('SalaryEngine', () => {
  it('uses current-year cap hit plus dead money, not cash or every contract year', () => {
    expect(calculateTeamPayroll([contract], date, 7).totalCapHit).toBe(14)
    expect(calculateTeamPayroll([contract], parseGameDate('2034-06-01')).totalCapHit).toBe(9)
  })

  it('calculates progressive tax, floor, aprons and configurable matching', () => {
    const payroll = calculateTeamPayroll([], date, 0, 98)
    const status = calculateTeamSalaryStatus(rules, payroll)
    expect(calculateLuxuryTax(rules, 8)).toBe(11)
    expect(status.belowSalaryFloor).toBe(false)
    expect(getIncomingSalaryLimit(rules, status, 10).maximumIncomingSalary).toBe(14)
    expect(getIncomingSalaryLimit(rules, calculateTeamSalaryStatus(rules, calculateTeamPayroll([], date, 0, 121)), 10).maximumIncomingSalary).toBe(10)
  })

  it('requires an exception over a soft cap and always rejects hard-cap excess', () => {
    const payroll = calculateTeamPayroll([], date, 0, 98)
    const proposed = { years: [{ cashSalary: 5, capHit: 5, guaranteedAmount: 5 }], serviceYears: 1 }
    expect(validateContractOffer(rules, payroll, proposed).reasons).toContain('EXCEPTION_REQUIRED')
    expect(validateContractOffer(rules, payroll, { ...proposed, exceptionAmount: 5 }).allowed).toBe(true)
    expect(validateContractOffer({ ...rules, capModel: 'hard' }, calculateTeamPayroll([], date, 0, 98), { ...proposed, exceptionAmount: 5 }).reasons).toContain('ABOVE_HARD_CAP')
  })
})
