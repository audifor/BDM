import type { GMPlanState, GMResponseOptionKind } from '@/domain/gmPlanning'
import type { TeamId } from '@/domain/ids'
import type { ExecutionReadiness, GovernanceOptionPolicyStatus } from '@/engine/gmDecisionContext'
import type { GMDecisionContext, GMResponseOption } from '@/engine/gmDecisionContext'
import { selectGMPlans } from './GMPlanSelectionEngine'

export type GMWorkflowRoute = 'NONE' | 'NO_ACTION' | 'MARKET_INTELLIGENCE_REQUIRED' | 'ROUTE_TO_SCOUTING' | 'ROUTE_TO_CONTRACT_REVIEW' | 'ROUTE_TO_FINANCE' | 'APPROVAL_PATH_UNRESOLVED' | 'NO_SUPPORTED_WORKFLOW'
export type GMWorkflowStatus = 'READY_TO_ROUTE' | 'WAITING_APPROVAL' | 'WAITING_INFORMATION' | 'BLOCKED' | 'UNSUPPORTED' | 'NO_ACTION' | 'REVIEW_REQUIRED'
export type GMWorkflowResponsibleSystem = 'GM_PLANNING' | 'BS10_MARKET_INTELLIGENCE' | 'SCOUTING' | 'BASKETBALL_OPERATIONS_ADVISORY' | 'FINANCE_AI' | 'UNRESOLVED'

export interface GMWorkflowDecision {
  readonly teamId: TeamId
  readonly needId: string
  readonly planId: string
  readonly responseFamily: GMResponseOptionKind
  readonly selectedOn: GMPlanState['selectedOn']
  readonly selectionReason: GMPlanState['selectionReason']
  readonly currentValidity: 'CURRENT' | 'STALE'
  readonly currentPlanningEligibility: 'SELECTABLE' | 'NOT_SELECTABLE' | 'NOT_AVAILABLE'
  readonly route: GMWorkflowRoute
  readonly status: GMWorkflowStatus
  readonly currentExecutionReadiness?: ExecutionReadiness
  readonly authorityStatus?: GovernanceOptionPolicyStatus
  readonly responsibleSystem: GMWorkflowResponsibleSystem
  readonly reviewedOn: GMDecisionContext['asOfDate']
  readonly optionPriority?: number
  readonly needSeverity?: string
  readonly needUrgency?: string
  readonly coordinationFlags: readonly string[]
  readonly reasons: readonly string[]
  readonly blockers: readonly string[]
  readonly replacementOptionKind?: GMResponseOptionKind
}

const ANALYTIC_ROUTES: Partial<Readonly<Record<GMResponseOptionKind, { readonly route: GMWorkflowRoute; readonly responsibleSystem: GMWorkflowResponsibleSystem; readonly status: GMWorkflowStatus; readonly reason: string }>>> = {
  EXTERNAL_ACQUISITION: { route: 'MARKET_INTELLIGENCE_REQUIRED', responsibleSystem: 'BS10_MARKET_INTELLIGENCE', status: 'WAITING_INFORMATION', reason: 'EXACT_EXTERNAL_TARGET_REQUIRES_BS10' },
  OUTGOING_MARKET_REVIEW: { route: 'MARKET_INTELLIGENCE_REQUIRED', responsibleSystem: 'BS10_MARKET_INTELLIGENCE', status: 'WAITING_INFORMATION', reason: 'OUTGOING_TARGET_REQUIRES_BS10' },
  SCOUTING_EXPANSION: { route: 'ROUTE_TO_SCOUTING', responsibleSystem: 'SCOUTING', status: 'WAITING_INFORMATION', reason: 'SCOUTING_REVIEW_NEEDS_TARGET_AND_EVALUATOR' },
  CONTRACT_RETENTION_REVIEW: { route: 'ROUTE_TO_CONTRACT_REVIEW', responsibleSystem: 'BASKETBALL_OPERATIONS_ADVISORY', status: 'WAITING_INFORMATION', reason: 'CONTRACT_ADVISORY_IS_REVIEW_ONLY' },
  FINANCIAL_CONTAINMENT: { route: 'ROUTE_TO_FINANCE', responsibleSystem: 'FINANCE_AI', status: 'WAITING_INFORMATION', reason: 'FINANCE_REVIEW_REQUIRED' },
}

