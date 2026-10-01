import { addYears, type GameDate } from '@/domain/date'
import type { Player } from '@/domain/player'
import type { Team } from '@/domain/team'
import type { SalaryRules } from '@/domain/salary'
import type { GameWorld } from '@/domain/world'
import type { RetentionTermSet } from '@/domain/contract/ContractRetentionNegotiation'
import { calculateTeamPayroll, validateContractOffer } from './SalaryEngine'
import { getContractServiceTime } from './ContractServiceTime'

export type BindingCompensationFailure = 'RULES_UNAVAILABLE' | 'SERVICE_TIME_UNKNOWN' | 'ILLEGAL_SALARY' | 'ILLEGAL_TERM' | 'CAP_TREATMENT_UNAVAILABLE' | 'UNSUPPORTED_BINDING_TERM'
export type BindingCapTreatment = { readonly policy: 'NOT_APPLICABLE' } | { readonly policy: 'BASE_SALARY'; readonly capHit: number } | { readonly policy: 'EXPLICIT_SCHEDULE'; readonly capHit: number }
export interface BindingCompensationYear { readonly year: number; readonly cashSalary: number; readonly guaranteedAmount: number; readonly capTreatment: BindingCapTreatment }
export type BindingCompensationResult =
  | { readonly status: 'VALID'; readonly serviceTimeStatus: 'KNOWN' | 'NOT_REQUIRED'; readonly years: readonly BindingCompensationYear[] }
  | { readonly status: BindingCompensationFailure; readonly reasons?: readonly string[] }

/** Pure precondition/materialization query. It returns compensation only and never mutates GameWorld. */
export function materializeBindingContractCompensation(
  world: GameWorld,
  player: Player,
  team: Team,
  acceptedTerms: RetentionTermSet,
  contractDates: { readonly startsOn: GameDate; readonly expiresOn: GameDate },
  applicableSalaryRules?: SalaryRules,
): BindingCompensationResult {
  if ((acceptedTerms.incentives?.length ?? 0) > 0 || (acceptedTerms.options?.length ?? 0) > 0 || (acceptedTerms.clauses?.length ?? 0) > 0 || acceptedTerms.agentFee !== undefined || acceptedTerms.agentFeePayer !== undefined) return { status: 'UNSUPPORTED_BINDING_TERM' }
  const years = acceptedTerms.years
  if (!Number.isInteger(years) || years < 1 || years > 20 || contractDates.expiresOn !== addYears(contractDates.startsOn, years)) return { status: 'ILLEGAL_TERM' }
  if (!Number.isInteger(acceptedTerms.salary) || acceptedTerms.salary < 1) return { status: 'ILLEGAL_SALARY' }

  const ecosystem = Object.values(world.ecosystems).find((item) => item.id === applicableSalaryRules?.serviceTimePolicy?.jurisdictionId)
    ?? Object.values(world.competitions).filter((competition) => competition.participantTeamIds.includes(team.id)).map((competition) => world.ecosystems[competition.ecosystemId]).find((item) => item !== undefined)
  if (applicableSalaryRules === undefined && ecosystem?.kind !== 'fibaLike') return { status: 'RULES_UNAVAILABLE' }
  const rules = applicableSalaryRules
  const serviceTime = rules === undefined ? { status: 'NOT_REQUIRED' as const } : getContractServiceTime(world, player.id, rules, contractDates.startsOn)
  if (serviceTime.status === 'UNKNOWN') return { status: 'SERVICE_TIME_UNKNOWN' }
  if (rules !== undefined && (years < rules.contractLength.minimumYears || years > rules.contractLength.maximumYears)) return { status: 'ILLEGAL_TERM' }

  const capPolicy = rules === undefined ? 'NOT_APPLICABLE' : rules.capAccounting
  if (capPolicy === undefined) return { status: 'CAP_TREATMENT_UNAVAILABLE' }
  const selectedPick = Object.values(world.draftPicksById).find((pick) => {
    const draft = world.draftsById[pick.draftId]
    return pick.selection?.playerId === player.id && pick.selection.teamId === team.id && draft?.ecosystemId === rules?.serviceTimePolicy?.jurisdictionId
  })
  const explicitEntry = capPolicy === 'EXPLICIT_SCHEDULE' && selectedPick !== undefined
    ? rules?.rookieScale?.entries.find((entry) => entry.pickOrder === selectedPick.order)
    : undefined
  if (capPolicy === 'EXPLICIT_SCHEDULE' && (explicitEntry === undefined || rules?.rookieScale === undefined || years > rules.rookieScale.contractYears || explicitEntry.cashSalary !== acceptedTerms.salary)) return { status: 'CAP_TREATMENT_UNAVAILABLE' }
  const capHit = capPolicy === 'BASE_SALARY' ? acceptedTerms.salary : explicitEntry?.capHit
  if (rules !== undefined && serviceTime.status === 'KNOWN' && capHit !== undefined) {
    const deadMoney = Object.values(world.deadMoneyChargesById).filter((charge) => charge.teamId === team.id && charge.seasonId === rules.seasonId).reduce((sum, charge) => sum + charge.amount, 0)
    const retainedSalary = Object.values(world.retainedSalaryObligationsById).filter((obligation) => obligation.retainingTeamId === team.id && obligation.seasonId === rules.seasonId).reduce((sum, obligation) => sum + obligation.amount, 0)
    const payroll = calculateTeamPayroll(Object.values(world.contractsById).filter((contract) => contract.teamId === team.id), contractDates.startsOn, deadMoney, retainedSalary)
    const validation = validateContractOffer(rules, payroll, { years: Array.from({ length: years }, () => ({ cashSalary: acceptedTerms.salary, capHit, guaranteedAmount: acceptedTerms.salary })), serviceYears: serviceTime.seasons })
    if (!validation.allowed) {
      const salaryReasons = validation.reasons.filter((reason) => reason === 'PLAYER_MINIMUM_NOT_MET' || reason === 'PLAYER_MAXIMUM_EXCEEDED')
      if (salaryReasons.length > 0) return { status: 'ILLEGAL_SALARY', reasons: salaryReasons }
      return { status: 'ILLEGAL_SALARY', reasons: validation.reasons }
    }
  } else if (rules !== undefined && capPolicy === 'BASE_SALARY' && serviceTime.status !== 'KNOWN') return { status: 'SERVICE_TIME_UNKNOWN' }

  const compensation = Object.freeze(Array.from({ length: years }, (_, index) => {
    const guarantee = acceptedTerms.guarantees?.find((item) => item.year === index + 1)?.guaranteedAmount ?? 0
    if (!Number.isInteger(guarantee) || guarantee < 0 || guarantee > acceptedTerms.salary) return undefined
    const treatment: BindingCapTreatment = capPolicy === 'NOT_APPLICABLE' ? { policy: 'NOT_APPLICABLE' } : capPolicy === 'EXPLICIT_SCHEDULE' ? { policy: 'EXPLICIT_SCHEDULE', capHit: explicitEntry!.capHit } : { policy: 'BASE_SALARY', capHit: capHit! }
    return Object.freeze({ year: index + 1, cashSalary: acceptedTerms.salary, guaranteedAmount: guarantee, capTreatment: treatment })
  }))
  if (compensation.some((year) => year === undefined)) return { status: 'ILLEGAL_SALARY' }
  return { status: 'VALID', serviceTimeStatus: serviceTime.status, years: compensation as readonly BindingCompensationYear[] }
}
