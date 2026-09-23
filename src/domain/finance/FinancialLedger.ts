import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import {
  competitionIdFromString,
  contractIdFromString,
  financialAccountIdFromString,
  financialTransactionIdFromString,
  fiscalPeriodIdFromString,
  organizationIdFromString,
  organizationSectionIdFromString,
  teamIdFromString,
  type CompetitionId,
  type ContractId,
  type FinancialAccountId,
  type FinancialTransactionId,
  type OrganizationId,
  type OrganizationSectionId,
  type TeamId,
} from '@/domain/ids'

export type CurrencyCode = string & { readonly __currencyCode: unique symbol }

export interface Money {
  readonly currencyCode: CurrencyCode
  /** JSON-safe integer minor units. No floating-point monetary arithmetic is used. */
  readonly minorUnits: number
}

export const FINANCIAL_ACCOUNT_TYPES = [
  'CASH',
  'RECEIVABLE',
  'PAYABLE',
  'ASSET',
  'LIABILITY',
  'EQUITY',
  'REVENUE',
  'EXPENSE',
] as const

export type FinancialAccountType = typeof FINANCIAL_ACCOUNT_TYPES[number] | (string & {})
export type FinancialPostingDirection = 'DEBIT' | 'CREDIT'

export interface FinancialSource {
  readonly kind: string
  readonly id?: string
  readonly description?: string
}

export type FinancialProvenance = FinancialSource

export interface FinancialDimensions {
  readonly teamId?: TeamId
  readonly organizationSectionId?: OrganizationSectionId
  readonly competitionId?: CompetitionId
  readonly contractId?: ContractId
  /** Extensible non-authoritative analytical reference for future domains. */
  readonly reference?: { readonly kind: string; readonly id: string }
}

export interface FinancialDimensionsInput {
  readonly teamId?: TeamId | string
  readonly organizationSectionId?: OrganizationSectionId | string
  readonly competitionId?: CompetitionId | string
  readonly contractId?: ContractId | string
  readonly reference?: { readonly kind: string; readonly id: string }
}

export interface FinancialAccount {
  readonly id: FinancialAccountId
  readonly organizationId: OrganizationId
  readonly accountType: FinancialAccountType
  readonly currencyCode: CurrencyCode
  readonly openedOn: GameDate | null
  readonly closedOn: GameDate | null
}

export interface FinancialPosting {
  readonly accountId: FinancialAccountId
  readonly direction: FinancialPostingDirection
  readonly amount: Money
}

export interface FinancialTransaction {
  readonly id: FinancialTransactionId
  readonly organizationId: OrganizationId
  readonly effectiveOn: GameDate
  readonly transactionType: string
  readonly amount: Money
  readonly postings: readonly FinancialPosting[]
  readonly provenance: FinancialProvenance
  readonly description: string | null
  readonly dimensions: FinancialDimensions | null
  readonly relatedContractId?: ContractId
  readonly relatedEventId?: string
}

export interface FiscalPeriod {
  readonly id: import('@/domain/ids').FiscalPeriodId
  readonly organizationId: OrganizationId
  readonly label: string
  readonly startsOn: GameDate
  readonly endsOn: GameDate
  readonly status: 'OPEN' | 'CLOSED'
}

export interface OrganizationFinancialProfile {
  readonly organizationId: OrganizationId
  readonly baseCurrencyCode: CurrencyCode
  readonly fiscalYearStartMonth: number
}

export function createCurrencyCode(value: string): CurrencyCode {
  if (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value)) {
    throw new TypeError('Currency code must be a three-letter uppercase ISO-style code')
  }
  return value as CurrencyCode
}

export function createMoney(input: { readonly currencyCode: string; readonly minorUnits: number }): Money {
  const currencyCode = createCurrencyCode(input.currencyCode)
  if (!Number.isSafeInteger(input.minorUnits) || input.minorUnits < 0) {
    throw new RangeError('Money minorUnits must be a non-negative safe integer')
  }
  return Object.freeze({ currencyCode, minorUnits: input.minorUnits })
}

