import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import {
  competitionIdFromString,
  contractIdFromString,
  organizationSectionIdFromString,
  teamIdFromString,
  organizationIdFromString,
  type CompetitionId,
  type ContractId,
  type FinancialAccountId,
  type OrganizationId,
  type OrganizationSectionId,
  type TeamId,
} from '@/domain/ids'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { staffContractIdFromString } from '@/domain/staffContract'
import {
  createExpenseRecognition,
  createExpenseRecognitionLedgerTransaction,
  createFinancialCommitment,
  createFinancialEntitlement,
  createRevenueRecognitionLedgerTransaction,
  createRevenueRecognitionFromEntitlement,
  type ExpenseRecognition,
  type FinancialCommitment,
  type FinancialEntitlement,
  type RevenueRecognition,
} from './Recognition'
import { createFinancialDimensions, createFinancialSource, type FinancialDimensionsInput, type FinancialSource, type FinancialTransaction } from './FinancialLedger'
import { createOwnerFundingTransaction, createPayable, createReceivable, type TreasuryCounterparty } from './Treasury'

export const ECONOMIC_EVENT_AUTHORITIES = [
  'CONTRACT',
  'COMPETITION',
  'GOVERNANCE',
  'OWNERSHIP',
  'ORGANIZATION',
  'FUTURE_REVENUE_ENGINE',
  'FUTURE_COST_ENGINE',
  'MANUAL_SYSTEM_ACTION',
] as const

export type EconomicEventAuthority = typeof ECONOMIC_EVENT_AUTHORITIES[number]
export type EconomicEventType =
  | 'CONTRACT_COMMITMENT_OPENED'
  | 'CONTRACT_EXPENSE_DUE'
  | 'STAFF_CONTRACT_EXPENSE_DUE'
  | 'CONTRACT_BONUS_DUE'
  | 'CONTRACT_BUYOUT_DUE'
  | 'CONTRACT_TERMINATION_PAYMENT'
  | 'COMPETITION_ENTITLEMENT'
  | 'COMPETITION_DISTRIBUTION'
  | 'COMPETITION_SOLIDARITY_DISTRIBUTION'
  | 'COMPETITION_MEDIA_DISTRIBUTION'
  | 'OWNER_FUNDING'
  | (string & {})

export interface AuthorizedEconomicEvent {
  readonly id: string
  readonly eventType: EconomicEventType
  readonly sourceAuthority: EconomicEventAuthority
  readonly sourceEntityId: string
  readonly organizationId: OrganizationId
  readonly effectiveOn: GameDate
  readonly dueOn: GameDate | null
  readonly amount: import('./FinancialLedger').Money
  readonly provenance: FinancialSource
  readonly idempotencyKey: string
  readonly counterparty: TreasuryCounterparty | null
  readonly dimensions: import('./FinancialLedger').FinancialDimensions | null
  readonly contractId: ContractId | null
  readonly competitionId: CompetitionId | null
  readonly teamId: TeamId | null
  readonly organizationSectionId: OrganizationSectionId | null
}

