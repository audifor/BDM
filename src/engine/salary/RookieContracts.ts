import { addYears } from '@/domain/date'
import { createPlayerContract, type PlayerContract } from '@/domain/contract'
import { contractIdFromString, type PlayerId, type TeamId } from '@/domain/ids'
import type { SalaryRules } from '@/domain/salary'

export function createRookieContract(rules: SalaryRules, playerId: PlayerId, teamId: TeamId, pickOrder: number, startsOn: import('@/domain/date').GameDate): PlayerContract | undefined {
  const entry = rules.rookieScale?.entries.find((candidate) => candidate.pickOrder === pickOrder)
  if (entry === undefined || rules.rookieScale === undefined) return undefined
  const years = Array.from({ length: rules.rookieScale.contractYears }, () => ({ cashSalary: entry.cashSalary, capHit: entry.capHit, guaranteedAmount: entry.guaranteedAmount }))
  return createPlayerContract({ id: contractIdFromString(`rookie-contract:${rules.seasonId}:${pickOrder}:${playerId}:${teamId}`), playerId, teamId, kind: 'standard', term: { startsOn, expiresOn: addYears(startsOn, rules.rookieScale.contractYears) }, compensation: { annualSalary: entry.cashSalary, years } })
}