export function createFinancialSource(input: FinancialSource): FinancialSource {
  const kind = nonEmptyText(input.kind, 'Financial source kind')
  const id = input.id === undefined ? undefined : nonEmptyText(input.id, 'Financial source id')
  const description = input.description === undefined ? undefined : nonEmptyText(input.description, 'Financial source description')
  return Object.freeze({ kind, ...(id === undefined ? {} : { id }), ...(description === undefined ? {} : { description }) })
}

export function createFinancialAccount(input: {
  readonly id: FinancialAccountId | string
  readonly organizationId: OrganizationId | string
  readonly accountType: string
  readonly currencyCode: string
  readonly openedOn?: GameDate | string | null
  readonly closedOn?: GameDate | string | null
}): FinancialAccount {
  const openedOn = input.openedOn === undefined || input.openedOn === null ? null : parseGameDate(input.openedOn)
  const closedOn = input.closedOn === undefined || input.closedOn === null ? null : parseGameDate(input.closedOn)
  if (openedOn !== null && closedOn !== null && compareGameDates(closedOn, openedOn) < 0) throw new RangeError('Financial account closedOn cannot precede openedOn')
  return Object.freeze({
    id: financialAccountIdFromString(input.id),
    organizationId: organizationIdFromString(input.organizationId),
    accountType: nonEmptyText(input.accountType, 'Financial account type'),
    currencyCode: createCurrencyCode(input.currencyCode),
    openedOn,
    closedOn,
  })
}

export function createFinancialPosting(input: {
  readonly accountId: FinancialAccountId | string
  readonly direction: FinancialPostingDirection
  readonly amount: Money | { readonly currencyCode: string; readonly minorUnits: number }
}): FinancialPosting {
  if (input.direction !== 'DEBIT' && input.direction !== 'CREDIT') throw new TypeError('Financial posting direction is invalid')
  const amount = createMoney(input.amount)
  if (amount.minorUnits <= 0) throw new RangeError('Financial posting amount must be greater than zero')
  return Object.freeze({ accountId: financialAccountIdFromString(input.accountId), direction: input.direction, amount })
}

export function createFinancialDimensions(input: FinancialDimensionsInput): FinancialDimensions {
  const result = {
    ...(input.teamId === undefined ? {} : { teamId: teamIdFromString(input.teamId) }),
    ...(input.organizationSectionId === undefined ? {} : { organizationSectionId: organizationSectionIdFromString(input.organizationSectionId) }),
    ...(input.competitionId === undefined ? {} : { competitionId: competitionIdFromString(input.competitionId) }),
    ...(input.contractId === undefined ? {} : { contractId: contractIdFromString(input.contractId) }),
    ...(input.reference === undefined ? {} : { reference: { kind: nonEmptyText(input.reference.kind, 'Financial dimension reference kind'), id: nonEmptyText(input.reference.id, 'Financial dimension reference id') } }),
  }
  return Object.freeze(result)
}

