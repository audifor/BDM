import { describe, expect, it } from 'vitest'
import { createGameWorld, updateGameWorld } from '@/domain/world'
import { createValidGameWorldInput } from '@/domain/world/testFixtures'
import { teamIdFromString } from '@/domain/ids'
import {
  createFinancialAccount,
  createFinancialTransaction,
  createOrganizationFinancialProfile,
  createTeamFinances,
  ensureCanonicalFinanceFoundation,
  fiscalPeriodIdFor,
  getFinanceActivationReport,
  getOrganizationFinancialAuthorization,
} from '@/domain/finance'
import { deserializeGameWorldV4, serializeGameWorldV4 } from './GameWorldSaveV4'

const savedAt = '2032-10-01T00:00:00.000Z'
const organizationId = 'team-home'
const AS_OF = '2032-10-01'
const eur = (minorUnits: number) => ({ currencyCode: 'EUR', minorUnits })

function legacyActivationWorld() {
  const profile = createOrganizationFinancialProfile({ organizationId, baseCurrencyCode: 'EUR', fiscalYearStartMonth: 1 })
  const cash = 500_000
  return createGameWorld({
    ...createValidGameWorldInput(),
    teamFinances: [createTeamFinances({ teamId: teamIdFromString('team-home'), playerSalaryBudget: 1_000_000, staffSalaryBudget: 500_000 })],
    organizationFinancialProfiles: [profile],
    financialAccounts: [
      createFinancialAccount({ id: 'cash:eur', organizationId, accountType: 'CASH', currencyCode: 'EUR', openedOn: '2032-01-01' }),
      createFinancialAccount({ id: 'equity:eur', organizationId, accountType: 'EQUITY', currencyCode: 'EUR', openedOn: '2032-01-01' }),
    ],
    financialTransactions: [createFinancialTransaction({
      id: 'finance:opening',
      organizationId,
      effectiveOn: '2032-01-01',
      transactionType: 'OPENING_BALANCE',
      amount: eur(cash),
      postings: [
        { accountId: 'cash:eur', direction: 'DEBIT', amount: eur(cash) },
        { accountId: 'equity:eur', direction: 'CREDIT', amount: eur(cash) },
      ],
      provenance: { kind: 'MIGRATION', id: 'bs16e-save' },
    })],
  })
}

function roundTrip(world: ReturnType<typeof legacyActivationWorld>) {
  return deserializeGameWorldV4(serializeGameWorldV4(world, savedAt))
}

