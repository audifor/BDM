import type { PlayerId, TeamId } from '@/domain/ids'
import type { CourtPosition } from '@/domain/court'
import type { MatchLineups } from './MatchEngine'
import { assignBaseSpatialTargets, type BaseSpatialTarget } from './BaseSpacing'
import type { MatchPlayerProfiles } from './MatchPlayerProfile'
import { advancePlayerTowardTarget, getSpatialPossessionView, type SpatialState } from './SpatialState'

export type TransitionMovementRole = 'ballHandler' | 'wingLane' | 'rimRunner' | 'trailer' | 'stopBall' | 'protectRim' | 'retreat'

export interface TransitionSpatialTarget {
  readonly playerId: PlayerId
  readonly teamId: TeamId
  readonly role: TransitionMovementRole
  readonly position: CourtPosition
}

export interface TransitionSpatialTargets {
  readonly offense: readonly TransitionSpatialTarget[]
  readonly defense: readonly TransitionSpatialTarget[]
}

export interface TransitionIntent {
  readonly attackingTeamId: TeamId
}

export interface TransitionSpatialInput {
  readonly homeTeamId: TeamId
  readonly awayTeamId: TeamId
  readonly attackingTeamId: TeamId
  readonly period: number
  readonly activeLineups: MatchLineups
  readonly playerProfiles: MatchPlayerProfiles
  readonly spatial: SpatialState
}

const TRANSITION_RULES_V1 = {
  ballHandlerAdvanceMeters: 5,
  wingAdvanceMeters: 4.5,
  rimRunnerAdvanceMeters: 4.5,
  trailerAdvanceMeters: 2.5,
  stopBallOffsetMeters: 1.25,
  protectRimOffsetMeters: 1.75,
  wingLaneFractions: { SG: 0.2, SF: 0.8 },
} as const

/** Derives one transition step from current possession, player roles, and court geometry. */
export function assignTransitionSpatialTargets(input: TransitionSpatialInput): TransitionSpatialTargets {
  const view = getSpatialPossessionView(input)
  const baseTargets = assignBaseSpatialTargets({ ...input, ballHandlerId: view.ballHandlerId })
  const direction = view.attackingBasket.x > input.spatial.court.lengthMeters / 2 ? 1 : -1
  const defensiveBasket = direction > 0 ? input.spatial.court.baskets.left : input.spatial.court.baskets.right
  const offense = baseTargets.offensive.map((target) => offensiveTarget(target, view.ballHandlerId, direction, input.spatial))
  const defense = defensiveTargets(baseTargets.defensive, input.spatial, view.attackingBasket, defensiveBasket)
  return { offense, defense }
}

/** Takes the single bounded step owned by a pending transition; the next step returns to BaseSpacing. */
export function stepPlayersTowardTransitionTargets(input: TransitionSpatialInput, deltaTimeSeconds: number): SpatialState {
  const targets = assignTransitionSpatialTargets(input)
  return [...targets.offense, ...targets.defense].reduce(
    (spatial, target) => {
      const profile = [...input.playerProfiles.home, ...input.playerProfiles.away].find((candidate) => candidate.playerId === target.playerId)
      if (profile === undefined) throw new Error(`Match player profile ${target.playerId} is missing`)
      return advancePlayerTowardTarget(spatial, target.playerId, target.position, deltaTimeSeconds, profile.kinematics)
    },
    input.spatial,
  )
}

