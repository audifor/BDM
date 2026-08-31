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

/**
 * THE single canonical semantics of "is this Staff contract active on `date`" (Issue #19 review
 * Blocker 5) — every consumer (payroll derivation, enrichment, `validateWorld`, `StaffCareerService`)
 * must call this rather than re-deriving its own proxy (e.g. `termination === undefined`, which
 * silently ignores both a lapsed `expiresOn` and a not-yet-effective future termination).
 *
 * A contract is active on `date` when:
 * - `date` falls within its term (`startsOn <= date < expiresOn`), AND
 * - it has no termination yet in effect: either no `termination` at all, or a `termination` whose
 *   `effectiveOn` is still in the future relative to `date` (a scheduled-but-not-yet-effective
 *   termination keeps the contract active right up to, but not including, `effectiveOn`).
 *
 * From `termination.effectiveOn` onward (inclusive), the contract is never active again, even if
 * `date` is still within `[startsOn, expiresOn)`.
 */
export function isStaffContractActiveOn(contract: StaffContract, date: GameDate): boolean {
  if (compareGameDates(date, contract.term.startsOn) < 0 || compareGameDates(date, contract.term.expiresOn) >= 0) return false
  if (contract.termination !== undefined && compareGameDates(date, contract.termination.effectiveOn) >= 0) return false
  return true
}

export function terminateStaffContract(contract: StaffContract, effectiveOn: GameDate, reason: StaffFiringReason | 'resigned'): StaffContract {
  if (contract.termination !== undefined) throw new RangeError('Staff contract is already terminated')
  return { ...contract, termination: { effectiveOn: parseGameDate(effectiveOn), reason } }
}

export function findActiveStaffContract(contracts: readonly StaffContract[], staffId: StaffPersonId, date: GameDate): StaffContract | undefined {
  return contracts.find((contract) => contract.staffId === staffId && isStaffContractActiveOn(contract, date))
}
