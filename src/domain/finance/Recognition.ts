import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import {
  expenseRecognitionIdFromString,
  financialAccountIdFromString,
  financialCommitmentIdFromString,
  financialEntitlementIdFromString,
  financialTransactionIdFromString,
  organizationIdFromString,
  payableIdFromString,
  receivableIdFromString,
  revenueRecognitionIdFromString,
  type ExpenseRecognitionId,
  type FinancialAccountId,
  type FinancialCommitmentId,
  type FinancialEntitlementId,
  type FinancialTransactionId,
  type OrganizationId,
  type PayableId,
  type ReceivableId,
  type RevenueRecognitionId,
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
import { createPayable, createReceivable, type Payable, type Receivable, type TreasuryCounterparty } from './Treasury'

export interface RevenueRecognition {
  readonly id: RevenueRecognitionId
  readonly organizationId: OrganizationId
  readonly amount: Money
  readonly recognizedOn: GameDate
  readonly category: string
  readonly provenance: FinancialSource
  readonly counterparty: TreasuryCounterparty | null
  readonly dimensions: FinancialDimensions | null
  readonly entitlementId: FinancialEntitlementId | null
  readonly receivableId: ReceivableId | null
  readonly ledgerTransactionId: FinancialTransactionId | null
}

export interface ExpenseRecognition {
  readonly id: ExpenseRecognitionId
  readonly organizationId: OrganizationId
  readonly amount: Money
  readonly recognizedOn: GameDate
  readonly category: string
  readonly provenance: FinancialSource
  readonly counterparty: TreasuryCounterparty | null
  readonly dimensions: FinancialDimensions | null
  readonly commitmentId: FinancialCommitmentId | null
  readonly payableId: PayableId | null
  readonly ledgerTransactionId: FinancialTransactionId | null
}

export interface FinancialCommitment {
  readonly id: FinancialCommitmentId
  readonly organizationId: OrganizationId
  readonly amount: Money
  readonly startsOn: GameDate
  readonly dueOn: GameDate
  readonly category: string
  readonly provenance: FinancialSource
  readonly counterparty: TreasuryCounterparty | null
  readonly dimensions: FinancialDimensions | null
  readonly cancelledOn: GameDate | null
}

export interface FinancialEntitlement {
  readonly id: FinancialEntitlementId
  readonly organizationId: OrganizationId
  readonly amount: Money
  readonly availableOn: GameDate
  readonly dueOn: GameDate
  readonly category: string
  readonly provenance: FinancialSource
  readonly counterparty: TreasuryCounterparty | null
  readonly dimensions: FinancialDimensions | null
  readonly cancelledOn: GameDate | null
}

export interface CreateRevenueRecognitionInput {
  readonly id: RevenueRecognitionId | string
  readonly organizationId: OrganizationId | string
  readonly amount: Money | { readonly currencyCode: string; readonly minorUnits: number }
  readonly recognizedOn: GameDate | string
  readonly category: string
  readonly provenance: FinancialSource
  readonly counterparty?: TreasuryCounterparty | null
  readonly dimensions?: FinancialDimensionsInput | null
  readonly entitlementId?: FinancialEntitlementId | string | null
  readonly receivableId?: ReceivableId | string | null
  readonly ledgerTransactionId?: FinancialTransactionId | string | null
}

export interface CreateExpenseRecognitionInput {
  readonly id: ExpenseRecognitionId | string
  readonly organizationId: OrganizationId | string
  readonly amount: Money | { readonly currencyCode: string; readonly minorUnits: number }
  readonly recognizedOn: GameDate | string
  readonly category: string
  readonly provenance: FinancialSource
  readonly counterparty?: TreasuryCounterparty | null
  readonly dimensions?: FinancialDimensionsInput | null
  readonly commitmentId?: FinancialCommitmentId | string | null
  readonly payableId?: PayableId | string | null
  readonly ledgerTransactionId?: FinancialTransactionId | string | null
}

export function createRevenueRecognition(input: CreateRevenueRecognitionInput): RevenueRecognition {
  return Object.freeze({
    id: revenueRecognitionIdFromString(input.id),
    organizationId: organizationIdFromString(input.organizationId),
    amount: positiveMoney(input.amount, 'Revenue recognition amount'),
    recognizedOn: parseGameDate(input.recognizedOn),
    category: nonEmptyText(input.category, 'Revenue recognition category'),
    provenance: recognitionSource(input.provenance, 'Revenue recognition'),
    counterparty: input.counterparty === undefined || input.counterparty === null ? null : createCounterparty(input.counterparty),
    dimensions: input.dimensions === undefined || input.dimensions === null ? null : createFinancialDimensions(input.dimensions),
    entitlementId: input.entitlementId === undefined || input.entitlementId === null ? null : financialEntitlementIdFromString(input.entitlementId),
    receivableId: input.receivableId === undefined || input.receivableId === null ? null : receivableIdFromString(input.receivableId),
    ledgerTransactionId: input.ledgerTransactionId === undefined || input.ledgerTransactionId === null ? null : financialTransactionIdFromString(input.ledgerTransactionId),
  })
}

export function createExpenseRecognition(input: CreateExpenseRecognitionInput): ExpenseRecognition {
  return Object.freeze({
    id: expenseRecognitionIdFromString(input.id),
    organizationId: organizationIdFromString(input.organizationId),
    amount: positiveMoney(input.amount, 'Expense recognition amount'),
    recognizedOn: parseGameDate(input.recognizedOn),
    category: nonEmptyText(input.category, 'Expense recognition category'),
    provenance: recognitionSource(input.provenance, 'Expense recognition'),
    counterparty: input.counterparty === undefined || input.counterparty === null ? null : createCounterparty(input.counterparty),
    dimensions: input.dimensions === undefined || input.dimensions === null ? null : createFinancialDimensions(input.dimensions),
    commitmentId: input.commitmentId === undefined || input.commitmentId === null ? null : financialCommitmentIdFromString(input.commitmentId),
    payableId: input.payableId === undefined || input.payableId === null ? null : payableIdFromString(input.payableId),
    ledgerTransactionId: input.ledgerTransactionId === undefined || input.ledgerTransactionId === null ? null : financialTransactionIdFromString(input.ledgerTransactionId),
  })
}

export function createFinancialCommitment(input: {
  readonly id: FinancialCommitmentId | string
  readonly organizationId: OrganizationId | string
  readonly amount: Money | { readonly currencyCode: string; readonly minorUnits: number }
  readonly startsOn: GameDate | string
  readonly dueOn: GameDate | string
  readonly category: string
  readonly provenance: FinancialSource
  readonly counterparty?: TreasuryCounterparty | null
  readonly dimensions?: FinancialDimensionsInput | null
  readonly cancelledOn?: GameDate | string | null
}): FinancialCommitment {
  const startsOn = parseGameDate(input.startsOn)
  const dueOn = parseGameDate(input.dueOn)
  if (compareGameDates(dueOn, startsOn) < 0) throw new RangeError('Financial commitment dueOn cannot precede startsOn')
  const cancelledOn = input.cancelledOn === undefined || input.cancelledOn === null ? null : parseGameDate(input.cancelledOn)
  if (cancelledOn !== null && compareGameDates(cancelledOn, startsOn) < 0) throw new RangeError('Financial commitment cancelledOn cannot precede startsOn')
  return Object.freeze({
    id: financialCommitmentIdFromString(input.id),
    organizationId: organizationIdFromString(input.organizationId),
    amount: positiveMoney(input.amount, 'Financial commitment amount'),
    startsOn,
    dueOn,
    category: nonEmptyText(input.category, 'Financial commitment category'),
    provenance: recognitionSource(input.provenance, 'Financial commitment'),
    counterparty: input.counterparty === undefined || input.counterparty === null ? null : createCounterparty(input.counterparty),
    dimensions: input.dimensions === undefined || input.dimensions === null ? null : createFinancialDimensions(input.dimensions),
    cancelledOn,
  })
}

export function createFinancialEntitlement(input: {
  readonly id: FinancialEntitlementId | string
  readonly organizationId: OrganizationId | string
  readonly amount: Money | { readonly currencyCode: string; readonly minorUnits: number }
  readonly availableOn: GameDate | string
  readonly dueOn: GameDate | string
  readonly category: string
  readonly provenance: FinancialSource
  readonly counterparty?: TreasuryCounterparty | null
  readonly dimensions?: FinancialDimensionsInput | null
  readonly cancelledOn?: GameDate | string | null
}): FinancialEntitlement {
  const availableOn = parseGameDate(input.availableOn)
  const dueOn = parseGameDate(input.dueOn)
  if (compareGameDates(dueOn, availableOn) < 0) throw new RangeError('Financial entitlement dueOn cannot precede availableOn')
  const cancelledOn = input.cancelledOn === undefined || input.cancelledOn === null ? null : parseGameDate(input.cancelledOn)
  if (cancelledOn !== null && compareGameDates(cancelledOn, availableOn) < 0) throw new RangeError('Financial entitlement cancelledOn cannot precede availableOn')
  return Object.freeze({
    id: financialEntitlementIdFromString(input.id),
    organizationId: organizationIdFromString(input.organizationId),
    amount: positiveMoney(input.amount, 'Financial entitlement amount'),
    availableOn,
    dueOn,
    category: nonEmptyText(input.category, 'Financial entitlement category'),
    provenance: recognitionSource(input.provenance, 'Financial entitlement'),
    counterparty: input.counterparty === undefined || input.counterparty === null ? null : createCounterparty(input.counterparty),
    dimensions: input.dimensions === undefined || input.dimensions === null ? null : createFinancialDimensions(input.dimensions),
    cancelledOn,
  })
}

export function createRevenueRecognitionFromEntitlement(entitlement: FinancialEntitlement, input: Omit<CreateRevenueRecognitionInput, 'entitlementId' | 'organizationId' | 'amount' | 'category' | 'counterparty' | 'dimensions'> & Pick<CreateRevenueRecognitionInput, 'category' | 'amount'> & { readonly counterparty?: TreasuryCounterparty | null; readonly dimensions?: FinancialDimensionsInput | null }): RevenueRecognition {
  return createRevenueRecognition({ ...input, organizationId: entitlement.organizationId, entitlementId: entitlement.id, counterparty: input.counterparty ?? entitlement.counterparty, dimensions: input.dimensions ?? entitlement.dimensions })
}

export function createExpenseRecognitionFromCommitment(commitment: FinancialCommitment, input: Omit<CreateExpenseRecognitionInput, 'commitmentId' | 'organizationId' | 'amount' | 'category' | 'counterparty' | 'dimensions'> & Pick<CreateExpenseRecognitionInput, 'category' | 'amount'> & { readonly counterparty?: TreasuryCounterparty | null; readonly dimensions?: FinancialDimensionsInput | null }): ExpenseRecognition {
  return createExpenseRecognition({ ...input, organizationId: commitment.organizationId, commitmentId: commitment.id, counterparty: input.counterparty ?? commitment.counterparty, dimensions: input.dimensions ?? commitment.dimensions })
}

export interface MaterializeReceivableInput {
  readonly receivableId: ReceivableId | string
  readonly dueOn: GameDate | string
  readonly counterparty?: TreasuryCounterparty
}

export interface MaterializePayableInput {
  readonly payableId: PayableId | string
  readonly dueOn: GameDate | string
  readonly counterparty?: TreasuryCounterparty
}

export function materializeRevenueReceivable(world: GameWorld, recognitionId: RevenueRecognitionId | string, input: MaterializeReceivableInput): { readonly recognition: RevenueRecognition; readonly receivable: Receivable } {
  const recognition = getRevenueRecognition(world, recognitionId)
  if (recognition.receivableId !== null) throw new RangeError('Revenue recognition already has a receivable')
  if (Object.values(world.receivablesById).some((item) => item.provenance.kind === 'REVENUE_RECOGNITION' && item.provenance.id === String(recognition.id))) throw new RangeError('Revenue recognition already materialized a receivable')
  const receivable = createReceivable({ id: input.receivableId, organizationId: recognition.organizationId, amount: recognition.amount, counterparty: input.counterparty ?? recognition.counterparty ?? (() => { throw new TypeError('Revenue receivable requires a counterparty') })(), recognizedOn: recognition.recognizedOn, dueOn: input.dueOn, provenance: { kind: 'REVENUE_RECOGNITION', id: String(recognition.id) }, dimensions: recognition.dimensions })
  return Object.freeze({ recognition: createRevenueRecognition({ ...recognition, receivableId: receivable.id }), receivable })
}

export function materializeExpensePayable(world: GameWorld, recognitionId: ExpenseRecognitionId | string, input: MaterializePayableInput): { readonly recognition: ExpenseRecognition; readonly payable: Payable } {
  const recognition = getExpenseRecognition(world, recognitionId)
  if (recognition.payableId !== null) throw new RangeError('Expense recognition already has a payable')
  if (Object.values(world.payablesById).some((item) => item.provenance.kind === 'EXPENSE_RECOGNITION' && item.provenance.id === String(recognition.id))) throw new RangeError('Expense recognition already materialized a payable')
  const payable = createPayable({ id: input.payableId, organizationId: recognition.organizationId, amount: recognition.amount, counterparty: input.counterparty ?? recognition.counterparty ?? (() => { throw new TypeError('Expense payable requires a counterparty') })(), recognizedOn: recognition.recognizedOn, dueOn: input.dueOn, provenance: { kind: 'EXPENSE_RECOGNITION', id: String(recognition.id) }, dimensions: recognition.dimensions })
  return Object.freeze({ recognition: createExpenseRecognition({ ...recognition, payableId: payable.id }), payable })
}

export interface RecognitionLedgerInput {
  readonly transactionId: FinancialTransactionId | string
  readonly offsetAccountId: FinancialAccountId | string
  readonly resultAccountId: FinancialAccountId | string
  readonly description?: string | null
}

export interface RecognitionLedgerResult<TRecognition> {
  readonly recognition: TRecognition
  readonly transaction: FinancialTransaction
}

export function createRevenueRecognitionLedgerTransaction(world: GameWorld, recognition: RevenueRecognition, input: RecognitionLedgerInput): RecognitionLedgerResult<RevenueRecognition> {
  if (recognition.ledgerTransactionId !== null) throw new RangeError('Revenue recognition already has a ledger transaction')
  assertNoRecognitionLedgerTransaction(world, 'REVENUE_RECOGNITION', recognition.id)
  const offset = accountFor(world, input.offsetAccountId, recognition.organizationId, recognition.amount.currencyCode)
  const result = accountFor(world, input.resultAccountId, recognition.organizationId, recognition.amount.currencyCode)
  if (offset.accountType === 'CASH') throw new TypeError('Revenue recognition cannot use cash as its offset account')
  if (recognition.receivableId !== null && offset.accountType !== 'RECEIVABLE') throw new TypeError('Revenue recognition with a receivable requires a receivable ledger account')
  if (recognition.receivableId === null && offset.accountType !== 'ASSET' && offset.accountType !== 'RECEIVABLE') throw new TypeError('Revenue recognition requires an asset or receivable offset account')
  if (result.accountType !== 'REVENUE') throw new TypeError('Revenue recognition requires a revenue ledger account')
  const transaction = createFinancialTransaction({ id: input.transactionId, organizationId: recognition.organizationId, effectiveOn: recognition.recognizedOn, transactionType: 'REVENUE_RECOGNITION', amount: recognition.amount, postings: [{ accountId: offset.id, direction: 'DEBIT', amount: recognition.amount }, { accountId: result.id, direction: 'CREDIT', amount: recognition.amount }], provenance: { kind: 'REVENUE_RECOGNITION', id: String(recognition.id) }, dimensions: recognition.dimensions, description: input.description })
  return Object.freeze({ recognition: createRevenueRecognition({ ...recognition, ledgerTransactionId: transaction.id }), transaction })
}

export function createExpenseRecognitionLedgerTransaction(world: GameWorld, recognition: ExpenseRecognition, input: RecognitionLedgerInput): RecognitionLedgerResult<ExpenseRecognition> {
  if (recognition.ledgerTransactionId !== null) throw new RangeError('Expense recognition already has a ledger transaction')
  assertNoRecognitionLedgerTransaction(world, 'EXPENSE_RECOGNITION', recognition.id)
  const result = accountFor(world, input.offsetAccountId, recognition.organizationId, recognition.amount.currencyCode)
  const expense = accountFor(world, input.resultAccountId, recognition.organizationId, recognition.amount.currencyCode)
  if (result.accountType === 'CASH') throw new TypeError('Expense recognition cannot use cash as its offset account')
  if (recognition.payableId !== null && result.accountType !== 'PAYABLE') throw new TypeError('Expense recognition with a payable requires a payable ledger account')
  if (recognition.payableId === null && result.accountType !== 'LIABILITY' && result.accountType !== 'PAYABLE') throw new TypeError('Expense recognition requires a liability or payable offset account')
  if (expense.accountType !== 'EXPENSE') throw new TypeError('Expense recognition requires an expense ledger account')
  const transaction = createFinancialTransaction({ id: input.transactionId, organizationId: recognition.organizationId, effectiveOn: recognition.recognizedOn, transactionType: 'EXPENSE_RECOGNITION', amount: recognition.amount, postings: [{ accountId: expense.id, direction: 'DEBIT', amount: recognition.amount }, { accountId: result.id, direction: 'CREDIT', amount: recognition.amount }], provenance: { kind: 'EXPENSE_RECOGNITION', id: String(recognition.id) }, dimensions: recognition.dimensions, description: input.description })
  return Object.freeze({ recognition: createExpenseRecognition({ ...recognition, ledgerTransactionId: transaction.id }), transaction })
}

function getRevenueRecognition(world: GameWorld, id: RevenueRecognitionId | string): RevenueRecognition {
  const recognition = world.revenueRecognitionsById[revenueRecognitionIdFromString(id)]
  if (recognition === undefined) throw new Error(`Unknown revenue recognition ${id}`)
  return recognition
}

function getExpenseRecognition(world: GameWorld, id: ExpenseRecognitionId | string): ExpenseRecognition {
  const recognition = world.expenseRecognitionsById[expenseRecognitionIdFromString(id)]
  if (recognition === undefined) throw new Error(`Unknown expense recognition ${id}`)
  return recognition
}

function accountFor(world: GameWorld, id: FinancialAccountId | string, organizationId: OrganizationId, currencyCode: CurrencyCode) {
  const account = world.financialAccountsById[financialAccountIdFromString(id)]
  if (account === undefined) throw new Error(`Unknown financial account ${id}`)
  if (account.organizationId !== organizationId) throw new RangeError('Recognition ledger accounts must belong to the Organization')
  if (account.currencyCode !== currencyCode) throw new RangeError('Recognition ledger account currency must match recognition currency')
  return account
}

function assertNoRecognitionLedgerTransaction(world: GameWorld, kind: string, id: string): void {
  if (Object.values(world.financialTransactionsById).some((transaction) => transaction.provenance.kind === kind && transaction.provenance.id === String(id))) throw new RangeError('Recognition already has a ledger transaction')
}

function recognitionSource(input: FinancialSource, label: string): FinancialSource {
  const source = createFinancialSource(input)
  if (source.id === undefined) throw new TypeError(`${label} provenance requires an id`)
  return source
}

function createCounterparty(input: TreasuryCounterparty): TreasuryCounterparty {
  if (input.kind !== 'ORGANIZATION' && input.kind !== 'PERSON' && input.kind !== 'EXTERNAL') throw new TypeError('Recognition counterparty kind is invalid')
  const id = input.id === undefined ? undefined : nonEmptyText(input.id, 'Recognition counterparty id')
  if (id === undefined && input.kind !== 'EXTERNAL') throw new TypeError('Non-external recognition counterparties require an id')
  return Object.freeze({ kind: input.kind, ...(id === undefined ? {} : { id }), label: nonEmptyText(input.label, 'Recognition counterparty label') })
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