export function createAuthorizedEconomicEvent(input: {
  readonly id: string
  readonly eventType: EconomicEventType
  readonly sourceAuthority: EconomicEventAuthority
  readonly sourceEntityId: string
  readonly organizationId: OrganizationId | string
  readonly effectiveOn: GameDate | string
  readonly dueOn?: GameDate | string | null
  readonly amount: import('./FinancialLedger').Money | { readonly currencyCode: string; readonly minorUnits: number }
  readonly provenance: FinancialSource
  readonly idempotencyKey: string
  readonly counterparty?: TreasuryCounterparty | null
  readonly dimensions?: FinancialDimensionsInput | null
  readonly contractId?: ContractId | string | null
  readonly competitionId?: CompetitionId | string | null
  readonly teamId?: TeamId | string | null
  readonly organizationSectionId?: OrganizationSectionId | string | null
}): AuthorizedEconomicEvent {
  if (typeof input.id !== 'string' || input.id.trim().length === 0) throw new TypeError('Authorized economic event id must be non-empty')
  if (typeof input.eventType !== 'string' || input.eventType.trim().length === 0) throw new TypeError('Authorized economic event type must be non-empty')
  if (!ECONOMIC_EVENT_AUTHORITIES.includes(input.sourceAuthority)) throw new TypeError('Authorized economic event source authority is invalid')
  if (typeof input.sourceEntityId !== 'string' || input.sourceEntityId.trim().length === 0) throw new TypeError('Authorized economic event source entity id must be non-empty')
  if (typeof input.idempotencyKey !== 'string' || input.idempotencyKey.trim().length === 0) throw new TypeError('Authorized economic event idempotency key must be non-empty')
  const dimensions = input.dimensions === undefined || input.dimensions === null ? null : createFinancialDimensions(input.dimensions)
  const effectiveOn = parseGameDate(input.effectiveOn)
  const dueOn = input.dueOn === undefined || input.dueOn === null ? null : parseGameDate(input.dueOn)
  if (dueOn !== null && compareGameDates(dueOn, effectiveOn) < 0) throw new RangeError('Authorized economic event dueOn cannot precede effectiveOn')
  const contractId = input.contractId === undefined || input.contractId === null ? null : contractIdFromString(input.contractId)
  const competitionId = input.competitionId === undefined || input.competitionId === null ? null : competitionIdFromString(input.competitionId)
  const teamId = input.teamId === undefined || input.teamId === null ? null : teamIdFromString(input.teamId)
  const organizationSectionId = input.organizationSectionId === undefined || input.organizationSectionId === null ? null : organizationSectionIdFromString(input.organizationSectionId)
  if (contractId !== null && dimensions?.contractId !== undefined && dimensions.contractId !== contractId) throw new RangeError('Authorized economic event contract dimension does not match contractId')
  if (competitionId !== null && dimensions?.competitionId !== undefined && dimensions.competitionId !== competitionId) throw new RangeError('Authorized economic event competition dimension does not match competitionId')
  if (teamId !== null && dimensions?.teamId !== undefined && dimensions.teamId !== teamId) throw new RangeError('Authorized economic event team dimension does not match teamId')
  if (organizationSectionId !== null && dimensions?.organizationSectionId !== undefined && dimensions.organizationSectionId !== organizationSectionId) throw new RangeError('Authorized economic event section dimension does not match organizationSectionId')
  const mergedDimensionInput = { ...dimensions, contractId: contractId ?? dimensions?.contractId, competitionId: competitionId ?? dimensions?.competitionId, teamId: teamId ?? dimensions?.teamId, organizationSectionId: organizationSectionId ?? dimensions?.organizationSectionId }
  const mergedDimensions = Object.keys(mergedDimensionInput).length === 0 ? null : createFinancialDimensions(mergedDimensionInput)
  return Object.freeze({
    id: input.id,
    eventType: input.eventType,
    sourceAuthority: input.sourceAuthority,
    sourceEntityId: input.sourceEntityId,
    organizationId: organizationIdFromString(input.organizationId),
    effectiveOn,
    dueOn,
    amount: positiveMoney(input.amount),
    provenance: eventSource(input.provenance),
    idempotencyKey: input.idempotencyKey,
    counterparty: input.counterparty === undefined || input.counterparty === null ? null : createCounterparty(input.counterparty),
    dimensions: mergedDimensions,
    contractId: contractId ?? dimensions?.contractId ?? null,
    competitionId: competitionId ?? dimensions?.competitionId ?? null,
    teamId: teamId ?? dimensions?.teamId ?? null,
    organizationSectionId: organizationSectionId ?? dimensions?.organizationSectionId ?? null,
  })
}

export interface EconomicEventAdapterOptions {
  readonly recognize?: boolean
  readonly materializeSubledger?: boolean
  readonly ledger?: {
    readonly cashAccountId?: FinancialAccountId | string
    readonly offsetAccountId: FinancialAccountId | string
    readonly resultAccountId?: FinancialAccountId | string
  }
}

export interface EconomicEventAdapterResult {
  readonly status: 'accepted' | 'alreadyProcessed' | 'rejected'
  readonly alreadyProcessed: boolean
  readonly world: GameWorld
  readonly event: AuthorizedEconomicEvent
  readonly error?: string
  readonly commitment?: FinancialCommitment
  readonly entitlement?: FinancialEntitlement
  readonly recognition?: RevenueRecognition | ExpenseRecognition
  readonly receivable?: import('./Treasury').Receivable
  readonly payable?: import('./Treasury').Payable
  readonly transaction?: FinancialTransaction
}

