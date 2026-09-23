import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import type { OrganizationId, FinancialAccountId } from '@/domain/ids'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { createAuthorizedEconomicEvent, processDebtInterestEconomicEvent, type EconomicEventAdapterOptions, type EconomicEventAdapterResult } from './EconomicEventAdapters'
import { createFinancialDimensions, createFinancialSource, createFinancialTransaction, createMoney, type CurrencyCode, type FinancialDimensionsInput, type FinancialSource, type FinancialTransaction, type Money } from './FinancialLedger'
import { createOwnerFundingTransaction, getPayableSettledAmount, type TreasuryCounterparty } from './Treasury'

export const DEBT_TYPES = ['TERM_LOAN', 'CREDIT_FACILITY', 'OWNER_LOAN', 'BRIDGE_FINANCING', 'OTHER_DEBT'] as const
export type DebtType = typeof DEBT_TYPES[number]
export type DebtStatus = 'ACTIVE' | 'INACTIVE' | 'PAID_OFF' | 'DEFAULTED'
export type DebtInterest =
  | { readonly kind: 'NONE' }
  | { readonly kind: 'FIXED_RATE'; readonly annualRateBps: number; readonly periods: readonly DebtInterestPeriod[] }
  | { readonly kind: 'EXPLICIT_SCHEDULE'; readonly entries: readonly DebtInterestEntry[] }
export interface DebtInterestPeriod { readonly startsOn: GameDate; readonly endsOn: GameDate; readonly dueOn: GameDate }
export interface DebtInterestEntry { readonly recognitionOn: GameDate; readonly dueOn: GameDate; readonly amount: Money }
export type DebtRepayment =
  | { readonly kind: 'BULLET' }
  | { readonly kind: 'EXPLICIT_SCHEDULE'; readonly entries: readonly DebtPrincipalRepayment[] }
export interface DebtPrincipalRepayment { readonly repaymentOn: GameDate; readonly amount: Money }

export interface DebtInstrument {
  readonly id: string
  readonly organizationId: OrganizationId
  readonly lender: TreasuryCounterparty
  readonly debtType: DebtType
  readonly currencyCode: CurrencyCode
  readonly originalPrincipal: Money
  readonly startsOn: GameDate
  readonly maturityOn: GameDate
  readonly interest: DebtInterest
  readonly repayment: DebtRepayment
  readonly status: DebtStatus
  readonly provenance: FinancialSource
  readonly governanceAuthorizationReference: FinancialSource | null
  readonly dimensions: import('./FinancialLedger').FinancialDimensions | null
}

export interface DebtScheduleEntry {
  readonly id: string
  readonly debtInstrumentId: string
  readonly organizationId: OrganizationId
  readonly kind: 'DRAWDOWN' | 'PRINCIPAL_REPAYMENT' | 'INTEREST'
  readonly amount: Money
  readonly effectiveOn: GameDate
  readonly dueOn: GameDate
  readonly provenance: FinancialSource
  readonly dimensions: import('./FinancialLedger').FinancialDimensions | null
}

export interface DebtLedgerMapping { readonly cashAccountId: FinancialAccountId | string; readonly debtLiabilityAccountId: FinancialAccountId | string; readonly interestPayableAccountId?: FinancialAccountId | string; readonly interestExpenseAccountId?: FinancialAccountId | string }
export interface DebtMaterialization { readonly status: 'accepted' | 'alreadyProcessed' | 'rejected'; readonly world: GameWorld; readonly date: GameDate; readonly entries: readonly DebtScheduleEntry[]; readonly results: readonly (EconomicEventAdapterResult | { readonly transaction: FinancialTransaction; readonly kind: 'DRAWDOWN' | 'PRINCIPAL_REPAYMENT' })[]; readonly error?: string }