/** Pure current-context routing assessment. It reuses BS9D-B's selector for plan validity. */
export function assessGMPlanWorkflow(context: GMDecisionContext, plan: GMPlanState, activePlans: readonly GMPlanState[] = [plan]): GMWorkflowDecision {
  const selection = selectGMPlans(context, [plan])
  const activeSelection = selectGMPlans(context, activePlans)
  const currentActivePlans = activePlans.filter((candidate) => {
    const candidateReview = activeSelection.recommendations.find((item) => item.needId === candidate.needId)
    return activeSelection.plans.some((item) => item.needId === candidate.needId && item.selectedOptionKind === candidate.selectedOptionKind) && candidateReview?.selectionReason === 'PLAN_STILL_VALID'
  })
  const validity = selection.recommendations.find((item) => item.needId === plan.needId)
  const replacement = selection.plans.find((item) => item.needId === plan.needId)
  const currentOption = context.options.find((option) => option.needId === plan.needId && option.kind === plan.selectedOptionKind)
  const need = context.needsAssessment.needs.find((item) => item.id === plan.needId)
  const coordinationFlags = plan.selectedOptionKind === 'EXTERNAL_ACQUISITION' && currentActivePlans.some((item) => item.teamId === plan.teamId && item.needId !== plan.needId && item.selectedOptionKind === 'FINANCIAL_CONTAINMENT')
    ? ['FINANCIAL_CONTAINMENT_PLAN_PRESENT']
    : []
  const current = replacement?.selectedOptionKind === plan.selectedOptionKind && validity?.selectionReason === 'PLAN_STILL_VALID'

  if (!current || currentOption === undefined) {
    const blocked = currentOption?.planningEligibility === 'NOT_SELECTABLE' || validity?.selectionReason === 'OPTION_BECAME_BLOCKED'
    return Object.freeze({
      teamId: context.teamId, needId: plan.needId, planId: plan.id, responseFamily: plan.selectedOptionKind,
      selectedOn: plan.selectedOn, selectionReason: plan.selectionReason,
      currentValidity: 'STALE', currentPlanningEligibility: currentOption?.planningEligibility ?? 'NOT_AVAILABLE', route: 'NONE', status: blocked ? 'BLOCKED' : 'REVIEW_REQUIRED',
      ...(currentOption === undefined ? {} : { currentExecutionReadiness: currentOption.executionReadiness, authorityStatus: currentOption.governancePolicy.status, optionPriority: currentOption.priority }),
      responsibleSystem: 'GM_PLANNING', reviewedOn: context.asOfDate, ...(need === undefined ? {} : { needSeverity: need.severity, needUrgency: need.urgency }),
      coordinationFlags: Object.freeze(coordinationFlags), reasons: Object.freeze([validity?.selectionReason ?? 'PLAN_NOT_CURRENT']), blockers: Object.freeze(['STALE_PLAN_NOT_ROUTED']),
      ...(replacement !== undefined && replacement.selectedOptionKind !== plan.selectedOptionKind ? { replacementOptionKind: replacement.selectedOptionKind } : {}),
    })
  }

  if (plan.selectedOptionKind === 'WAIT_AND_MONITOR') return Object.freeze({
    teamId: context.teamId, needId: plan.needId, planId: plan.id, responseFamily: plan.selectedOptionKind, currentValidity: 'CURRENT', currentPlanningEligibility: 'SELECTABLE',
    selectedOn: plan.selectedOn, selectionReason: plan.selectionReason,
    route: 'NO_ACTION', status: 'NO_ACTION', currentExecutionReadiness: currentOption.executionReadiness, authorityStatus: currentOption.governancePolicy.status,
    responsibleSystem: 'GM_PLANNING', reviewedOn: context.asOfDate, optionPriority: currentOption.priority,
    ...(need === undefined ? {} : { needSeverity: need.severity, needUrgency: need.urgency }), coordinationFlags: Object.freeze(coordinationFlags), reasons: Object.freeze(['CURRENT_PLAN_VALID', 'WAIT_IS_A_DELIBERATE_PLAN']), blockers: Object.freeze([]),
  })

  if (currentOption.executionReadiness === 'BLOCKED') return Object.freeze({
    teamId: context.teamId, needId: plan.needId, planId: plan.id, responseFamily: plan.selectedOptionKind, currentValidity: 'STALE', currentPlanningEligibility: currentOption.planningEligibility, route: 'NONE', status: 'BLOCKED',
    selectedOn: plan.selectedOn, selectionReason: plan.selectionReason,
    currentExecutionReadiness: currentOption.executionReadiness, authorityStatus: currentOption.governancePolicy.status, responsibleSystem: 'GM_PLANNING', reviewedOn: context.asOfDate,
    optionPriority: currentOption.priority, ...(need === undefined ? {} : { needSeverity: need.severity, needUrgency: need.urgency }), coordinationFlags: Object.freeze(coordinationFlags),
    reasons: Object.freeze(['CURRENT_AUTHORITY_BLOCKS_OPTION']), blockers: Object.freeze(['PLANNING_EXECUTION_BOUNDARY_BLOCKED']),
  })

  if (currentOption.executionReadiness === 'REQUIRES_APPROVAL') return Object.freeze({
    teamId: context.teamId, needId: plan.needId, planId: plan.id, responseFamily: plan.selectedOptionKind, currentValidity: 'CURRENT', currentPlanningEligibility: 'SELECTABLE', route: 'APPROVAL_PATH_UNRESOLVED', status: 'WAITING_APPROVAL',
    selectedOn: plan.selectedOn, selectionReason: plan.selectionReason,
    currentExecutionReadiness: currentOption.executionReadiness, authorityStatus: currentOption.governancePolicy.status, responsibleSystem: 'UNRESOLVED', reviewedOn: context.asOfDate,
    optionPriority: currentOption.priority, ...(need === undefined ? {} : { needSeverity: need.severity, needUrgency: need.urgency }), coordinationFlags: Object.freeze(coordinationFlags),
    reasons: Object.freeze(['CURRENT_AUTHORITY_REQUIRES_APPROVAL']), blockers: Object.freeze(['NO_CONCRETE_PROPOSAL_OR_APPROVAL_ACTORS']),
  })

  const route = ANALYTIC_ROUTES[plan.selectedOptionKind]
  if (route === undefined) return Object.freeze({
    teamId: context.teamId, needId: plan.needId, planId: plan.id, responseFamily: plan.selectedOptionKind, currentValidity: 'CURRENT', currentPlanningEligibility: 'SELECTABLE', route: 'NO_SUPPORTED_WORKFLOW', status: 'UNSUPPORTED',
    selectedOn: plan.selectedOn, selectionReason: plan.selectionReason,
    currentExecutionReadiness: currentOption.executionReadiness, authorityStatus: currentOption.governancePolicy.status, responsibleSystem: 'GM_PLANNING', reviewedOn: context.asOfDate,
    optionPriority: currentOption.priority, ...(need === undefined ? {} : { needSeverity: need.severity, needUrgency: need.urgency }), coordinationFlags: Object.freeze(coordinationFlags),
    reasons: Object.freeze(['NO_SAFE_BROAD_PLAN_WORKFLOW_EXISTS']), blockers: Object.freeze([]),
  })

  const financeConstraint = plan.selectedOptionKind === 'EXTERNAL_ACQUISITION' && (currentOption.financialContext === 'CONSTRAINED' || currentOption.financialContext === 'STRESSED')
  const blockers = financeConstraint ? ['CURRENT_FINANCIAL_CONTEXT_CONSTRAINS_ACQUISITION'] : []
  const reasons = ['CURRENT_PLAN_VALID', route.reason, ...(financeConstraint ? ['BS9C_FINANCIAL_CONTEXT_CONSTRAINED'] : [])]
  return Object.freeze({
    teamId: context.teamId, needId: plan.needId, planId: plan.id, responseFamily: plan.selectedOptionKind, currentValidity: 'CURRENT', currentPlanningEligibility: 'SELECTABLE', route: route.route,
    selectedOn: plan.selectedOn, selectionReason: plan.selectionReason,
    status: plan.selectedOptionKind === 'FINANCIAL_CONTAINMENT' && currentOption.executionReadiness === 'AUTHORIZED' ? 'READY_TO_ROUTE' : route.status,
    currentExecutionReadiness: currentOption.executionReadiness, authorityStatus: currentOption.governancePolicy.status, responsibleSystem: route.responsibleSystem,
    reviewedOn: context.asOfDate, optionPriority: currentOption.priority, ...(need === undefined ? {} : { needSeverity: need.severity, needUrgency: need.urgency }),
    coordinationFlags: Object.freeze(coordinationFlags), reasons: Object.freeze(reasons), blockers: Object.freeze(blockers),
  })
}

export function assessGMPlanWorkflows(context: GMDecisionContext, plans: readonly GMPlanState[]): readonly GMWorkflowDecision[] {
  const teamPlans = [...plans].filter((plan) => plan.teamId === context.teamId).sort((a, b) => a.needId.localeCompare(b.needId) || a.id.localeCompare(b.id))
  return Object.freeze(teamPlans.map((plan) => assessGMPlanWorkflow(context, plan, teamPlans)))
}
