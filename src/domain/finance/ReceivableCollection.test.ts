import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { createGameDate } from '@/domain/date'
import {
  collectDueReceivablesForDate,
  createRevenueSource,
  getCashBalancesByCurrency,
  getCollectibleReceivablesForDate,
  getOrganizationFinanceAccounts,
  getReceivableRemaining,
  getUncollectedRecognizedRevenue,
  legacyMajorUnitsToMoney,
  receivableCollectionReceiptTransactionId,
  receivableCollectionSettlementId,
} from '@/domain/finance'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { processClubFinanceForDate } from '@/engine/finance/ClubFinanceLifecycle'

/**
 * BS16K-C certification of the receivable-collection authority: accrual revenue becomes cash **only** when the
 * owning source's own policy declares its due date collectible. There is no global "collect every receivable"
 * rule, collection is idempotent and save-safe, a claim is never collected before its contractual date, and a
 * currency the club does not hold is reported instead of converted.
 */
const ORGANIZATION = 'generated-team-0009'
const USD = 'USD'
const AMOUNT_MINOR_UNITS = legacyMajorUnitsToMoney(50_000, USD).minorUnits

function worldWithSource(policy: 'NONE' | 'COLLECT_ON_DUE_DATE', dates: { readonly recognitionOn?: string; readonly dueOn?: string } = {}): GameWorld {
  const world = createNewGame()
  const recognitionOn = dates.recognitionOn ?? '2032-10-05'
  const dueOn = dates.dueOn ?? recognitionOn
  const source = createRevenueSource({
    id: 'test-revenue-source:participation',
    organizationId: ORGANIZATION,
    category: 'COMPETITION',
    currencyCode: USD,
    amount: { currencyCode: USD, minorUnits: AMOUNT_MINOR_UNITS },
    startsOn: recognitionOn,
    endsOn: '2033-06-30',
    sourceAuthority: 'COMPETITION',
    generationPolicy: 'EXPLICIT_SCHEDULE',
    dueDatePolicy: 'ON_RECOGNITION',
    collectionPolicy: policy,
    paymentSchedule: [{ recognitionOn, dueOn, amount: { currencyCode: USD, minorUnits: AMOUNT_MINOR_UNITS } }],
    provenance: { kind: 'TEST_ECONOMIC_POLICY', id: 'test-revenue-source:participation', description: 'Collection authority test source' },
  })
  return updateGameWorld(world, { revenueSources: [...Object.values(world.revenueSourcesById), source] })
}

function accountsOf(world: GameWorld) {
  const accounts = getOrganizationFinanceAccounts(world, ORGANIZATION, USD)
  if (accounts === null) throw new Error('test world is missing canonical finance accounts')
  return accounts
}

function cashOf(world: GameWorld, asOfDate?: string): number {
  return getCashBalancesByCurrency(world, ORGANIZATION, asOfDate ?? world.currentDate).reduce((sum, row) => sum + row.totalCashMinorUnits, 0)
}

function receivablesOf(world: GameWorld) {
  return Object.values(world.receivablesById).filter((item) => String(item.organizationId) === ORGANIZATION)
}

