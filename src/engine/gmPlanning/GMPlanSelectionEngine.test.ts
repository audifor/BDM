import { describe, expect, it } from 'vitest'
import { parseGameDate } from '@/domain/date'
import type { GMPlanState, GMResponseOptionKind } from '@/domain/gmPlanning'
import { teamIdFromString } from '@/domain/ids'
import type { GMDecisionContext, GMResponseOption } from '@/engine/gmDecisionContext'
import { selectGMPlans } from './GMPlanSelectionEngine'

const teamId = teamIdFromString('team-plan-test')
const date = parseGameDate('2032-10-01')
const option = (kind: GMResponseOptionKind, priority: number, values: Partial<GMResponseOption> = {}): GMResponseOption => ({
  id: `need-a:${kind}`, needId: 'need-a', kind, priority,
  strategicAlignment: 'HIGH', staffStyleAlignment: 'MEDIUM', feasibility: 'HIGH', confidence: 'HIGH', knowledgeReadiness: 'UNKNOWN',
  governancePolicy: { status: 'UNKNOWN', authorityGrantIds: [], proposerBodyIds: [], approverBodyIds: [], executorBodyIds: [], pendingRequestIds: [] },
  planningEligibility: 'SELECTABLE', executionReadiness: 'UNKNOWN_AUTHORITY', financialContext: 'HEALTHY', reasons: [], blockers: [],
  ...values,
})
const context = (options: readonly GMResponseOption[], strategy: GMDecisionContext['strategy'] = 'CONTEND'): GMDecisionContext => ({ teamId, asOfDate: date, strategy, options } as GMDecisionContext)
const plan = (kind: GMResponseOptionKind, overrides: Partial<GMPlanState> = {}): GMPlanState => ({ id: `${teamId}:need-a`, teamId, needId: 'need-a', selectedOptionKind: kind, selectedOn: date, lastReviewedOn: date, selectionReason: 'INITIAL_SELECTION', executionReadinessAtSelection: 'UNKNOWN_AUTHORITY', strategyAtSelection: 'CONTEND', originalOptionPriority: 2, ...overrides })

describe('GM plan selection', () => {
  it('chooses the first selectable BS9C option regardless of execution readiness', () => {
    const result = selectGMPlans(context([
      option('EXTERNAL_ACQUISITION', 1, { planningEligibility: 'NOT_SELECTABLE', executionReadiness: 'BLOCKED' }),
      option('INTERNAL_DEVELOPMENT', 2, { executionReadiness: 'UNKNOWN_AUTHORITY' }),
      option('WAIT_AND_MONITOR', 3, { executionReadiness: 'REQUIRES_APPROVAL' }),
    ]))
    expect(result.plans.map((item) => item.selectedOptionKind)).toEqual(['INTERNAL_DEVELOPMENT'])
    expect(result.recommendations[0]).toMatchObject({ originalOptionPriority: 2, executionReadiness: 'UNKNOWN_AUTHORITY', alternatives: ['EXTERNAL_ACQUISITION', 'WAIT_AND_MONITOR'] })
    expect(selectGMPlans(context([option('FINANCIAL_CONTAINMENT', 1, { executionReadiness: 'REQUIRES_APPROVAL' })])).plans[0]?.executionReadinessAtSelection).toBe('REQUIRES_APPROVAL')
  })

  it('selects WAIT_AND_MONITOR and SCOUTING_EXPANSION as real plans, one per need', () => {
    const wait = option('WAIT_AND_MONITOR', 1)
    const scouting = { ...option('SCOUTING_EXPANSION', 1), id: 'need-b:SCOUTING_EXPANSION', needId: 'need-b' }
    const result = selectGMPlans(context([wait, scouting]))
    expect(result.plans.map((item) => [item.needId, item.selectedOptionKind])).toEqual([['need-a', 'WAIT_AND_MONITOR'], ['need-b', 'SCOUTING_EXPANSION']])
  })

  it('retains a valid plan when option ranks shift or unrelated context data changes', () => {
    const result = selectGMPlans(context([option('INTERNAL_DEVELOPMENT', 1), option('EXTERNAL_ACQUISITION', 2)]), [plan('EXTERNAL_ACQUISITION')])
    expect(result.plans[0]).toMatchObject({ selectedOptionKind: 'EXTERNAL_ACQUISITION', selectedOn: date })
    expect(result.recommendations[0].selectionReason).toBe('PLAN_STILL_VALID')
  })

  it('invalidates a plan when its source need disappears', () => {
    const result = selectGMPlans(context([]), [plan('EXTERNAL_ACQUISITION')])
    expect(result.plans).toEqual([])
    expect(result.recommendations).toEqual([{ needId: 'need-a', selectionReason: 'SOURCE_NEED_RESOLVED', alternatives: [] }])
  })

  it('reselects deterministically when the selected option becomes blocked and returns no plan without a selectable alternative', () => {
    const blocked = option('EXTERNAL_ACQUISITION', 1, { planningEligibility: 'NOT_SELECTABLE', executionReadiness: 'BLOCKED' })
    const next = option('WAIT_AND_MONITOR', 2)
    expect(selectGMPlans(context([blocked, next]), [plan('EXTERNAL_ACQUISITION')]).plans[0]?.selectedOptionKind).toBe('WAIT_AND_MONITOR')
    const none = selectGMPlans(context([blocked]), [plan('EXTERNAL_ACQUISITION')])
    expect(none.plans).toEqual([])
    expect(none.recommendations[0]?.selectionReason).toBe('OPTION_BECAME_BLOCKED')
  })

  it('reselects on strategy change and produces the same result on repeat', () => {
    const options = [option('INTERNAL_DEVELOPMENT', 1), option('EXTERNAL_ACQUISITION', 2)]
    const first = selectGMPlans(context(options, 'REBUILD'), [plan('EXTERNAL_ACQUISITION')])
    expect(first.plans[0]).toMatchObject({ selectedOptionKind: 'INTERNAL_DEVELOPMENT', selectionReason: 'STRATEGY_CHANGED' })
    expect(selectGMPlans(context(options, 'REBUILD'), [plan('EXTERNAL_ACQUISITION')])).toEqual(first)
  })
})
