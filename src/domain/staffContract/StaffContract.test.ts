import { describe, expect, it } from 'vitest'
import { staffPersonIdFromString, teamIdFromString } from '@/domain/ids'
import { createStaffContract, findActiveStaffContract, isStaffContractActiveOn, staffContractIdFromString, terminateStaffContract } from './StaffContract'

const staffId = staffPersonIdFromString('staff-1')
const teamId = teamIdFromString('team-1')

function baseContract() {
  return createStaffContract({ id: staffContractIdFromString('contract-1'), staffId, teamId, kind: 'standard', term: { startsOn: '2032-10-01' as never, expiresOn: '2034-10-01' as never }, compensation: { annualSalary: 60_000 } })
}

describe('createStaffContract: construction validation', () => {
  it('constructs a valid standard contract', () => {
    const contract = baseContract()
    expect(contract.compensation.annualSalary).toBe(60_000)
    expect(contract.termination).toBeUndefined()
  })

  it('rejects a term that does not start before it expires', () => {
    expect(() => createStaffContract({ id: staffContractIdFromString('c'), staffId, teamId, kind: 'standard', term: { startsOn: '2032-10-01' as never, expiresOn: '2032-10-01' as never }, compensation: { annualSalary: 60_000 } })).toThrow(RangeError)
  })

  it('rejects a non-positive annual salary', () => {
    expect(() => createStaffContract({ id: staffContractIdFromString('c'), staffId, teamId, kind: 'standard', term: { startsOn: '2032-10-01' as never, expiresOn: '2034-10-01' as never }, compensation: { annualSalary: 0 } })).toThrow(RangeError)
  })

  it('rejects an unknown contract kind', () => {
    expect(() => createStaffContract({ id: staffContractIdFromString('c'), staffId, teamId, kind: 'exotic' as never, term: { startsOn: '2032-10-01' as never, expiresOn: '2034-10-01' as never }, compensation: { annualSalary: 60_000 } })).toThrow(RangeError)
  })
})

describe('isStaffContractActiveOn / active contract lookup', () => {
  it('is active on a date within [startsOn, expiresOn)', () => {
    const contract = baseContract()
    expect(isStaffContractActiveOn(contract, '2032-10-01' as never)).toBe(true)
    expect(isStaffContractActiveOn(contract, '2033-01-01' as never)).toBe(true)
  })

  it('is not active on or after expiresOn', () => {
    const contract = baseContract()
    expect(isStaffContractActiveOn(contract, '2034-10-01' as never)).toBe(false)
  })

  it('is not active before startsOn', () => {
    const contract = baseContract()
    expect(isStaffContractActiveOn(contract, '2032-09-30' as never)).toBe(false)
  })

  it('a terminated contract is never active, regardless of date', () => {
    const terminated = terminateStaffContract(baseContract(), '2033-01-01' as never, 'performance')
    expect(isStaffContractActiveOn(terminated, '2032-11-01' as never)).toBe(false)
  })

  it('findActiveStaffContract locates the one active contract for a Staff person on a date', () => {
    const contract = baseContract()
    expect(findActiveStaffContract([contract], staffId, '2033-01-01' as never)).toBe(contract)
    expect(findActiveStaffContract([contract], staffId, '2035-01-01' as never)).toBeUndefined()
  })
})

describe('terminateStaffContract', () => {
  it('sets a termination record', () => {
    const terminated = terminateStaffContract(baseContract(), '2033-01-01' as never, 'budgetCuts')
    expect(terminated.termination).toEqual({ effectiveOn: '2033-01-01', reason: 'budgetCuts' })
  })

  it('rejects terminating an already-terminated contract', () => {
    const terminated = terminateStaffContract(baseContract(), '2033-01-01' as never, 'performance')
    expect(() => terminateStaffContract(terminated, '2033-02-01' as never, 'performance')).toThrow(RangeError)
  })
})