describe('BS16K-C receivable collection authority', () => {
  it('collects a revenue claim into cash when its own source policy declares the due date collectible', () => {
    const world = worldWithSource('COLLECT_ON_DUE_DATE')
    const collected = processClubFinanceForDate(world, createGameDate(2032, 10, 5)).world

    const receivables = receivablesOf(collected)
    expect(receivables).toHaveLength(1)
    expect(cashOf(collected, '2032-10-05')).toBe(AMOUNT_MINOR_UNITS)
    expect(getReceivableRemaining(collected, receivables[0]!.id, '2032-10-05').minorUnits).toBe(0)
    expect(getUncollectedRecognizedRevenue(collected, ORGANIZATION, '2032-10-05')).toHaveLength(0)

    // The receipt is the canonical Treasury posting against the receivable, with deterministic identity.
    const applications = Object.values(collected.treasuryApplicationsById)
    expect(applications).toHaveLength(1)
    expect(applications[0]!.obligationKind).toBe('RECEIVABLE')
    expect(String(applications[0]!.id)).toBe(String(receivableCollectionSettlementId(receivables[0]!.id)))
    expect(String(applications[0]!.transactionId)).toBe(String(receivableCollectionReceiptTransactionId(receivables[0]!.id)))
  })

  it('never collects a receivable whose source declares no collection policy', () => {
    const world = worldWithSource('NONE')
    const recognized = processClubFinanceForDate(world, createGameDate(2032, 10, 5)).world

    expect(receivablesOf(recognized)).toHaveLength(1)
    expect(cashOf(recognized, '2032-10-05')).toBe(0)
    expect(Object.keys(recognized.treasuryApplicationsById)).toEqual([])
    expect(getUncollectedRecognizedRevenue(recognized, ORGANIZATION, '2032-10-05')).toHaveLength(1)
    expect(getCollectibleReceivablesForDate(recognized, { organizationId: ORGANIZATION, currencyCode: USD, date: '2032-10-05' })).toEqual([])
  })

  it('collects a claim exactly on its contractual date, never before it, and replays a collected date as a no-op', () => {
    const world = worldWithSource('COLLECT_ON_DUE_DATE', { recognitionOn: '2032-10-05', dueOn: '2032-10-06' })
    const beforeDue = processClubFinanceForDate(world, createGameDate(2032, 10, 5)).world
    // The claim exists and is contractually due tomorrow: it is not collected early.
    expect(receivablesOf(beforeDue)).toHaveLength(1)
    expect(cashOf(beforeDue, '2032-10-05')).toBe(0)
    expect(getCollectibleReceivablesForDate(beforeDue, { organizationId: ORGANIZATION, currencyCode: USD, date: '2032-10-05' })).toEqual([])

    const collected = processClubFinanceForDate(beforeDue, createGameDate(2032, 10, 6)).world
    expect(cashOf(collected, '2032-10-06')).toBe(AMOUNT_MINOR_UNITS)
    const replay = processClubFinanceForDate(collected, createGameDate(2032, 10, 6))
    expect(replay.result.collection.status).toBe('NOTHING_DUE')
    expect(replay.result.collection.collectedMinorUnits).toBe(0)
    expect(Object.keys(replay.world.treasuryApplicationsById)).toHaveLength(1)
    expect(cashOf(replay.world, '2032-10-06')).toBe(AMOUNT_MINOR_UNITS)
  })

  it('reports receivables in a currency the batch does not use instead of converting them', () => {
    const world = worldWithSource('COLLECT_ON_DUE_DATE', { recognitionOn: '2032-10-05', dueOn: '2032-10-06' })
    const recognized = processClubFinanceForDate(world, createGameDate(2032, 10, 5)).world
    const accounts = accountsOf(recognized)

    const foreign = collectDueReceivablesForDate(recognized, {
      organizationId: ORGANIZATION,
      currencyCode: 'EUR',
      date: '2032-10-06',
      cashAccountId: accounts.cashOperating.id,
      receivableAccountId: accounts.receivableControl.id,
    })
    expect(foreign.result.status).toBe('NOTHING_DUE')
    expect(foreign.result.ineligibleCurrencyReceivableCount).toBe(1)
    expect(foreign.result.collectedMinorUnits).toBe(0)
  })

  it('leaves the world untouched when a collection cannot be applied', () => {
    const world = worldWithSource('COLLECT_ON_DUE_DATE', { recognitionOn: '2032-10-05', dueOn: '2032-10-06' })
    const recognized = processClubFinanceForDate(world, createGameDate(2032, 10, 5)).world

    const blocked = collectDueReceivablesForDate(recognized, {
      organizationId: ORGANIZATION,
      currencyCode: USD,
      date: '2032-10-06',
      cashAccountId: accountsOf(recognized).cashOperating.id,
      receivableAccountId: accountsOf(recognized).cashOperating.id,
    })
    expect(blocked.result.status).toBe('BLOCKED')
    expect(blocked.world).toBe(recognized)
    expect(Object.keys(blocked.world.treasuryApplicationsById)).toEqual([])
    const receivableId = receivablesOf(blocked.world)[0]!.id
    expect(getReceivableRemaining(blocked.world, receivableId, '2032-10-06').minorUnits).toBe(AMOUNT_MINOR_UNITS)
  })
})
