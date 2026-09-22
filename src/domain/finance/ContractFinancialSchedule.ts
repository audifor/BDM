import { compareGameDates, createGameDate, daysInMonth, parseGameDate, type GameDate } from '@/domain/date'
import { getContractYearCompensation, type PlayerContract } from '@/domain/contract'
import type { StaffContract } from '@/domain/staffContract'
import {
  contractIdFromString,
  organizationIdFromString,
  organizationSectionIdFromString,
  seasonIdFromString,
  teamIdFromString,
  type ContractId,
  type OrganizationId,
  type OrganizationSectionId,
  type SeasonId,
  type TeamId,
} from '@/domain/ids'
import { type GameWorld } from '@/domain/world'
import { createAuthorizedEconomicEvent, processContractEconomicEvent, type EconomicEventAdapterResult, type EconomicEventAdapterOptions } from './EconomicEventAdapters'
import { createCurrencyCode, createMoney, type CurrencyCode, type FinancialDimensions, type FinancialSource, type Money } from './FinancialLedger'
import { getExpenseRecognitionsAsOfDate, getExpenseRecognitionsBetween } from './RecognitionQueries'
import { getPayableRemaining } from './Treasury'
import type { ExpenseRecognition } from './Recognition'

export type ContractFinancialSourceType = 'PLAYER' | 'STAFF'
export type ContractFinancialCompensationStatus = 'GUARANTEED' | 'CONDITIONAL'
export type ContractFinancialCategory = 'PLAYER_SALARY' | 'STAFF_SALARY'

export interface ContractFinancialSchedulePeriod {
  readonly startsOn: GameDate
  /** Exclusive end. The source contract remains authoritative for the exact term. */
  readonly endsOn: GameDate
}

export interface ContractFinancialScheduleEntry {
  readonly id: string
  readonly contractId: string
  readonly sourceContractType: ContractFinancialSourceType
  readonly organizationId: OrganizationId
  readonly beneficiaryId: string
  readonly teamId: TeamId
  readonly organizationSectionId: OrganizationSectionId
  readonly category: ContractFinancialCategory
  readonly amount: Money
  readonly compensationStatus: ContractFinancialCompensationStatus
  readonly sourceTerm: string
  readonly seasonId: SeasonId | null
  readonly period: ContractFinancialSchedulePeriod
  readonly effectiveOn: GameDate
  /** Null because the current contract models contain no payment dates. */
  readonly dueOn: GameDate | null
  readonly provenance: FinancialSource
  readonly dimensions: FinancialDimensions
}

export interface ContractFinancialScheduleQuery {
  readonly organizationId?: OrganizationId | string
  readonly teamId?: TeamId | string
  readonly contractId?: ContractId | string
  /** Contract models have no currency field; this is the explicit simulation currency policy. */
  readonly currencyCode?: CurrencyCode | string
  readonly includeConditional?: boolean
}

export interface ContractFinanceMaterializationOptions extends ContractFinancialScheduleQuery {
  /** The contract model has no payment dates, so this policy must be explicit. */
  readonly dueDatePolicy: 'ON_RECOGNITION'
  readonly ledger: NonNullable<EconomicEventAdapterOptions['ledger']>
  readonly materializeSubledger?: boolean
}

export interface ContractFinanceMaterialization {
  readonly status: 'accepted' | 'alreadyProcessed' | 'rejected'
  readonly world: GameWorld
  readonly date: GameDate
  readonly entries: readonly ContractFinancialScheduleEntry[]
  readonly events: readonly ReturnType<typeof createAuthorizedEconomicEvent>[]
  readonly results: readonly EconomicEventAdapterResult[]
  readonly error?: string
}

export interface ContractPayrollTotal {
  readonly currencyCode: CurrencyCode
  readonly minorUnits: number
}

const PLAYER_EVENT_TYPE = 'CONTRACT_PLAYER_SALARY_DUE' as const
const STAFF_EVENT_TYPE = 'STAFF_CONTRACT_EXPENSE_DUE' as const
const PAYROLL_EVENT_CATEGORIES = new Set<string>([PLAYER_EVENT_TYPE, STAFF_EVENT_TYPE])