export function createDebtInstrument(input: {
  readonly id: string; readonly organizationId: OrganizationId | string; readonly lender: TreasuryCounterparty; readonly debtType: DebtType; readonly currencyCode: string; readonly originalPrincipal: Money | { readonly currencyCode: string; readonly minorUnits: number }; readonly startsOn: GameDate | string; readonly maturityOn: GameDate | string; readonly interest?: DebtInterestInput; readonly repayment?: DebtRepaymentInput; readonly status?: DebtStatus; readonly provenance: FinancialSource; readonly governanceAuthorizationReference?: FinancialSource | null; readonly dimensions?: FinancialDimensionsInput | null
}): DebtInstrument {
  const startsOn = parseGameDate(input.startsOn); const maturityOn = parseGameDate(input.maturityOn)
  if (compareGameDates(maturityOn, startsOn) < 0) throw new RangeError('Debt maturityOn cannot precede startsOn')
  if (!DEBT_TYPES.includes(input.debtType)) throw new TypeError('Debt type is invalid')
  const originalPrincipal = positiveMoney(input.originalPrincipal)
  const interest = normalizeInterest(input.interest, originalPrincipal.currencyCode)
  const repayment = normalizeRepayment(input.repayment, originalPrincipal.currencyCode)
  if (repayment.kind === 'EXPLICIT_SCHEDULE' && repayment.entries.reduce((sum, item) => sum + item.amount.minorUnits, 0) > originalPrincipal.minorUnits) throw new RangeError('Debt repayment schedule exceeds original principal')
  return Object.freeze({ id: nonEmpty(input.id, 'Debt instrument id'), organizationId: input.organizationId as OrganizationId, lender: Object.freeze({ ...input.lender }), debtType: input.debtType, currencyCode: originalPrincipal.currencyCode, originalPrincipal, startsOn, maturityOn, interest, repayment, status: input.status ?? 'ACTIVE', provenance: createFinancialSource(input.provenance), governanceAuthorizationReference: input.governanceAuthorizationReference === undefined || input.governanceAuthorizationReference === null ? null : createFinancialSource(input.governanceAuthorizationReference), dimensions: input.dimensions === undefined || input.dimensions === null ? null : createFinancialDimensions(input.dimensions) })
}

type DebtInterestInput = DebtInterest | { readonly kind: 'FIXED_RATE'; readonly annualRateBps: number; readonly periods?: readonly { readonly startsOn: GameDate | string; readonly endsOn: GameDate | string; readonly dueOn: GameDate | string }[] } | { readonly kind: 'EXPLICIT_SCHEDULE'; readonly entries: readonly { readonly recognitionOn: GameDate | string; readonly dueOn: GameDate | string; readonly amount: Money | { readonly currencyCode: string; readonly minorUnits: number } }[] }
type DebtRepaymentInput = DebtRepayment | { readonly kind: 'EXPLICIT_SCHEDULE'; readonly entries: readonly { readonly repaymentOn: GameDate | string; readonly amount: Money | { readonly currencyCode: string; readonly minorUnits: number } }[] }

