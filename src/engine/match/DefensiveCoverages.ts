import type { PlayerId } from '@/domain/ids'
import { distanceBetween, isInsideCourt, type CourtGeometry, type CourtPosition } from '@/domain/court'
import type { PickAndRollCoverage } from '@/domain/tactics'
import type { MatchTacticalPlan } from './tactics/MatchTacticalPlan'
import type { PlayerMatchup } from './Matchups'
import type { ScreenIntent } from './ScreenInteractions'
import type { SpatialState } from './SpatialState'

export const DEFENSIVE_COVERAGE_RULES_V1 = {
  dropDepthMeters: 4.25,
  blitzSeparationMeters: 0.7,
  switchDefenderDepth: 0.55,
  hedgeStepUpMeters: 0.9,
  hedgeBasketBiasMeters: 0.4,
  courtMarginMeters: 0.6,
} as const

export type DefensiveCoveragePhase = 'ACTIVE' | 'RECOVER'

export interface DefensiveCoverageState {
  readonly type: PickAndRollCoverage
  readonly phase: DefensiveCoveragePhase
  readonly handlerId: PlayerId
  readonly screenerId: PlayerId
  readonly handlerDefenderId: PlayerId
  readonly screenerDefenderId: PlayerId
}

export interface DefensiveCoverageResolution {
  readonly state: DefensiveCoverageState
  readonly assignments: readonly PlayerMatchup[]
  readonly targetOverrides: readonly { readonly playerId: PlayerId; readonly position: CourtPosition }[]
  readonly committedDefenderIds: readonly PlayerId[]
}

/** The one authority that translates the runtime tactical plan and valid P&R context into coverage. */
export function coverageForCurrentScreen(input: {
  readonly plan: MatchTacticalPlan
  readonly screen?: ScreenIntent
  readonly offensiveLineup: readonly PlayerId[]
  readonly defensiveLineup: readonly PlayerId[]
  readonly assignments: readonly PlayerMatchup[]
  readonly spatial: SpatialState
  readonly attackingBasket: CourtPosition
}): DefensiveCoverageResolution | undefined {
  const screen = input.screen
  if (screen === undefined || screen.phase === 'approach') return undefined
  if (!input.offensiveLineup.includes(screen.ballHandlerId) || !input.offensiveLineup.includes(screen.screenerId)) return undefined
  if (input.spatial.ball.kind !== 'playerControlled' || input.spatial.ball.playerId !== screen.ballHandlerId) return undefined
  const handlerAssignment = input.assignments.find((assignment) => assignment.offensivePlayerId === screen.ballHandlerId)
  const screenerAssignment = input.assignments.find((assignment) => assignment.offensivePlayerId === screen.screenerId)
  if (handlerAssignment === undefined || screenerAssignment === undefined
    || handlerAssignment.defensivePlayerId !== screen.defenderId
    || (screen.screenerDefenderId !== undefined && screenerAssignment.defensivePlayerId !== screen.screenerDefenderId)
    || !input.defensiveLineup.includes(handlerAssignment.defensivePlayerId)
    || !input.defensiveLineup.includes(screenerAssignment.defensivePlayerId)
    || handlerAssignment.defensivePlayerId === screenerAssignment.defensivePlayerId) return undefined

  const handler = input.spatial.players.find((player) => player.playerId === screen.ballHandlerId)
  const screener = input.spatial.players.find((player) => player.playerId === screen.screenerId)
  if (handler === undefined || screener === undefined) return undefined

  const type = input.plan.defense.pickAndRollCoverage ?? 'switch'
  const state: DefensiveCoverageState = {
    type,
    phase: type === 'hedge' && screen.phase === 'postScreen' ? 'RECOVER' : 'ACTIVE',
    handlerId: screen.ballHandlerId,
    screenerId: screen.screenerId,
    handlerDefenderId: handlerAssignment.defensivePlayerId,
    screenerDefenderId: screenerAssignment.defensivePlayerId,
  }
  const committedDefenderIds = [state.handlerDefenderId, state.screenerDefenderId]
  if (type === 'switch') {
    const assignments = input.assignments.map((assignment) => assignment.offensivePlayerId === state.handlerId
      ? { ...assignment, defensivePlayerId: state.screenerDefenderId }
      : assignment.offensivePlayerId === state.screenerId
        ? { ...assignment, defensivePlayerId: state.handlerDefenderId }
        : assignment)
    return {
      state,
      assignments,
      targetOverrides: [
        { playerId: state.handlerDefenderId, position: assignmentTarget(screener.position, input.attackingBasket, input.spatial.court) },
        { playerId: state.screenerDefenderId, position: assignmentTarget(handler.position, input.attackingBasket, input.spatial.court) },
      ],
      committedDefenderIds,
    }
  }

  if (type === 'drop') {
    const rollThreat = screen.phase === 'postScreen' && screen.postScreenAction === 'roll' && screen.postScreenTarget !== undefined
      ? screen.postScreenTarget
      : handler.position
    return {
      state,
      assignments: input.assignments,
      targetOverrides: [{ playerId: state.screenerDefenderId, position: pointToward(rollThreat, input.attackingBasket, DEFENSIVE_COVERAGE_RULES_V1.dropDepthMeters, input.spatial.court) }],
      committedDefenderIds,
    }
  }

  if (type === 'hedge') {
    const hedgeTarget = pointToward(midpoint(handler.position, screener.position), handler.position, DEFENSIVE_COVERAGE_RULES_V1.hedgeStepUpMeters, input.spatial.court)
    const target = state.phase === 'ACTIVE'
      ? pointToward(hedgeTarget, input.attackingBasket, DEFENSIVE_COVERAGE_RULES_V1.hedgeBasketBiasMeters, input.spatial.court)
      : undefined
    return {
      state,
      assignments: input.assignments,
      targetOverrides: target === undefined ? [] : [{ playerId: state.screenerDefenderId, position: target }],
      committedDefenderIds,
    }
  }

  const towardBasket = unitVector(handler.position, input.attackingBasket)
  const lateral = { x: -towardBasket.y, y: towardBasket.x }
  return {
    state,
    assignments: input.assignments,
    targetOverrides: [-1, 1].map((side) => ({
      playerId: side < 0 ? state.handlerDefenderId : state.screenerDefenderId,
      position: clampToCourt({
        x: handler.position.x + lateral.x * side * DEFENSIVE_COVERAGE_RULES_V1.blitzSeparationMeters,
        y: handler.position.y + lateral.y * side * DEFENSIVE_COVERAGE_RULES_V1.blitzSeparationMeters,
      }, input.spatial.court),
    })),
    committedDefenderIds,
  }
}