export function processContractEconomicEvent(world: GameWorld, event: AuthorizedEconomicEvent, options: EconomicEventAdapterOptions = {}): EconomicEventAdapterResult {
  try {
    assertEventAuthority(event, 'CONTRACT')
    if (!['CONTRACT_COMMITMENT_OPENED', 'CONTRACT_EXPENSE_DUE', 'STAFF_CONTRACT_EXPENSE_DUE', 'CONTRACT_BONUS_DUE', 'CONTRACT_BUYOUT_DUE', 'CONTRACT_TERMINATION_PAYMENT'].includes(event.eventType)) throw new TypeError(`Unsupported Contract economic event type ${event.eventType}`)
    if (event.dueOn === null) throw new RangeError('Contract economic events require an explicit dueOn; Finance does not invent contract calendars')
    const playerContract = world.contractsById[contractIdFromString(event.sourceEntityId)]
    const staffContract = world.staffContractsById[staffContractIdFromString(event.sourceEntityId)]
    if (playerContract === undefined && staffContract === undefined) throw new Error(`Unknown Contract source entity ${event.sourceEntityId}`)
    if (event.contractId !== null && (playerContract === undefined || event.contractId !== playerContract.id)) throw new RangeError('Contract economic event contractId does not match source Contract')
    if (staffContract !== undefined && event.contractId !== null) throw new RangeError('Staff contract events cannot use a player ContractId')
    const teamId = playerContract?.teamId ?? staffContract!.teamId
    const team = world.teams[teamId]
    if (team === undefined || team.organizationId !== event.organizationId) throw new RangeError('Contract economic event Organization does not match Contract Team')
    if (event.teamId !== null && event.teamId !== teamId) throw new RangeError('Contract economic event Team does not match Contract Team')
    return processExpenseEvent(world, event, options, event.eventType !== 'CONTRACT_COMMITMENT_OPENED', teamId)
  } catch (error) {
    return rejected(world, event, error)
  }
}

export function processCompetitionEconomicEvent(world: GameWorld, event: AuthorizedEconomicEvent, options: EconomicEventAdapterOptions = {}): EconomicEventAdapterResult {
  try {
    assertEventAuthority(event, 'COMPETITION')
    if (!['COMPETITION_ENTITLEMENT', 'COMPETITION_DISTRIBUTION', 'COMPETITION_SOLIDARITY_DISTRIBUTION', 'COMPETITION_MEDIA_DISTRIBUTION'].includes(event.eventType)) throw new TypeError(`Unsupported Competition economic event type ${event.eventType}`)
    if (event.competitionId === null) throw new TypeError('Competition economic events require competitionId')
    if (event.sourceEntityId !== event.competitionId) throw new RangeError('Competition economic event source entity does not match competitionId')
    if (event.dueOn === null) throw new RangeError('Competition economic events require an explicit dueOn')
    const competition = world.competitions[event.competitionId]
    if (competition === undefined) throw new Error(`Unknown Competition ${event.competitionId}`)
    const team = event.teamId === null ? Object.values(world.teams).find((candidate) => candidate.organizationId === event.organizationId && competition.participantTeamIds.includes(candidate.id)) : world.teams[event.teamId]
    if (team === undefined || team.organizationId !== event.organizationId || !competition.participantTeamIds.includes(team.id)) throw new RangeError('Competition economic event Organization is not a Competition participant')
    return processRevenueEvent(world, event, options, team.id)
  } catch (error) {
    return rejected(world, event, error)
  }
}