export function getDebtSchedule(world: GameWorld, debtId: string): readonly DebtScheduleEntry[] {
  const debt = world.debtInstrumentsById[debtId]; if (debt === undefined) throw new Error(`Unknown debt instrument ${debtId}`)
  const entries: DebtScheduleEntry[] = [{ id: `debt-schedule:${debt.id}:drawdown`, debtInstrumentId: debt.id, organizationId: debt.organizationId, kind: 'DRAWDOWN', amount: debt.originalPrincipal, effectiveOn: debt.startsOn, dueOn: debt.startsOn, provenance: debt.provenance, dimensions: debt.dimensions }]
  if (debt.repayment.kind === 'BULLET') entries.push({ id: `debt-schedule:${debt.id}:bullet`, debtInstrumentId: debt.id, organizationId: debt.organizationId, kind: 'PRINCIPAL_REPAYMENT', amount: debt.originalPrincipal, effectiveOn: debt.maturityOn, dueOn: debt.maturityOn, provenance: debt.provenance, dimensions: debt.dimensions })
  else debt.repayment.entries.forEach((item, index) => entries.push({ id: `debt-schedule:${debt.id}:principal:${index + 1}`, debtInstrumentId: debt.id, organizationId: debt.organizationId, kind: 'PRINCIPAL_REPAYMENT', amount: item.amount, effectiveOn: item.repaymentOn, dueOn: item.repaymentOn, provenance: debt.provenance, dimensions: debt.dimensions }))
  if (debt.interest.kind === 'EXPLICIT_SCHEDULE') debt.interest.entries.forEach((item, index) => entries.push({ id: `debt-schedule:${debt.id}:interest:${index + 1}`, debtInstrumentId: debt.id, organizationId: debt.organizationId, kind: 'INTEREST', amount: item.amount, effectiveOn: item.recognitionOn, dueOn: item.dueOn, provenance: debt.provenance, dimensions: debt.dimensions }))
  if (debt.interest.kind === 'FIXED_RATE') for (const [index, period] of debt.interest.periods.entries()) {
    const principal = getOutstandingPrincipal(world, debt.id, addDate(period.startsOn, -1)).minorUnits
    const days = Math.max(1, dayDistance(period.startsOn, period.endsOn) + 1)
    const amount = Math.floor(principal * debt.interest.annualRateBps * days / (365 * 10_000))
    if (amount > 0) entries.push({ id: `debt-schedule:${debt.id}:interest:${index + 1}`, debtInstrumentId: debt.id, organizationId: debt.organizationId, kind: 'INTEREST', amount: { currencyCode: debt.currencyCode, minorUnits: amount }, effectiveOn: period.endsOn, dueOn: period.dueOn, provenance: debt.provenance, dimensions: debt.dimensions })
  }
  return Object.freeze(entries.sort((left, right) => compareGameDates(left.effectiveOn, right.effectiveOn) || left.id.localeCompare(right.id)))
}

export function getOutstandingPrincipal(world: GameWorld, debtId: string, asOfDate: GameDate | string = world.currentDate): Money {
  const debt = world.debtInstrumentsById[debtId]; if (debt === undefined) throw new Error(`Unknown debt instrument ${debtId}`); const asOf = parseGameDate(asOfDate); let amount = 0
  for (const transaction of Object.values(world.financialTransactionsById)) {
    if (transaction.organizationId !== debt.organizationId || transaction.dimensions?.reference?.kind !== 'DEBT_INSTRUMENT' || transaction.dimensions.reference.id !== debt.id || transaction.amount.currencyCode !== debt.currencyCode || compareGameDates(transaction.effectiveOn, asOf) > 0) continue
    if (transaction.transactionType === 'DEBT_DRAWDOWN') amount += transaction.amount.minorUnits
    if (transaction.transactionType === 'DEBT_PRINCIPAL_REPAYMENT') amount -= transaction.amount.minorUnits
  }
  if (amount < 0 || !Number.isSafeInteger(amount)) throw new RangeError('Debt outstanding principal is invalid')
  return Object.freeze({ currencyCode: debt.currencyCode, minorUnits: amount })
}