describe('BS16E activation persistence', () => {
  it('round-trips the activated authorization with its fiscal period, approval, provenance and scope', () => {
    const activated = ensureCanonicalFinanceFoundation(legacyActivationWorld())
    const restored = roundTrip(activated)
    const authorization = getOrganizationFinancialAuthorization(restored, { organizationId, currencyCode: 'EUR', asOfDate: AS_OF })

    expect(restored.fiscalPeriodsById).toEqual(activated.fiscalPeriodsById)
    expect(restored.financialBudgetsById).toEqual(activated.financialBudgetsById)
    expect(restored.budgetLinesById).toEqual(activated.budgetLinesById)
    expect(authorization.fiscalPeriodId).toBe(fiscalPeriodIdFor(organizationId, '2032-01-01'))
    expect(authorization.authorizedMinorUnits).toBe(150_000_000)
    expect(authorization.lines.map((line) => [line.category, line.authorizedMinorUnits])).toEqual([['PLAYER_SALARY', 100_000_000], ['STAFF_SALARY', 50_000_000]])
    expect(authorization.currencyCode).toBe('EUR')
    expect(authorization.approval).toEqual(Object.values(activated.financialBudgetsById)[0]!.approval)
    // Headroom stays derived, never persisted: reloading re-derives it from the same facts. The value
    // itself can move because the canonical save normalization also completes world structure (it
    // materializes the head-coach staff contract), which is pre-existing load behaviour, not authorization state.
    expect(authorization.availableHeadroomMinorUnits).toBe(authorization.authorizedMinorUnits - authorization.committedMinorUnits - authorization.reservedMinorUnits)
    expect(getOrganizationFinancialAuthorization(activated, { organizationId, currencyCode: 'EUR', asOfDate: AS_OF }).authorizedMinorUnits).toBe(150_000_000)
  })

  it('keeps headroom derived and creates no accounting fact on load', () => {
    const activated = ensureCanonicalFinanceFoundation(legacyActivationWorld())
    const restored = roundTrip(activated)
    const payload = serializeGameWorldV4(activated, savedAt).payload
    const persistedBudget = (payload.financialBudgets ?? [])[0] as unknown as Record<string, unknown>

    expect('availableHeadroomMinorUnits' in persistedBudget).toBe(false)
    expect(Object.keys(payload).sort().filter((key) => key.includes('Headroom'))).toEqual([])
    expect(Object.keys(restored.financialTransactionsById)).toEqual(['finance:opening'])
    expect(Object.keys(restored.financialAccountsById)).toEqual(['cash:eur', 'equity:eur'])
    expect(restored.financialReservationsById).toEqual({})
    expect(restored.payablesById).toEqual({})
    expect(restored.receivablesById).toEqual({})
  })

  it('replays activation after load without duplicating periods, budgets or lines', () => {
    const activated = ensureCanonicalFinanceFoundation(legacyActivationWorld())
    const loaded = roundTrip(activated)
    const reactivated = ensureCanonicalFinanceFoundation(loaded)

    expect(reactivated).toBe(loaded)
    expect(Object.keys(loaded.fiscalPeriodsById)).toHaveLength(1)
    expect(Object.keys(loaded.financialBudgetsById)).toHaveLength(1)
    expect(Object.keys(loaded.budgetLinesById)).toHaveLength(2)
    expect(getFinanceActivationReport(loaded).organizations.find((entry) => entry.organizationId === organizationId)?.status).toBe('ALREADY_PROVISIONED')
  })

  it('never lets migration seeding overwrite an existing canonical authorization', () => {
    const activated = ensureCanonicalFinanceFoundation(legacyActivationWorld())
    // The legacy pools changed materially, but canonical authorization for the period already exists.
    const changedLegacy = updateGameWorld(activated, { teamFinances: [createTeamFinances({ teamId: teamIdFromString('team-home'), playerSalaryBudget: 9_000_000, staffSalaryBudget: 4_000_000 })] })
    const loaded = ensureCanonicalFinanceFoundation(roundTrip(changedLegacy))

    expect(Object.keys(loaded.financialBudgetsById)).toHaveLength(1)
    expect(getOrganizationFinancialAuthorization(loaded, { organizationId, currencyCode: 'EUR', asOfDate: AS_OF }).authorizedMinorUnits).toBe(150_000_000)
    expect(getFinanceActivationReport(loaded).organizations.find((entry) => entry.organizationId === organizationId)?.status).toBe('ALREADY_PROVISIONED')
  })

  it('loads a pre-BS16E payload whose budgets declare no fiscal period', () => {
    const activated = ensureCanonicalFinanceFoundation(legacyActivationWorld())
    const current = serializeGameWorldV4(activated, savedAt)
    const legacyPayload = {
      ...current.payload,
      financialBudgets: (current.payload.financialBudgets ?? []).map(({ fiscalPeriodId: _fiscalPeriodId, ...budget }) => budget),
    }
    const restored = deserializeGameWorldV4({ ...current, payload: legacyPayload })
    const budget = Object.values(restored.financialBudgetsById)[0]!

    expect(budget.fiscalPeriodId).toBeNull()
    // Without a canonical fiscal period the authorization falls back to its own planning period.
    expect(getOrganizationFinancialAuthorization(restored, { organizationId, currencyCode: 'EUR', asOfDate: AS_OF }).state).toBe('ACTIVE')
  })
})