export function getContractFinancialSchedule(world: GameWorld, query: ContractFinancialScheduleQuery): readonly ContractFinancialScheduleEntry[] {
  const contracts = selectContracts(world, query)
  const entries = contracts.flatMap((source) => buildEntries(world, source, query)).filter((entry) => query.includeConditional !== false || entry.compensationStatus === 'GUARANTEED')
  return Object.freeze(entries.sort((left, right) => compareGameDates(left.effectiveOn, right.effectiveOn) || left.id.localeCompare(right.id)))
}

export function materializeContractFinanceForDate(world: GameWorld, dateInput: GameDate | string, query: ContractFinanceMaterializationOptions): ContractFinanceMaterialization {
  const date = parseGameDate(dateInput)
  if (query.dueDatePolicy !== 'ON_RECOGNITION') throw new TypeError('Contract finance materialization requires an explicit supported dueDatePolicy')
  const entries = getContractFinancialSchedule(world, { ...query, includeConditional: true }).filter((entry) => entry.effectiveOn === date && entry.compensationStatus === 'GUARANTEED')
  let currentWorld = world
  const events: ReturnType<typeof createAuthorizedEconomicEvent>[] = []
  const results: EconomicEventAdapterResult[] = []
  for (const entry of entries) {
    const event = createAuthorizedEconomicEvent({
      id: `contract-financial-event:${entry.id}`,
      eventType: entry.sourceContractType === 'PLAYER' ? PLAYER_EVENT_TYPE : STAFF_EVENT_TYPE,
      sourceAuthority: 'CONTRACT',
      sourceEntityId: entry.contractId,
      organizationId: entry.organizationId,
      effectiveOn: entry.effectiveOn,
      dueOn: date,
      amount: entry.amount,
      provenance: entry.provenance,
      idempotencyKey: entry.id,
      counterparty: { kind: 'PERSON', id: entry.beneficiaryId, label: entry.sourceContractType === 'PLAYER' ? 'Contracted player' : 'Contracted staff' },
      contractId: entry.sourceContractType === 'PLAYER' ? contractIdFromString(entry.contractId) : null,
      teamId: entry.teamId,
      organizationSectionId: entry.organizationSectionId,
      dimensions: entry.sourceContractType === 'PLAYER'
        ? { ...entry.dimensions, contractId: contractIdFromString(entry.contractId) }
        : { teamId: entry.teamId, organizationSectionId: entry.organizationSectionId, reference: { kind: 'STAFF_CONTRACT', id: entry.contractId } },
    })
    const result = processContractEconomicEvent(currentWorld, event, { recognize: true, materializeSubledger: query.materializeSubledger ?? true, ledger: query.ledger })
    events.push(event)
    results.push(result)
    if (result.status === 'rejected') return Object.freeze({ status: 'rejected', world, date, entries, events: Object.freeze(events), results: Object.freeze(results), error: result.error })
    currentWorld = result.world
  }
  const status = results.some((result) => result.status === 'accepted') ? 'accepted' : results.length > 0 ? 'alreadyProcessed' : 'accepted'
  return Object.freeze({ status, world: currentWorld, date, entries, events: Object.freeze(events), results: Object.freeze(results) })
}

export function getContractualPayrollCommitted(world: GameWorld, organizationId: OrganizationId | string, asOfDate: GameDate | string, options: Omit<ContractFinancialScheduleQuery, 'organizationId'> = {}): readonly ContractPayrollTotal[] {
  const date = parseGameDate(asOfDate)
  return totals(getContractFinancialSchedule(world, { ...options, organizationId, includeConditional: false }).filter((entry) => compareGameDates(entry.period.endsOn, date) > 0))
}

export function getPlayerPayrollCommitted(world: GameWorld, organizationId: OrganizationId | string, asOfDate: GameDate | string, options: Omit<ContractFinancialScheduleQuery, 'organizationId'> = {}): readonly ContractPayrollTotal[] {
  return totals(scheduleForOrganization(world, organizationId, asOfDate, options).filter((entry) => entry.category === 'PLAYER_SALARY' && entry.compensationStatus === 'GUARANTEED'))
}