export function materializeDebtFinanceForDate(world: GameWorld, dateInput: GameDate | string, options: { readonly organizationId: OrganizationId | string; readonly debtId?: string; readonly currencyCode?: string; readonly ledger: DebtLedgerMapping; readonly materializeSubledger?: boolean }): DebtMaterialization {
  const date = parseGameDate(dateInput); const debts = Object.values(world.debtInstrumentsById).filter((item) => item.organizationId === options.organizationId && (options.debtId === undefined || item.id === options.debtId) && (options.currencyCode === undefined || item.currencyCode === options.currencyCode) && item.status === 'ACTIVE'); const entries = debts.flatMap((debt) => getDebtSchedule(world, debt.id)).filter((entry) => entry.effectiveOn === date)
  let currentWorld = world; const results: DebtMaterialization['results'][number][] = []
  try {
    for (const entry of entries) {
      if (isDebtEntryMaterialized(currentWorld, entry)) continue
      if (entry.kind === 'DRAWDOWN' || entry.kind === 'PRINCIPAL_REPAYMENT') {
        const debt = currentWorld.debtInstrumentsById[entry.debtInstrumentId]!; const outstanding = getOutstandingPrincipal(currentWorld, debt.id, date)
        if (entry.kind === 'PRINCIPAL_REPAYMENT' && entry.amount.minorUnits > outstanding.minorUnits) throw new RangeError(`Debt repayment ${entry.id} exceeds outstanding principal`)
        const transaction = createDebtTransaction(currentWorld, entry, options.ledger)
        currentWorld = updateGameWorld(currentWorld, { financialTransactions: [...Object.values(currentWorld.financialTransactionsById), transaction] }); results.push({ transaction, kind: entry.kind })
      } else {
        const debt = currentWorld.debtInstrumentsById[entry.debtInstrumentId]!; if (options.ledger.interestPayableAccountId === undefined || options.ledger.interestExpenseAccountId === undefined) throw new TypeError('Debt interest requires payable and expense ledger accounts')
        const event = createAuthorizedEconomicEvent({ id: `debt-interest-event:${entry.id}`, eventType: 'DEBT_INTEREST_RECOGNITION', sourceAuthority: 'DEBT_ENGINE', sourceEntityId: debt.id, organizationId: debt.organizationId, effectiveOn: entry.effectiveOn, dueOn: entry.dueOn, amount: entry.amount, provenance: { kind: 'DEBT_INSTRUMENT', id: debt.id }, idempotencyKey: entry.id, counterparty: debt.lender, dimensions: { ...(debt.dimensions ?? {}), reference: { kind: 'DEBT_INSTRUMENT', id: debt.id } }, expenseCategory: 'INTEREST_EXPENSE' })
        const result = processDebtInterestEconomicEvent(currentWorld, event, { recognize: true, materializeSubledger: options.materializeSubledger ?? true, ledger: { offsetAccountId: options.ledger.interestPayableAccountId, resultAccountId: options.ledger.interestExpenseAccountId } }); if (result.status === 'rejected') throw new Error(result.error ?? 'Debt interest materialization rejected'); currentWorld = result.world; results.push(result)
      }
    }
    return Object.freeze({ status: results.some((item) => item.transaction !== undefined || ('status' in item && item.status === 'accepted')) ? 'accepted' : 'alreadyProcessed', world: currentWorld, date, entries: Object.freeze(entries), results: Object.freeze(results) })
  } catch (error) { return Object.freeze({ status: 'rejected', world, date, entries: Object.freeze(entries), results: Object.freeze(results), error: error instanceof Error ? error.message : String(error) }) }
}

export function materializeCapitalContribution(world: GameWorld, input: { readonly organizationId: OrganizationId | string; readonly amount: Money | { readonly currencyCode: string; readonly minorUnits: number }; readonly effectiveOn: GameDate | string; readonly sourceAuthority?: 'OWNERSHIP' | 'GOVERNANCE'; readonly sourceEntityId: string; readonly provenance: FinancialSource; readonly cashAccountId: FinancialAccountId | string; readonly equityAccountId: FinancialAccountId | string; readonly governanceAuthorizationReference?: FinancialSource | null }): GameWorld {
  const event = createAuthorizedEconomicEvent({ id: `capital-contribution:${input.sourceEntityId}`, eventType: 'OWNER_FUNDING', sourceAuthority: input.sourceAuthority ?? 'GOVERNANCE', sourceEntityId: input.sourceEntityId, organizationId: input.organizationId, effectiveOn: input.effectiveOn, dueOn: input.effectiveOn, amount: input.amount, provenance: input.provenance, idempotencyKey: input.sourceEntityId, dimensions: { reference: { kind: 'CAPITAL_CONTRIBUTION', id: input.sourceEntityId } } }); const transaction = createOwnerFundingTransaction(world, { transactionId: `financial:capital:${input.sourceEntityId}`, organizationId: input.organizationId, amount: event.amount, effectiveOn: event.effectiveOn, cashAccountId: input.cashAccountId, offsetAccountId: input.equityAccountId, provenance: { kind: 'AUTHORIZED_ECONOMIC_EVENT', id: `${event.sourceAuthority}:${event.sourceEntityId}:${event.idempotencyKey}` }, dimensions: event.dimensions }); return updateGameWorld(world, { financialTransactions: [...Object.values(world.financialTransactionsById), transaction] })
}

