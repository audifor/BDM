import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import {
  financialTransactionIdFromString,
  organizationIdFromString,
  treasurySettlementIdFromString,
  type FinancialAccountId,
  type FinancialTransactionId,
  type OrganizationId,
  type ReceivableId,
  type TreasurySettlementId,
} from '@/domain/ids'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { createCurrencyCode, type CurrencyCode, type FinancialTransaction } from './FinancialLedger'
import { getReceivableRemaining, getReceivableStatus, settleReceivable, type Receivable, type TreasurySettlement } from './Treasury'
import type { RevenueSource } from './RevenueEngine'

/**
 * BS16K-C — source-driven receivable collection.
 *
 * A revenue recognition posts a claim, never cash (`CASH ≠ REVENUE`). Whether that claim becomes cash is decided
 * by the **source's own collection policy**, never by a global rule: `COLLECT_ON_DUE_DATE` means the source's
 * contractual payment date is also the date the Organization receives the money, so the same GameDate posts
 * "DR Receivable / CR Revenue" (the revenue engine) and then "DR Cash / CR Receivable" (this authority, through
 * the canonical `settleReceivable` primitive). A source without that policy keeps its receivable outstanding,
 * which stays visible through `getUncollectedRecognizedRevenue`.
 *
 * The authority never invents a payer: it collects exactly the receivables an approved source policy declared
 * collectible, in the Organization's own currency, and it never converts, never partially settles and never
 * touches a claim in another currency. Deterministic settlement and transaction ids make a date replay, a second
 * pass and a save/load cycle no-ops.
 */
export const RECEIVABLE_COLLECTION_STATUSES = ['COLLECTED', 'NOTHING_DUE', 'BLOCKED'] as const
export type ReceivableCollectionStatus = (typeof RECEIVABLE_COLLECTION_STATUSES)[number]

export interface ReceivableCollectionQuery {
  readonly organizationId: OrganizationId | string
  readonly currencyCode: CurrencyCode | string
  readonly date: GameDate | string
}

export interface ReceivableCollectionInput extends ReceivableCollectionQuery {
  readonly cashAccountId: FinancialAccountId | string
  readonly receivableAccountId: FinancialAccountId | string
}

export interface CollectibleReceivableEntry {
  readonly receivable: Receivable
  readonly remainingMinorUnits: number
  readonly sourceId: string
}

export interface ReceivableCollectionResult {
  readonly status: ReceivableCollectionStatus
  readonly organizationId: OrganizationId
  readonly currencyCode: CurrencyCode
  readonly eligibleCount: number
  readonly collectedCount: number
  readonly collectedMinorUnits: number
  /** Due receivables in another currency, or of a source that declares no collection policy: reported, never collected. */
  readonly ineligibleCurrencyReceivableCount: number
  readonly policylessDueReceivableCount: number
  readonly reason: string | null
}

export interface ReceivableCollectionApplication {
  readonly world: GameWorld
  readonly result: ReceivableCollectionResult
}

/** Deterministic identities: a receivable is collected at most once, so a date replay is a no-op. */
export function receivableCollectionSettlementId(receivableId: ReceivableId | string): TreasurySettlementId {
  return treasurySettlementIdFromString(`finance:collection:receivable-settlement:${String(receivableId)}`)
}

export function receivableCollectionReceiptTransactionId(receivableId: ReceivableId | string): FinancialTransactionId {
  return financialTransactionIdFromString(`finance:collection:receivable-receipt:${String(receivableId)}`)
}

/**
 * The canonical collectible batch: this Organization's own receivables that are outstanding, not cancelled, dated
 * on or before the processed GameDate, denominated in the Organization's own currency, and owned by a source whose
 * collection policy says the money arrives on that due date. Deterministic ordering (due date, then id) is used
 * only for execution and reporting, never to prioritize.
 */
export function getCollectibleReceivablesForDate(world: GameWorld, query: ReceivableCollectionQuery): readonly CollectibleReceivableEntry[] {
  return receivableCollectionBatch(world, query).eligible
}