export function getStaffPayrollCommitted(world: GameWorld, organizationId: OrganizationId | string, asOfDate: GameDate | string, options: Omit<ContractFinancialScheduleQuery, 'organizationId'> = {}): readonly ContractPayrollTotal[] {
  return totals(scheduleForOrganization(world, organizationId, asOfDate, options).filter((entry) => entry.category === 'STAFF_SALARY' && entry.compensationStatus === 'GUARANTEED'))
}

export function getPayrollRecognizedYtd(world: GameWorld, organizationId: OrganizationId | string, asOfDate: GameDate | string = world.currentDate): readonly ContractPayrollTotal[] {
  const date = parseGameDate(asOfDate)
  return totals(payrollRecognitions(world, organizationId, date).filter((item) => item.recognizedOn.slice(0, 4) === date.slice(0, 4)))
}

export function getPayrollRecognizedByPeriod(world: GameWorld, organizationId: OrganizationId | string, from: GameDate | string, to: GameDate | string): readonly ExpenseRecognition[] {
  return Object.freeze(getExpenseRecognitionsBetween(world, organizationId, from, to).filter(isPayrollRecognition))
}

export function getFutureContractCommitmentsBySeason(world: GameWorld, organizationId: OrganizationId | string, asOfDate: GameDate | string, seasonId: SeasonId | string, options: Omit<ContractFinancialScheduleQuery, 'organizationId'> = {}): readonly ContractFinancialScheduleEntry[] {
  const date = parseGameDate(asOfDate)
  const normalizedSeasonId = seasonIdFromString(seasonId)
  return Object.freeze(scheduleForOrganization(world, organizationId, date, options).filter((entry) => entry.compensationStatus === 'GUARANTEED' && entry.seasonId === normalizedSeasonId && compareGameDates(entry.effectiveOn, date) > 0))
}

export function getFutureContractCommitmentsByContract(world: GameWorld, organizationId: OrganizationId | string, asOfDate: GameDate | string, contractId: string, options: Omit<ContractFinancialScheduleQuery, 'organizationId' | 'contractId'> = {}): readonly ContractFinancialScheduleEntry[] {
  const date = parseGameDate(asOfDate)
  return Object.freeze(getContractFinancialSchedule(world, { ...options, organizationId, contractId, includeConditional: false }).filter((entry) => compareGameDates(entry.effectiveOn, date) > 0))
}

export function getFutureContractCommitmentsByPerson(world: GameWorld, organizationId: OrganizationId | string, asOfDate: GameDate | string, beneficiaryId: string, options: Omit<ContractFinancialScheduleQuery, 'organizationId'> = {}): readonly ContractFinancialScheduleEntry[] {
  const date = parseGameDate(asOfDate)
  return Object.freeze(scheduleForOrganization(world, organizationId, date, options).filter((entry) => entry.compensationStatus === 'GUARANTEED' && entry.beneficiaryId === beneficiaryId && compareGameDates(entry.effectiveOn, date) > 0))
}

export function getGuaranteedPayrollCommitments(world: GameWorld, organizationId: OrganizationId | string, asOfDate: GameDate | string, options: Omit<ContractFinancialScheduleQuery, 'organizationId'> = {}): readonly ContractFinancialScheduleEntry[] {
  const date = parseGameDate(asOfDate)
  return Object.freeze(scheduleForOrganization(world, organizationId, date, options).filter((entry) => entry.compensationStatus === 'GUARANTEED' && compareGameDates(entry.period.endsOn, date) > 0))
}

export function getConditionalPayrollExposure(world: GameWorld, organizationId: OrganizationId | string, asOfDate: GameDate | string, options: Omit<ContractFinancialScheduleQuery, 'organizationId'> = {}): readonly ContractFinancialScheduleEntry[] {
  const date = parseGameDate(asOfDate)
  return Object.freeze(scheduleForOrganization(world, organizationId, date, { ...options, includeConditional: true }).filter((entry) => entry.compensationStatus === 'CONDITIONAL' && compareGameDates(entry.period.endsOn, date) > 0))
}

