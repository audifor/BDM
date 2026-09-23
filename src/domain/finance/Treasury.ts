import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import {
  financialAccountIdFromString,
  financialTransactionIdFromString,
  organizationIdFromString,
  payableIdFromString,
  receivableIdFromString,
  treasurySettlementIdFromString,
  type FinancialAccountId,
  type FinancialTransactionId,
  type OrganizationId,
  type PayableId,
  type ReceivableId,
  type TreasurySettlementId,
} from '@/domain/ids'
import type { GameWorld } from '@/domain/world/GameWorld'
import {
  createFinancialDimensions,
  createFinancialSource,
  createFinancialTransaction,
  createMoney,
  type CurrencyCode,
  type FinancialDimensions,
  type FinancialDimensionsInput,
  type FinancialSource,
  type FinancialTransaction,
  type Money,
} from './FinancialLedger'

export const CASH_ACCOUNT_TYPES = [
  'CASH',
  'CASH_OPERATING_BANK',
  'CASH_SECONDARY_BANK',
  'CASH_PETTY',
  'CASH_RESTRICTED',
  'CASH_ESCROW',
] as const

export type CashAccountType = typeof CASH_ACCOUNT_TYPES[number]
export type CashRestriction = 'UNRESTRICTED' | 'RESTRICTED'
export type TreasuryObligationStatus = 'OPEN' | 'PARTIALLY_SETTLED' | 'SETTLED' | 'CANCELLED'
export type TreasurySettlementKind = 'RECEIVABLE' | 'PAYABLE'

export interface TreasuryCounterparty {
  readonly kind: 'ORGANIZATION' | 'PERSON' | 'EXTERNAL'
  readonly id?: string
  readonly label: string
}

export interface Receivable {
  readonly id: ReceivableId
  readonly organizationId: OrganizationId
  readonly amount: Money
  readonly counterparty: TreasuryCounterparty
  readonly recognizedOn: GameDate
  readonly dueOn: GameDate
  readonly provenance: FinancialSource
  readonly dimensions: FinancialDimensions | null
  readonly cancelledOn: GameDate | null
}

export interface Payable {
  readonly id: PayableId
  readonly organizationId: OrganizationId
  readonly amount: Money
  readonly counterparty: TreasuryCounterparty
  readonly recognizedOn: GameDate
  readonly dueOn: GameDate
  readonly provenance: FinancialSource
  readonly dimensions: FinancialDimensions | null
  readonly cancelledOn: GameDate | null
}

export interface TreasurySettlement {
  readonly id: TreasurySettlementId
  readonly organizationId: OrganizationId
  readonly obligationKind: TreasurySettlementKind
  readonly obligationId: ReceivableId | PayableId
  readonly amount: Money
  readonly settledOn: GameDate
  readonly transactionId: FinancialTransactionId
  readonly provenance: FinancialSource
}

export function isCashAccountType(accountType: string): accountType is CashAccountType {
  return (CASH_ACCOUNT_TYPES as readonly string[]).includes(accountType)
}

export function isCashAccount(account: { readonly accountType: string }): boolean {
  return isCashAccountType(account.accountType)
}

export function cashRestrictionForAccount(account: { readonly accountType: string }): CashRestriction {
  if (account.accountType === 'CASH_RESTRICTED' || account.accountType === 'CASH_ESCROW') return 'RESTRICTED'
  if (!isCashAccount(account)) throw new TypeError(`Financial account ${account.accountType} is not a cash account`)
  return 'UNRESTRICTED'
}

export function createTreasuryCounterparty(input: TreasuryCounterparty): TreasuryCounterparty {
  if (input.kind !== 'ORGANIZATION' && input.kind !== 'PERSON' && input.kind !== 'EXTERNAL') throw new TypeError('Treasury counterparty kind is invalid')
  const id = input.id === undefined ? undefined : nonEmptyText(input.id, 'Treasury counterparty id')
  const label = nonEmptyText(input.label, 'Treasury counterparty label')
  if (id === undefined && input.kind !== 'EXTERNAL') throw new TypeError('Non-external treasury counterparties require an id')
  return Object.freeze({ kind: input.kind, ...(id === undefined ? {} : { id }), label })
}