export function processOwnerFundingEconomicEvent(world: GameWorld, event: AuthorizedEconomicEvent, options: EconomicEventAdapterOptions): EconomicEventAdapterResult {
  try {
    if (event.sourceAuthority !== 'OWNERSHIP' && event.sourceAuthority !== 'GOVERNANCE') throw new TypeError('Owner funding requires OWNERSHIP or GOVERNANCE authority')
    if (event.eventType !== 'OWNER_FUNDING') throw new TypeError(`Unsupported owner funding event type ${event.eventType}`)
    const existing = existingArtifacts(world, event)
    assertReplayCompatible(event, existing)
    if (existing.transaction !== undefined) return alreadyProcessed(world, event, existing)
    if (options.ledger === undefined || options.ledger.cashAccountId === undefined) throw new TypeError('Owner funding requires explicit cash and equity ledger account mapping')
    const transaction = createOwnerFundingTransaction(world, { transactionId: `financial:authorized:${eventKey(event)}`, organizationId: event.organizationId, amount: event.amount, effectiveOn: event.effectiveOn, cashAccountId: options.ledger.cashAccountId, offsetAccountId: options.ledger.offsetAccountId, provenance: eventProvenance(event), dimensions: event.dimensions })
    const next = apply(world, { financialTransactions: [...Object.values(world.financialTransactionsById), transaction] })
    return Object.freeze({ status: 'accepted', alreadyProcessed: false, world: next, event, transaction })
  } catch (error) {
    return rejected(world, event, error)
  }
}

function processExpenseEvent(world: GameWorld, event: AuthorizedEconomicEvent, options: EconomicEventAdapterOptions, recognizeDefault: boolean, teamId: TeamId): EconomicEventAdapterResult {
  const existing = existingArtifacts(world, event)
  assertReplayCompatible(event, existing)
  if (existing.commitment !== undefined || existing.recognition !== undefined || existing.payable !== undefined || existing.transaction !== undefined) return alreadyProcessed(world, event, existing)
  const commitment = createFinancialCommitment({ id: `commitment:authorized:${eventKey(event)}`, organizationId: event.organizationId, amount: event.amount, startsOn: event.effectiveOn, dueOn: event.dueOn!, category: event.eventType, provenance: eventProvenance(event), counterparty: event.counterparty, dimensions: event.dimensions ?? { teamId } })
  const shouldRecognize = options.recognize ?? recognizeDefault
  if (!shouldRecognize) return accepted(world, event, { financialCommitments: [...Object.values(world.financialCommitmentsById), commitment] }, { commitment })
  if (options.ledger === undefined) throw new TypeError('Expense economic recognition requires explicit ledger account mapping')
  const shouldMaterialize = options.materializeSubledger ?? true
  const payableId = `payable:authorized:${eventKey(event)}`
  const recognitionBase = createExpenseRecognition({ id: `expense:authorized:${eventKey(event)}`, organizationId: event.organizationId, amount: event.amount, recognizedOn: event.effectiveOn, category: event.eventType, provenance: eventProvenance(event), counterparty: event.counterparty, commitmentId: commitment.id, payableId: shouldMaterialize ? payableId : null, dimensions: event.dimensions ?? { teamId } })
  const payable = shouldMaterialize ? createPayable({ id: payableId, organizationId: event.organizationId, amount: event.amount, counterparty: event.counterparty ?? { kind: 'EXTERNAL', label: 'Authorized economic event' }, recognizedOn: event.effectiveOn, dueOn: event.dueOn!, provenance: { kind: 'EXPENSE_RECOGNITION', id: String(recognitionBase.id) }, dimensions: recognitionBase.dimensions }) : undefined
  if (options.ledger.resultAccountId === undefined) throw new TypeError('Expense economic recognition requires a result ledger account')
  const ledgerResult = createExpenseRecognitionLedgerTransaction(world, recognitionBase, { transactionId: `financial:authorized:${eventKey(event)}:expense`, offsetAccountId: options.ledger.offsetAccountId, resultAccountId: options.ledger.resultAccountId })
  return accepted(world, event, { financialCommitments: [...Object.values(world.financialCommitmentsById), commitment], expenseRecognitions: [...Object.values(world.expenseRecognitionsById), ledgerResult.recognition], ...(payable === undefined ? {} : { payables: [...Object.values(world.payablesById), payable] }), financialTransactions: [...Object.values(world.financialTransactionsById), ledgerResult.transaction] }, { commitment, recognition: ledgerResult.recognition, ...(payable === undefined ? {} : { payable }), transaction: ledgerResult.transaction })
}