export function getUnpaidRecognizedCompensation(world: GameWorld, organizationId: OrganizationId | string, asOfDate: GameDate | string = world.currentDate): readonly ExpenseRecognition[] {
  return Object.freeze(payrollRecognitions(world, organizationId, parseGameDate(asOfDate)).filter((item) => item.payableId !== null && getPayableRemaining(world, item.payableId, asOfDate).minorUnits > 0))
}

export function getPaidCompensation(world: GameWorld, organizationId: OrganizationId | string, asOfDate: GameDate | string = world.currentDate): readonly ExpenseRecognition[] {
  return Object.freeze(payrollRecognitions(world, organizationId, parseGameDate(asOfDate)).filter((item) => item.payableId !== null && getPayableRemaining(world, item.payableId, asOfDate).minorUnits === 0))
}

export function getPayrollByTeam(world: GameWorld, organizationId: OrganizationId | string, teamId: TeamId | string, asOfDate: GameDate | string, options: Omit<ContractFinancialScheduleQuery, 'organizationId' | 'teamId'> = {}): readonly ContractPayrollTotal[] {
  return totals(getGuaranteedPayrollCommitments(world, organizationId, asOfDate, { ...options, teamId }))
}

export function getPayrollBySection(world: GameWorld, organizationId: OrganizationId | string, sectionId: OrganizationSectionId | string, asOfDate: GameDate | string, options: Omit<ContractFinancialScheduleQuery, 'organizationId'> = {}): readonly ContractPayrollTotal[] {
  return totals(getGuaranteedPayrollCommitments(world, organizationId, asOfDate, options).filter((entry) => entry.organizationSectionId === organizationSectionIdFromString(sectionId)))
}

export function getContractualPayrollBySeason(world: GameWorld, organizationId: OrganizationId | string, seasonId: SeasonId | string, options: Omit<ContractFinancialScheduleQuery, 'organizationId'> = {}): readonly ContractPayrollTotal[] {
  return totals(getContractFinancialSchedule(world, { ...options, organizationId, includeConditional: false }).filter((entry) => entry.compensationStatus === 'GUARANTEED' && entry.seasonId === seasonIdFromString(seasonId)))
}

export function getCurrentSeasonContractualCost(world: GameWorld, organizationId: OrganizationId | string, options: Omit<ContractFinancialScheduleQuery, 'organizationId'> = {}): readonly ContractPayrollTotal[] {
  return getContractualPayrollBySeason(world, organizationId, world.currentSeasonId, options)
}

export function getNextSeasonCommittedCost(world: GameWorld, organizationId: OrganizationId | string, options: Omit<ContractFinancialScheduleQuery, 'organizationId'> = {}): readonly ContractPayrollTotal[] {
  const current = world.seasons[world.currentSeasonId]
  if (current === undefined) return Object.freeze([])
  const next = Object.values(world.seasons).filter((season) => season.competitionId === current.competitionId && compareGameDates(season.startDate, current.startDate) > 0).sort((left, right) => compareGameDates(left.startDate, right.startDate) || String(left.id).localeCompare(String(right.id)))[0]
  return next === undefined ? Object.freeze([]) : getContractualPayrollBySeason(world, organizationId, next.id, options)
}

function selectContracts(world: GameWorld, query: ContractFinancialScheduleQuery): readonly SourceContract[] {
  const organizationId = query.organizationId === undefined ? undefined : organizationIdFromString(query.organizationId)
  const teamId = query.teamId === undefined ? undefined : teamIdFromString(query.teamId)
  const contractId = query.contractId === undefined ? undefined : String(query.contractId)
  if (organizationId === undefined && teamId === undefined && contractId === undefined) throw new RangeError('Contract financial schedule requires an Organization, Team, or Contract scope')
  const player = Object.values(world.contractsById).filter((contract) => (contractId === undefined || String(contract.id) === contractId) && (teamId === undefined || contract.teamId === teamId) && belongsToOrganization(world, contract.teamId, organizationId)).map((contract) => ({ sourceContractType: 'PLAYER' as const, contract, contractId: String(contract.id), beneficiaryId: String(world.players[contract.playerId]?.personId ?? contract.playerId), teamId: contract.teamId, category: 'PLAYER_SALARY' as const }))
  const staff = Object.values(world.staffContractsById).filter((contract) => (contractId === undefined || String(contract.id) === contractId) && (teamId === undefined || contract.teamId === teamId) && belongsToOrganization(world, contract.teamId, organizationId)).map((contract) => ({ sourceContractType: 'STAFF' as const, contract, contractId: String(contract.id), beneficiaryId: String(contract.staffId), teamId: contract.teamId, category: 'STAFF_SALARY' as const }))
  return Object.freeze([...player, ...staff].sort((left, right) => left.contractId.localeCompare(right.contractId)))
}