export function createReceivable(input: {
  readonly id: ReceivableId | string
  readonly organizationId: OrganizationId | string
  readonly amount: Money | { readonly currencyCode: string; readonly minorUnits: number }
  readonly counterparty: TreasuryCounterparty
  readonly recognizedOn: GameDate | string
  readonly dueOn: GameDate | string
  readonly provenance: FinancialSource
  readonly dimensions?: FinancialDimensionsInput | null
  readonly cancelledOn?: GameDate | string | null
}): Receivable {
  const recognizedOn = parseGameDate(input.recognizedOn)
  const dueOn = parseGameDate(input.dueOn)
  if (compareGameDates(dueOn, recognizedOn) < 0) throw new RangeError('Receivable dueOn cannot precede recognizedOn')
  const cancelledOn = input.cancelledOn === undefined || input.cancelledOn === null ? null : parseGameDate(input.cancelledOn)
  if (cancelledOn !== null && compareGameDates(cancelledOn, recognizedOn) < 0) throw new RangeError('Receivable cancelledOn cannot precede recognizedOn')
  const amount = positiveMoney(input.amount, 'Receivable amount')
  return Object.freeze({ id: receivableIdFromString(input.id), organizationId: organizationIdFromString(input.organizationId), amount, counterparty: createTreasuryCounterparty(input.counterparty), recognizedOn, dueOn, provenance: createFinancialSource(input.provenance), dimensions: input.dimensions === undefined || input.dimensions === null ? null : createFinancialDimensions(input.dimensions), cancelledOn })
}

export function createPayable(input: {
  readonly id: PayableId | string
  readonly organizationId: OrganizationId | string
  readonly amount: Money | { readonly currencyCode: string; readonly minorUnits: number }
  readonly counterparty: TreasuryCounterparty
  readonly recognizedOn: GameDate | string
  readonly dueOn: GameDate | string
  readonly provenance: FinancialSource
  readonly dimensions?: FinancialDimensionsInput | null
  readonly cancelledOn?: GameDate | string | null
}): Payable {
  const recognizedOn = parseGameDate(input.recognizedOn)
  const dueOn = parseGameDate(input.dueOn)
  if (compareGameDates(dueOn, recognizedOn) < 0) throw new RangeError('Payable dueOn cannot precede recognizedOn')
  const cancelledOn = input.cancelledOn === undefined || input.cancelledOn === null ? null : parseGameDate(input.cancelledOn)
  if (cancelledOn !== null && compareGameDates(cancelledOn, recognizedOn) < 0) throw new RangeError('Payable cancelledOn cannot precede recognizedOn')
  const amount = positiveMoney(input.amount, 'Payable amount')
  return Object.freeze({ id: payableIdFromString(input.id), organizationId: organizationIdFromString(input.organizationId), amount, counterparty: createTreasuryCounterparty(input.counterparty), recognizedOn, dueOn, provenance: createFinancialSource(input.provenance), dimensions: input.dimensions === undefined || input.dimensions === null ? null : createFinancialDimensions(input.dimensions), cancelledOn })
}

export function createTreasurySettlement(input: {
  readonly id: TreasurySettlementId | string
  readonly organizationId: OrganizationId | string
  readonly obligationKind: TreasurySettlementKind
  readonly obligationId: ReceivableId | PayableId | string
  readonly amount: Money | { readonly currencyCode: string; readonly minorUnits: number }
  readonly settledOn: GameDate | string
  readonly transactionId: FinancialTransactionId | string
  readonly provenance: FinancialSource
}): TreasurySettlement {
  if (input.obligationKind !== 'RECEIVABLE' && input.obligationKind !== 'PAYABLE') throw new TypeError('Treasury settlement obligationKind is invalid')
  const amount = positiveMoney(input.amount, 'Treasury settlement amount')
  return Object.freeze({ id: treasurySettlementIdFromString(input.id), organizationId: organizationIdFromString(input.organizationId), obligationKind: input.obligationKind, obligationId: input.obligationKind === 'RECEIVABLE' ? receivableIdFromString(input.obligationId) : payableIdFromString(input.obligationId), amount, settledOn: parseGameDate(input.settledOn), transactionId: financialTransactionIdFromString(input.transactionId), provenance: createFinancialSource(input.provenance) })
}

export function getReceivableSettledAmount(world: GameWorld, receivableId: ReceivableId | string, asOfDate: GameDate | string = world.currentDate): Money {
  const receivable = world.receivablesById[receivableIdFromString(receivableId)]
  if (receivable === undefined) throw new Error(`Unknown receivable ${receivableId}`)
  return settlementTotal(world, 'RECEIVABLE', receivable.id, receivable.amount.currencyCode, asOfDate)
}

