import { compareGameDates, type GameDate } from '@/domain/date'
import type { ContractId, PlayerId, TeamId } from '@/domain/ids'

export type PlayerContractKind = 'standard'
export type ContractTerminationReason = 'released' | 'retired'
export type ContractCapTreatment =
  | { readonly policy: 'NOT_APPLICABLE' }
  | { readonly policy: 'BASE_SALARY' | 'EXPLICIT_SCHEDULE'; readonly capHit: number }

export interface ContractYearCompensation {
  readonly cashSalary: number
  readonly capHit?: number
  readonly guaranteedAmount: number
  readonly capTreatment?: ContractCapTreatment
}
export type ResolvedContractYearCompensation = Omit<ContractYearCompensation, 'capHit'> & { readonly capHit: number }

export interface PlayerContract {
  readonly id: ContractId
  readonly playerId: PlayerId
  readonly teamId: TeamId
  readonly kind: PlayerContractKind
  readonly term: { readonly startsOn: GameDate; readonly expiresOn: GameDate }
  readonly compensation: { readonly annualSalary: number; readonly years?: readonly ContractYearCompensation[] }
  readonly predecessorContractId?: ContractId
  readonly termination?: { readonly terminatedOn: GameDate; readonly reason: ContractTerminationReason }
}

export type PlayerContractStatus = 'scheduled' | 'active' | 'expired' | 'terminated'

export function createPlayerContract(input: PlayerContract): PlayerContract {
  if (input.kind !== 'standard') throw new TypeError('Contract kind is invalid')
  if (compareGameDates(input.term.expiresOn, input.term.startsOn) <= 0) throw new RangeError('Contract expiry must be after start')
  if (input.predecessorContractId === input.id) throw new TypeError('Contract cannot succeed itself')
  if (input.termination && (!['released', 'retired'].includes(input.termination.reason) || compareGameDates(input.termination.terminatedOn, input.term.expiresOn) >= 0)) throw new RangeError('Contract termination is invalid')
  if (!Number.isInteger(input.compensation.annualSalary) || input.compensation.annualSalary < 1 || input.compensation.annualSalary > 100_000_000) throw new RangeError('Contract annual salary must be an integer from 1 to 100000000')
  const years = input.compensation.years
  if (years !== undefined && (years.length === 0 || years.some((year) => !validMoney(year.cashSalary) || (year.capHit !== undefined && !validMoney(year.capHit)) || !validMoney(year.guaranteedAmount) || year.guaranteedAmount > year.cashSalary || !validCapTreatment(year)))) throw new RangeError('Contract year compensation is invalid')
  return {
    ...input,
    term: { ...input.term },
    compensation: { ...input.compensation, ...(years === undefined ? {} : { years: Object.freeze(years.map((year) => Object.freeze({ ...year, ...(year.capTreatment === undefined ? {} : { capTreatment: Object.freeze({ ...year.capTreatment }) }) }))) }) },
    ...(input.termination ? { termination: { ...input.termination } } : {}),
  }
}

export function getPlayerContractStatus(contract: PlayerContract, onDate: GameDate): PlayerContractStatus {
  if (contract.termination && compareGameDates(onDate, contract.termination.terminatedOn) >= 0) return 'terminated'
  return compareGameDates(onDate, contract.term.startsOn) < 0 ? 'scheduled' : compareGameDates(onDate, contract.term.expiresOn) < 0 ? 'active' : 'expired'
}

export function getContractYearCompensation(contract: PlayerContract, onDate: GameDate): ResolvedContractYearCompensation {
  const index = Math.max(0, Number(onDate.slice(0, 4)) - Number(contract.term.startsOn.slice(0, 4)))
  const compensation = contract.compensation.years?.[Math.min(index, contract.compensation.years.length - 1)] ?? { cashSalary: contract.compensation.annualSalary, capHit: contract.compensation.annualSalary, guaranteedAmount: contract.compensation.annualSalary }
  return { ...compensation, capHit: compensation.capTreatment?.policy === 'NOT_APPLICABLE' ? 0 : compensation.capHit ?? compensation.cashSalary }
}

export function getContractYearCapHit(contract: PlayerContract, onDate: GameDate): number {
  const compensation = getContractYearCompensation(contract, onDate)
  return compensation.capTreatment?.policy === 'NOT_APPLICABLE' ? 0 : compensation.capHit ?? compensation.cashSalary
}

function validMoney(value: number): boolean { return Number.isInteger(value) && value >= 0 && value <= 100_000_000 }
function validCapTreatment(year: ContractYearCompensation): boolean {
  const treatment = year.capTreatment
  if (treatment === undefined) return year.capHit !== undefined
  if (treatment.policy === 'NOT_APPLICABLE') return year.capHit === undefined
  return (treatment.policy === 'BASE_SALARY' || treatment.policy === 'EXPLICIT_SCHEDULE') && year.capHit !== undefined && year.capHit === treatment.capHit
}