function assignmentTarget(opponent: CourtPosition, basket: CourtPosition, court: CourtGeometry): CourtPosition {
  const target = {
    x: basket.x + (opponent.x - basket.x) * DEFENSIVE_COVERAGE_RULES_V1.switchDefenderDepth,
    y: basket.y + (opponent.y - basket.y) * DEFENSIVE_COVERAGE_RULES_V1.switchDefenderDepth,
  }
  return clampToCourt(target, court)
}

function pointToward(from: CourtPosition, target: CourtPosition, distance: number, court: CourtGeometry): CourtPosition {
  const length = distanceBetween(from, target)
  if (length <= distance) return midpoint(from, target)
  const ratio = distance / length
  return clampToCourt({ x: from.x + (target.x - from.x) * ratio, y: from.y + (target.y - from.y) * ratio }, court)
}

function midpoint(left: CourtPosition, right: CourtPosition): CourtPosition {
  return { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 }
}

function unitVector(from: CourtPosition, to: CourtPosition): CourtPosition {
  const length = distanceBetween(from, to)
  return length <= 1e-9 ? { x: 1, y: 0 } : { x: (to.x - from.x) / length, y: (to.y - from.y) / length }
}

function clampToCourt(position: CourtPosition, court: CourtGeometry): CourtPosition {
  const margin = DEFENSIVE_COVERAGE_RULES_V1.courtMarginMeters
  const target = {
    x: Math.max(margin, Math.min(court.lengthMeters - margin, position.x)),
    y: Math.max(margin, Math.min(court.widthMeters - margin, position.y)),
  }
  if (!isInsideCourt(target, court)) throw new Error('Defensive coverage target must remain inside the court')
  return target
}
