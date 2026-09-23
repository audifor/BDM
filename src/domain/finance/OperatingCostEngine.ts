import { addDays, addYears, compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import type { GameWorld } from '@/domain/world'
import type { CompetitionId, OrganizationId, OrganizationSectionId, TeamId } from '@/domain/ids'
import { createAuthorizedEconomicEvent, processOperatingCostEconomicEvent, type EconomicEventAdapterOptions, type EconomicEventAdapterResult } from './EconomicEventAdapters'
import { createFinancialSource, createMoney, type CurrencyCode, type FinancialDimensions, type FinancialSource, type Money } from './FinancialLedger'
import { createTreasuryCounterparty, getPayableSettledAmount, type TreasuryCounterparty } from './Treasury'
import type { ExpenseRecognition } from './Recognition'

export const OPERATING_COST_CATEGORIES = ['FACILITY', 'VENUE', 'TRAVEL', 'ACCOMMODATION', 'MEDICAL', 'SCOUTING', 'ACADEMY', 'EQUIPMENT', 'SECURITY', 'INSURANCE', 'ADMINISTRATION', 'UTILITIES', 'EXTERNAL_SERVICES', 'COMPETITION', 'MATCH_OPERATIONS', 'OTHER_OPERATING'] as const
export type OperatingCostCategory = typeof OPERATING_COST_CATEGORIES[number]
export type OperatingCostNature = 'OPERATING' | 'CAPITAL'
export type OperatingCostStatus = 'ACTIVE' | 'INACTIVE'
export type OperatingCostSourceAuthority = 'FACILITY' | 'COMPETITION' | 'TRAVEL' | 'MEDICAL' | 'SCOUTING' | 'ACADEMY' | 'ORGANIZATION' | 'MANUAL_SYSTEM_ACTION'
export type OperatingCostGenerationPolicy = 'ONE_OFF' | 'ANNUAL' | 'SEASONAL' | 'EXPLICIT_SCHEDULE'
export type OperatingCostDueDatePolicy = 'ON_RECOGNITION' | 'NO_DUE_DATE'

export interface OperatingCostPaymentTerm {
  readonly recognitionOn: GameDate
  readonly dueOn: GameDate | null
  readonly amount: Money
}

export interface OperatingCostSource {
  readonly id: string
  readonly organizationId: OrganizationId
  readonly category: OperatingCostCategory
  readonly costNature: OperatingCostNature
  readonly currencyCode: CurrencyCode
  readonly amount: Money
  readonly startsOn: GameDate
  readonly endsOn: GameDate
  readonly sourceAuthority: OperatingCostSourceAuthority
  readonly status: OperatingCostStatus
  readonly generationPolicy: OperatingCostGenerationPolicy
  readonly dueDatePolicy: OperatingCostDueDatePolicy
  readonly teamId: TeamId | null
  readonly organizationSectionId: OrganizationSectionId | null
  readonly competitionId: CompetitionId | null
  readonly facilityId: string | null
  readonly matchId: string | null
  readonly counterparty: TreasuryCounterparty | null
  readonly paymentSchedule: readonly OperatingCostPaymentTerm[]
  readonly provenance: FinancialSource
}

export interface AuthorizedOperatingCostFact {
  readonly id: string
  readonly authority: OperatingCostSourceAuthority
  readonly sourceEntityId: string
  readonly organizationId: OrganizationId
  readonly category: OperatingCostCategory
  readonly costNature: OperatingCostNature
  readonly amount: Money
  readonly incurredOn: GameDate
  readonly dueOn: GameDate | null
  readonly teamId: TeamId | null
  readonly organizationSectionId: OrganizationSectionId | null
  readonly competitionId: CompetitionId | null
  readonly facilityId: string | null
  readonly matchId: string | null
  readonly counterparty: TreasuryCounterparty | null
  readonly dimensions: FinancialDimensions | null
  readonly provenance: FinancialSource
}

export interface OperatingCostScheduleEntry {
  readonly id: string
  readonly sourceId: string | null
  readonly factId: string | null
  readonly organizationId: OrganizationId
  readonly category: OperatingCostCategory
  readonly costNature: OperatingCostNature
  readonly amount: Money
  readonly periodStartsOn: GameDate
  readonly periodEndsOn: GameDate
  readonly recognitionOn: GameDate
  readonly dueOn: GameDate | null
  readonly seasonId: string | null
  readonly teamId: TeamId | null
  readonly organizationSectionId: OrganizationSectionId | null
  readonly competitionId: CompetitionId | null
  readonly facilityId: string | null
  readonly matchId: string | null
  readonly counterparty: TreasuryCounterparty | null
  readonly provenance: FinancialSource
}

export interface OperatingCostMaterialization {
  readonly status: 'accepted' | 'alreadyProcessed' | 'rejected'
  readonly world: GameWorld
  readonly date: GameDate
  readonly entries: readonly OperatingCostScheduleEntry[]
  readonly events: readonly ReturnType<typeof createAuthorizedEconomicEvent>[]
  readonly results: readonly EconomicEventAdapterResult[]
  readonly error?: string
}

export function createOperatingCostSource(input: {
  readonly id: string
  readonly organizationId: OrganizationId | string
  readonly category: OperatingCostCategory
  readonly costNature?: OperatingCostNature
  readonly currencyCode: string
  readonly amount: Money | { readonly currencyCode: string; readonly minorUnits: number }
  readonly startsOn: GameDate | string
  readonly endsOn: GameDate | string
  readonly sourceAuthority: OperatingCostSourceAuthority
  readonly status?: OperatingCostStatus
  readonly generationPolicy: OperatingCostGenerationPolicy
  readonly dueDatePolicy?: OperatingCostDueDatePolicy
  readonly teamId?: TeamId | string | null
  readonly organizationSectionId?: OrganizationSectionId | string | null
  readonly competitionId?: CompetitionId | string | null
  readonly facilityId?: string | null
  readonly matchId?: string | null
  readonly counterparty?: TreasuryCounterparty | null
  readonly paymentSchedule?: readonly { readonly recognitionOn: GameDate | string; readonly dueOn?: GameDate | string | null; readonly amount: Money | { readonly currencyCode: string; readonly minorUnits: number } }[]
  readonly provenance: FinancialSource
}): OperatingCostSource {
  validateCategory(input.category)
  validateSourceAuthority(input.sourceAuthority)
  validateSourceConfiguration(input.costNature ?? 'OPERATING', input.status ?? 'ACTIVE', input.generationPolicy, input.dueDatePolicy ?? 'NO_DUE_DATE')
  const startsOn = parseGameDate(input.startsOn); const endsOn = parseGameDate(input.endsOn)
  if (compareGameDates(endsOn, startsOn) < 0) throw new RangeError('Operating cost source endsOn cannot precede startsOn')
  const amount = createMoney(input.amount)
  if (amount.minorUnits <= 0) throw new RangeError('Operating cost source amount must be positive')
  if (amount.currencyCode !== input.currencyCode) throw new RangeError('Operating cost source currencyCode must match amount currency')
  if (input.generationPolicy === 'EXPLICIT_SCHEDULE' && (input.paymentSchedule === undefined || input.paymentSchedule.length === 0)) throw new TypeError('Explicit operating cost schedule requires payment terms')
  const paymentSchedule = Object.freeze((input.paymentSchedule ?? []).map((term) => {
    const recognitionOn = parseGameDate(term.recognitionOn); const dueOn = term.dueOn === undefined || term.dueOn === null ? null : parseGameDate(term.dueOn); const termAmount = createMoney(term.amount)
    if (termAmount.minorUnits <= 0) throw new RangeError('Operating cost payment term amount must be positive')
    if (termAmount.currencyCode !== amount.currencyCode) throw new RangeError('Operating cost payment terms must use the source currency')
    if (compareGameDates(recognitionOn, startsOn) < 0 || compareGameDates(recognitionOn, endsOn) > 0) throw new RangeError('Operating cost payment term is outside its active period')
    if (dueOn !== null && compareGameDates(dueOn, recognitionOn) < 0) throw new RangeError('Operating cost dueOn cannot precede recognitionOn')
    return Object.freeze({ recognitionOn, dueOn, amount: termAmount })
  }))
  return Object.freeze({ id: nonEmpty(input.id, 'Operating cost source id'), organizationId: String(input.organizationId) as OrganizationId, category: input.category, costNature: input.costNature ?? 'OPERATING', currencyCode: amount.currencyCode, amount, startsOn, endsOn, sourceAuthority: input.sourceAuthority, status: input.status ?? 'ACTIVE', generationPolicy: input.generationPolicy, dueDatePolicy: input.dueDatePolicy ?? 'NO_DUE_DATE', teamId: nullableId(input.teamId) as TeamId | null, organizationSectionId: nullableId(input.organizationSectionId) as OrganizationSectionId | null, competitionId: nullableId(input.competitionId) as CompetitionId | null, facilityId: nullableText(input.facilityId), matchId: nullableText(input.matchId), counterparty: input.counterparty === undefined || input.counterparty === null ? null : createTreasuryCounterparty(input.counterparty), paymentSchedule, provenance: createFinancialSource(input.provenance) })
}

export function createAuthorizedOperatingCostFact(input: {
  readonly id: string
  readonly authority: OperatingCostSourceAuthority
  readonly sourceEntityId: string
  readonly organizationId: OrganizationId | string
  readonly category: OperatingCostCategory
  readonly costNature?: OperatingCostNature
  readonly amount: Money | { readonly currencyCode: string; readonly minorUnits: number }
  readonly incurredOn: GameDate | string
  readonly dueOn?: GameDate | string | null
  readonly teamId?: TeamId | string | null
  readonly organizationSectionId?: OrganizationSectionId | string | null
  readonly competitionId?: CompetitionId | string | null
  readonly facilityId?: string | null
  readonly matchId?: string | null
  readonly counterparty?: TreasuryCounterparty | null
  readonly dimensions?: FinancialDimensions | null
  readonly provenance: FinancialSource
}): AuthorizedOperatingCostFact {
  validateCategory(input.category)
  validateSourceAuthority(input.authority)
  if (input.costNature !== undefined && input.costNature !== 'OPERATING' && input.costNature !== 'CAPITAL') throw new TypeError('Operating cost nature is invalid')
  const incurredOn = parseGameDate(input.incurredOn); const dueOn = input.dueOn === undefined || input.dueOn === null ? null : parseGameDate(input.dueOn); const amount = createMoney(input.amount)
  if (amount.minorUnits <= 0) throw new RangeError('Authorized operating cost amount must be positive')
  if (dueOn !== null && compareGameDates(dueOn, incurredOn) < 0) throw new RangeError('Authorized operating cost dueOn cannot precede incurredOn')
  return Object.freeze({ id: nonEmpty(input.id, 'Operating cost fact id'), authority: input.authority, sourceEntityId: nonEmpty(input.sourceEntityId, 'Operating cost fact sourceEntityId'), organizationId: String(input.organizationId) as OrganizationId, category: input.category, costNature: input.costNature ?? 'OPERATING', amount, incurredOn, dueOn, teamId: nullableId(input.teamId) as TeamId | null, organizationSectionId: nullableId(input.organizationSectionId) as OrganizationSectionId | null, competitionId: nullableId(input.competitionId) as CompetitionId | null, facilityId: nullableText(input.facilityId), matchId: nullableText(input.matchId), counterparty: input.counterparty === undefined || input.counterparty === null ? null : createTreasuryCounterparty(input.counterparty), dimensions: input.dimensions === undefined || input.dimensions === null ? null : Object.freeze({ ...input.dimensions }), provenance: createFinancialSource(input.provenance) })
}

export const createTravelCostFact = (input: Omit<Parameters<typeof createAuthorizedOperatingCostFact>[0], 'category'>) => createAuthorizedOperatingCostFact({ ...input, category: 'TRAVEL' })
export const createMedicalCostFact = (input: Omit<Parameters<typeof createAuthorizedOperatingCostFact>[0], 'category'>) => createAuthorizedOperatingCostFact({ ...input, category: 'MEDICAL' })

export function getOperatingCostSourcesByProvenance(world: GameWorld, organizationId: OrganizationId | string, provenance: FinancialSource): readonly OperatingCostSource[] { return Object.freeze(Object.values(world.operatingCostSourcesById).filter((source) => source.organizationId === organizationId && source.provenance.kind === provenance.kind && source.provenance.id === provenance.id).sort((left, right) => left.id.localeCompare(right.id))) }
export function getAuthorizedOperatingCostFactsByProvenance(world: GameWorld, organizationId: OrganizationId | string, provenance: FinancialSource): readonly AuthorizedOperatingCostFact[] { return Object.freeze(Object.values(world.operatingCostFactsById).filter((fact) => fact.organizationId === organizationId && fact.provenance.kind === provenance.kind && fact.provenance.id === provenance.id).sort((left, right) => left.id.localeCompare(right.id))) }

export function getActiveOperatingCostSources(world: GameWorld, organizationId: OrganizationId | string, asOfDate: GameDate | string = world.currentDate): readonly OperatingCostSource[] {
  const date = parseGameDate(asOfDate)
  return Object.freeze(Object.values(world.operatingCostSourcesById).filter((source) => source.organizationId === organizationId && source.status === 'ACTIVE' && source.costNature === 'OPERATING' && compareGameDates(source.startsOn, date) <= 0 && compareGameDates(source.endsOn, date) >= 0).sort((left, right) => left.id.localeCompare(right.id)))
}

export function getOperatingCostSchedule(world: GameWorld, input: { readonly organizationId?: OrganizationId | string; readonly sourceId?: string; readonly factId?: string; readonly from?: GameDate | string; readonly to?: GameDate | string; readonly currencyCode?: string; readonly category?: OperatingCostCategory }): readonly OperatingCostScheduleEntry[] {
  const sourceEntries = Object.values(world.operatingCostSourcesById).filter((source) => (input.organizationId === undefined || source.organizationId === input.organizationId) && (input.sourceId === undefined || source.id === input.sourceId) && (input.currencyCode === undefined || source.currencyCode === input.currencyCode) && (input.category === undefined || source.category === input.category)).flatMap((source) => deriveSourceSchedule(world, source))
  const factEntries = Object.values(world.operatingCostFactsById).filter((fact) => (input.organizationId === undefined || fact.organizationId === input.organizationId) && (input.factId === undefined || fact.id === input.factId) && (input.currencyCode === undefined || fact.amount.currencyCode === input.currencyCode) && (input.category === undefined || fact.category === input.category)).map((fact) => factScheduleEntry(fact))
  return Object.freeze([...sourceEntries, ...factEntries].filter((entry) => (input.from === undefined || compareGameDates(entry.recognitionOn, parseGameDate(input.from)) >= 0) && (input.to === undefined || compareGameDates(entry.recognitionOn, parseGameDate(input.to)) <= 0)).sort((left, right) => compareGameDates(left.recognitionOn, right.recognitionOn) || left.id.localeCompare(right.id)))
}

export const getScheduledOperatingCosts = getOperatingCostSchedule

export function getFutureOperatingCostCommitments(world: GameWorld, organizationId: OrganizationId | string, asOfDate: GameDate | string = world.currentDate, currencyCode?: string): readonly OperatingCostScheduleEntry[] {
  const date = parseGameDate(asOfDate)
  return Object.freeze(getOperatingCostSchedule(world, { organizationId, currencyCode }).filter((entry) => entry.costNature === 'OPERATING' && compareGameDates(entry.recognitionOn, date) > 0 && isActiveOperatingCostEntry(world, entry) && !isOperatingCostEntryMaterialized(world, entry)))
}

export function getRecognizedOperatingExpense(world: GameWorld, organizationId: OrganizationId | string, asOfDate: GameDate | string = world.currentDate): readonly OperatingCostQueryTotal[] { return totalize(Object.values(world.expenseRecognitionsById).filter((item) => item.organizationId === organizationId && isOperatingCategory(item.category) && compareGameDates(item.recognizedOn, parseGameDate(asOfDate)) <= 0)) }
export function getOperatingExpenseYtd(world: GameWorld, organizationId: OrganizationId | string, asOfDate: GameDate | string = world.currentDate): readonly OperatingCostQueryTotal[] { const date = parseGameDate(asOfDate); return totalize(Object.values(world.expenseRecognitionsById).filter((item) => item.organizationId === organizationId && isOperatingCategory(item.category) && item.recognizedOn.slice(0, 4) === date.slice(0, 4) && compareGameDates(item.recognizedOn, date) <= 0)) }
export function getPaidOperatingExpenses(world: GameWorld, organizationId: OrganizationId | string, asOfDate: GameDate | string = world.currentDate): readonly OperatingCostQueryTotal[] { const date = parseGameDate(asOfDate); return totalize(Object.values(world.expenseRecognitionsById).filter((item) => item.organizationId === organizationId && isOperatingCategory(item.category) && item.payableId !== null && getPayableSettledAmount(world, item.payableId, date).minorUnits > 0).map((item) => ({ ...item, amount: getPayableSettledAmount(world, item.payableId!, date) }))) }
export function getUnpaidOperatingExpenses(world: GameWorld, organizationId: OrganizationId | string, asOfDate: GameDate | string = world.currentDate): readonly ExpenseRecognition[] { const date = parseGameDate(asOfDate); return Object.values(world.expenseRecognitionsById).filter((item) => item.organizationId === organizationId && isOperatingCategory(item.category) && item.payableId !== null && getPayableSettledAmount(world, item.payableId, date).minorUnits < item.amount.minorUnits) }
export function getOperatingExpenseByCategory(world: GameWorld, organizationId: OrganizationId | string, from: GameDate | string, to: GameDate | string): readonly OperatingCostBreakdown[] { return breakdown(world, organizationId, from, to, () => true, (item) => item.category) }
export function getOperatingExpenseByTeam(world: GameWorld, organizationId: OrganizationId | string, teamId: string, from: GameDate | string, to: GameDate | string): readonly OperatingCostQueryTotal[] { return totalize(Object.values(world.expenseRecognitionsById).filter((item) => item.organizationId === organizationId && isOperatingCategory(item.category) && item.dimensions?.teamId === teamId && inRange(item.recognizedOn, from, to))) }
export function getOperatingExpenseBySection(world: GameWorld, organizationId: OrganizationId | string, sectionId: string, from: GameDate | string, to: GameDate | string): readonly OperatingCostQueryTotal[] { return totalize(Object.values(world.expenseRecognitionsById).filter((item) => item.organizationId === organizationId && isOperatingCategory(item.category) && item.dimensions?.organizationSectionId === sectionId && inRange(item.recognizedOn, from, to))) }
export function getOperatingExpenseByCompetition(world: GameWorld, organizationId: OrganizationId | string, competitionId: string, from: GameDate | string, to: GameDate | string): readonly OperatingCostQueryTotal[] { return totalize(Object.values(world.expenseRecognitionsById).filter((item) => item.organizationId === organizationId && isOperatingCategory(item.category) && item.dimensions?.competitionId === competitionId && inRange(item.recognizedOn, from, to))) }
export function getOperatingExpenseByFacility(world: GameWorld, organizationId: OrganizationId | string, facilityId: string, from: GameDate | string, to: GameDate | string): readonly OperatingCostQueryTotal[] { return totalize(Object.values(world.expenseRecognitionsById).filter((item) => item.organizationId === organizationId && isOperatingCategory(item.category) && referenceMatches(world, item, 'FACILITY', facilityId) && inRange(item.recognizedOn, from, to))) }
export function getOperatingExpenseByMatch(world: GameWorld, organizationId: OrganizationId | string, matchId: string, from: GameDate | string, to: GameDate | string): readonly OperatingCostQueryTotal[] { return totalize(Object.values(world.expenseRecognitionsById).filter((item) => item.organizationId === organizationId && isOperatingCategory(item.category) && referenceMatches(world, item, 'MATCH', matchId) && inRange(item.recognizedOn, from, to))) }
export function getOperatingExpenseByCurrency(world: GameWorld, organizationId: OrganizationId | string, from: GameDate | string, to: GameDate | string): readonly OperatingCostQueryTotal[] { return totalize(Object.values(world.expenseRecognitionsById).filter((item) => item.organizationId === organizationId && isOperatingCategory(item.category) && inRange(item.recognizedOn, from, to))) }
export function getOperatingExpenseBySource(world: GameWorld, organizationId: OrganizationId | string, sourceId: string, from: GameDate | string, to: GameDate | string): readonly OperatingCostQueryTotal[] { return totalize(Object.values(world.expenseRecognitionsById).filter((item) => item.organizationId === organizationId && isOperatingCategory(item.category) && item.dimensions?.reference?.kind === 'OPERATING_COST_SOURCE' && item.dimensions.reference.id === sourceId && inRange(item.recognizedOn, from, to))) }
export function getOperatingExpenseByProvenance(world: GameWorld, organizationId: OrganizationId | string, provenance: FinancialSource, from: GameDate | string, to: GameDate | string): readonly OperatingCostQueryTotal[] { return totalize(Object.values(world.expenseRecognitionsById).filter((item) => item.organizationId === organizationId && isOperatingCategory(item.category) && item.provenance.kind === provenance.kind && item.provenance.id === provenance.id && inRange(item.recognizedOn, from, to))) }

export function materializeOperatingCostsForDate(world: GameWorld, dateInput: GameDate | string, options: { readonly organizationId: OrganizationId | string; readonly sourceId?: string; readonly factId?: string; readonly currencyCode?: string; readonly ledger: NonNullable<EconomicEventAdapterOptions['ledger']>; readonly materializeSubledger?: boolean }): OperatingCostMaterialization {
  const date = parseGameDate(dateInput)
  const entries = getOperatingCostSchedule(world, { organizationId: options.organizationId, sourceId: options.sourceId, factId: options.factId, currencyCode: options.currencyCode }).filter((entry) => entry.recognitionOn === date && entry.costNature === 'OPERATING' && isActiveOperatingCostEntry(world, entry))
  let currentWorld = world; const events: ReturnType<typeof createAuthorizedEconomicEvent>[] = []; const results: EconomicEventAdapterResult[] = []
  for (const entry of entries) {
    if (entry.dueOn === null) return materializationRejected(world, date, entries, events, results, `Operating cost entry ${entry.id} has no explicit due date`)
    const sourceEntityId = entry.factId ?? entry.sourceId!
    const reference = entry.factId === null ? { kind: 'OPERATING_COST_SOURCE', id: entry.sourceId! } : { kind: 'OPERATING_COST_FACT', id: entry.factId }
    const event = createAuthorizedEconomicEvent({ id: `operating-cost-event:${entry.id}`, eventType: 'OPERATING_COST_RECOGNITION', sourceAuthority: 'FUTURE_COST_ENGINE', sourceEntityId, organizationId: entry.organizationId, effectiveOn: entry.recognitionOn, dueOn: entry.dueOn, amount: entry.amount, provenance: entry.provenance, idempotencyKey: entry.id, expenseCategory: entry.category, counterparty: entry.counterparty, dimensions: { ...(entry.teamId === null ? {} : { teamId: entry.teamId }), ...(entry.organizationSectionId === null ? {} : { organizationSectionId: entry.organizationSectionId }), ...(entry.competitionId === null ? {} : { competitionId: entry.competitionId }), reference, }, teamId: entry.teamId, organizationSectionId: entry.organizationSectionId, competitionId: entry.competitionId })
    const result = processOperatingCostEconomicEvent(currentWorld, event, { recognize: true, materializeSubledger: options.materializeSubledger ?? true, ledger: options.ledger }); events.push(event); results.push(result)
    if (result.status === 'rejected') return materializationRejected(world, date, entries, events, results, result.error ?? 'Operating cost materialization rejected')
    currentWorld = result.world
  }
  return Object.freeze({ status: results.some((result) => result.status === 'accepted') ? 'accepted' : results.length > 0 ? 'alreadyProcessed' : 'accepted', world: currentWorld, date, entries, events: Object.freeze(events), results: Object.freeze(results) })
}

export function validateOperatingCostCollections(sources: readonly OperatingCostSource[], facts: readonly AuthorizedOperatingCostFact[], world: Pick<GameWorld, 'organizationsById' | 'teams' | 'organizationSectionsById' | 'competitions'>): void {
  const sourceIds = new Set<string>(); const factIds = new Set<string>()
  for (const source of sources) { if (sourceIds.has(source.id)) throw new Error(`Duplicate operating cost source ${source.id}`); sourceIds.add(source.id); validateOwnedDimensions(source.organizationId, source.teamId, source.organizationSectionId, source.competitionId, source.id, world); validateCounterpartyOrganization(source.organizationId, source.counterparty, source.id, world) }
  for (const fact of facts) { if (factIds.has(fact.id)) throw new Error(`Duplicate operating cost fact ${fact.id}`); factIds.add(fact.id); validateOwnedDimensions(fact.organizationId, fact.teamId, fact.organizationSectionId, fact.competitionId, fact.id, world); validateCounterpartyOrganization(fact.organizationId, fact.counterparty, fact.id, world) }
}

export function isOperatingCostEntryMaterialized(world: GameWorld, entry: OperatingCostScheduleEntry): boolean {
  const key = `FUTURE_COST_ENGINE:${entry.factId ?? entry.sourceId}:${entry.id}`
  return Object.values(world.financialCommitmentsById).some((item) => item.provenance.kind === 'AUTHORIZED_ECONOMIC_EVENT' && item.provenance.id === key) || Object.values(world.expenseRecognitionsById).some((item) => item.provenance.kind === 'AUTHORIZED_ECONOMIC_EVENT' && item.provenance.id === key)
}

export interface OperatingCostQueryTotal { readonly currencyCode: CurrencyCode; readonly minorUnits: number }
export interface OperatingCostBreakdown { readonly category: string; readonly currencyCode: CurrencyCode; readonly minorUnits: number }

function deriveSourceSchedule(world: GameWorld, source: OperatingCostSource): readonly OperatingCostScheduleEntry[] {
  if (source.generationPolicy === 'EXPLICIT_SCHEDULE') return Object.freeze(source.paymentSchedule.map((term, index) => sourceScheduleEntry(source, `explicit-${index + 1}`, term.recognitionOn, term.recognitionOn, term.recognitionOn, term.dueOn, null, term.amount)))
  if (source.generationPolicy === 'ONE_OFF') return Object.freeze([sourceScheduleEntry(source, 'one-off', source.startsOn, source.endsOn, source.startsOn, source.dueDatePolicy === 'ON_RECOGNITION' ? source.startsOn : null, null, source.amount)])
  if (source.generationPolicy === 'SEASONAL') { const seasons = Object.values(world.seasons).filter((season) => compareGameDates(season.endDate, source.startsOn) >= 0 && compareGameDates(season.startDate, source.endsOn) <= 0).sort((left, right) => compareGameDates(left.startDate, right.startDate) || String(left.id).localeCompare(String(right.id))); return Object.freeze(seasons.map((season, index) => { const start = maxDate(source.startsOn, season.startDate); const end = minDate(source.endsOn, season.endDate); return sourceScheduleEntry(source, `season-${index + 1}-${String(season.id)}`, start, end, start, source.dueDatePolicy === 'ON_RECOGNITION' ? start : null, String(season.id), source.amount) })) }
  const entries: OperatingCostScheduleEntry[] = []; let cursor = source.startsOn; let index = 0
  while (compareGameDates(cursor, source.endsOn) <= 0) { const end = minDate(source.endsOn, addDays(addYears(cursor, 1), -1)); entries.push(sourceScheduleEntry(source, `annual-${index + 1}`, cursor, end, cursor, source.dueDatePolicy === 'ON_RECOGNITION' ? cursor : null, null, source.amount)); cursor = addDays(end, 1); index += 1 }
  return Object.freeze(entries)
}

function sourceScheduleEntry(source: OperatingCostSource, suffix: string, periodStartsOn: GameDate, periodEndsOn: GameDate, recognitionOn: GameDate, dueOn: GameDate | null, seasonId: string | null, amount: Money): OperatingCostScheduleEntry { return Object.freeze({ id: `operating-cost-schedule:${source.id}:${suffix}`, sourceId: source.id, factId: null, organizationId: source.organizationId, category: source.category, costNature: source.costNature, amount, periodStartsOn, periodEndsOn, recognitionOn, dueOn, seasonId, teamId: source.teamId, organizationSectionId: source.organizationSectionId, competitionId: source.competitionId, facilityId: source.facilityId, matchId: source.matchId, counterparty: source.counterparty, provenance: { kind: 'OPERATING_COST_SOURCE_SCHEDULE', id: `${source.id}:${suffix}` } }) }
function factScheduleEntry(fact: AuthorizedOperatingCostFact): OperatingCostScheduleEntry { return Object.freeze({ id: `operating-cost-fact:${fact.id}`, sourceId: null, factId: fact.id, organizationId: fact.organizationId, category: fact.category, costNature: fact.costNature, amount: fact.amount, periodStartsOn: fact.incurredOn, periodEndsOn: fact.incurredOn, recognitionOn: fact.incurredOn, dueOn: fact.dueOn, seasonId: null, teamId: fact.teamId ?? fact.dimensions?.teamId ?? null, organizationSectionId: fact.organizationSectionId ?? fact.dimensions?.organizationSectionId ?? null, competitionId: fact.competitionId ?? fact.dimensions?.competitionId ?? null, facilityId: fact.facilityId, matchId: fact.matchId, counterparty: fact.counterparty, provenance: { kind: 'AUTHORIZED_OPERATING_COST_FACT', id: fact.id } }) }
function isActiveOperatingCostEntry(world: GameWorld, entry: OperatingCostScheduleEntry): boolean { return entry.factId !== null || world.operatingCostSourcesById[entry.sourceId!]?.status === 'ACTIVE' }
function isOperatingCategory(category: string): boolean { return (OPERATING_COST_CATEGORIES as readonly string[]).includes(category) }
function validateCategory(category: string): asserts category is OperatingCostCategory { if (!(OPERATING_COST_CATEGORIES as readonly string[]).includes(category)) throw new TypeError('Operating cost category is invalid'); if (category === 'PAYROLL' || category.includes('SALARY')) throw new TypeError('Operating cost sources cannot represent payroll') }
function validateSourceAuthority(authority: string): asserts authority is OperatingCostSourceAuthority { if (!['FACILITY', 'COMPETITION', 'TRAVEL', 'MEDICAL', 'SCOUTING', 'ACADEMY', 'ORGANIZATION', 'MANUAL_SYSTEM_ACTION'].includes(authority)) throw new TypeError('Operating cost source authority is invalid') }
function validateSourceConfiguration(costNature: string, status: string, generationPolicy: string, dueDatePolicy: string): void { if (costNature !== 'OPERATING' && costNature !== 'CAPITAL') throw new TypeError('Operating cost nature is invalid'); if (status !== 'ACTIVE' && status !== 'INACTIVE') throw new TypeError('Operating cost status is invalid'); if (!['ONE_OFF', 'ANNUAL', 'SEASONAL', 'EXPLICIT_SCHEDULE'].includes(generationPolicy)) throw new TypeError('Operating cost generation policy is invalid'); if (dueDatePolicy !== 'ON_RECOGNITION' && dueDatePolicy !== 'NO_DUE_DATE') throw new TypeError('Operating cost due-date policy is invalid') }
function validateOwnedDimensions(organizationId: OrganizationId, teamId: TeamId | null, sectionId: OrganizationSectionId | null, competitionId: CompetitionId | null, id: string, world: Pick<GameWorld, 'organizationsById' | 'teams' | 'organizationSectionsById' | 'competitions'>): void { if (world.organizationsById[organizationId] === undefined) throw new Error(`Operating cost ${id} references an unknown Organization`); if (teamId !== null && (world.teams[teamId] === undefined || world.teams[teamId]!.organizationId !== organizationId)) throw new Error(`Operating cost ${id} team dimension crosses organizations`); if (sectionId !== null && (world.organizationSectionsById[sectionId] === undefined || world.organizationSectionsById[sectionId]!.organizationId !== organizationId)) throw new Error(`Operating cost ${id} section dimension crosses organizations`); const competition = competitionId === null ? undefined : world.competitions[competitionId]; if (competitionId !== null && competition === undefined) throw new Error(`Operating cost ${id} references an unknown Competition`); if (competition !== undefined && teamId !== null && !competition.participantTeamIds.includes(teamId)) throw new Error(`Operating cost ${id} team is not a participant in its Competition`) }
function validateCounterpartyOrganization(_organizationId: OrganizationId, counterparty: TreasuryCounterparty | null, id: string, world: Pick<GameWorld, 'organizationsById'>): void { if (counterparty?.kind === 'ORGANIZATION' && (counterparty.id === undefined || world.organizationsById[counterparty.id as OrganizationId] === undefined)) throw new Error(`Operating cost ${id} references an unknown counterparty Organization`) }
function referenceMatches(world: GameWorld, item: ExpenseRecognition, kind: string, id: string): boolean { const reference = item.dimensions?.reference; if (reference === undefined) return false; if (reference.kind === 'OPERATING_COST_SOURCE') return world.operatingCostSourcesById[reference.id]?.[kind === 'FACILITY' ? 'facilityId' : 'matchId'] === id; if (reference.kind === 'OPERATING_COST_FACT') return world.operatingCostFactsById[reference.id]?.[kind === 'FACILITY' ? 'facilityId' : 'matchId'] === id; return false }
function materializationRejected(world: GameWorld, date: GameDate, entries: readonly OperatingCostScheduleEntry[], events: readonly ReturnType<typeof createAuthorizedEconomicEvent>[], results: readonly EconomicEventAdapterResult[], error: string): OperatingCostMaterialization { return Object.freeze({ status: 'rejected', world, date, entries, events: Object.freeze([...events]), results: Object.freeze([...results]), error }) }
function totalize(items: readonly { readonly amount: Money }[]): readonly OperatingCostQueryTotal[] { const totals = new Map<CurrencyCode, number>(); for (const item of items) totals.set(item.amount.currencyCode, (totals.get(item.amount.currencyCode) ?? 0) + item.amount.minorUnits); return Object.freeze([...totals.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([currencyCode, minorUnits]) => Object.freeze({ currencyCode, minorUnits }))) }
function breakdown(world: GameWorld, organizationId: OrganizationId | string, from: GameDate | string, to: GameDate | string, predicate: (item: ExpenseRecognition) => boolean, key: (item: ExpenseRecognition) => string): readonly OperatingCostBreakdown[] { const grouped = new Map<string, number>(); for (const item of Object.values(world.expenseRecognitionsById).filter((item) => item.organizationId === organizationId && isOperatingCategory(item.category) && predicate(item) && inRange(item.recognizedOn, from, to))) { const groupKey = `${key(item)}:${item.amount.currencyCode}`; grouped.set(groupKey, (grouped.get(groupKey) ?? 0) + item.amount.minorUnits) } return Object.freeze([...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([keyValue, minorUnits]) => { const split = keyValue.lastIndexOf(':'); return Object.freeze({ category: keyValue.slice(0, split), currencyCode: keyValue.slice(split + 1) as CurrencyCode, minorUnits }) })) }
function inRange(date: GameDate, from: GameDate | string, to: GameDate | string): boolean { const start = parseGameDate(from); const end = parseGameDate(to); if (compareGameDates(end, start) < 0) throw new RangeError('Operating cost query to cannot precede from'); return compareGameDates(date, start) >= 0 && compareGameDates(date, end) <= 0 }
function maxDate(left: GameDate, right: GameDate): GameDate { return compareGameDates(left, right) >= 0 ? left : right }
function minDate(left: GameDate, right: GameDate): GameDate { return compareGameDates(left, right) <= 0 ? left : right }
function nullableId(value: string | null | undefined): string | null { return value === undefined || value === null ? null : nonEmpty(value, 'Operating cost dimension') }
function nullableText(value: string | null | undefined): string | null { return value === undefined || value === null ? null : nonEmpty(value, 'Operating cost reference') }
function nonEmpty(value: string, label: string): string { if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${label} must be non-empty`); return value }