export function materializeOwnerDistribution(world: GameWorld, input: { readonly organizationId: OrganizationId | string; readonly amount: Money | { readonly currencyCode: string; readonly minorUnits: number }; readonly effectiveOn: GameDate | string; readonly sourceEntityId: string; readonly provenance: FinancialSource; readonly cashAccountId: FinancialAccountId | string; readonly equityAccountId: FinancialAccountId | string; readonly governanceAuthorizationReference: FinancialSource }): GameWorld {
  const amount = positiveMoney(input.amount); const cash = world.financialAccountsById[input.cashAccountId as FinancialAccountId]; const equity = world.financialAccountsById[input.equityAccountId as FinancialAccountId]; if (!cash || !equity || cash.organizationId !== input.organizationId || equity.organizationId !== input.organizationId || cash.currencyCode !== amount.currencyCode || equity.currencyCode !== amount.currencyCode || !cash.accountType.startsWith('CASH') || equity.accountType !== 'EQUITY') throw new TypeError('Owner distribution account mapping is invalid')
  const transaction = createFinancialTransaction({ id: `financial:owner-distribution:${input.sourceEntityId}`, organizationId: input.organizationId, effectiveOn: input.effectiveOn, transactionType: 'OWNER_DISTRIBUTION', amount, postings: [{ accountId: equity.id, direction: 'DEBIT', amount }, { accountId: cash.id, direction: 'CREDIT', amount }], provenance: input.provenance, dimensions: { reference: { kind: 'OWNER_DISTRIBUTION', id: input.sourceEntityId } } }); return updateGameWorld(world, { financialTransactions: [...Object.values(world.financialTransactionsById), transaction] })
}

export function getDebtServiceForecast(world: GameWorld, input: { readonly organizationId: OrganizationId | string; readonly from: GameDate | string; readonly to: GameDate | string; readonly currencyCode?: string }): readonly { readonly effectiveOn: GameDate; readonly currencyCode: CurrencyCode; readonly principalMinorUnits: number; readonly interestMinorUnits: number; readonly cashOutflowMinorUnits: number }[] {
  const from = parseGameDate(input.from); const to = parseGameDate(input.to); if (compareGameDates(to, from) < 0) throw new RangeError('Debt service forecast to cannot precede from'); const grouped = new Map<string, { principal: number; interest: number }>()
  for (const debt of Object.values(world.debtInstrumentsById).filter((item) => item.organizationId === input.organizationId && (input.currencyCode === undefined || item.currencyCode === input.currencyCode))) for (const entry of getDebtSchedule(world, debt.id)) if (entry.kind !== 'DRAWDOWN' && compareGameDates(entry.effectiveOn, from) >= 0 && compareGameDates(entry.effectiveOn, to) <= 0) { const row = grouped.get(entry.effectiveOn) ?? { principal: 0, interest: 0 }; if (entry.kind === 'INTEREST') row.interest += entry.amount.minorUnits; else row.principal += entry.amount.minorUnits; grouped.set(entry.effectiveOn, row) }
  return Object.freeze([...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([effectiveOn, row]) => Object.freeze({ effectiveOn: effectiveOn as GameDate, currencyCode: (input.currencyCode ?? Object.values(world.debtInstrumentsById).find((item) => item.organizationId === input.organizationId)!.currencyCode) as CurrencyCode, principalMinorUnits: row.principal, interestMinorUnits: row.interest, cashOutflowMinorUnits: row.principal + row.interest })))
}