type SourceContract =
  | { readonly sourceContractType: 'PLAYER'; readonly contract: PlayerContract; readonly contractId: string; readonly beneficiaryId: string; readonly teamId: TeamId; readonly category: 'PLAYER_SALARY' }
  | { readonly sourceContractType: 'STAFF'; readonly contract: StaffContract; readonly contractId: string; readonly beneficiaryId: string; readonly teamId: TeamId; readonly category: 'STAFF_SALARY' }

function buildEntries(world: GameWorld, source: SourceContract, query: ContractFinancialScheduleQuery): readonly ContractFinancialScheduleEntry[] {
  const organizationId = world.teams[source.teamId]?.organizationId
  if (organizationId === undefined) throw new Error(`Contract financial schedule Team ${source.teamId} is missing`)
  const currencyCode = resolveCurrencyCode(world, organizationId, query.currencyCode)
  const contractEnd = source.sourceContractType === 'PLAYER'
    ? earliest(source.contract.term.expiresOn, source.contract.termination?.terminatedOn)
    : earliest(source.contract.term.expiresOn, source.contract.termination?.effectiveOn)
  const team = world.teams[source.teamId]!
  const periods = annualPeriods(source.contract.term.startsOn, contractEnd)
  return Object.freeze(periods.flatMap((period, yearIndex) => {
    const compensation = source.sourceContractType === 'PLAYER' ? getContractYearCompensation(source.contract, period.startsOn) : { cashSalary: source.contract.compensation.annualSalary, guaranteedAmount: source.contract.compensation.annualSalary }
    const guaranteed = compensation.guaranteedAmount
    const conditional = compensation.cashSalary - compensation.guaranteedAmount
    const values: { amount: number; status: ContractFinancialCompensationStatus; sourceTerm: string }[] = []
    if (guaranteed > 0) values.push({ amount: guaranteed, status: 'GUARANTEED', sourceTerm: source.sourceContractType === 'PLAYER' && source.contract.compensation.years !== undefined ? `compensation.years[${yearIndex}].guaranteedAmount` : 'compensation.annualSalary' })
    if (conditional > 0) values.push({ amount: conditional, status: 'CONDITIONAL', sourceTerm: `compensation.years[${yearIndex}].cashSalary-guaranteedAmount` })
    return values.map((value) => {
      const seasonId = findSeasonForPeriod(world, source.teamId, period.startsOn)
      const id = `contract-schedule:${source.sourceContractType.toLowerCase()}:${source.contractId}:year:${yearIndex + 1}:${value.status.toLowerCase()}`
      const dimensions = source.sourceContractType === 'PLAYER'
        ? { teamId: source.teamId, organizationSectionId: team.organizationSectionId, contractId: contractIdFromString(source.contractId) }
        : { teamId: source.teamId, organizationSectionId: team.organizationSectionId, reference: { kind: 'STAFF_CONTRACT', id: source.contractId } }
      return Object.freeze({ id, contractId: source.contractId, sourceContractType: source.sourceContractType, organizationId, beneficiaryId: source.beneficiaryId, teamId: source.teamId, organizationSectionId: team.organizationSectionId, category: source.category, amount: createMoney({ currencyCode, minorUnits: value.amount }), compensationStatus: value.status, sourceTerm: value.sourceTerm, seasonId, period, effectiveOn: period.startsOn, dueOn: null, provenance: Object.freeze({ kind: 'CONTRACT_FINANCIAL_SCHEDULE', id, description: `Derived from ${source.sourceContractType.toLowerCase()} Contract terms` }), dimensions: Object.freeze(dimensions) })
    })
  }))
}

