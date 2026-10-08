import { describe, expect, it } from 'vitest'
import { createGameWorld } from '@/domain/world'
import { createValidGameWorldInput } from '@/domain/world/testFixtures'
import {
  createBudgetLine,
  createFinancialAccount,
  createFinancialBudget,
  createFinancialTransaction,
  createOrganizationFinancialProfile,
  evaluateOrganizationFinancialCommitment,
  getOrganizationFinancialAuthorization,
  reserveFinancialCommitment,
} from '@/domain/finance'
import { deserializeGameWorldV4, serializeGameWorldV4 } from './GameWorldSaveV4'

const savedAt = '2032-10-01T00:00:00.000Z'
const organizationId = 'team-home'
const asOfDate = '2032-10-01'
const eur = (minorUnits: number) => ({ currencyCode: 'EUR', minorUnits })

const approval = { authorityKind: 'GOVERNANCE' as const, authorityId: 'board:1', approvedOn: '2032-06-15', provenance: { kind: 'GOVERNANCE_DECISION', id: 'decision:budget-1' } }

function authorizedWorld() {
  const held = reserveFinancialCommitment({
    organizationFinancialProfile: createOrganizationFinancialProfile({ organizationId, baseCurrencyCode: 'EUR' }),
    organizationId,
    amount: eur(150_000),
    currentCash: eur(1_000_000),
    sourceAuthority: 'FACILITY',
    sourceEntityId: 'facility:project-1',
    createdOn: '2032-08-01',
  })
  return createGameWorld({
    ...createValidGameWorldInput(),
    financialAccounts: [
      createFinancialAccount({ id: 'cash:eur', organizationId, accountType: 'CASH', currencyCode: 'EUR', openedOn: '2032-07-01' }),
      createFinancialAccount({ id: 'equity:eur', organizationId, accountType: 'EQUITY', currencyCode: 'EUR', openedOn: '2032-07-01' }),
    ],
    financialTransactions: [createFinancialTransaction({
      id: 'finance:opening',
      organizationId,
      effectiveOn: '2032-07-01',
      transactionType: 'OPENING_BALANCE',
      amount: eur(1_000_000),
      postings: [
        { accountId: 'cash:eur', direction: 'DEBIT', amount: eur(1_000_000) },
        { accountId: 'equity:eur', direction: 'CREDIT', amount: eur(1_000_000) },
      ],
      provenance: { kind: 'MIGRATION', id: 'bs16d-save' },
    })],
    organizationFinancialProfiles: [createOrganizationFinancialProfile({ organizationId, baseCurrencyCode: 'EUR' })],
    financialBudgets: [createFinancialBudget({ id: 'budget:a1', organizationId, currencyCode: 'EUR', period: { kind: 'DATE_RANGE', startsOn: '2032-07-01', endsOn: '2033-06-30' }, status: 'APPROVED', label: 'Season authorization', createdOn: '2032-06-20', approval, provenance: { kind: 'BUDGET_PROPOSAL', id: 'budget:a1' } })],
    budgetLines: [createBudgetLine({ id: 'budget:a1:operations', budgetId: 'budget:a1', organizationId, category: 'OPERATIONS', direction: 'EXPENSE', amount: eur(400_000), provenance: { kind: 'BUDGET_PROPOSAL', id: 'budget:a1:operations' } })],
    financialReservations: held.reservations,
  })
}

