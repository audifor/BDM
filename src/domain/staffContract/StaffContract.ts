import type { GameDate } from '@/domain/date'
import { compareGameDates, parseGameDate } from '@/domain/date'
import type { StaffPersonId, TeamId } from '@/domain/ids'
import type { StaffFiringReason } from '@/domain/staffCareer'
import { requireNonEmptyString } from '@/domain/validation'

declare const staffContractIdBrand: unique symbol
export type StaffContractId = string & { readonly [staffContractIdBrand]: 'StaffContractId' }
export const staffContractIdFromString = (value: string): StaffContractId => requireNonEmptyString(value, 'Staff contract ID') as StaffContractId

export type StaffContractKind = 'standard'
export interface StaffContractTerm { readonly startsOn: GameDate; readonly expiresOn: GameDate }
export interface StaffContractCompensation { readonly annualSalary: number }
export interface StaffContractTermination { readonly effectiveOn: GameDate; readonly reason: StaffFiringReason | 'resigned' }
export interface StaffContract {
  readonly id: StaffContractId
  readonly staffId: StaffPersonId
  readonly teamId: TeamId
  readonly kind: StaffContractKind
  readonly term: StaffContractTerm
  readonly compensation: StaffContractCompensation
  readonly termination?: StaffContractTermination
}

export function createStaffContract(input: StaffContract): StaffContract {
  if (input.kind !== 'standard') throw new RangeError('Unknown Staff contract kind')
  const term = { startsOn: parseGameDate(input.term.startsOn), expiresOn: parseGameDate(input.term.expiresOn) }
  if (compareGameDates(term.startsOn, term.expiresOn) >= 0) throw new RangeError('Staff contract term must start before it expires')
  if (!Number.isFinite(input.compensation.annualSalary) || input.compensation.annualSalary <= 0) throw new RangeError('Staff contract annual salary must be a positive finite number')
  const termination = input.termination === undefined ? undefined : { effectiveOn: parseGameDate(input.termination.effectiveOn), reason: input.termination.reason }
  return {
    id: staffContractIdFromString(input.id),
    staffId: requireNonEmptyString(input.staffId, 'Staff contract Staff') as StaffPersonId,
    teamId: requireNonEmptyString(input.teamId, 'Staff contract Team') as TeamId,
    kind: 'standard',
    term,
    compensation: { annualSalary: input.compensation.annualSalary },
    ...(termination === undefined ? {} : { termination }),
  }
}

/** A contract is active on `date` when it has no termination and `date` falls within its term (inclusive of `startsOn`, exclusive of `expiresOn`). A terminated contract is never active, regardless of date. */
export function isStaffContractActiveOn(contract: StaffContract, date: GameDate): boolean {
  if (contract.termination !== undefined) return false
  return compareGameDates(date, contract.term.startsOn) >= 0 && compareGameDates(date, contract.term.expiresOn) < 0
}

export function terminateStaffContract(contract: StaffContract, effectiveOn: GameDate, reason: StaffFiringReason | 'resigned'): StaffContract {
  if (contract.termination !== undefined) throw new RangeError('Staff contract is already terminated')
  return { ...contract, termination: { effectiveOn: parseGameDate(effectiveOn), reason } }
}

export function findActiveStaffContract(contracts: readonly StaffContract[], staffId: StaffPersonId, date: GameDate): StaffContract | undefined {
  return contracts.find((contract) => contract.staffId === staffId && isStaffContractActiveOn(contract, date))
}
