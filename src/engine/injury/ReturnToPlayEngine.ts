import { addDays } from '@/domain/date'
import type { InjuryId, StaffPersonId } from '@/domain/ids'
import type { DelegationOutcomeId } from '@/domain/responsibility'
import { injuryLifecycleStatus, type ReturnToPlayDecision, type ReturnToPlayReviewActor } from '@/domain/injury'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { hasPassedRequiredFitnessTest } from './FitnessTest'

export type ReturnToPlayReviewFailure = 'INJURY_NOT_FOUND' | 'REVIEW_NOT_DUE' | 'ALREADY_CLEARED' | 'TEAM_NOT_FOUND' | 'NOT_AUTHORIZED' | 'FITNESS_TEST_REQUIRED'
export type ReturnToPlayReviewResult =
  | { readonly ok: true; readonly world: GameWorld }
  | { readonly ok: false; readonly reason: ReturnToPlayReviewFailure }

/** Shared user/AI transition for a due Return-to-Play review. */
export function reviewReturnToPlay(
  world: GameWorld,
  request: {
    readonly injuryId: InjuryId
    readonly decision: ReturnToPlayDecision
    readonly actor: ReturnToPlayReviewActor
    readonly staffId?: StaffPersonId
    readonly recommendationOutcomeId?: DelegationOutcomeId
  },
): ReturnToPlayReviewResult {
  const injury = world.injuriesById[request.injuryId]
  if (injury === undefined) return { ok: false, reason: 'INJURY_NOT_FOUND' }
  if (injuryLifecycleStatus(injury, world.currentDate) === 'CLEARED') return { ok: false, reason: 'ALREADY_CLEARED' }
  if (injuryLifecycleStatus(injury, world.currentDate) !== 'RTP_REVIEW_DUE') return { ok: false, reason: 'REVIEW_NOT_DUE' }
  if (request.decision === 'CLEAR_FOR_PLAY' && !hasPassedRequiredFitnessTest(world, injury)) return { ok: false, reason: 'FITNESS_TEST_REQUIRED' }

  const team = Object.values(world.teams).find((candidate) => candidate.rosterPlayerIds.includes(injury.playerId))
  if (team === undefined) return { ok: false, reason: 'TEAM_NOT_FOUND' }
  if (request.actor.kind === 'USER') {
    if (team.coachId !== request.actor.coachId || request.actor.coachId !== world.userCoachId) return { ok: false, reason: 'NOT_AUTHORIZED' }
  } else if (team.id !== request.actor.teamId || team.coachId === world.userCoachId) {
    return { ok: false, reason: 'NOT_AUTHORIZED' }
  }

  const state = injury.returnToPlay ?? { reviewDueOn: injury.expectedReturnDate, reviews: [] }
  const review = {
    reviewedOn: world.currentDate,
    decision: request.decision,
    actor: request.actor,
    ...(request.staffId === undefined ? {} : { staffId: request.staffId }),
    ...(request.recommendationOutcomeId === undefined ? {} : { recommendationOutcomeId: request.recommendationOutcomeId }),
  }
  const returnToPlay = request.decision === 'CLEAR_FOR_PLAY'
    ? { ...state, clearedOn: world.currentDate, reviews: [...state.reviews, review] }
    : { ...state, reviewDueOn: addDays(world.currentDate, 1), reviews: [...state.reviews, review] }
  const updated = { ...injury, returnToPlay }
  return { ok: true, world: updateGameWorld(world, { injuries: [...Object.values(world.injuriesById).filter((item) => item.id !== injury.id), updated] }) }
}