export function getPayableSettledAmount(world: GameWorld, payableId: PayableId | string, asOfDate: GameDate | string = world.currentDate): Money {
  const payable = world.payablesById[payableIdFromString(payableId)]
  if (payable === undefined) throw new Error(`Unknown payable ${payableId}`)
  return settlementTotal(world, 'PAYABLE', payable.id, payable.amount.currencyCode, asOfDate)
}

export function getReceivableRemaining(world: GameWorld, receivableId: ReceivableId | string, asOfDate: GameDate | string = world.currentDate): Money {
  const receivable = world.receivablesById[receivableIdFromString(receivableId)]
  if (receivable === undefined) throw new Error(`Unknown receivable ${receivableId}`)
  return remainingMoney(receivable.amount, getReceivableSettledAmount(world, receivable.id, asOfDate))
}

export function getPayableRemaining(world: GameWorld, payableId: PayableId | string, asOfDate: GameDate | string = world.currentDate): Money {
  const payable = world.payablesById[payableIdFromString(payableId)]
  if (payable === undefined) throw new Error(`Unknown payable ${payableId}`)
  return remainingMoney(payable.amount, getPayableSettledAmount(world, payable.id, asOfDate))
}

export function getReceivableStatus(world: GameWorld, receivableId: ReceivableId | string, asOfDate: GameDate | string = world.currentDate): TreasuryObligationStatus {
  const receivable = world.receivablesById[receivableIdFromString(receivableId)]
  if (receivable === undefined) throw new Error(`Unknown receivable ${receivableId}`)
  return obligationStatus(receivable.amount, getReceivableSettledAmount(world, receivable.id, asOfDate), receivable.cancelledOn, asOfDate)
}

export function getPayableStatus(world: GameWorld, payableId: PayableId | string, asOfDate: GameDate | string = world.currentDate): TreasuryObligationStatus {
  const payable = world.payablesById[payableIdFromString(payableId)]
  if (payable === undefined) throw new Error(`Unknown payable ${payableId}`)
  return obligationStatus(payable.amount, getPayableSettledAmount(world, payable.id, asOfDate), payable.cancelledOn, asOfDate)
}

export interface SettlementRequest {
  readonly settlementId: TreasurySettlementId | string
  readonly transactionId: FinancialTransactionId | string
  readonly amount: Money | { readonly currencyCode: string; readonly minorUnits: number }
  readonly settledOn: GameDate | string
  readonly cashAccountId: FinancialAccountId | string
  readonly offsetAccountId: FinancialAccountId | string
  readonly provenance?: FinancialSource
}

export interface TreasurySettlementResult {
  readonly settlement: TreasurySettlement
  readonly transaction: FinancialTransaction
}

export function settleReceivable(world: GameWorld, receivableId: ReceivableId | string, request: SettlementRequest): TreasurySettlementResult {
  const receivable = world.receivablesById[receivableIdFromString(receivableId)]
  if (receivable === undefined) throw new Error(`Unknown receivable ${receivableId}`)
  const amount = validateSettlementRequest(world, 'RECEIVABLE', receivable.organizationId, receivable.amount, receivable.recognizedOn, receivable.cancelledOn, receivable.id, request)
  const transaction = createSettlementTransaction(world, 'RECEIVABLE', receivable.organizationId, receivable.dimensions, amount, request, receivable.id)
  const settlement = createTreasurySettlement({ id: request.settlementId, organizationId: receivable.organizationId, obligationKind: 'RECEIVABLE', obligationId: receivable.id, amount, settledOn: request.settledOn, transactionId: transaction.id, provenance: request.provenance ?? { kind: 'TREASURY_SETTLEMENT', id: String(request.settlementId) } })
  return Object.freeze({ settlement, transaction })
}