function offensiveTarget(target: BaseSpatialTarget, ballHandlerId: PlayerId | undefined, direction: number, spatial: SpatialState): TransitionSpatialTarget {
  const role: TransitionMovementRole = target.playerId === ballHandlerId
    ? 'ballHandler'
    : target.role === 'SG' || target.role === 'SF'
      ? 'wingLane'
      : target.role === 'C'
        ? 'rimRunner'
        : 'trailer'
  const advanceMeters = role === 'ballHandler' ? TRANSITION_RULES_V1.ballHandlerAdvanceMeters
    : role === 'wingLane' ? TRANSITION_RULES_V1.wingAdvanceMeters
      : role === 'rimRunner' ? TRANSITION_RULES_V1.rimRunnerAdvanceMeters
        : TRANSITION_RULES_V1.trailerAdvanceMeters
  const current = positionOf(target.playerId, spatial)
  const position = {
    x: clamp(current.x + direction * advanceMeters, 0, spatial.court.lengthMeters),
    y: role === 'wingLane'
      ? spatial.court.widthMeters * TRANSITION_RULES_V1.wingLaneFractions[target.role as 'SG' | 'SF']
      : role === 'rimRunner' ? spatial.court.widthMeters / 2 : current.y,
  }
  return { playerId: target.playerId, teamId: target.teamId, role, position }
}

function defensiveTargets(
  targets: readonly BaseSpatialTarget[],
  spatial: SpatialState,
  attackingBasket: CourtPosition,
  defensiveBasket: CourtPosition,
): readonly TransitionSpatialTarget[] {
  const ballPosition = spatial.ball.position
  const stopBall = closestTo(targets, ballPosition, spatial)
  const protectRim = closestTo(targets.filter((target) => target.playerId !== stopBall?.playerId), defensiveBasket, spatial)
  const courtCenter = { x: spatial.court.lengthMeters / 2, y: spatial.court.widthMeters / 2 }
  const stopBallTarget = pointToward(ballPosition, attackingBasket, TRANSITION_RULES_V1.stopBallOffsetMeters, spatial)
  const protectRimTarget = pointToward(defensiveBasket, courtCenter, TRANSITION_RULES_V1.protectRimOffsetMeters, spatial)
  const attackDirection = attackingBasket.x > spatial.court.lengthMeters / 2 ? 1 : -1
  return targets.map((target) => {
    const current = positionOf(target.playerId, spatial)
    if (target.playerId === stopBall?.playerId) return { playerId: target.playerId, teamId: target.teamId, role: 'stopBall', position: stopBallTarget }
    if (target.playerId === protectRim?.playerId) return { playerId: target.playerId, teamId: target.teamId, role: 'protectRim', position: protectRimTarget }
    return {
      playerId: target.playerId,
      teamId: target.teamId,
      role: 'retreat',
      position: { x: clamp(current.x - attackDirection * TRANSITION_RULES_V1.trailerAdvanceMeters, 0, spatial.court.lengthMeters), y: current.y },
    }
  })
}

function closestTo(targets: readonly BaseSpatialTarget[], point: CourtPosition, spatial: SpatialState): BaseSpatialTarget | undefined {
  return [...targets].sort((left, right) =>
    distance(positionOf(left.playerId, spatial), point) - distance(positionOf(right.playerId, spatial), point)
      || comparePlayerIds(left.playerId, right.playerId),
  )[0]
}

function comparePlayerIds(left: PlayerId, right: PlayerId): number {
  const leftKey = String(left)
  const rightKey = String(right)
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0
}

function pointToward(from: CourtPosition, target: CourtPosition, maxDistance: number, spatial: SpatialState): CourtPosition {
  const length = distance(from, target)
  if (length <= maxDistance) return target
  const ratio = maxDistance / length
  return {
    x: clamp(from.x + (target.x - from.x) * ratio, 0, spatial.court.lengthMeters),
    y: clamp(from.y + (target.y - from.y) * ratio, 0, spatial.court.widthMeters),
  }
}

function positionOf(playerId: PlayerId, spatial: SpatialState): CourtPosition {
  const player = spatial.players.find((candidate) => candidate.playerId === playerId)
  if (player === undefined) throw new Error(`Transition player ${playerId} is missing from SpatialState`)
  return player.position
}

function distance(left: CourtPosition, right: CourtPosition): number { return Math.hypot(left.x - right.x, left.y - right.y) }
function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)) }
