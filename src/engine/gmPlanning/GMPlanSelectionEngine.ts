import { createGMPlanState, type GMPlanReviewTrigger, type GMPlanSelectionReason, type GMPlanState, type GMResponseOptionKind } from '@/domain/gmPlanning'
import type { GMDecisionContext, GMResponseOption } from '@/engine/gmDecisionContext'

export interface GMPlanRecommendation {
  readonly needId: string
  readonly selectedOptionKind?: GMResponseOptionKind
  readonly selectedOn?: GMPlanState['selectedOn']
  readonly originalOptionPriority?: number
  readonly planningEligibility?: 'SELECTABLE'
  readonly executionReadiness?: GMResponseOption['executionReadiness']
  readonly selectionReason: GMPlanSelectionReason
  readonly strategicAlignment?: GMResponseOption['strategicAlignment']
  readonly feasibility?: GMResponseOption['feasibility']
  readonly staffStyleAlignment?: GMResponseOption['staffStyleAlignment']
  readonly knowledgeReadiness?: GMResponseOption['knowledgeReadiness']
  readonly alternatives: readonly GMResponseOptionKind[]
}

export interface GMPlanSelectionResult {
  readonly plans: readonly GMPlanState[]
  readonly recommendations: readonly GMPlanRecommendation[]
}

const MATERIAL_TRIGGERS: readonly GMPlanReviewTrigger[] = ['STRATEGY_TRANSITION', 'MATERIAL_ROSTER_CHANGE', 'CONTRACT_CHANGE', 'MAJOR_INJURY', 'CONTRACT_DEADLINE_ESCALATION', 'MATERIAL_FINANCIAL_CHANGE', 'GOVERNANCE_CHANGE', 'EXPLICIT_REEVALUATION']

/** Selects from BS9C's already ordered option list; it never derives needs or ratings. */
export function selectGMPlans(context: GMDecisionContext, existingPlans: readonly GMPlanState[] = [], trigger: GMPlanReviewTrigger = 'ROUTINE_REVIEW'): GMPlanSelectionResult {
  const optionsByNeed = new Map<string, GMResponseOption[]>()
  for (const option of context.options) {
    const group = optionsByNeed.get(option.needId) ?? []
    group.push(option)
    optionsByNeed.set(option.needId, group)
  }
  const priorByNeed = new Map(existingPlans.filter((plan) => plan.teamId === context.teamId).map((plan) => [plan.needId, plan]))
  const plans: GMPlanState[] = []
  const recommendations: GMPlanRecommendation[] = []
  const needIds = [...new Set([...optionsByNeed.keys(), ...priorByNeed.keys()])].sort()

  for (const needId of needIds) {
    const options = optionsByNeed.get(needId) ?? []
    const prior = priorByNeed.get(needId)
    let reason: GMPlanSelectionReason = prior === undefined ? 'INITIAL_SELECTION' : 'PLAN_STILL_VALID'
    let retained: GMPlanState | undefined
    if (prior !== undefined) {
      if (options.length === 0) reason = 'SOURCE_NEED_RESOLVED'
      else {
        const priorOption = options.find((option) => option.kind === prior.selectedOptionKind)
        if (priorOption === undefined) reason = 'OPTION_NO_LONGER_AVAILABLE'
        else if (priorOption.planningEligibility !== 'SELECTABLE') reason = 'OPTION_BECAME_BLOCKED'
        else if (prior.strategyAtSelection !== context.strategy) reason = 'STRATEGY_CHANGED'
        else if (MATERIAL_TRIGGERS.includes(trigger)) reason = 'CONTEXT_MATERIALLY_CHANGED'
        else retained = createGMPlanState({ ...prior, lastReviewedOn: context.asOfDate })
      }
    }
    const selectedOption = retained === undefined ? options.find((option) => option.planningEligibility === 'SELECTABLE') : options.find((option) => option.kind === retained.selectedOptionKind)
    if (selectedOption !== undefined) {
      const state = retained ?? createGMPlanState({ id: `${context.teamId}:${needId}`, teamId: context.teamId, needId, selectedOptionKind: selectedOption.kind, selectedOn: context.asOfDate, lastReviewedOn: context.asOfDate, selectionReason: reason, executionReadinessAtSelection: selectedOption.executionReadiness as Exclude<GMResponseOption['executionReadiness'], 'BLOCKED'>, strategyAtSelection: context.strategy, originalOptionPriority: selectedOption.priority })
      plans.push(state)
      const currentOption = options.find((option) => option.kind === state.selectedOptionKind)
      recommendations.push(Object.freeze({ needId, selectedOptionKind: state.selectedOptionKind, selectedOn: state.selectedOn, originalOptionPriority: state.originalOptionPriority, planningEligibility: 'SELECTABLE', executionReadiness: currentOption?.executionReadiness ?? state.executionReadinessAtSelection, selectionReason: reason, ...(currentOption === undefined ? {} : { strategicAlignment: currentOption.strategicAlignment, feasibility: currentOption.feasibility, staffStyleAlignment: currentOption.staffStyleAlignment, knowledgeReadiness: currentOption.knowledgeReadiness }), alternatives: Object.freeze(options.filter((option) => option.kind !== state.selectedOptionKind).map((option) => option.kind)) }))
    } else {
      recommendations.push(Object.freeze({ needId, selectionReason: prior !== undefined || options.length === 0 ? reason : 'NO_SELECTABLE_OPTION', alternatives: Object.freeze([]) }))
    }
  }
  return Object.freeze({ plans: Object.freeze(plans), recommendations: Object.freeze(recommendations) })
}
