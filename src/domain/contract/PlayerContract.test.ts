import { describe, expect, it } from 'vitest'
import { createPlayerContract, getPlayerContractStatus } from './PlayerContract'
import { contractIdFromString, playerIdFromString, teamIdFromString } from '@/domain/ids'

describe('PlayerContract termination', () => {
  it('preserves a scheduled contract terminated before activation as historical contract truth', () => {
    const contract = createPlayerContract({
      id: contractIdFromString('contract:scheduled-release'),
      playerId: playerIdFromString('player:scheduled-release'),
      teamId: teamIdFromString('team:scheduled-release'),
      kind: 'standard',
      term: { startsOn: '2034-10-01' as never, expiresOn: '2035-10-01' as never },
      compensation: { annualSalary: 1_000_000, years: [{ cashSalary: 1_000_000, capTreatment: { policy: 'NOT_APPLICABLE' }, guaranteedAmount: 500_000 }] },
      termination: { terminatedOn: '2033-10-01' as never, reason: 'released' },
    })

    expect(contract.term).toEqual({ startsOn: '2034-10-01', expiresOn: '2035-10-01' })
    expect(contract.termination).toEqual({ terminatedOn: '2033-10-01', reason: 'released' })
    expect(getPlayerContractStatus(contract, '2033-09-30' as never)).toBe('scheduled')
    expect(getPlayerContractStatus(contract, '2033-10-01' as never)).toBe('terminated')
    expect(getPlayerContractStatus(contract, '2034-10-01' as never)).toBe('terminated')
  })
})
