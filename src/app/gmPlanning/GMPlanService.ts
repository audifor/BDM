import type { TeamId } from '@/domain/ids'
import type { GMPlanReviewTrigger, GMPlanState } from '@/domain/gmPlanning'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { assessGMDecisionContext, type GMDecisionContext } from '@/engine/gmDecisionContext'
import { selectGMPlans, type GMPlanRecommendation } from '@/engine/gmPlanning'

export interface ReviewGMPlansResult {
  readonly context: GMDecisionContext
  readonly kind: 'AI_SELECTED' | 'USER_RECOMMENDATION'
  readonly recommendations: readonly GMPlanRecommendation[]
  readonly selectedPlans: readonly GMPlanState[]
  readonly world: GameWorld
}

/** Explicit BS9E review seam. It selects broad plans only and never resolves an action. */
export function reviewGMPlans(world: GameWorld, teamId: TeamId, trigger: GMPlanReviewTrigger = 'ROUTINE_REVIEW'): ReviewGMPlansResult {
  const team = world.teams[teamId]
  if (team === undefined) throw new RangeError(`Unknown Team ${teamId}`)
  const context = assessGMDecisionContext(world, teamId)
  const isUserTeam = team.coachId === world.userCoachId
  const currentTeamPlans = Object.values(world.gmPlanStatesById).filter((plan) => plan.teamId === teamId)
  const selection = selectGMPlans(context, isUserTeam ? [] : currentTeamPlans, trigger)
  if (isUserTeam) return Object.freeze({ kind: 'USER_RECOMMENDATION', context, recommendations: selection.recommendations, selectedPlans: Object.freeze([]), world })

  const otherTeamPlans = Object.values(world.gmPlanStatesById).filter((plan) => plan.teamId !== teamId)
  const nextWorld = updateGameWorld(world, { gmPlanStates: [...otherTeamPlans, ...selection.plans] })
  return Object.freeze({ kind: 'AI_SELECTED', context, recommendations: selection.recommendations, selectedPlans: selection.plans, world: nextWorld })
}
