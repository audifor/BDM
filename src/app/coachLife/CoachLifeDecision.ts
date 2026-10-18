import { createCoachFinanceProfile } from '@/domain/coachFinances'
import type { CoachId } from '@/domain/ids'
import { addInboxItem, applyMoraleEventToWorld, archiveInboxItem, updateGameWorld, type GameWorld } from '@/domain/world'
import { registerCoachFinanceMovement, setCoachLifestyle } from '@/engine/coachFinances'
import { recordMemory } from '@/engine/memory/MemoryEngine'

export type OpeningDebtChoice = 'extraPayment' | 'reduceLifestyle'
export type OpeningDebtDecisionResult =
  | { readonly status: 'APPLIED'; readonly world: GameWorld; readonly choice: OpeningDebtChoice }
  | { readonly status: 'BLOCKED'; readonly world: GameWorld; readonly reason: 'NOT_USER_COACH' | 'NOT_PENDING' | 'NOT_ELIGIBLE' | 'INSUFFICIENT_CASH' | 'SIMULATION_BUSY' }

export function openingDebtInboxId(coachId: CoachId): string { return `inbox:bs19c:opening-debt:${coachId}` }
function startingDebtId(coachId: CoachId): string { return `bs19b:starting-debt:${coachId}` }
function debtMemoryId(coachId: CoachId): string { return `memory:bs19c:opening-debt:${coachId}` }

/** Triggered by the player-selected indebted origin. A pending situation is not itself a decision.
 * No random drama, invented creditors, repeated events or consequences revealed in advance. */
export function queueOpeningDebtDecision(world: GameWorld, coachId: CoachId = world.userCoachId): GameWorld {
  if (coachId !== world.userCoachId) return world
  if (world.coachRpgProfilesByCoachId[coachId]?.creatorOrigin?.background !== 'inDebt') return world
  if (!world.coachFinancesByCoachId[coachId]?.debts.some(debt => debt.id === startingDebtId(coachId) && debt.status === 'active')) return world
  return addInboxItem(world, {
    id: openingDebtInboxId(coachId),
    coachId,
    gameDate: world.currentDate,
    category: 'career',
    priority: 'high',
    title: 'A personal financial decision',
    body: 'Your existing debt requires attention as your coaching career begins. Decide how to handle this obligation.',
    status: 'unread',
    context: { lifeScenario: 'openingDebt', source: 'playerSelectedOrigin', scenarioVersion: 1 },
  })
}

/** Uses only persisted GameWorld authority: one inbox situation, one movement / lifestyle change,
 * one permanent memory and one terminal inbox status. No duplicate resolution across Save V4.
 * This is a BDM core command. Courtside/other future UI must call it rather than reimplement it. */
export function decideOpeningDebt(world: GameWorld, choice: OpeningDebtChoice, coachId: CoachId = world.userCoachId): OpeningDebtDecisionResult {
  if (coachId !== world.userCoachId) return { status: 'BLOCKED', world, reason: 'NOT_USER_COACH' }
  const inbox = world.inboxItemsById[openingDebtInboxId(coachId)]
  if (inbox === undefined || inbox.coachId !== coachId || inbox.status === 'archived' || world.memoriesById[debtMemoryId(coachId)] !== undefined) {
    return { status: 'BLOCKED', world, reason: 'NOT_PENDING' }
  }
  const finance = world.coachFinancesByCoachId[coachId]
  const debt = finance?.debts.find(item => item.id === startingDebtId(coachId))
  if (world.coachRpgProfilesByCoachId[coachId]?.creatorOrigin?.background !== 'inDebt' || debt === undefined || debt.status !== 'active') {
    return { status: 'BLOCKED', world, reason: 'NOT_ELIGIBLE' }
  }
  let next: GameWorld
  if (choice === 'extraPayment') {
    const amount = Math.min(500, debt.principalRemaining)
    if ((finance?.cash ?? 0) < amount || amount <= 0) return { status: 'BLOCKED', world, reason: 'INSUFFICIENT_CASH' }
    const paid = registerCoachFinanceMovement(world, coachId, {
      id: `finance:bs19c:opening-debt-extra-payment:${coachId}`,
      date: world.currentDate, type: 'debtPayment', amount: -amount,
      description: 'Voluntary repayment of personal starting debt',
      relatedEntityId: debt.id,
    })
    const afterPayment = paid.coachFinancesByCoachId[coachId]!
    next = updateGameWorld(paid, { coachFinancesByCoachId: {
      ...paid.coachFinancesByCoachId, [coachId]: createCoachFinanceProfile({
        ...afterPayment,
        debts: afterPayment.debts.map(item => item.id === debt.id ? {
          ...item,
          principalRemaining: item.principalRemaining - amount,
          status: item.principalRemaining <= amount ? 'paid' as const : 'active' as const,
        } : item),
      }),
    } })
  } else if (choice === 'reduceLifestyle') {
    next = setCoachLifestyle(world, coachId, 'modest')
  } else {
    // Runtime guard for untrusted UI/connector inputs, including Save-replayed commands.
    return { status: 'BLOCKED', world, reason: 'NOT_ELIGIBLE' }
  }
  next = recordMemory(next, {
    id: debtMemoryId(coachId),
    owner: { kind: 'coach', id: coachId },
    type: 'opportunity',
    occurredOn: world.currentDate,
    entityRefs: [{ kind: 'coach', id: coachId }],
    sourceId: inbox.id,
    semanticKey: `life:opening-debt:${coachId}`,
    importance: 'important',
    valence: choice === 'extraPayment' ? 15 : -5,
    intensity: 75,
    decayPerMonth: 0,
    permanent: true,
    tags: ['life', 'finance', 'personalDecision'],
    context: { scenario: 'openingDebt', decision: choice, debtId: debt.id },
  })
  // A personal financial choice can affect the coach's morale today.
  // Deliberately NO personalityEventKind: the canonical 75-event PERSON23I catalog
  // does not include personal debt repayment or lifestyle cuts. Evidence is stored
  // in Finance + Memory instead of impersonating an unrelated semantic event.
  next = applyMoraleEventToWorld(next, {
    id: `morale:bs19c:opening-debt:${coachId}`,
    personId: coachId,
    gameDate: world.currentDate,
    source: 'careerEvent',
    delta: choice === 'extraPayment' ? 5 : -3,
    context: { lifeScenario: 'openingDebt', choice, sourceInboxId: inbox.id },
  })
  next = archiveInboxItem(next, inbox.id)
  return { status: 'APPLIED', world: next, choice }
}

/** A query for BDM logic and future UX; expose only unresolved choices grounded in the world. */
export function getPendingOpeningDebtDecision(world: GameWorld): { readonly id: string; readonly body: string; readonly openedOn: string } | null {
  const item = world.inboxItemsById[openingDebtInboxId(world.userCoachId)]
  if (item === undefined || item.status === 'archived' || item.context.lifeScenario !== 'openingDebt') return null
  return { id: item.id, body: item.body, openedOn: item.gameDate }
}