export function collectDueReceivablesForDate(world: GameWorld, input: ReceivableCollectionInput): ReceivableCollectionApplication {
  const organizationId = organizationIdFromString(input.organizationId)
  const currencyCode = createCurrencyCode(input.currencyCode)
  const date = parseGameDate(input.date)
  const batch = receivableCollectionBatch(world, { organizationId, currencyCode, date })
  const otherCurrencyReason = batch.otherCurrencyCount === 0 ? null : 'Due receivables exist in another currency; they are never converted and never collected from this currency batch.'
  const policylessReason = batch.policylessCount === 0 ? null : `${batch.policylessCount} due receivable(s) belong to a source whose collection policy is not COLLECT_ON_DUE_DATE, so they stay outstanding.`

  if (batch.eligible.length === 0) {
    return Object.freeze({
      world,
      result: Object.freeze({
        status: 'NOTHING_DUE' as const,
        organizationId,
        currencyCode,
        eligibleCount: 0,
        collectedCount: 0,
        collectedMinorUnits: 0,
        ineligibleCurrencyReceivableCount: batch.otherCurrencyCount,
        policylessDueReceivableCount: batch.policylessCount,
        reason: [otherCurrencyReason, policylessReason].filter((reason): reason is string => reason !== null).join(' ') || null,
      }),
    })
  }

  const collectedMinorUnits = batch.eligible.reduce((sum, entry) => sum + entry.remainingMinorUnits, 0)
  // Build the complete batch first and apply it in one world update, so a failure can never leave a half-collected
  // batch behind. `settleReceivable` owns the accounting and validates every request.
  try {
    const transactions: FinancialTransaction[] = []
    const settlements: TreasurySettlement[] = []
    for (const entry of batch.eligible) {
      const applied = settleReceivable(world, entry.receivable.id, {
        settlementId: receivableCollectionSettlementId(entry.receivable.id),
        transactionId: receivableCollectionReceiptTransactionId(entry.receivable.id),
        amount: { currencyCode, minorUnits: entry.remainingMinorUnits },
        settledOn: date,
        cashAccountId: input.cashAccountId,
        offsetAccountId: input.receivableAccountId,
      })
      transactions.push(applied.transaction)
      settlements.push(applied.settlement)
    }
    const collectedWorld = updateGameWorld(world, {
      financialTransactions: [...Object.values(world.financialTransactionsById), ...transactions],
      treasuryApplications: [...Object.values(world.treasuryApplicationsById), ...settlements],
    })
    return Object.freeze({
      world: collectedWorld,
      result: Object.freeze({
        status: 'COLLECTED' as const,
        organizationId,
        currencyCode,
        eligibleCount: batch.eligible.length,
        collectedCount: batch.eligible.length,
        collectedMinorUnits,
        ineligibleCurrencyReceivableCount: batch.otherCurrencyCount,
        policylessDueReceivableCount: batch.policylessCount,
        reason: [otherCurrencyReason, policylessReason].filter((reason): reason is string => reason !== null).join(' ') || null,
      }),
    })
  } catch (error) {
    return Object.freeze({
      world,
      result: Object.freeze({
        status: 'BLOCKED' as const,
        organizationId,
        currencyCode,
        eligibleCount: batch.eligible.length,
        collectedCount: 0,
        collectedMinorUnits: 0,
        ineligibleCurrencyReceivableCount: batch.otherCurrencyCount,
        policylessDueReceivableCount: batch.policylessCount,
        reason: error instanceof Error ? error.message : 'Receivable collection failed',
      }),
    })
  }
}

interface ReceivableCollectionBatch {
  readonly eligible: readonly CollectibleReceivableEntry[]
  readonly otherCurrencyCount: number
  readonly policylessCount: number
}

function receivableCollectionBatch(world: GameWorld, query: ReceivableCollectionQuery): ReceivableCollectionBatch {
  const organization = String(organizationIdFromString(query.organizationId))
  const currencyCode = createCurrencyCode(query.currencyCode)
  const date = parseGameDate(query.date)
  const collectingSources = collectingSourceByReceivable(world, organization)
  const eligible: CollectibleReceivableEntry[] = []
  let otherCurrencyCount = 0
  let policylessCount = 0

  for (const receivable of Object.values(world.receivablesById)) {
    if (String(receivable.organizationId) !== organization) continue
    if (compareGameDates(receivable.dueOn, date) > 0) continue
    const status = getReceivableStatus(world, receivable.id, date)
    if (status !== 'OPEN' && status !== 'PARTIALLY_SETTLED') continue
    const remaining = getReceivableRemaining(world, receivable.id, date)
    if (remaining.minorUnits <= 0) continue
    if (remaining.currencyCode !== currencyCode) {
      otherCurrencyCount += 1
      continue
    }
    const sourceId = collectingSources.get(String(receivable.id))
    if (sourceId === undefined) {
      policylessCount += 1
      continue
    }
    eligible.push(Object.freeze({ receivable, remainingMinorUnits: remaining.minorUnits, sourceId }))
  }

  eligible.sort((left, right) => compareGameDates(left.receivable.dueOn, right.receivable.dueOn) || String(left.receivable.id).localeCompare(String(right.receivable.id)))
  return Object.freeze({ eligible: Object.freeze(eligible), otherCurrencyCount, policylessCount })
}

/**
 * Receivable → source mapping through the canonical recognition reference the revenue engine records
 * (`dimensions.reference = { kind: 'REVENUE_SOURCE', id: sourceId }`). Only sources whose own policy says the
 * money arrives on the due date are mapped, so this never becomes a global "collect everything" rule.
 */
function collectingSourceByReceivable(world: GameWorld, organizationId: string): ReadonlyMap<string, string> {
  const mapping = new Map<string, string>()
  for (const recognition of Object.values(world.revenueRecognitionsById)) {
    if (String(recognition.organizationId) !== organizationId) continue
    if (recognition.receivableId === null) continue
    const reference = recognition.dimensions?.reference
    if (reference === undefined || reference.kind !== 'REVENUE_SOURCE') continue
    const source: RevenueSource | undefined = world.revenueSourcesById[reference.id as never]
    if (source === undefined || source.status !== 'ACTIVE' || source.collectionPolicy !== 'COLLECT_ON_DUE_DATE') continue
    mapping.set(String(recognition.receivableId), String(source.id))
  }
  return mapping
}
