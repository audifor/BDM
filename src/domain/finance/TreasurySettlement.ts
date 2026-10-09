import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import {
  financialTransactionIdFromString,
  organizationIdFromString,
  treasurySettlementIdFromString,
  type FinancialAccountId,
  type FinancialTransactionId,
  type OrganizationId,
  type PayableId,
  type TreasurySettlementId,
} from '@/domain/ids'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { getAccountBalanceAsOfDate } from './FinancialQueries'
import { createCurrencyCode, type CurrencyCode, type FinancialTransaction } from './FinancialLedger'
import { getPayableRemaining, getPayableStatus, settlePayable, type Payable, type TreasurySettlement } from './Treasury'

/**
 * BS16J — the canonical due-payable batch settlement authority.
 *
 * It closes `PAYABLE → PAYMENT` for one Organization and one GameDate without inventing anything: the eligible
 * set is exactly the Organization's own outstanding payables that are already due, in the Organization's own
 * currency, and the payment source is exactly the cash its ledger derives in the canonical operating cash
 * account. There is no creditor priority in BDM, so the policy is all-or-none over the whole due batch: if the
 * available cash covers the entire batch, every payable in it is settled; if it does not, none is, and the
 * obligations stay outstanding with an explicit insufficient-liquidity result. Partial automatic allocation,
 * overdrafts, financing and FX are deliberately not modelled.
 *
 * Settlement is delegated to the existing `settlePayable` primitive (no second settlement engine), so the
 * accounting stays PAYABLE debit / cash credit with no second expense, and the artifact ids are deterministic
 * per payable, which makes replay and save/load idempotent: a settled payable is no longer eligible.
 */
export const DUE_PAYABLE_SETTLEMENT_STATUSES = ['NO_DUE_PAYABLES', 'SETTLED', 'INSUFFICIENT_LIQUIDITY_FOR_DUE_PAYABLES', 'BLOCKED'] as const
export type DuePayableSettlementStatus = (typeof DUE_PAYABLE_SETTLEMENT_STATUSES)[number]

export interface DuePayableBatchEntry {
  readonly payable: Payable
  readonly remainingMinorUnits: number
}

export interface DuePayableBatchQuery {
  readonly organizationId: OrganizationId | string
  readonly currencyCode: CurrencyCode | string
  readonly date: GameDate | string
}

export interface DuePayableSettlementInput extends DuePayableBatchQuery {
  readonly cashAccountId: FinancialAccountId | string
  readonly payableAccountId: FinancialAccountId | string
}

export interface DuePayableSettlementResult {
  readonly status: DuePayableSettlementStatus
  readonly organizationId: OrganizationId
  readonly currencyCode: CurrencyCode
  readonly eligiblePayableCount: number
  readonly totalDueMinorUnits: number
  /** The canonical operating cash account balance before settlement; `null` when nothing was due, so the ledger was never read. */
  readonly availableCashMinorUnits: number | null
  readonly fundingGapMinorUnits: number | null
  readonly settledCount: number
  readonly settledMinorUnits: number
  /** Outstanding due payables in another currency: never converted, never settled, always reported. */
  readonly ineligibleCurrencyPayableCount: number
  readonly reason: string | null
}

export interface DuePayableSettlementApplication {
  readonly world: GameWorld
  readonly result: DuePayableSettlementResult
}

/** Deterministic settlement identity: a payable is automatically settled at most once, so a date replay is a no-op. */
export function duePayableSettlementId(payableId: PayableId | string): TreasurySettlementId {
  return treasurySettlementIdFromString(`finance:treasury:payable-settlement:${String(payableId)}`)
}

export function duePayablePaymentTransactionId(payableId: PayableId | string): FinancialTransactionId {
  return financialTransactionIdFromString(`finance:treasury:payable-payment:${String(payableId)}`)
}

/**
 * The canonical eligible due batch: this Organization's own payables that are outstanding, not cancelled, dated
 * on or before the processed GameDate, and denominated in the Organization's own currency. Deterministic
 * ordering (due date, then id) is used only for execution and reporting after the batch is fundable — never to
 * decide who gets paid.
 */
export function getEligibleDuePayablesForDate(world: GameWorld, query: DuePayableBatchQuery): readonly DuePayableBatchEntry[] {
  return duePayableBatch(world, query).eligible
}

/** Outstanding payables that are due but in another currency, so they are reported instead of silently ignored. */
export function countDuePayablesInOtherCurrency(world: GameWorld, query: DuePayableBatchQuery): number {
  return duePayableBatch(world, query).otherCurrencyCount
}