export function settlePayable(world: GameWorld, payableId: PayableId | string, request: SettlementRequest): TreasurySettlementResult {
  const payable = world.payablesById[payableIdFromString(payableId)]
  if (payable === undefined) throw new Error(`Unknown payable ${payableId}`)
  const amount = validateSettlementRequest(world, 'PAYABLE', payable.organizationId, payable.amount, payable.recognizedOn, payable.cancelledOn, payable.id, request)
  const transaction = createSettlementTransaction(world, 'PAYABLE', payable.organizationId, payable.dimensions, amount, request, payable.id)
  const settlement = createTreasurySettlement({ id: request.settlementId, organizationId: payable.organizationId, obligationKind: 'PAYABLE', obligationId: payable.id, amount, settledOn: request.settledOn, transactionId: transaction.id, provenance: request.provenance ?? { kind: 'TREASURY_SETTLEMENT', id: String(request.settlementId) } })
  return Object.freeze({ settlement, transaction })
}

export interface AuthorizedCashReceiptInput {
  readonly transactionId: FinancialTransactionId | string
  readonly organizationId: OrganizationId | string
  readonly amount: Money | { readonly currencyCode: string; readonly minorUnits: number }
  readonly effectiveOn: GameDate | string
  readonly cashAccountId: FinancialAccountId | string
  readonly offsetAccountId: FinancialAccountId | string
  readonly provenance: FinancialSource
  readonly dimensions?: FinancialDimensionsInput | null
  readonly relatedEventId?: string
  readonly description?: string | null
}

export function createAuthorizedCashReceiptTransaction(world: GameWorld, transactionType: 'OWNER_FUNDING_RECEIPT' | 'COMPETITION_DISTRIBUTION_RECEIPT', input: AuthorizedCashReceiptInput): FinancialTransaction {
  if (input.provenance.id === undefined) throw new TypeError('Authorized cash receipts require an external event provenance id')
  const amount = positiveMoney(input.amount, 'Authorized cash receipt amount')
  validateCashAndOffsetAccounts(world, input.organizationId, amount.currencyCode, input.cashAccountId, input.offsetAccountId, transactionType === 'OWNER_FUNDING_RECEIPT' ? 'EQUITY' : 'REVENUE')
  return createFinancialTransaction({ id: input.transactionId, organizationId: input.organizationId, effectiveOn: input.effectiveOn, transactionType, amount, postings: [{ accountId: input.cashAccountId, direction: 'DEBIT', amount }, { accountId: input.offsetAccountId, direction: 'CREDIT', amount }], provenance: input.provenance, dimensions: input.dimensions, relatedEventId: input.relatedEventId, description: input.description })
}

export const createOwnerFundingTransaction = (world: GameWorld, input: AuthorizedCashReceiptInput): FinancialTransaction => createAuthorizedCashReceiptTransaction(world, 'OWNER_FUNDING_RECEIPT', input)
export const createCompetitionDistributionTransaction = (world: GameWorld, input: AuthorizedCashReceiptInput): FinancialTransaction => createAuthorizedCashReceiptTransaction(world, 'COMPETITION_DISTRIBUTION_RECEIPT', input)

function validateSettlementRequest(world: GameWorld, kind: TreasurySettlementKind, organizationId: OrganizationId, original: Money, recognizedOn: GameDate, cancelledOn: GameDate | null, obligationId: string, request: SettlementRequest): Money {
  const amount = positiveMoney(request.amount, 'Treasury settlement amount')
  if (amount.currencyCode !== original.currencyCode) throw new RangeError('Settlement currency must match obligation currency')
  const settledOn = parseGameDate(request.settledOn)
  if (compareGameDates(settledOn, recognizedOn) < 0) throw new RangeError('Settlement cannot precede obligation recognition')
  if (cancelledOn !== null && compareGameDates(settledOn, cancelledOn) >= 0) throw new RangeError('Cancelled obligations cannot be settled')
  if (world.treasuryApplicationsById[treasurySettlementIdFromString(request.settlementId)] !== undefined) throw new RangeError('Duplicate treasury settlement')
  if (world.financialTransactionsById[financialTransactionIdFromString(request.transactionId)] !== undefined) throw new RangeError('Settlement transaction already exists')
  const alreadySettled = settlementTotal(world, kind, obligationId, original.currencyCode, settledOn)
  if (alreadySettled.minorUnits + amount.minorUnits > original.minorUnits) throw new RangeError('Settlement exceeds remaining obligation amount')
  validateCashAndOffsetAccounts(world, organizationId, amount.currencyCode, request.cashAccountId, request.offsetAccountId, kind === 'RECEIVABLE' ? 'RECEIVABLE' : 'PAYABLE')
  return amount
}