function processRevenueEvent(world: GameWorld, event: AuthorizedEconomicEvent, options: EconomicEventAdapterOptions, teamId: TeamId): EconomicEventAdapterResult {
  const existing = existingArtifacts(world, event)
  assertReplayCompatible(event, existing)
  if (existing.entitlement !== undefined || existing.recognition !== undefined || existing.receivable !== undefined || existing.transaction !== undefined) return alreadyProcessed(world, event, existing)
  const entitlement = createFinancialEntitlement({ id: `entitlement:authorized:${eventKey(event)}`, organizationId: event.organizationId, amount: event.amount, availableOn: event.effectiveOn, dueOn: event.dueOn!, category: event.eventType, provenance: eventProvenance(event), counterparty: event.counterparty, dimensions: event.dimensions ?? { teamId, competitionId: event.competitionId! } })
  const shouldRecognize = options.recognize ?? true
  if (!shouldRecognize) return accepted(world, event, { financialEntitlements: [...Object.values(world.financialEntitlementsById), entitlement] }, { entitlement })
  if (options.ledger === undefined) throw new TypeError('Revenue economic recognition requires explicit ledger account mapping')
  const shouldMaterialize = options.materializeSubledger ?? true
  const receivableId = `receivable:authorized:${eventKey(event)}`
  const recognitionBase = createRevenueRecognitionFromEntitlement(entitlement, { id: `revenue:authorized:${eventKey(event)}`, amount: event.amount, recognizedOn: event.effectiveOn, category: event.eventType, provenance: eventProvenance(event), counterparty: event.counterparty, dimensions: event.dimensions ?? { teamId, competitionId: event.competitionId! }, receivableId: shouldMaterialize ? receivableId : null })
  const receivable = shouldMaterialize ? createReceivable({ id: receivableId, organizationId: event.organizationId, amount: event.amount, counterparty: event.counterparty ?? { kind: 'EXTERNAL', label: 'Authorized economic event' }, recognizedOn: event.effectiveOn, dueOn: event.dueOn!, provenance: { kind: 'REVENUE_RECOGNITION', id: String(recognitionBase.id) }, dimensions: recognitionBase.dimensions }) : undefined
  if (options.ledger.resultAccountId === undefined) throw new TypeError('Revenue economic recognition requires a result ledger account')
  const ledgerResult = createRevenueRecognitionLedgerTransaction(world, recognitionBase, { transactionId: `financial:authorized:${eventKey(event)}:revenue`, offsetAccountId: options.ledger.offsetAccountId, resultAccountId: options.ledger.resultAccountId })
  return accepted(world, event, { financialEntitlements: [...Object.values(world.financialEntitlementsById), entitlement], revenueRecognitions: [...Object.values(world.revenueRecognitionsById), ledgerResult.recognition], ...(receivable === undefined ? {} : { receivables: [...Object.values(world.receivablesById), receivable] }), financialTransactions: [...Object.values(world.financialTransactionsById), ledgerResult.transaction] }, { entitlement, recognition: ledgerResult.recognition, ...(receivable === undefined ? {} : { receivable }), transaction: ledgerResult.transaction })
}

function accepted(world: GameWorld, event: AuthorizedEconomicEvent, patch: Parameters<typeof import('@/domain/world').updateGameWorld>[1], artifacts: Omit<EconomicEventAdapterResult, 'status' | 'alreadyProcessed' | 'world' | 'event'>): EconomicEventAdapterResult {
  try {
    return Object.freeze({ status: 'accepted', alreadyProcessed: false, world: apply(world, patch), event, ...artifacts })
  } catch (error) {
    return rejected(world, event, error)
  }
}

function apply(world: GameWorld, patch: Parameters<typeof import('@/domain/world').updateGameWorld>[1]): GameWorld {
  return updateGameWorld(world, patch)
}

function existingArtifacts(world: GameWorld, event: AuthorizedEconomicEvent): Pick<EconomicEventAdapterResult, 'commitment' | 'entitlement' | 'recognition' | 'receivable' | 'payable' | 'transaction'> {
  const key = eventKey(event)
  const commitment = Object.values(world.financialCommitmentsById).find((item) => item.provenance.kind === 'AUTHORIZED_ECONOMIC_EVENT' && item.provenance.id === key)
  const entitlement = Object.values(world.financialEntitlementsById).find((item) => item.provenance.kind === 'AUTHORIZED_ECONOMIC_EVENT' && item.provenance.id === key)
  const recognition = [...Object.values(world.revenueRecognitionsById), ...Object.values(world.expenseRecognitionsById)].find((item) => item.provenance.kind === 'AUTHORIZED_ECONOMIC_EVENT' && item.provenance.id === key)
  const receivable = recognition !== undefined && 'receivableId' in recognition && recognition.receivableId !== null ? world.receivablesById[recognition.receivableId] : undefined
  const payable = recognition !== undefined && 'payableId' in recognition && recognition.payableId !== null ? world.payablesById[recognition.payableId] : undefined
  const transaction = Object.values(world.financialTransactionsById).find((item) => item.provenance.kind === 'AUTHORIZED_ECONOMIC_EVENT' && item.provenance.id === key)
  return { commitment, entitlement, recognition, receivable, payable, transaction }
}