export function settleDuePayableBatchForDate(world: GameWorld, input: DuePayableSettlementInput): DuePayableSettlementApplication {
  const organizationId = organizationIdFromString(input.organizationId)
  const currencyCode = createCurrencyCode(input.currencyCode)
  const date = parseGameDate(input.date)
  const batch = duePayableBatch(world, { organizationId, currencyCode, date })
  const otherCurrencyReason = 'Due payables exist in another currency; they are never converted and never settled from this currency batch.'

  if (batch.eligible.length === 0) {
    return Object.freeze({
      world,
      result: Object.freeze({
        status: 'NO_DUE_PAYABLES' as const,
        organizationId,
        currencyCode,
        eligiblePayableCount: 0,
        totalDueMinorUnits: 0,
        availableCashMinorUnits: null,
        fundingGapMinorUnits: null,
        settledCount: 0,
        settledMinorUnits: 0,
        ineligibleCurrencyPayableCount: batch.otherCurrencyCount,
        reason: batch.otherCurrencyCount === 0 ? null : otherCurrencyReason,
      }),
    })
  }

  const totalDueMinorUnits = batch.eligible.reduce((sum, entry) => sum + entry.remainingMinorUnits, 0)
  const availableCashMinorUnits = getAccountBalanceAsOfDate(world, input.cashAccountId, date).balanceMinorUnits
  const fundingGapMinorUnits = Math.max(0, totalDueMinorUnits - availableCashMinorUnits)

  if (availableCashMinorUnits < totalDueMinorUnits) {
    return Object.freeze({
      world,
      result: Object.freeze({
        status: 'INSUFFICIENT_LIQUIDITY_FOR_DUE_PAYABLES' as const,
        organizationId,
        currencyCode,
        eligiblePayableCount: batch.eligible.length,
        totalDueMinorUnits,
        availableCashMinorUnits,
        fundingGapMinorUnits,
        settledCount: 0,
        settledMinorUnits: 0,
        ineligibleCurrencyPayableCount: batch.otherCurrencyCount,
        reason: `Cash ${availableCashMinorUnits} ${currencyCode} does not cover the whole due batch of ${totalDueMinorUnits} ${currencyCode}, and BDM has no creditor priority, so no payable is settled automatically.`,
      }),
    })
  }

  // Fully fundable: build the complete batch first and apply it in one world update, so a failure can never
  // leave a half-settled batch behind. `settlePayable` owns the accounting and validates every request.
  try {
    const transactions: FinancialTransaction[] = []
    const settlements: TreasurySettlement[] = []
    for (const entry of batch.eligible) {
      const applied = settlePayable(world, entry.payable.id, {
        settlementId: duePayableSettlementId(entry.payable.id),
        transactionId: duePayablePaymentTransactionId(entry.payable.id),
        amount: { currencyCode, minorUnits: entry.remainingMinorUnits },
        settledOn: date,
        cashAccountId: input.cashAccountId,
        offsetAccountId: input.payableAccountId,
      })
      transactions.push(applied.transaction)
      settlements.push(applied.settlement)
    }
    const settledWorld = updateGameWorld(world, {
      financialTransactions: [...Object.values(world.financialTransactionsById), ...transactions],
      treasuryApplications: [...Object.values(world.treasuryApplicationsById), ...settlements],
    })
    return Object.freeze({
      world: settledWorld,
      result: Object.freeze({
        status: 'SETTLED' as const,
        organizationId,
        currencyCode,
        eligiblePayableCount: batch.eligible.length,
        totalDueMinorUnits,
        availableCashMinorUnits,
        fundingGapMinorUnits: 0,
        settledCount: batch.eligible.length,
        settledMinorUnits: totalDueMinorUnits,
        ineligibleCurrencyPayableCount: batch.otherCurrencyCount,
        reason: batch.otherCurrencyCount === 0 ? null : otherCurrencyReason,
      }),
    })
  } catch (error) {
    return Object.freeze({
      world,
      result: Object.freeze({
        status: 'BLOCKED' as const,
        organizationId,
        currencyCode,
        eligiblePayableCount: batch.eligible.length,
        totalDueMinorUnits,
        availableCashMinorUnits,
        fundingGapMinorUnits,
        settledCount: 0,
        settledMinorUnits: 0,
        ineligibleCurrencyPayableCount: batch.otherCurrencyCount,
        reason: error instanceof Error ? error.message : 'Treasury batch settlement failed',
      }),
    })
  }
}

interface DuePayableBatch {
  readonly eligible: readonly DuePayableBatchEntry[]
  readonly otherCurrencyCount: number
}

function duePayableBatch(world: GameWorld, query: DuePayableBatchQuery): DuePayableBatch {
  const organization = String(organizationIdFromString(query.organizationId))
  const currencyCode = createCurrencyCode(query.currencyCode)
  const date = parseGameDate(query.date)
  const eligible: DuePayableBatchEntry[] = []
  let otherCurrencyCount = 0

  for (const payable of Object.values(world.payablesById)) {
    if (String(payable.organizationId) !== organization) continue
    if (compareGameDates(payable.dueOn, date) > 0) continue
    if (getPayableStatus(world, payable.id, date) !== 'OPEN' && getPayableStatus(world, payable.id, date) !== 'PARTIALLY_SETTLED') continue
    const remaining = getPayableRemaining(world, payable.id, date)
    if (remaining.minorUnits <= 0) continue
    if (remaining.currencyCode !== currencyCode) {
      otherCurrencyCount += 1
      continue
    }
    eligible.push(Object.freeze({ payable, remainingMinorUnits: remaining.minorUnits }))
  }

  eligible.sort((left, right) => compareGameDates(left.payable.dueOn, right.payable.dueOn) || String(left.payable.id).localeCompare(String(right.payable.id)))
  return Object.freeze({ eligible: Object.freeze(eligible), otherCurrencyCount })
}
