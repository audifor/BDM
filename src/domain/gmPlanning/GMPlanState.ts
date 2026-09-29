import { parseGameDate, type GameDate } from '@/domain/date'
import type { TeamId } from '@/domain/ids'
import type { ClubStrategicMode } from '@/domain/clubStrategy'

export type GMResponseOptionKind = 'INTERNAL_ROLE_REALLOCATION' | 'INTERNAL_DEVELOPMENT' | 'EXTERNAL_ACQUISITION' | 'SHORT_TERM_COVER' | 'CONTRACT_RETENTION_REVIEW' | 'SUCCESSION_PLANNING' | 'OUTGOING_MARKET_REVIEW' | 'FINANCIAL_CONTAINMENT' | 'SCOUTING_EXPANSION' | 'WAIT_AND_MONITOR'
export type GMPlanSelectionReason = 'INITIAL_SELECTION' | 'PLAN_STILL_VALID' | 'SOURCE_NEED_RESOLVED' | 'OPTION_NO_LONGER_AVAILABLE' | 'OPTION_BECAME_BLOCKED' | 'STRATEGY_CHANGED' | 'CONTEXT_MATERIALLY_CHANGED' | 'NO_SELECTABLE_OPTION'
export type GMPlanReviewTrigger = 'ROUTINE_REVIEW' | 'STRATEGY_TRANSITION' | 'MATERIAL_ROSTER_CHANGE' | 'CONTRACT_CHANGE' | 'MAJOR_INJURY' | 'CONTRACT_DEADLINE_ESCALATION' | 'MATERIAL_FINANCIAL_CHANGE' | 'GOVERNANCE_CHANGE' | 'EXPLICIT_REEVALUATION'
export type GMExecutionReadiness = 'AUTHORIZED' | 'REQUIRES_APPROVAL' | 'UNKNOWN_AUTHORITY' | 'BLOCKED'

/** Minimal accepted AI preference for a single need. This is planning memory, not action state. */
export interface GMPlanState {
  readonly id: string
  readonly teamId: TeamId
  readonly needId: string
  readonly selectedOptionKind: GMResponseOptionKind
  readonly selectedOn: GameDate
  readonly lastReviewedOn: GameDate
  readonly selectionReason: GMPlanSelectionReason
  readonly executionReadinessAtSelection: Exclude<GMExecutionReadiness, 'BLOCKED'>
  readonly strategyAtSelection: ClubStrategicMode
  readonly originalOptionPriority: number
}

export function createGMPlanState(input: GMPlanState): GMPlanState {
  if (!input.id.trim() || !input.needId.trim() || !Number.isInteger(input.originalOptionPriority) || input.originalOptionPriority < 1) throw new RangeError('Invalid GM plan state')
  if ((input.executionReadinessAtSelection as GMExecutionReadiness) === 'BLOCKED') throw new RangeError('A blocked option cannot be selected as a GM plan')
  const selectedOn = parseGameDate(input.selectedOn)
  const lastReviewedOn = parseGameDate(input.lastReviewedOn)
  if (lastReviewedOn < selectedOn) throw new RangeError('GM plan review predates its selection')
  if (!['INTERNAL_ROLE_REALLOCATION', 'INTERNAL_DEVELOPMENT', 'EXTERNAL_ACQUISITION', 'SHORT_TERM_COVER', 'CONTRACT_RETENTION_REVIEW', 'SUCCESSION_PLANNING', 'OUTGOING_MARKET_REVIEW', 'FINANCIAL_CONTAINMENT', 'SCOUTING_EXPANSION', 'WAIT_AND_MONITOR'].includes(input.selectedOptionKind)) throw new TypeError('Invalid GM plan response family')
  if (!['INITIAL_SELECTION', 'PLAN_STILL_VALID', 'SOURCE_NEED_RESOLVED', 'OPTION_NO_LONGER_AVAILABLE', 'OPTION_BECAME_BLOCKED', 'STRATEGY_CHANGED', 'CONTEXT_MATERIALLY_CHANGED', 'NO_SELECTABLE_OPTION'].includes(input.selectionReason)) throw new TypeError('Invalid GM plan selection reason')
  if (!['AUTHORIZED', 'REQUIRES_APPROVAL', 'UNKNOWN_AUTHORITY'].includes(input.executionReadinessAtSelection)) throw new TypeError('Invalid GM plan execution readiness')
  if (!['CONTEND', 'COMPETE', 'DEVELOP', 'REBUILD', 'SELL', 'SURVIVE'].includes(input.strategyAtSelection)) throw new TypeError('Invalid GM plan strategy')
  return Object.freeze({ ...input, selectedOn, lastReviewedOn })
}