describe('BS16D authorization persistence', () => {
  it('round-trips an ACTIVE authorization with its period, currency, scope and provenance', () => {
    const world = authorizedWorld()
    const restored = deserializeGameWorldV4(serializeGameWorldV4(world, savedAt))
    const before = getOrganizationFinancialAuthorization(world, { organizationId, currencyCode: 'EUR', asOfDate })
    const after = getOrganizationFinancialAuthorization(restored, { organizationId, currencyCode: 'EUR', asOfDate })

    expect(restored.financialBudgetsById).toEqual(world.financialBudgetsById)
    expect(restored.budgetLinesById).toEqual(world.budgetLinesById)
    expect(after).toEqual(before)
    expect(after.state).toBe('ACTIVE')
    expect(after.organizationId).toBe(organizationId)
    expect(after.currencyCode).toBe('EUR')
    expect(after.period).toEqual({ kind: 'DATE_RANGE', startsOn: '2032-07-01', endsOn: '2033-06-30' })
    expect(after.approval).toEqual(approval)
    expect(after.lines.map((line) => line.category)).toEqual(['OPERATIONS'])
    expect(after.authorizedMinorUnits).toBe(400_000)
  })

  it('preserves available headroom when the authorization is saved together with an OPEN reservation', () => {
    const world = authorizedWorld()
    const restored = deserializeGameWorldV4(serializeGameWorldV4(world, savedAt))

    expect(restored.financialReservationsById).toEqual(world.financialReservationsById)
    expect(Object.values(restored.financialReservationsById)[0]?.status).toBe('OPEN')
    const before = getOrganizationFinancialAuthorization(world, { organizationId, currencyCode: 'EUR', asOfDate })
    const after = getOrganizationFinancialAuthorization(restored, { organizationId, currencyCode: 'EUR', asOfDate })
    expect(after.reservedMinorUnits).toBe(150_000)
    expect(after.availableHeadroomMinorUnits).toBe(before.availableHeadroomMinorUnits)
    expect(after.availableHeadroomMinorUnits).toBe(250_000)
  })

  it('returns an equivalent decision after load and never duplicates the authorization or the reservation on replay', () => {
    const world = authorizedWorld()
    const restored = deserializeGameWorldV4(serializeGameWorldV4(world, savedAt))
    const request = { organizationId, currency: 'EUR', amount: eur(200_000), category: 'OPERATIONS', asOfDate }

    const before = evaluateOrganizationFinancialCommitment(world, request)
    const after = evaluateOrganizationFinancialCommitment(restored, request)

    expect(after).toEqual(before)
    expect(after.status).toBe('AFFORDABLE_NOW')

    // Replaying the resolution adds no authorization record and no second capacity consumption.
    expect(Object.keys(restored.financialBudgetsById)).toEqual(['budget:a1'])
    expect(getOrganizationFinancialAuthorization(restored, { organizationId, currencyCode: 'EUR', asOfDate })).toEqual(getOrganizationFinancialAuthorization(restored, { organizationId, currencyCode: 'EUR', asOfDate }))
    const replay = reserveFinancialCommitment({
      organizationFinancialProfile: createOrganizationFinancialProfile({ organizationId, baseCurrencyCode: 'EUR' }),
      organizationId,
      amount: eur(150_000),
      currentCash: eur(1_000_000),
      sourceAuthority: 'FACILITY',
      sourceEntityId: 'facility:project-1',
      createdOn: '2032-08-01',
      activeReservations: Object.values(restored.financialReservationsById),
    })
    expect(replay.outcome).toBe('REPLAYED')
    expect(replay.reservations).toHaveLength(1)
  })

  it('loads pre-BS16D payloads without budget collections as unprovisioned authorization', () => {
    const current = serializeGameWorldV4(authorizedWorld(), savedAt)
    const { financialBudgets: _budgets, budgetLines: _lines, ...legacyPayload } = current.payload
    const restored = deserializeGameWorldV4({ ...current, payload: legacyPayload })

    expect(restored.financialBudgetsById).toEqual({})
    expect(restored.budgetLinesById).toEqual({})
    expect(getOrganizationFinancialAuthorization(restored, { organizationId, currencyCode: 'EUR', asOfDate }).state).toBe('NOT_PROVISIONED')
  })

  it('persists authorization facts without persisting derived headroom', () => {
    const payload = serializeGameWorldV4(authorizedWorld(), savedAt).payload
    const persistedBudget = (payload.financialBudgets ?? [])[0] as unknown as Record<string, unknown>
    const persistedLine = (payload.budgetLines ?? [])[0] as unknown as Record<string, unknown>

    expect(Object.keys(persistedBudget).sort()).toEqual(['approval', 'createdOn', 'currencyCode', 'id', 'label', 'organizationId', 'period', 'provenance', 'revisionOfId', 'status'])
    expect(Object.keys(persistedLine).sort()).toEqual(['amount', 'budgetId', 'category', 'direction', 'id', 'organizationId', 'provenance'])
    expect('availableHeadroomMinorUnits' in persistedBudget).toBe(false)
    expect('availableHeadroomMinorUnits' in persistedLine).toBe(false)
  })
})