function alreadyProcessed(world: GameWorld, event: AuthorizedEconomicEvent, artifacts: Pick<EconomicEventAdapterResult, 'commitment' | 'entitlement' | 'recognition' | 'receivable' | 'payable' | 'transaction'>): EconomicEventAdapterResult {
  return Object.freeze({ status: 'alreadyProcessed', alreadyProcessed: true, world, event, ...artifacts })
}

function assertReplayCompatible(event: AuthorizedEconomicEvent, artifacts: Pick<EconomicEventAdapterResult, 'commitment' | 'entitlement' | 'recognition' | 'receivable' | 'payable' | 'transaction'>): void {
  const facts = [artifacts.commitment, artifacts.entitlement, artifacts.recognition, artifacts.receivable, artifacts.payable, artifacts.transaction].filter((fact): fact is NonNullable<typeof fact> => fact !== undefined)
  for (const fact of facts) {
    if (fact.organizationId !== event.organizationId || fact.amount.currencyCode !== event.amount.currencyCode || fact.amount.minorUnits !== event.amount.minorUnits) throw new Error('Economic event idempotency key conflicts with an existing financial consequence')
    if ('category' in fact && fact.category !== event.eventType) throw new Error('Economic event idempotency key conflicts with an existing event category')
  }
}

function rejected(world: GameWorld, event: AuthorizedEconomicEvent, error: unknown): EconomicEventAdapterResult {
  return Object.freeze({ status: 'rejected', alreadyProcessed: false, world, event, error: error instanceof Error ? error.message : String(error) })
}

function assertEventAuthority(event: AuthorizedEconomicEvent, authority: EconomicEventAuthority): void {
  if (event.sourceAuthority !== authority) throw new TypeError(`Economic event requires ${authority} authority`)
}

function eventKey(event: AuthorizedEconomicEvent): string {
  return `${event.sourceAuthority}:${event.sourceEntityId}:${event.idempotencyKey}`
}

function eventProvenance(event: AuthorizedEconomicEvent): FinancialSource {
  return { kind: 'AUTHORIZED_ECONOMIC_EVENT', id: eventKey(event), description: event.provenance.description }
}

function eventSource(input: FinancialSource): FinancialSource {
  if (typeof input.kind !== 'string' || input.kind.trim().length === 0 || typeof input.id !== 'string' || input.id.trim().length === 0) throw new TypeError('Authorized economic event provenance requires kind and id')
  return createFinancialSource(input)
}

function createCounterparty(input: TreasuryCounterparty): TreasuryCounterparty {
  if (input.kind !== 'ORGANIZATION' && input.kind !== 'PERSON' && input.kind !== 'EXTERNAL') throw new TypeError('Economic event counterparty kind is invalid')
  if (input.kind !== 'EXTERNAL' && (input.id === undefined || input.id.trim().length === 0)) throw new TypeError('Non-external economic event counterparty requires an id')
  if (input.label.trim().length === 0) throw new TypeError('Economic event counterparty label must be non-empty')
  return Object.freeze({ ...input })
}

function positiveMoney(input: import('./FinancialLedger').Money | { readonly currencyCode: string; readonly minorUnits: number }): import('./FinancialLedger').Money {
  if (!/^[A-Z]{3}$/.test(input.currencyCode) || !Number.isSafeInteger(input.minorUnits) || input.minorUnits <= 0) throw new RangeError('Authorized economic event amount must use a valid currency and positive minorUnits')
  return Object.freeze({ currencyCode: input.currencyCode as import('./FinancialLedger').CurrencyCode, minorUnits: input.minorUnits })
}
