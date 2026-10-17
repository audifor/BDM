import { describe, expect, it } from 'vitest'
import { createAcbTestGame } from '@/app/game/createAcbTestGame'
import { applyUserCoachCreation, type UserCoachCreationInput } from '@/app/game/UserCoachCreator'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { processCoachFinancesForMonth } from '@/engine/coachFinances'
import { decideOpeningDebt, getPendingOpeningDebtDecision, openingDebtInboxId, queueOpeningDebtDecision } from './CoachLifeDecision'

const profile: UserCoachCreationInput = {
  firstName: 'Ana', lastName: 'Lozano', dateOfBirth: '1990-08-10', gender: 'female',
  background: 'inDebt', ambition: 'financialFreedom', disposition: 'ambitious', coachingStyle: 'developer',
}

function started() { return applyUserCoachCreation(createAcbTestGame(), profile) }

describe('BS19C opening debt dilemma: situation -> decision -> finance -> memory -> save', () => {
  it('is triggered once by a real chosen origin, not for unrelated coaches, and survives Save V4 pending', () => {
    const unrelated = applyUserCoachCreation(createAcbTestGame(), { ...profile, background: 'rookie' })
    expect(getPendingOpeningDebtDecision(unrelated)).toBeNull()
    const world = started()
    const pending = getPendingOpeningDebtDecision(world)
    expect(pending).not.toBeNull()
    expect(world.inboxItemsById[openingDebtInboxId(world.userCoachId)]).toMatchObject({
      coachId: world.userCoachId, status: 'unread', context: { lifeScenario: 'openingDebt', source: 'playerSelectedOrigin' },
    })
    expect(queueOpeningDebtDecision(world)).toBe(world)
    const restored = deserializeGameWorldV4(serializeGameWorldV4(world, '2026-10-17T12:00:00.000Z'))
    expect(getPendingOpeningDebtDecision(restored)?.id).toBe(pending?.id)
    expect(restored.memoriesById[`memory:bs19c:opening-debt:${world.userCoachId}`]).toBeUndefined()
  }, 120_000)

  it('extra repayment posts one ledger debit, lowers principal, archives inbox and records one memory', () => {
    const original = started()
    const coachId = original.userCoachId
    const debt = original.coachFinancesByCoachId[coachId]!.debts[0]!
    const choice = decideOpeningDebt(original, 'extraPayment')
    expect(choice.status).toBe('APPLIED')
    if (choice.status !== 'APPLIED') throw new Error('Expected decision to apply')
    expect(original.coachFinancesByCoachId[coachId]!.cash).toBe(2_500)
    const finance = choice.world.coachFinancesByCoachId[coachId]!
    expect(finance.cash).toBe(2_000)
    expect(finance.debts[0]!.principalRemaining).toBe(debt.principalRemaining - 500)
    expect(finance.movements.filter(item => item.id === `finance:bs19c:opening-debt-extra-payment:${coachId}`)).toEqual([
      expect.objectContaining({ amount: -500, type: 'debtPayment', relatedEntityId: debt.id }),
    ])
    expect(getPendingOpeningDebtDecision(choice.world)).toBeNull()
    expect(choice.world.inboxItemsById[openingDebtInboxId(coachId)]?.status).toBe('archived')
    const memories = Object.values(choice.world.memoriesById).filter(item => item.semanticKey === `life:opening-debt:${coachId}`)
    expect(memories).toHaveLength(1)
    expect(memories[0]).toMatchObject({ permanent: true, context: { decision: 'extraPayment', debtId: debt.id } })
    expect(decideOpeningDebt(choice.world, 'extraPayment')).toMatchObject({ status: 'BLOCKED', reason: 'NOT_PENDING' })
    expect(decideOpeningDebt(choice.world, 'reduceLifestyle')).toMatchObject({ status: 'BLOCKED', reason: 'NOT_PENDING' })
  }, 120_000)

  it('lower lifestyle saves monthly money through the actual coach finance processor', () => {
    const world = started()
    const choice = decideOpeningDebt(world, 'reduceLifestyle')
    expect(choice.status).toBe('APPLIED')
    if (choice.status !== 'APPLIED') throw new Error('Expected decision to apply')
    expect(choice.world.coachFinancesByCoachId[world.userCoachId]!.lifestyle).toBe('modest')
    expect(choice.world.coachFinancesByCoachId[world.userCoachId]!.debts[0]!.principalRemaining).toBe(30_000)
    const reduced = processCoachFinancesForMonth(choice.world)
    const unchanged = processCoachFinancesForMonth(world)
    const cheaperExpense = reduced.coachFinancesByCoachId[world.userCoachId]!.movements.find(item => item.type === 'expense')
    const originalExpense = unchanged.coachFinancesByCoachId[world.userCoachId]!.movements.find(item => item.type === 'expense')
    expect(cheaperExpense).toBeDefined()
    expect(originalExpense).toBeDefined()
    expect(cheaperExpense!.amount - originalExpense!.amount).toBe(1_400)
  }, 120_000)

  it('Save V4 replays resolved situation with exact money, memory and archived state, no second effects', () => {
    const created = started()
    const first = decideOpeningDebt(created, 'extraPayment')
    expect(first.status).toBe('APPLIED')
    if (first.status !== 'APPLIED') throw new Error('Expected applied')
    const loaded = deserializeGameWorldV4(serializeGameWorldV4(first.world, '2026-10-17T12:00:00.000Z'))
    expect(loaded.coachFinancesByCoachId[created.userCoachId]!.cash).toBe(2_000)
    expect(loaded.coachFinancesByCoachId[created.userCoachId]!.debts[0]!.principalRemaining).toBe(29_500)
    expect(loaded.memoriesById[`memory:bs19c:opening-debt:${created.userCoachId}`]).toEqual(
      first.world.memoriesById[`memory:bs19c:opening-debt:${created.userCoachId}`],
    )
    expect(loaded.inboxItemsById[openingDebtInboxId(created.userCoachId)]!.status).toBe('archived')
    expect(decideOpeningDebt(loaded, 'extraPayment')).toMatchObject({ status: 'BLOCKED', reason: 'NOT_PENDING', world: loaded })
    expect(queueOpeningDebtDecision(loaded)).toBe(loaded)
  }, 120_000)

  it('blocks unauthorized, unfunded, unrelated or corrupted choice inputs without changing world', () => {
    const world = started()
    const coachId = world.userCoachId
    expect(decideOpeningDebt(world, 'wrongChoice' as never)).toMatchObject({ status: 'BLOCKED', world, reason: 'NOT_ELIGIBLE' })
    expect(decideOpeningDebt(world, 'extraPayment', 'someone-else' as never)).toMatchObject({ status: 'BLOCKED', world, reason: 'NOT_USER_COACH' })
    const nonDebt = applyUserCoachCreation(createAcbTestGame(), { ...profile, background: 'academyCoach' })
    expect(decideOpeningDebt(nonDebt, 'extraPayment')).toMatchObject({ status: 'BLOCKED', world: nonDebt, reason: 'NOT_PENDING' })
    expect(world.coachFinancesByCoachId[coachId]!.cash).toBe(2_500)
  }, 120_000)
})
