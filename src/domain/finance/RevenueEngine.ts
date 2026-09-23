import { addDays, addYears, compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import type { GameWorld } from '@/domain/world'
import type { OrganizationId, TeamId, OrganizationSectionId, CompetitionId } from '@/domain/ids'
import { createAuthorizedEconomicEvent, processRevenueEconomicEvent, type EconomicEventAdapterOptions, type EconomicEventAdapterResult } from './EconomicEventAdapters'
import { createFinancialSource, createMoney, type CurrencyCode, type FinancialSource, type Money } from './FinancialLedger'
import { createTreasuryCounterparty, getReceivableSettledAmount, type TreasuryCounterparty } from './Treasury'
import type { RevenueRecognition } from './Recognition'
import { getOutstandingEntitlements } from './RecognitionQueries'
import { createIndexationPolicy, type IndexationPolicy } from './EconomicEnvironment'

export const REVENUE_CATEGORIES = ['TICKETING', 'SEASON_TICKETS', 'HOSPITALITY', 'SPONSORSHIP', 'MEDIA', 'MERCHANDISING', 'LICENSING', 'COMPETITION', 'TRANSFER_BUYOUT', 'FACILITY', 'ACADEMY', 'GRANT', 'DONATION', 'OTHER_OPERATING'] as const
export type RevenueCategory = typeof REVENUE_CATEGORIES[number]
export type RevenueSourceStatus = 'ACTIVE' | 'INACTIVE'
export type RevenueSourceAuthority = 'COMMERCIAL_CONTRACT' | 'COMPETITION' | 'TICKETING' | 'MEDIA' | 'ORGANIZATION' | 'MANUAL_SYSTEM_ACTION'
export type RevenueGenerationPolicy = 'ONE_OFF' | 'ANNUAL' | 'SEASONAL' | 'EXPLICIT_SCHEDULE'
export type RevenueDueDatePolicy = 'ON_RECOGNITION' | 'NO_DUE_DATE'

export interface RevenuePaymentTerm {
  readonly recognitionOn: GameDate
  readonly dueOn: GameDate | null
  readonly amount: Money
}

export interface RevenueSource {
  readonly indexation?: IndexationPolicy
  readonly id: string
  readonly organizationId: OrganizationId
  readonly category: RevenueCategory
  readonly currencyCode: CurrencyCode
  readonly amount: Money
  readonly startsOn: GameDate
  readonly endsOn: GameDate
  readonly sourceAuthority: RevenueSourceAuthority
  readonly status: RevenueSourceStatus
  readonly generationPolicy: RevenueGenerationPolicy
  readonly dueDatePolicy: RevenueDueDatePolicy
  readonly teamId: TeamId | null
  readonly organizationSectionId: OrganizationSectionId | null
  readonly competitionId: CompetitionId | null
  readonly counterparty: TreasuryCounterparty | null
  readonly paymentSchedule: readonly RevenuePaymentTerm[]
  readonly provenance: FinancialSource
}

export interface RevenueScheduleEntry {
  readonly id: string
  readonly sourceId: string
  readonly organizationId: OrganizationId
  readonly category: RevenueCategory
  readonly amount: Money
  readonly periodStartsOn: GameDate
  readonly periodEndsOn: GameDate
  readonly recognitionOn: GameDate
  readonly dueOn: GameDate | null
  readonly seasonId: string | null
  readonly teamId: TeamId | null
  readonly organizationSectionId: OrganizationSectionId | null
  readonly competitionId: CompetitionId | null
  readonly counterparty: TreasuryCounterparty | null
  readonly provenance: FinancialSource
}

export interface TicketRevenueFact {
  readonly matchId: string
  readonly organizationId: OrganizationId | string
  readonly ticketsSold: number
  readonly attendance: number | null
  readonly grossRevenue: Money
  readonly currencyCode: CurrencyCode
  readonly teamId?: TeamId | string
  readonly competitionId?: CompetitionId | string
  readonly provenance: FinancialSource
}

export interface RevenueQueryTotal {
  readonly currencyCode: CurrencyCode
  readonly minorUnits: number
}

export interface RevenueMaterialization {
  readonly status: 'accepted' | 'alreadyProcessed' | 'rejected'
  readonly world: GameWorld
  readonly date: GameDate
  readonly entries: readonly RevenueScheduleEntry[]
  readonly events: readonly ReturnType<typeof createAuthorizedEconomicEvent>[]
  readonly results: readonly EconomicEventAdapterResult[]
  readonly error?: string
}

export function createRevenueSource(input: {
  readonly indexation?: IndexationPolicy
  readonly id: string
  readonly organizationId: OrganizationId | string
  readonly category: RevenueCategory
  readonly currencyCode: string
  readonly amount: Money | { readonly currencyCode: string; readonly minorUnits: number }
  readonly startsOn: GameDate | string
  readonly endsOn: GameDate | string
  readonly sourceAuthority: RevenueSourceAuthority
  readonly status?: RevenueSourceStatus
  readonly generationPolicy: RevenueGenerationPolicy
  readonly dueDatePolicy?: RevenueDueDatePolicy
  readonly teamId?: TeamId | string | null
  readonly organizationSectionId?: OrganizationSectionId | string | null
  readonly competitionId?: CompetitionId | string | null
  readonly counterparty?: TreasuryCounterparty | null
  readonly paymentSchedule?: readonly { readonly recognitionOn: GameDate | string; readonly dueOn?: GameDate | string | null; readonly amount: Money | { readonly currencyCode: string; readonly minorUnits: number } }[]
  readonly provenance: FinancialSource
}): RevenueSource {
  if (!REVENUE_CATEGORIES.includes(input.category)) throw new TypeError('Revenue source category is invalid')
  if (!['COMMERCIAL_CONTRACT', 'COMPETITION', 'TICKETING', 'MEDIA', 'ORGANIZATION', 'MANUAL_SYSTEM_ACTION'].includes(input.sourceAuthority)) throw new TypeError('Revenue source authority is invalid')
  if (!['ONE_OFF', 'ANNUAL', 'SEASONAL', 'EXPLICIT_SCHEDULE'].includes(input.generationPolicy)) throw new TypeError('Revenue source generation policy is invalid')
  const startsOn = parseGameDate(input.startsOn); const endsOn = parseGameDate(input.endsOn)
  if (compareGameDates(endsOn, startsOn) < 0) throw new RangeError('Revenue source endsOn cannot precede startsOn')
  const amount = createMoney(input.amount)
  if (amount.minorUnits <= 0) throw new RangeError('Revenue source amount must be positive')
  if (input.currencyCode !== amount.currencyCode) throw new RangeError('Revenue source currencyCode must match amount currency')
  if (input.generationPolicy === 'EXPLICIT_SCHEDULE' && (input.paymentSchedule === undefined || input.paymentSchedule.length === 0)) throw new TypeError('Explicit revenue schedule requires payment terms')
  if (input.paymentSchedule !== undefined && input.paymentSchedule.some((term) => term.amount.currencyCode !== amount.currencyCode)) throw new RangeError('Revenue source payment terms must use the source currency')
  const paymentSchedule = Object.freeze((input.paymentSchedule ?? []).map((term) => {
    const recognitionOn = parseGameDate(term.recognitionOn); const dueOn = term.dueOn === undefined || term.dueOn === null ? null : parseGameDate(term.dueOn); const termAmount = createMoney(term.amount)
    if (termAmount.minorUnits <= 0) throw new RangeError('Revenue source payment term amount must be positive')
    if (compareGameDates(recognitionOn, startsOn) < 0 || compareGameDates(recognitionOn, endsOn) > 0) throw new RangeError('Revenue source payment term is outside its active period')
    if (dueOn !== null && compareGameDates(dueOn, recognitionOn) < 0) throw new RangeError('Revenue source dueOn cannot precede recognitionOn')
    return Object.freeze({ recognitionOn, dueOn, amount: termAmount })
  }))
  const teamId = input.teamId === undefined || input.teamId === null ? null : String(input.teamId) as TeamId
  const organizationSectionId = input.organizationSectionId === undefined || input.organizationSectionId === null ? null : String(input.organizationSectionId) as OrganizationSectionId
  const competitionId = input.competitionId === undefined || input.competitionId === null ? null : String(input.competitionId) as CompetitionId
  return Object.freeze({ id: nonEmpty(input.id, 'Revenue source id'), organizationId: String(input.organizationId) as OrganizationId, category: input.category, currencyCode: amount.currencyCode, amount, startsOn, endsOn, sourceAuthority: input.sourceAuthority, status: input.status ?? 'ACTIVE', generationPolicy: input.generationPolicy, dueDatePolicy: input.dueDatePolicy ?? 'NO_DUE_DATE', teamId, organizationSectionId, competitionId, counterparty: input.counterparty === undefined || input.counterparty === null ? null : createTreasuryCounterparty(input.counterparty), paymentSchedule, provenance: createFinancialSource(input.provenance), ...(input.indexation === undefined ? {} : { indexation: createIndexationPolicy(input.indexation) }) })
}

export function getActiveRevenueSources(world: GameWorld, organizationId: OrganizationId | string, asOfDate: GameDate | string = world.currentDate): readonly RevenueSource[] {
  const date = parseGameDate(asOfDate)
  return Object.freeze(Object.values(world.revenueSourcesById).filter((source) => source.organizationId === organizationId && source.status === 'ACTIVE' && compareGameDates(source.startsOn, date) <= 0 && compareGameDates(source.endsOn, date) >= 0).sort((left, right) => left.id.localeCompare(right.id)))
}

export function getRevenueSchedule(world: GameWorld, input: { readonly organizationId?: OrganizationId | string; readonly sourceId?: string; readonly from?: GameDate | string; readonly to?: GameDate | string; readonly currencyCode?: string }): readonly RevenueScheduleEntry[] {
  const sources = Object.values(world.revenueSourcesById).filter((source) => (input.organizationId === undefined || source.organizationId === input.organizationId) && (input.sourceId === undefined || source.id === input.sourceId) && (input.currencyCode === undefined || source.currencyCode === input.currencyCode))
  const entries = sources.flatMap((source) => deriveRevenueSchedule(world, source)).filter((entry) => (input.from === undefined || compareGameDates(entry.recognitionOn, parseGameDate(input.from)) >= 0) && (input.to === undefined || compareGameDates(entry.recognitionOn, parseGameDate(input.to)) <= 0))
  return Object.freeze(entries.sort((left, right) => compareGameDates(left.recognitionOn, right.recognitionOn) || left.id.localeCompare(right.id)))
}

export function getContractedRevenue(world: GameWorld, organizationId: OrganizationId | string, from?: GameDate | string, to?: GameDate | string, currencyCode?: string): readonly RevenueQueryTotal[] {
  return totalize(getRevenueSchedule(world, { organizationId, from, to, currencyCode }))
}

export function getFutureScheduledRevenue(world: GameWorld, organizationId: OrganizationId | string, asOfDate: GameDate | string = world.currentDate, currencyCode?: string): readonly RevenueScheduleEntry[] {
  const date = parseGameDate(asOfDate)
  return Object.freeze(getRevenueSchedule(world, { organizationId, currencyCode }).filter((entry) => compareGameDates(entry.recognitionOn, date) > 0))
}

export function getRecognizedRevenueByCategory(world: GameWorld, organizationId: OrganizationId | string, from: GameDate | string, to: GameDate | string): readonly { readonly category: string; readonly currencyCode: CurrencyCode; readonly minorUnits: number }[] {
  return groupRecognized(world, organizationId, from, to, (item) => item.category)
}

export function getRecognizedRevenueByTeam(world: GameWorld, organizationId: OrganizationId | string, teamId: string, from: GameDate | string, to: GameDate | string): readonly RevenueQueryTotal[] { return totalize(Object.values(world.revenueRecognitionsById).filter((item) => item.organizationId === organizationId && item.dimensions?.teamId === teamId && inRange(item.recognizedOn, from, to))) }
export function getRecognizedRevenueBySection(world: GameWorld, organizationId: OrganizationId | string, sectionId: string, from: GameDate | string, to: GameDate | string): readonly RevenueQueryTotal[] { return totalize(Object.values(world.revenueRecognitionsById).filter((item) => item.organizationId === organizationId && item.dimensions?.organizationSectionId === sectionId && inRange(item.recognizedOn, from, to))) }
export function getRecognizedRevenueByCompetition(world: GameWorld, organizationId: OrganizationId | string, competitionId: string, from: GameDate | string, to: GameDate | string): readonly RevenueQueryTotal[] { return totalize(Object.values(world.revenueRecognitionsById).filter((item) => item.organizationId === organizationId && item.dimensions?.competitionId === competitionId && inRange(item.recognizedOn, from, to))) }
export function getRecognizedRevenueByCounterparty(world: GameWorld, organizationId: OrganizationId | string, from: GameDate | string, to: GameDate | string): readonly { readonly counterparty: string; readonly currencyCode: CurrencyCode; readonly minorUnits: number }[] { const grouped = new Map<string, RevenueQueryTotal>(); for (const item of Object.values(world.revenueRecognitionsById).filter((item) => item.organizationId === organizationId && inRange(item.recognizedOn, from, to))) { const counterparty = item.counterparty?.id ?? item.counterparty?.label ?? 'UNSPECIFIED'; const key = `${counterparty}:${item.amount.currencyCode}`; const current = grouped.get(key) ?? { currencyCode: item.amount.currencyCode, minorUnits: 0 }; grouped.set(key, { currencyCode: current.currencyCode, minorUnits: current.minorUnits + item.amount.minorUnits }) } return Object.freeze([...grouped.entries()].map(([key, value]) => Object.freeze({ counterparty: key.slice(0, key.lastIndexOf(':')), ...value })).sort((left, right) => left.counterparty.localeCompare(right.counterparty) || left.currencyCode.localeCompare(right.currencyCode))) }
export function getCollectedRevenue(world: GameWorld, organizationId: OrganizationId | string, asOfDate: GameDate | string = world.currentDate): readonly RevenueQueryTotal[] { return totalize(Object.values(world.revenueRecognitionsById).filter((item) => item.organizationId === organizationId && item.receivableId !== null).map((item) => ({ ...item, amount: getReceivableSettledAmount(world, item.receivableId!, asOfDate) }))) }
export function getRevenueByCurrency(world: GameWorld, organizationId: OrganizationId | string, from: GameDate | string, to: GameDate | string): readonly RevenueQueryTotal[] { return totalize(Object.values(world.revenueRecognitionsById).filter((item) => item.organizationId === organizationId && inRange(item.recognizedOn, from, to))) }
export function getRecognizedRevenueYtd(world: GameWorld, organizationId: OrganizationId | string, asOfDate: GameDate | string = world.currentDate): readonly RevenueQueryTotal[] { const date = parseGameDate(asOfDate); return totalize(Object.values(world.revenueRecognitionsById).filter((item) => item.organizationId === organizationId && item.recognizedOn.slice(0, 4) === date.slice(0, 4) && compareGameDates(item.recognizedOn, date) <= 0)) }
export function getOutstandingRevenueEntitlements(world: GameWorld, organizationId: OrganizationId | string, asOfDate: GameDate | string = world.currentDate) { return getOutstandingEntitlements(world, organizationId, asOfDate) }
export function getUncollectedRecognizedRevenue(world: GameWorld, organizationId: OrganizationId | string, asOfDate: GameDate | string = world.currentDate): readonly RevenueRecognition[] { return Object.values(world.revenueRecognitionsById).filter((item) => item.organizationId === organizationId && item.receivableId !== null && getReceivableSettledAmount(world, item.receivableId, asOfDate).minorUnits < item.amount.minorUnits) }

export function materializeRevenueForDate(world: GameWorld, dateInput: GameDate | string, options: { readonly organizationId: OrganizationId | string; readonly sourceId?: string; readonly currencyCode?: string; readonly ledger: NonNullable<EconomicEventAdapterOptions['ledger']>; readonly materializeSubledger?: boolean }): RevenueMaterialization {
  const date = parseGameDate(dateInput); const entries = getRevenueSchedule(world, { organizationId: options.organizationId, sourceId: options.sourceId, currencyCode: options.currencyCode }).filter((entry) => entry.recognitionOn === date && world.revenueSourcesById[entry.sourceId]?.status === 'ACTIVE')
  let currentWorld = world; const events: ReturnType<typeof createAuthorizedEconomicEvent>[] = []; const results: EconomicEventAdapterResult[] = []
  for (const entry of entries) {
    if (entry.dueOn === null) return Object.freeze({ status: 'rejected', world, date, entries, events: Object.freeze(events), results: Object.freeze(results), error: `Revenue source ${entry.sourceId} has no explicit due date policy for ${entry.recognitionOn}` })
    const event = createAuthorizedEconomicEvent({ id: `revenue-source-event:${entry.id}`, eventType: 'REVENUE_SOURCE_RECOGNITION', sourceAuthority: 'FUTURE_REVENUE_ENGINE', sourceEntityId: entry.sourceId, organizationId: entry.organizationId, effectiveOn: entry.recognitionOn, dueOn: entry.dueOn, amount: entry.amount, provenance: entry.provenance, idempotencyKey: entry.id, counterparty: entry.counterparty, revenueCategory: entry.category, dimensions: { ...(entry.teamId === null ? {} : { teamId: entry.teamId }), ...(entry.organizationSectionId === null ? {} : { organizationSectionId: entry.organizationSectionId }), ...(entry.competitionId === null ? {} : { competitionId: entry.competitionId }), reference: { kind: 'REVENUE_SOURCE', id: entry.sourceId } }, teamId: entry.teamId, organizationSectionId: entry.organizationSectionId, competitionId: entry.competitionId })
    const result = processRevenueEconomicEvent(currentWorld, event, { recognize: true, materializeSubledger: options.materializeSubledger ?? true, ledger: options.ledger }); events.push(event); results.push(result)
    if (result.status === 'rejected') return Object.freeze({ status: 'rejected', world, date, entries, events: Object.freeze(events), results: Object.freeze(results), error: result.error })
    currentWorld = result.world
  }
  return Object.freeze({ status: results.some((result) => result.status === 'accepted') ? 'accepted' : results.length > 0 ? 'alreadyProcessed' : 'accepted', world: currentWorld, date, entries, events: Object.freeze(events), results: Object.freeze(results) })
}

export function createTicketRevenueFact(input: { readonly matchId: string; readonly organizationId: OrganizationId | string; readonly ticketsSold: number; readonly attendance?: number | null; readonly grossRevenue: Money | { readonly currencyCode: string; readonly minorUnits: number }; readonly teamId?: TeamId | string; readonly competitionId?: CompetitionId | string; readonly provenance: FinancialSource }): TicketRevenueFact {
  if (!Number.isSafeInteger(input.ticketsSold) || input.ticketsSold < 0) throw new RangeError('Ticket revenue ticketsSold must be a non-negative integer')
  const grossRevenue = createMoney(input.grossRevenue); if (grossRevenue.minorUnits <= 0) throw new RangeError('Ticket revenue grossRevenue must be positive')
  if (input.attendance !== undefined && input.attendance !== null && (!Number.isSafeInteger(input.attendance) || input.attendance < 0)) throw new RangeError('Ticket revenue attendance must be a non-negative integer')
  return Object.freeze({ matchId: nonEmpty(input.matchId, 'Ticket revenue matchId'), organizationId: String(input.organizationId) as OrganizationId, ticketsSold: input.ticketsSold, attendance: input.attendance ?? null, grossRevenue, currencyCode: grossRevenue.currencyCode, ...(input.teamId === undefined ? {} : { teamId: String(input.teamId) as TeamId }), ...(input.competitionId === undefined ? {} : { competitionId: String(input.competitionId) as CompetitionId }), provenance: createFinancialSource(input.provenance) })
}

export function validateRevenueSources(sources: readonly RevenueSource[], world: Pick<GameWorld, 'organizationsById' | 'teams' | 'organizationSectionsById' | 'competitions'>): void {
  const ids = new Set<string>();
  for (const source of sources) {
    if (ids.has(source.id)) throw new Error(`Duplicate revenue source ${source.id}`)
    ids.add(source.id)
    if (world.organizationsById[source.organizationId] === undefined) throw new Error(`Revenue source ${source.id} references an unknown Organization`)
    if (source.teamId !== null) {
      const team = world.teams?.[source.teamId]
      if (team === undefined || team.organizationId !== source.organizationId) throw new Error(`Revenue source ${source.id} team dimension crosses organizations`)
    }
    if (source.organizationSectionId !== null) {
      const section = world.organizationSectionsById?.[source.organizationSectionId]
      if (section === undefined || section.organizationId !== source.organizationId) throw new Error(`Revenue source ${source.id} section dimension crosses organizations`)
    }
    const competition = source.competitionId === null ? undefined : world.competitions?.[source.competitionId]
    if (source.competitionId !== null && competition === undefined) throw new Error(`Revenue source ${source.id} references an unknown Competition`)
    if (competition !== undefined && source.teamId !== null && !competition.participantTeamIds.includes(source.teamId)) throw new Error(`Revenue source ${source.id} team is not a participant in its Competition`)
    if (source.counterparty?.kind === 'ORGANIZATION' && (source.counterparty.id === undefined || world.organizationsById[source.counterparty.id as OrganizationId] === undefined)) throw new Error(`Revenue source ${source.id} references an unknown counterparty Organization`)
  }
}

function deriveRevenueSchedule(world: GameWorld, source: RevenueSource): readonly RevenueScheduleEntry[] {
  if (source.generationPolicy === 'EXPLICIT_SCHEDULE') return Object.freeze(source.paymentSchedule.map((term, index) => scheduleEntry(source, `explicit-${index + 1}`, term.recognitionOn, term.recognitionOn, term.recognitionOn, term.dueOn, null, term.amount)))
  if (source.generationPolicy === 'ONE_OFF') { const dueOn = source.dueDatePolicy === 'ON_RECOGNITION' ? source.startsOn : null; return Object.freeze([scheduleEntry(source, 'one-off', source.startsOn, source.endsOn, source.startsOn, dueOn, null, source.amount)]) }
  if (source.generationPolicy === 'SEASONAL') { const seasons = Object.values(world.seasons).filter((season) => compareGameDates(season.endDate, source.startsOn) >= 0 && compareGameDates(season.startDate, source.endsOn) <= 0).sort((left, right) => compareGameDates(left.startDate, right.startDate) || String(left.id).localeCompare(String(right.id))); return Object.freeze(seasons.map((season, index) => { const start = maxDate(source.startsOn, season.startDate); const end = minDate(source.endsOn, season.endDate); const recognitionOn = start; const dueOn = source.dueDatePolicy === 'ON_RECOGNITION' ? recognitionOn : null; return scheduleEntry(source, `season-${index + 1}-${String(season.id)}`, start, end, recognitionOn, dueOn, String(season.id), source.amount) })) }
  const entries: RevenueScheduleEntry[] = []; let cursor = source.startsOn; let index = 0; while (compareGameDates(cursor, source.endsOn) <= 0) { const end = minDate(source.endsOn, addDays(addYears(cursor, 1), -1)); const dueOn = source.dueDatePolicy === 'ON_RECOGNITION' ? cursor : null; entries.push(scheduleEntry(source, `annual-${index + 1}`, cursor, end, cursor, dueOn, null, source.amount)); cursor = addDays(end, 1); index += 1 }
  return Object.freeze(entries)
}

function scheduleEntry(source: RevenueSource, suffix: string, periodStartsOn: GameDate, periodEndsOn: GameDate, recognitionOn: GameDate, dueOn: GameDate | null, seasonId: string | null, amount: Money): RevenueScheduleEntry { return Object.freeze({ id: `revenue-schedule:${source.id}:${suffix}`, sourceId: source.id, organizationId: source.organizationId, category: source.category, amount, periodStartsOn, periodEndsOn, recognitionOn, dueOn, seasonId, teamId: source.teamId, organizationSectionId: source.organizationSectionId, competitionId: source.competitionId, counterparty: source.counterparty, provenance: { kind: 'REVENUE_SOURCE_SCHEDULE', id: `${source.id}:${suffix}` } }) }
function groupRecognized(world: GameWorld, organizationId: OrganizationId | string, from: GameDate | string, to: GameDate | string, key: (item: RevenueRecognition) => string): readonly { readonly category: string; readonly currencyCode: CurrencyCode; readonly minorUnits: number }[] { const grouped = new Map<string, { currencyCode: CurrencyCode; minorUnits: number }>(); for (const item of Object.values(world.revenueRecognitionsById).filter((item) => item.organizationId === organizationId && inRange(item.recognizedOn, from, to))) { const groupKey = `${key(item)}:${item.amount.currencyCode}`; const current = grouped.get(groupKey) ?? { currencyCode: item.amount.currencyCode, minorUnits: 0 }; current.minorUnits += item.amount.minorUnits; grouped.set(groupKey, current) } return Object.freeze([...grouped.entries()].map(([groupKey, value]) => Object.freeze({ category: groupKey.split(':')[0]!, ...value })).sort((left, right) => left.category.localeCompare(right.category) || left.currencyCode.localeCompare(right.currencyCode))) }
function totalize(items: readonly { readonly amount: Money }[] | readonly RevenueScheduleEntry[]): readonly RevenueQueryTotal[] { const grouped = new Map<CurrencyCode, number>(); for (const item of items) grouped.set(item.amount.currencyCode, (grouped.get(item.amount.currencyCode) ?? 0) + item.amount.minorUnits); return Object.freeze([...grouped.entries()].map(([currencyCode, minorUnits]) => Object.freeze({ currencyCode, minorUnits })).sort((left, right) => left.currencyCode.localeCompare(right.currencyCode))) }
function inRange(date: GameDate, from: GameDate | string, to: GameDate | string): boolean { const start = parseGameDate(from); const end = parseGameDate(to); if (compareGameDates(end, start) < 0) throw new RangeError('Revenue query to cannot precede from'); return compareGameDates(date, start) >= 0 && compareGameDates(date, end) <= 0 }
function maxDate(left: GameDate, right: GameDate): GameDate { return compareGameDates(left, right) >= 0 ? left : right }
function minDate(left: GameDate, right: GameDate): GameDate { return compareGameDates(left, right) <= 0 ? left : right }
function nonEmpty(value: string, label: string): string { if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${label} must be non-empty`); return value }