function createSettlementTransaction(world: GameWorld, kind: TreasurySettlementKind, organizationId: OrganizationId, dimensions: FinancialDimensions | null, amount: Money, request: SettlementRequest, obligationId: string): FinancialTransaction {
  const provenance = request.provenance ?? { kind: 'TREASURY_SETTLEMENT', id: String(request.settlementId) }
  return createFinancialTransaction({ id: request.transactionId, organizationId, effectiveOn: request.settledOn, transactionType: kind === 'RECEIVABLE' ? 'RECEIVABLE_COLLECTION' : 'PAYABLE_SETTLEMENT', amount, postings: kind === 'RECEIVABLE' ? [{ accountId: request.cashAccountId, direction: 'DEBIT', amount }, { accountId: request.offsetAccountId, direction: 'CREDIT', amount }] : [{ accountId: request.offsetAccountId, direction: 'DEBIT', amount }, { accountId: request.cashAccountId, direction: 'CREDIT', amount }], provenance, dimensions, relatedEventId: String(obligationId) })
}

function validateCashAndOffsetAccounts(world: GameWorld, organizationId: OrganizationId | string, currencyCode: CurrencyCode, cashAccountId: FinancialAccountId | string, offsetAccountId: FinancialAccountId | string, offsetType: 'EQUITY' | 'REVENUE' | 'RECEIVABLE' | 'PAYABLE'): void {
  const cashAccount = world.financialAccountsById[financialAccountIdFromString(cashAccountId)]
  const offsetAccount = world.financialAccountsById[financialAccountIdFromString(offsetAccountId)]
  if (cashAccount === undefined || offsetAccount === undefined) throw new Error('Treasury settlement references an unknown account')
  if (cashAccount.organizationId !== organizationId || offsetAccount.organizationId !== organizationId) throw new RangeError('Treasury settlement accounts must belong to the Organization')
  if (!isCashAccount(cashAccount)) throw new TypeError('Treasury settlement requires a cash account')
  if (offsetAccount.accountType !== offsetType) throw new TypeError(`Treasury settlement requires a ${offsetType} offset account`)
  if (cashAccount.currencyCode !== currencyCode || offsetAccount.currencyCode !== currencyCode) throw new RangeError('Treasury settlement account currencies must match')
  if (cashAccount.id === offsetAccount.id) throw new RangeError('Treasury settlement cash and offset accounts must differ')
}

function settlementTotal(world: GameWorld, kind: TreasurySettlementKind, obligationId: string, currencyCode: CurrencyCode, asOfDate: GameDate | string): Money {
  const date = parseGameDate(asOfDate)
  let minorUnits = 0
  for (const settlement of Object.values(world.treasuryApplicationsById)) {
    if (settlement.obligationKind === kind && String(settlement.obligationId) === String(obligationId) && compareGameDates(settlement.settledOn, date) <= 0) {
      if (settlement.amount.currencyCode !== currencyCode) throw new RangeError('Settlement currency does not match obligation')
      minorUnits += settlement.amount.minorUnits
    }
  }
  if (!Number.isSafeInteger(minorUnits)) throw new RangeError('Settlement total exceeds safe integer range')
  return Object.freeze({ currencyCode, minorUnits })
}

function remainingMoney(original: Money, settled: Money): Money {
  if (original.currencyCode !== settled.currencyCode || settled.minorUnits > original.minorUnits) throw new RangeError('Settled amount exceeds original amount')
  return Object.freeze({ currencyCode: original.currencyCode, minorUnits: original.minorUnits - settled.minorUnits })
}

function obligationStatus(original: Money, settled: Money, cancelledOn: GameDate | null, asOfDate: GameDate | string): TreasuryObligationStatus {
  if (cancelledOn !== null && compareGameDates(cancelledOn, parseGameDate(asOfDate)) <= 0) return 'CANCELLED'
  if (settled.minorUnits === 0) return 'OPEN'
  return settled.minorUnits === original.minorUnits ? 'SETTLED' : 'PARTIALLY_SETTLED'
}

function positiveMoney(input: Money | { readonly currencyCode: string; readonly minorUnits: number }, label: string): Money {
  const amount = createMoney(input)
  if (amount.minorUnits <= 0) throw new RangeError(`${label} must be greater than zero`)
  return amount
}

function nonEmptyText(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new TypeError(`${label} must be non-empty`)
  return value
}