export function createFinancialTransaction(input: {
  readonly id: FinancialTransactionId | string
  readonly organizationId: OrganizationId | string
  readonly effectiveOn: GameDate | string
  readonly transactionType: string
  readonly amount: Money | { readonly currencyCode: string; readonly minorUnits: number }
  readonly postings: readonly {
    readonly accountId: FinancialAccountId | string
    readonly direction: FinancialPostingDirection
    readonly amount: Money | { readonly currencyCode: string; readonly minorUnits: number }
  }[]
  readonly provenance?: FinancialProvenance
  readonly source?: FinancialSource
  readonly description?: string | null
  readonly dimensions?: FinancialDimensionsInput | null
  readonly relatedContractId?: ContractId | string
  readonly relatedEventId?: string
}): FinancialTransaction {
  const amount = createMoney(input.amount)
  if (amount.minorUnits <= 0) throw new RangeError('Financial transaction amount must be greater than zero')
  const postings = Object.freeze(input.postings.map((posting) => createFinancialPosting(posting)))
  if (postings.length < 2) throw new RangeError('Financial transaction requires at least two postings')
  const provenance = input.provenance ?? input.source
  if (provenance === undefined) throw new TypeError('Financial transaction provenance is required')
  const debitTotal = totalPostings(postings, 'DEBIT')
  const creditTotal = totalPostings(postings, 'CREDIT')
  if (debitTotal !== creditTotal || debitTotal !== amount.minorUnits) throw new RangeError('Financial transaction postings must balance to the transaction amount')
  const seenAccounts = new Set<string>()
  for (const posting of postings) {
    if (posting.amount.currencyCode !== amount.currencyCode) throw new RangeError('Financial transaction postings must use the transaction currency')
    const key = String(posting.accountId)
    if (seenAccounts.has(key)) throw new RangeError('Financial transaction cannot debit and credit the same account')
    seenAccounts.add(key)
  }
  const description = input.description === undefined || input.description === null ? null : nonEmptyText(input.description, 'Financial transaction description')
  return Object.freeze({
    id: financialTransactionIdFromString(input.id),
    organizationId: organizationIdFromString(input.organizationId),
    effectiveOn: parseGameDate(input.effectiveOn),
    transactionType: nonEmptyText(input.transactionType, 'Financial transaction type'),
    amount,
    postings,
    provenance: createFinancialSource(provenance),
    description,
    dimensions: input.dimensions === undefined || input.dimensions === null ? null : createFinancialDimensions(input.dimensions),
    ...(input.relatedContractId === undefined ? {} : { relatedContractId: contractIdFromString(input.relatedContractId) }),
    ...(input.relatedEventId === undefined ? {} : { relatedEventId: nonEmptyText(input.relatedEventId, 'Financial transaction related event id') }),
  })
}

export function createFiscalPeriod(input: {
  readonly id: import('@/domain/ids').FiscalPeriodId | string
  readonly organizationId: OrganizationId | string
  readonly label: string
  readonly startsOn: GameDate | string
  readonly endsOn: GameDate | string
  readonly status?: FiscalPeriod['status']
}): FiscalPeriod {
  const startsOn = parseGameDate(input.startsOn)
  const endsOn = parseGameDate(input.endsOn)
  if (compareGameDates(endsOn, startsOn) < 0) throw new RangeError('Fiscal period endsOn cannot precede startsOn')
  if (input.status !== undefined && input.status !== 'OPEN' && input.status !== 'CLOSED') throw new TypeError('Fiscal period status is invalid')
  return Object.freeze({ id: fiscalPeriodIdFromString(input.id), organizationId: organizationIdFromString(input.organizationId), label: nonEmptyText(input.label, 'Fiscal period label'), startsOn, endsOn, status: input.status ?? 'OPEN' })
}

export function createOrganizationFinancialProfile(input: {
  readonly organizationId: OrganizationId | string
  readonly baseCurrencyCode: string
  readonly fiscalYearStartMonth?: number
}): OrganizationFinancialProfile {
  const fiscalYearStartMonth = input.fiscalYearStartMonth ?? 1
  if (!Number.isInteger(fiscalYearStartMonth) || fiscalYearStartMonth < 1 || fiscalYearStartMonth > 12) throw new RangeError('Fiscal year start month must be an integer from 1 to 12')
  return Object.freeze({ organizationId: organizationIdFromString(input.organizationId), baseCurrencyCode: createCurrencyCode(input.baseCurrencyCode), fiscalYearStartMonth })
}

function totalPostings(postings: readonly FinancialPosting[], direction: FinancialPostingDirection): number {
  const total = postings.filter((posting) => posting.direction === direction).reduce((sum, posting) => sum + posting.amount.minorUnits, 0)
  if (!Number.isSafeInteger(total)) throw new RangeError('Financial posting total exceeds safe integer range')
  return total
}

function nonEmptyText(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new TypeError(`${label} must be non-empty`)
  return value
}