export function getActiveDebtInstruments(world: GameWorld, organizationId: OrganizationId | string, asOfDate: GameDate | string = world.currentDate): readonly DebtInstrument[] { const asOf = parseGameDate(asOfDate); return Object.values(world.debtInstrumentsById).filter((item) => item.organizationId === organizationId && item.status === 'ACTIVE' && compareGameDates(item.startsOn, asOf) <= 0 && compareGameDates(item.maturityOn, asOf) >= 0).sort((left, right) => compareGameDates(left.maturityOn, right.maturityOn) || left.id.localeCompare(right.id)) }
export function getDebtMaturities(world: GameWorld, organizationId: OrganizationId | string, throughDate: GameDate | string): readonly DebtScheduleEntry[] { const through = parseGameDate(throughDate); return Object.values(world.debtInstrumentsById).filter((item) => item.organizationId === organizationId).flatMap((item) => getDebtSchedule(world, item.id)).filter((entry) => entry.kind === 'PRINCIPAL_REPAYMENT' && compareGameDates(entry.dueOn, through) <= 0).sort((left, right) => compareGameDates(left.dueOn, right.dueOn) || left.id.localeCompare(right.id)) }
export function getDebtInterestRecognized(world: GameWorld, organizationId: OrganizationId | string, asOfDate: GameDate | string = world.currentDate): readonly { readonly currencyCode: CurrencyCode; readonly minorUnits: number }[] { const asOf = parseGameDate(asOfDate); return sumByCurrency(Object.values(world.expenseRecognitionsById).filter((item) => item.organizationId === organizationId && item.category === 'INTEREST_EXPENSE' && compareGameDates(item.recognizedOn, asOf) <= 0)) }
export function getDebtInterestPaid(world: GameWorld, organizationId: OrganizationId | string, asOfDate: GameDate | string = world.currentDate): readonly { readonly currencyCode: CurrencyCode; readonly minorUnits: number }[] { const asOf = parseGameDate(asOfDate); return sumByCurrency(Object.values(world.expenseRecognitionsById).filter((item) => item.organizationId === organizationId && item.category === 'INTEREST_EXPENSE' && item.payableId !== null).map((item) => ({ amount: getPayableSettledAmount(world, item.payableId!, asOf) }))) }
export function getFinancingTransactions(world: GameWorld, organizationId: OrganizationId | string, from?: GameDate | string, to?: GameDate | string): readonly FinancialTransaction[] { return Object.values(world.financialTransactionsById).filter((item) => item.organizationId === organizationId && ['DEBT_DRAWDOWN', 'DEBT_PRINCIPAL_REPAYMENT', 'OWNER_FUNDING_RECEIPT', 'OWNER_DISTRIBUTION'].includes(item.transactionType) && (from === undefined || compareGameDates(item.effectiveOn, parseGameDate(from)) >= 0) && (to === undefined || compareGameDates(item.effectiveOn, parseGameDate(to)) <= 0)).sort((left, right) => compareGameDates(left.effectiveOn, right.effectiveOn) || String(left.id).localeCompare(String(right.id))) }

export function validateDebtInstrumentCollections(debts: readonly DebtInstrument[], world: Pick<GameWorld, 'organizationsById' | 'financialAccountsById'>): void { const ids = new Set<string>(); for (const debt of debts) { if (ids.has(debt.id)) throw new Error(`Duplicate debt instrument ${debt.id}`); ids.add(debt.id); if (!world.organizationsById[debt.organizationId]) throw new Error(`Debt instrument ${debt.id} references an unknown Organization`); if (debt.lender.kind === 'ORGANIZATION' && debt.lender.id !== undefined && !world.organizationsById[debt.lender.id as OrganizationId]) throw new Error(`Debt instrument ${debt.id} references an unknown lender Organization`) } }