function scheduleForOrganization(world: GameWorld, organizationId: OrganizationId | string, asOfDate: GameDate | string, options: Omit<ContractFinancialScheduleQuery, 'organizationId'>): readonly ContractFinancialScheduleEntry[] {
  return getContractFinancialSchedule(world, { ...options, organizationId, includeConditional: true }).filter((entry) => compareGameDates(entry.period.endsOn, parseGameDate(asOfDate)) > 0)
}

function payrollRecognitions(world: GameWorld, organizationId: OrganizationId | string, asOfDate: GameDate): readonly ExpenseRecognition[] {
  return getExpenseRecognitionsAsOfDate(world, organizationId, asOfDate).filter(isPayrollRecognition)
}

function isPayrollRecognition(item: ExpenseRecognition): boolean {
  return PAYROLL_EVENT_CATEGORIES.has(item.category)
}

function totals(entries: readonly { readonly amount: Money }[]): readonly ContractPayrollTotal[] {
  const totals = new Map<CurrencyCode, number>()
  for (const entry of entries) totals.set(entry.amount.currencyCode, (totals.get(entry.amount.currencyCode) ?? 0) + entry.amount.minorUnits)
  return Object.freeze([...totals.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([currencyCode, minorUnits]) => ({ currencyCode, minorUnits })))
}

function resolveCurrencyCode(world: GameWorld, organizationId: OrganizationId, requested: CurrencyCode | string | undefined): CurrencyCode {
  if (requested !== undefined) return createCurrencyCode(requested)
  const profile = world.organizationFinancialProfilesById[organizationId]
  if (profile === undefined) throw new RangeError(`Contract financial schedule requires currencyCode because Organization ${organizationId} has no financial profile`)
  return profile.baseCurrencyCode
}

function belongsToOrganization(world: GameWorld, teamId: TeamId, organizationId: OrganizationId | undefined): boolean {
  const team = world.teams[teamId]
  if (team === undefined) throw new Error(`Contract financial schedule Team ${teamId} is missing`)
  return organizationId === undefined || team.organizationId === organizationId
}

function annualPeriods(startsOn: GameDate, endsOn: GameDate): readonly ContractFinancialSchedulePeriod[] {
  const periods: ContractFinancialSchedulePeriod[] = []
  let start = startsOn
  while (compareGameDates(start, endsOn) < 0) {
    const next = addCalendarYears(start, 1)
    if (compareGameDates(next, endsOn) > 0) break
    periods.push(Object.freeze({ startsOn: start, endsOn: next }))
    start = next
  }
  return Object.freeze(periods)
}

function findSeasonForPeriod(world: GameWorld, teamId: TeamId, date: GameDate): SeasonId | null {
  const current = world.seasons[world.currentSeasonId]
  const currentParticipants = current === undefined ? [] : current.participantTeamIds ?? world.competitions[current.competitionId]?.participantTeamIds ?? []
  const preferredCompetitionId = current !== undefined && currentParticipants.includes(teamId) ? current.competitionId : undefined
  const candidates = Object.values(world.seasons).filter((season) => (preferredCompetitionId === undefined || season.competitionId === preferredCompetitionId) && season.startDate <= date && date <= season.endDate && (season.participantTeamIds ?? world.competitions[season.competitionId]?.participantTeamIds ?? []).includes(teamId)).sort((left, right) => {
    const currentWeight = (season: typeof left) => season.id === current?.id ? 0 : 1
    return currentWeight(left) - currentWeight(right) || compareGameDates(left.startDate, right.startDate) || String(left.id).localeCompare(String(right.id))
  })
  return candidates[0] === undefined ? null : seasonIdFromString(candidates[0].id)
}

function earliest(first: GameDate, second: GameDate | undefined): GameDate {
  return second === undefined || compareGameDates(first, second) <= 0 ? first : second
}

function addCalendarYears(date: GameDate, amount: number): GameDate {
  const [yearText, monthText, dayText] = date.split('-')
  const year = Number(yearText) + amount
  const month = Number(monthText)
  const day = Math.min(Number(dayText), daysInMonth(year, month))
  return createGameDate(year, month, day)
}
