import { describe, expect, it } from 'vitest'
import { parseGameDate } from '@/domain/date'
import { createGMPlanState, type GMResponseOptionKind } from '@/domain/gmPlanning'
import { teamIdFromString } from '@/domain/ids'
import type { GMDecisionContext, GMResponseOption } from '@/engine/gmDecisionContext'
import { assessGMPlanWorkflow, assessGMPlanWorkflows } from './GMPlanWorkflowEngine'

const teamId = teamIdFromString('gm-workflow-test')
const date = parseGameDate('2032-10-01')
const option = (kind: GMResponseOptionKind, needId = `need-${kind}`, values: Partial<GMResponseOption> = {}): GMResponseOption => ({
  id: `${needId}:${kind}`, needId, kind, priority: 1, strategicAlignment: 'HIGH', staffStyleAlignment: 'MEDIUM', feasibility: 'HIGH', confidence: 'HIGH', knowledgeReadiness: 'UNKNOWN',
  governancePolicy: { status: 'UNKNOWN', authorityGrantIds: [], proposerBodyIds: [], approverBodyIds: [], executorBodyIds: [], pendingRequestIds: [] },
  planningEligibility: 'SELECTABLE', executionReadiness: 'UNKNOWN_AUTHORITY', financialContext: 'HEALTHY', reasons: [], blockers: [], ...values,
})
const context = (options: readonly GMResponseOption[]): GMDecisionContext => ({
  teamId, asOfDate: date, strategy: 'CONTEND', options,
  needsAssessment: { needs: options.map((item) => ({ id: item.needId, severity: 'HIGH', urgency: 'SOON' })) },
} as unknown as GMDecisionContext)
const plan = (kind: GMResponseOptionKind, needId = `need-${kind}`, values: Partial<ReturnType<typeof createGMPlanState>> = {}) => createGMPlanState({
  id: `${teamId}:${needId}`, teamId, needId, selectedOptionKind: kind, selectedOn: date, lastReviewedOn: date,
  selectionReason: 'INITIAL_SELECTION', executionReadinessAtSelection: 'UNKNOWN_AUTHORITY', strategyAtSelection: 'CONTEND', originalOptionPriority: 1, ...values,
})

describe('GM plan workflow assessment', () => {
  it('routes supported families to analysis or review destinations and leaves other families unsupported', () => {
    const route = (kind: GMResponseOptionKind) => assessGMPlanWorkflow(context([option(kind)]), plan(kind))
    expect(route('WAIT_AND_MONITOR')).toMatchObject({ route: 'NO_ACTION', status: 'NO_ACTION' })
    expect(route('EXTERNAL_ACQUISITION')).toMatchObject({ route: 'MARKET_INTELLIGENCE_REQUIRED', responsibleSystem: 'BS10_MARKET_INTELLIGENCE', status: 'WAITING_INFORMATION' })
    expect(route('OUTGOING_MARKET_REVIEW')).toMatchObject({ route: 'MARKET_INTELLIGENCE_REQUIRED', status: 'WAITING_INFORMATION' })
    expect(route('SCOUTING_EXPANSION')).toMatchObject({ route: 'ROUTE_TO_SCOUTING', status: 'WAITING_INFORMATION' })
    expect(route('CONTRACT_RETENTION_REVIEW')).toMatchObject({ route: 'ROUTE_TO_CONTRACT_REVIEW', status: 'WAITING_INFORMATION' })
    expect(route('FINANCIAL_CONTAINMENT')).toMatchObject({ route: 'ROUTE_TO_FINANCE', status: 'WAITING_INFORMATION' })
    expect(route('INTERNAL_DEVELOPMENT')).toMatchObject({ route: 'NO_SUPPORTED_WORKFLOW', status: 'UNSUPPORTED' })
  })

  it('does not route stale or blocked plans and uses BS9D-B invalidation reasons', () => {
    const stale = assessGMPlanWorkflow(context([]), plan('EXTERNAL_ACQUISITION'))
    expect(stale).toMatchObject({ currentValidity: 'STALE', route: 'NONE', status: 'REVIEW_REQUIRED', reasons: ['SOURCE_NEED_RESOLVED'] })
    const blocked = assessGMPlanWorkflow(context([option('EXTERNAL_ACQUISITION', undefined, { planningEligibility: 'NOT_SELECTABLE', executionReadiness: 'BLOCKED' })]), plan('EXTERNAL_ACQUISITION'))
    expect(blocked).toMatchObject({ currentValidity: 'STALE', route: 'NONE', status: 'BLOCKED', currentExecutionReadiness: 'BLOCKED' })
  })

  it('uses current readiness rather than the readiness saved with the plan', () => {
    const prior = plan('FINANCIAL_CONTAINMENT', undefined, { executionReadinessAtSelection: 'UNKNOWN_AUTHORITY' })
    const approval = assessGMPlanWorkflow(context([option('FINANCIAL_CONTAINMENT', undefined, { executionReadiness: 'REQUIRES_APPROVAL', governancePolicy: { status: 'REQUIRES_APPROVAL', authorityGrantIds: [], proposerBodyIds: [], approverBodyIds: ['board'], executorBodyIds: [], pendingRequestIds: [] } })]), prior)
    expect(approval).toMatchObject({ currentExecutionReadiness: 'REQUIRES_APPROVAL', route: 'APPROVAL_PATH_UNRESOLVED', status: 'WAITING_APPROVAL', blockers: ['NO_CONCRETE_PROPOSAL_OR_APPROVAL_ACTORS'] })
    const authorized = assessGMPlanWorkflow(context([option('FINANCIAL_CONTAINMENT', undefined, { executionReadiness: 'AUTHORIZED', governancePolicy: { status: 'AUTHORIZED', authorityGrantIds: [], proposerBodyIds: [], approverBodyIds: [], executorBodyIds: ['executive'], pendingRequestIds: [] } })]), plan('FINANCIAL_CONTAINMENT', undefined, { executionReadinessAtSelection: 'REQUIRES_APPROVAL' }))
    expect(authorized).toMatchObject({ currentExecutionReadiness: 'AUTHORIZED', route: 'ROUTE_TO_FINANCE', status: 'READY_TO_ROUTE' })
  })

  it('preserves market boundaries, exposes Finance coordination, and is deterministic', () => {
    const external = plan('EXTERNAL_ACQUISITION', 'need-roster')
    const containment = plan('FINANCIAL_CONTAINMENT', 'need-finance')
    const current = context([option('EXTERNAL_ACQUISITION', 'need-roster', { financialContext: 'CONSTRAINED' }), option('FINANCIAL_CONTAINMENT', 'need-finance')])
    const first = assessGMPlanWorkflows(current, [external, containment])
    expect(first.find((decision) => decision.responseFamily === 'EXTERNAL_ACQUISITION')).toMatchObject({ route: 'MARKET_INTELLIGENCE_REQUIRED', coordinationFlags: ['FINANCIAL_CONTAINMENT_PLAN_PRESENT'], blockers: ['CURRENT_FINANCIAL_CONTEXT_CONSTRAINS_ACQUISITION'] })
    expect(JSON.stringify(first)).not.toContain('external-player')
    expect(assessGMPlanWorkflows(current, [external, containment])).toEqual(first)
  })
})
