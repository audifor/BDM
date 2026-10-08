import { describe, expect, it } from 'vitest'
import { createGameWorld, updateGameWorld, type GameWorld } from '@/domain/world'
import { createValidGameWorldInput } from '@/domain/world/testFixtures'
import { teamIdFromString } from '@/domain/ids'
import {
  consumeFinancialReservation,
  createOrganizationFinancialProfile,
  createTeamFinances,
  ensureCanonicalFinanceFoundation,
  evaluateFinancialCommitment,
  evaluateOrganizationFinancialCommitment,
  getOrganizationFinanceAccounts,
  getOrganizationFinancialAuthorization,
  provisionOrganizationFinanceFoundation,
  reserveFinancialCommitment,
  resolveCashAccount,
} from '@/domain/finance'
import { deserializeGameWorldV4, serializeGameWorldV4 } from './GameWorldSaveV4'

const savedAt = '2032-10-01T00:00:00.000Z'
const organizationId = 'team-home'
const eur = (minorUnits: number) => ({ currencyCode: 'EUR', minorUnits })

/**
 * BS16 lineage reconciliation proof: the BS16B foundation, the canonical BS16C decision/reservation
 * authority, the BS16D approved-budget authorization and the BS16E activation authority operate as one
 * stack. Currency is passed explicitly because the canonical currency authority is BS16F, which is NOT
 * implemented here.
 */
function legacyOnlyWorld(): GameWorld {
  return createGameWorld({
    ...createValidGameWorldInput(),
    teamFinances: [createTeamFinances({ teamId: teamIdFromString('team-home'), playerSalaryBudget: 1_000_000, staffSalaryBudget: 500_000 })],
  })
}

function stackWorld() {
  const world = legacyOnlyWorld()
  return { world, organizationId: world.teams[teamIdFromString('team-home')]!.organizationId }
}