function createDebtTransaction(world: GameWorld, entry: DebtScheduleEntry, ledger: DebtLedgerMapping): FinancialTransaction { const debt = world.debtInstrumentsById[entry.debtInstrumentId]!; const cash = world.financialAccountsById[ledger.cashAccountId as FinancialAccountId]; const liability = world.financialAccountsById[ledger.debtLiabilityAccountId as FinancialAccountId]; if (!cash || !liability || cash.organizationId !== debt.organizationId || liability.organizationId !== debt.organizationId || cash.currencyCode !== debt.currencyCode || liability.currencyCode !== debt.currencyCode || !cash.accountType.startsWith('CASH') || liability.accountType !== 'LIABILITY') throw new TypeError('Debt ledger account mapping is invalid'); const repayment = entry.kind === 'PRINCIPAL_REPAYMENT'; return createFinancialTransaction({ id: `financial:debt:${entry.id}`, organizationId: debt.organizationId, effectiveOn: entry.effectiveOn, transactionType: repayment ? 'DEBT_PRINCIPAL_REPAYMENT' : 'DEBT_DRAWDOWN', amount: entry.amount, postings: repayment ? [{ accountId: liability.id, direction: 'DEBIT', amount: entry.amount }, { accountId: cash.id, direction: 'CREDIT', amount: entry.amount }] : [{ accountId: cash.id, direction: 'DEBIT', amount: entry.amount }, { accountId: liability.id, direction: 'CREDIT', amount: entry.amount }], provenance: { kind: 'DEBT_SCHEDULE_ENTRY', id: entry.id }, dimensions: { ...(entry.dimensions ?? {}), reference: { kind: 'DEBT_INSTRUMENT', id: debt.id } } }) }
function isDebtEntryMaterialized(world: GameWorld, entry: DebtScheduleEntry): boolean { return Object.values(world.financialTransactionsById).some((item) => item.provenance.kind === 'DEBT_SCHEDULE_ENTRY' && item.provenance.id === entry.id) || Object.values(world.expenseRecognitionsById).some((item) => item.provenance.kind === 'AUTHORIZED_ECONOMIC_EVENT' && item.provenance.id === `DEBT_ENGINE:${entry.debtInstrumentId}:${entry.id}`) }
function normalizeInterest(input: DebtInterestInput | undefined, currency: CurrencyCode): DebtInterest { if (!input || input.kind === 'NONE') return { kind: 'NONE' }; if (input.kind === 'FIXED_RATE') { if (!Number.isSafeInteger(input.annualRateBps) || input.annualRateBps < 0 || !input.periods) throw new TypeError('Fixed debt interest requires integer annualRateBps and explicit periods'); return { kind: 'FIXED_RATE', annualRateBps: input.annualRateBps, periods: input.periods.map((period) => ({ startsOn: parseGameDate(period.startsOn), endsOn: parseGameDate(period.endsOn), dueOn: parseGameDate(period.dueOn) })) } } return { kind: 'EXPLICIT_SCHEDULE', entries: input.entries.map((item) => ({ recognitionOn: parseGameDate(item.recognitionOn), dueOn: parseGameDate(item.dueOn), amount: sameCurrency(positiveMoney(item.amount), currency) })) } }
function normalizeRepayment(input: DebtRepaymentInput | undefined, currency: CurrencyCode): DebtRepayment { if (!input || input.kind === 'BULLET') return { kind: 'BULLET' }; return { kind: 'EXPLICIT_SCHEDULE', entries: input.entries.map((item) => ({ repaymentOn: parseGameDate(item.repaymentOn), amount: sameCurrency(positiveMoney(item.amount), currency) })) } }
function positiveMoney(input: Money | { readonly currencyCode: string; readonly minorUnits: number }): Money { const amount = createMoney(input); if (amount.minorUnits <= 0) throw new RangeError('Debt money must be greater than zero'); return amount }
function sameCurrency(amount: Money, currency: CurrencyCode): Money { if (amount.currencyCode !== currency) throw new RangeError('Debt schedules must use the instrument currency'); return amount }
function dayDistance(from: GameDate, to: GameDate): number { const left = Date.parse(`${from}T00:00:00Z`); const right = Date.parse(`${to}T00:00:00Z`); if (!Number.isFinite(left) || !Number.isFinite(right)) throw new RangeError('Debt interest period date is invalid'); return Math.round((right - left) / 86_400_000) }
function addDate(date: GameDate, days: number): GameDate { const parsed = new Date(`${date}T00:00:00Z`); parsed.setUTCDate(parsed.getUTCDate() + days); return parseGameDate(parsed.toISOString().slice(0, 10)) }
function nonEmpty(value: string, label: string): string { if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${label} must be non-empty`); return value }
function sumByCurrency(items: readonly { readonly amount: Money }[]): readonly { readonly currencyCode: CurrencyCode; readonly minorUnits: number }[] { const totals = new Map<CurrencyCode, number>(); for (const item of items) totals.set(item.amount.currencyCode, (totals.get(item.amount.currencyCode) ?? 0) + item.amount.minorUnits); return Object.freeze([...totals.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([currencyCode, minorUnits]) => Object.freeze({ currencyCode, minorUnits }))) }
