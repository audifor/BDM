import { createGMPlanState, type GMPlanReviewTrigger, type GMPlanState } from '@/domain/gmPlanning'
import type { TeamId } from '@/domain/ids'
import { type GameWorld } from '@/domain/world'
import { assessGMDecisionContext } from '@/engine/gmDecisionContext'
import { assessGMPlanWorkflow, assessGMPlanWorkflows, type GMWorkflowDecision } from '@/engine/gmPlanning'
import { reviewGMPlans } from './GMPlanService'

export interface ReviewGMPlanWorkflowsResult {
  readonly kind: 'AI_PLANNED_WORKFLOW' | 'USER_RECOMMENDED_WORKFLOW'
  readonly decisions: readonly GMWorkflowDecision[]
  readonly world: GameWorld
}

/** Revalidates current plans and derives next-workflow decisions; it dispatches no workflow. */
export function reviewGMPlanWorkflows(world: GameWorld, teamId: TeamId, trigger: GMPlanReviewTrigger = 'ROUTINE_REVIEW'): ReviewGMPlanWorkflowsResult {
  const priorPlans = Object.values(world.gmPlanStatesById).filter((plan) => plan.teamId === teamId)
  const planReview = reviewGMPlans(world, teamId, trigger)
  const context = assessGMDecisionContext(planReview.world, teamId)
  const plans: readonly GMPlanState[] = planReview.kind === 'AI_SELECTED'
    ? planReview.selectedPlans
    : planReview.recommendations.flatMap((recommendation) => recommendation.selectedOptionKind === undefined ? [] : [createGMPlanState({
      id: `recommendation:${teamId}:${recommendation.needId}`,
      teamId,
      needId: recommendation.needId,
      selectedOptionKind: recommendation.selectedOptionKind,
      selectedOn: recommendation.selectedOn ?? context.asOfDate,
      lastReviewedOn: context.asOfDate,
      selectionReason: recommendation.selectionReason,
      executionReadinessAtSelection: recommendation.executionReadiness as Exclude<GMPlanState['executionReadinessAtSelection'], 'BLOCKED'>,
      strategyAtSelection: context.strategy,
      originalOptionPriority: recommendation.originalOptionPriority ?? 1,
    })])
  const decisions = [...assessGMPlanWorkflows(context, plans)]
  for (const prior of priorPlans) {
    const current = plans.find((plan) => plan.needId === prior.needId && plan.selectedOptionKind === prior.selectedOptionKind)
    if (current !== undefined) continue
    decisions.push(assessGMPlanWorkflow(context, prior, plans))
  }
  decisions.sort((a, b) => a.needId.localeCompare(b.needId) || (a.currentValidity === b.currentValidity ? 0 : a.currentValidity === 'STALE' ? -1 : 1) || a.responseFamily.localeCompare(b.responseFamily))
  return Object.freeze({
    kind: planReview.kind === 'AI_SELECTED' ? 'AI_PLANNED_WORKFLOW' : 'USER_RECOMMENDED_WORKFLOW',
    decisions: Object.freeze(decisions),
    world: planReview.world,
  })
}