describe('BS16 canonical stack integration (A→E)', () => {
  it('runs foundation, authorization, decision, reservation, save/load and activation without duplicate state', () => {
    const { world, organizationId: org } = stackWorld()
    expect(Object.keys(world.financialAccountsById)).toEqual([])

    // 1. BS16B foundation: explicit currency -> profile, canonical account catalog, opening fiscal period.
    const founded = provisionOrganizationFinanceFoundation(world, org, { currencyCode: 'EUR' })
    const accounts = getOrganizationFinanceAccounts(founded, org, 'EUR')
    expect(Object.keys(accounts).sort()).toEqual(['cashOperating', 'currencyCode', 'debtLiability', 'equityControl', 'expenseOperating', 'organizationId', 'payableControl', 'receivableControl', 'revenueOperating'])
    expect(Object.keys(founded.organizationFinancialProfilesById)).toEqual([org])
    expect(Object.keys(founded.fiscalPeriodsById)).toHaveLength(1)
    expect(resolveCashAccount(founded, org, 'EUR').currencyCode).toBe('EUR')
    // No fake cash: the ledger-derived cash truth stays zero.
    expect(evaluateFinancialCommitment({
      organizationFinancialProfile: founded.organizationFinancialProfilesById[org as never],
      organizationId: org,
      amount: eur(10_000),
      currentCash: null,
    }).status).toBe('REQUIRES_FINANCING')

    // 2. BS16E activation, reusing the BS16B opening fiscal period rather than inserting a second one.
    const activated = ensureCanonicalFinanceFoundation(founded)
    expect(Object.keys(activated.fiscalPeriodsById)).toHaveLength(1)
    expect(Object.keys(activated.financialBudgetsById)).toHaveLength(1)
    expect(Object.keys(activated.budgetLinesById)).toHaveLength(2)
    expect(Object.keys(activated.financialAccountsById)).toEqual(Object.keys(founded.financialAccountsById))
    expect(getOrganizationFinancialAuthorization(activated, { organizationId: org, currencyCode: 'EUR', asOfDate: activated.currentDate })).toMatchObject({ state: 'ACTIVE', authorizedMinorUnits: 1_500_000 })

    // 3. BS16C decision authority consumed by BS16D authorization: zero cash is valid truth, not a fake budget.
    const decision = evaluateOrganizationFinancialCommitment(activated, { organizationId: org, currency: 'EUR', amount: eur(1_000_000), category: 'PLAYER_SALARY', asOfDate: activated.currentDate })
    expect(decision.status).toBe('INSUFFICIENT_LIQUIDITY')
    expect(decision.availableAuthorizedHeadroom).toEqual(eur(1_000_000))
    expect(decision.reasonCodes).not.toContain('BUDGET_AUTHORIZATION_NOT_MODELLED')

    // 4. BS16C reservation authority on the same canonical stack.
    const held = reserveFinancialCommitment({
      organizationFinancialProfile: createOrganizationFinancialProfile({ organizationId: org, baseCurrencyCode: 'EUR' }),
      organizationId: org,
      amount: eur(400_000),
      currentCash: eur(1_000_000),
      sourceAuthority: 'FACILITY',
      sourceEntityId: 'facility:stack-1',
      createdOn: activated.currentDate,
      activeReservations: Object.values(activated.financialReservationsById),
    })
    expect(held.outcome).toBe('CREATED')
    const reserved = updateGameWorld(activated, { financialReservations: held.reservations })
    expect(getOrganizationFinancialAuthorization(reserved, { organizationId: org, currencyCode: 'EUR', asOfDate: activated.currentDate }).reservedMinorUnits).toBe(400_000)

    // 5. Save/load round trip preserves the whole stack exactly once.
    const restored = deserializeGameWorldV4(serializeGameWorldV4(reserved, savedAt))
    expect(restored.organizationFinancialProfilesById).toEqual(reserved.organizationFinancialProfilesById)
    expect(restored.financialAccountsById).toEqual(reserved.financialAccountsById)
    expect(restored.fiscalPeriodsById).toEqual(reserved.fiscalPeriodsById)
    expect(restored.financialBudgetsById).toEqual(reserved.financialBudgetsById)
    expect(restored.budgetLinesById).toEqual(reserved.budgetLinesById)
    expect(restored.financialReservationsById).toEqual(reserved.financialReservationsById)
    expect(Object.keys(restored.fiscalPeriodsById)).toHaveLength(1)

    // 6. Activation replay after load is a no-op: no duplicate profile, account, period or authorization.
    expect(ensureCanonicalFinanceFoundation(restored)).toBe(restored)
    expect(ensureCanonicalFinanceFoundation(provisionOrganizationFinanceFoundation(restored, org, { currencyCode: 'EUR' }))).toBe(provisionOrganizationFinanceFoundation(restored, org, { currencyCode: 'EUR' }))

    // 7. Consuming the reservation keeps the obligation counted exactly once.
    const consumed = updateGameWorld(restored, { financialReservations: held.reservations.map((reservation) => consumeFinancialReservation(reservation)) })
    expect(Object.values(consumed.financialReservationsById)[0]?.status).toBe('CONSUMED')
    const afterConsumption = getOrganizationFinancialAuthorization(consumed, { organizationId: org, currencyCode: 'EUR', asOfDate: activated.currentDate })
    expect(afterConsumption.reservedMinorUnits).toBe(0)
    expect(afterConsumption.authorizedMinorUnits).toBe(1_500_000)
    expect(Object.keys(consumed.financialTransactionsById)).toEqual([])
  })

  it('refuses to overwrite existing canonical currency when the foundation is provisioned twice', () => {
    const { world, organizationId: org } = stackWorld()
    const founded = provisionOrganizationFinanceFoundation(world, org, { currencyCode: 'EUR' })

    expect(provisionOrganizationFinanceFoundation(founded, org, { currencyCode: 'EUR' })).toBe(founded)
    expect(() => provisionOrganizationFinanceFoundation(founded, org, { currencyCode: 'USD' })).toThrow(/refusing to overwrite/i)
  })
})
