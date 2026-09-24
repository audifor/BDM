import type { PlayerId, TeamId } from '@/domain/ids'
import { createCourtGeometry, courtRulesetForEcosystem, distanceBetween, isInsideCourt, type CourtGeometry, type CourtPosition } from '@/domain/court'
import { BASKETBALL_POSITIONS, type SportsCategory } from '@/domain/primitives'
import type { SportsEcosystemKind } from '@/domain/ecosystem'
import type { MatchLineups } from './MatchEngine'
import { BASELINE_PLAYER_KINEMATIC_PROFILE, type MatchPlayerProfiles, type PlayerKinematicProfile } from './MatchPlayerProfile'

const SLOT_POSITIONS = BASKETBALL_POSITIONS
const RIGHT_ATTACKING_FORMATION: Readonly<Record<(typeof SLOT_POSITIONS)[number], CourtPosition>> = {
  PG: { x: 0.42, y: 0.5 },
  SG: { x: 0.56, y: 0.2 },
  SF: { x: 0.56, y: 0.8 },
  PF: { x: 0.66, y: 0.34 },
  C: { x: 0.66, y: 0.66 },
}

export interface SpatialPlayerState {
  readonly playerId: PlayerId
  readonly teamId: TeamId
  readonly position: CourtPosition
  /** Canonical movement velocity in metres per second. */
  readonly velocity: CourtPosition
}

export const PLAYER_MAX_SPEED_METERS_PER_SECOND = BASELINE_PLAYER_KINEMATIC_PROFILE.maxSpeedMps
export const PLAYER_ACCELERATION_METERS_PER_SECOND_SQUARED = BASELINE_PLAYER_KINEMATIC_PROFILE.accelerationMps2
export const PLAYER_DECELERATION_METERS_PER_SECOND_SQUARED = BASELINE_PLAYER_KINEMATIC_PROFILE.brakingMps2
const MOVEMENT_EPSILON = 1e-9

/** No player handler is selected at session creation, so the ball starts unassigned at center. */
export type BallSpatialState =
  | { readonly kind: 'unassigned'; readonly position: CourtPosition }
  | { readonly kind: 'loose'; readonly position: CourtPosition }
  | { readonly kind: 'playerControlled'; readonly playerId: PlayerId; readonly teamId: TeamId; readonly position: CourtPosition }

export interface SpatialState {
  readonly court: CourtGeometry
  readonly players: readonly SpatialPlayerState[]
  readonly ball: BallSpatialState
}

export interface SpatialPossessionView {
  readonly offensiveTeamId: TeamId
  readonly defensiveTeamId: TeamId
  readonly attackingBasket: CourtPosition
  readonly ballHandlerId?: PlayerId
}

export function createInitialSpatialState(input: {
  readonly homeTeamId: TeamId
  readonly awayTeamId: TeamId
  readonly lineups: MatchLineups
  readonly playerProfiles: MatchPlayerProfiles
  readonly ecosystemKind: SportsEcosystemKind
  readonly category: SportsCategory
}): SpatialState {
  const court = createCourtGeometry(courtRulesetForEcosystem(input.ecosystemKind, input.category))
  const homePositions = lineupPositions(input.lineups.home, input.homeTeamId, input.homeTeamId, input.awayTeamId, input.playerProfiles.home, court)
  const awayPositions = lineupPositions(input.lineups.away, input.awayTeamId, input.homeTeamId, input.awayTeamId, input.playerProfiles.away, court)
  const ballPosition = { x: court.lengthMeters / 2, y: court.widthMeters / 2 }
  return { court, players: [...homePositions, ...awayPositions], ball: { kind: 'unassigned', position: ballPosition } }
}

export function attackingBasketForTeam(input: {
  readonly teamId: TeamId
  readonly homeTeamId: TeamId
  readonly awayTeamId: TeamId
  readonly period: number
  readonly court: CourtGeometry
}): CourtPosition {
  const homeAttacksRight = input.period <= 2
  if (input.teamId !== input.homeTeamId && input.teamId !== input.awayTeamId) throw new Error(`Team ${input.teamId} is not in this match`)
  const attacksRight = input.teamId === input.homeTeamId ? homeAttacksRight : !homeAttacksRight
  return attacksRight ? input.court.baskets.right : input.court.baskets.left
}

export function defendingBasketForTeam(input: {
  readonly teamId: TeamId
  readonly homeTeamId: TeamId
  readonly awayTeamId: TeamId
  readonly period: number
  readonly court: CourtGeometry
}): CourtPosition {
  const attacking = attackingBasketForTeam(input)
  return attacking === input.court.baskets.right ? input.court.baskets.left : input.court.baskets.right
}

/** Derives spatial offense/defense from MatchSession possession authority; no second possession state is stored. */
export function getSpatialPossessionView(input: {
  readonly homeTeamId: TeamId
  readonly awayTeamId: TeamId
  readonly attackingTeamId: TeamId
  readonly period: number
  readonly spatial: SpatialState
}): SpatialPossessionView {
  if (input.attackingTeamId !== input.homeTeamId && input.attackingTeamId !== input.awayTeamId) {
    throw new Error(`Attacking team ${input.attackingTeamId} is not in this match`)
  }
  const defensiveTeamId = input.attackingTeamId === input.homeTeamId ? input.awayTeamId : input.homeTeamId
  const ballHandlerId = input.spatial.ball.kind === 'playerControlled' ? input.spatial.ball.playerId : undefined
  return {
    offensiveTeamId: input.attackingTeamId,
    defensiveTeamId,
    attackingBasket: attackingBasketForTeam({
      teamId: input.attackingTeamId,
      homeTeamId: input.homeTeamId,
      awayTeamId: input.awayTeamId,
      period: input.period,
      court: input.spatial.court,
    }),
    ...(ballHandlerId === undefined ? {} : { ballHandlerId }),
  }
}

export function isSpatialStateCoherentWithPossession(input: {
  readonly homeTeamId: TeamId
  readonly awayTeamId: TeamId
  readonly attackingTeamId: TeamId
  readonly period: number
  readonly spatial: SpatialState
}): boolean {
  const ball = input.spatial.ball
  return (input.attackingTeamId === input.homeTeamId || input.attackingTeamId === input.awayTeamId)
    && isSpatialStateInsideCourt(input.spatial)
    && (ball.kind !== 'playerControlled' || ball.teamId === input.attackingTeamId)
}

export function isSpatialStateInsideCourt(spatial: SpatialState): boolean {
  const ball = spatial.ball
  return spatial.players.every((player) => isInsideCourt(player.position, spatial.court))
    && isInsideCourt(ball.position, spatial.court)
    && (ball.kind !== 'playerControlled' || spatial.players.some((player) =>
      player.playerId === ball.playerId
      && player.teamId === ball.teamId
      && player.position.x === ball.position.x
      && player.position.y === ball.position.y))
}

export function controlBallByPlayer(spatial: SpatialState, playerId: PlayerId): SpatialState {
  const player = spatial.players.find((candidate) => candidate.playerId === playerId)
  if (player === undefined) throw new Error(`Spatial player ${playerId} is not active`)
  return { ...spatial, ball: { kind: 'playerControlled', playerId: player.playerId, teamId: player.teamId, position: player.position } }
}

export function releaseSpatialBall(spatial: SpatialState): SpatialState {
  return { ...spatial, ball: { kind: 'unassigned', position: spatial.ball.position } }
}

/** Advances one active player toward a legal court target using the elapsed match-clock seconds. */
export function advancePlayerTowardTarget(
  spatial: SpatialState,
  playerId: PlayerId,
  target: CourtPosition,
  deltaTimeSeconds: number,
  kinematics: PlayerKinematicProfile,
): SpatialState {
  const playerIndex = spatial.players.findIndex((candidate) => candidate.playerId === playerId)
  if (playerIndex < 0) throw new Error(`Spatial player ${playerId} is not active`)
  if (!isInsideCourt(target, spatial.court)) throw new RangeError('Movement target must be inside the court')
  if (!Number.isFinite(deltaTimeSeconds) || deltaTimeSeconds < 0) throw new RangeError('Movement delta time must be finite and non-negative')

  const player = spatial.players[playerIndex]!
  if (deltaTimeSeconds === 0) return spatial

  const dx = target.x - player.position.x
  const dy = target.y - player.position.y
  const distance = Math.hypot(dx, dy)
  const currentSpeed = Math.hypot(player.velocity.x, player.velocity.y)
  const velocityScale = currentSpeed > kinematics.maxSpeedMps ? kinematics.maxSpeedMps / currentSpeed : 1
  const currentVelocity = { x: player.velocity.x * velocityScale, y: player.velocity.y * velocityScale }

  if (distance <= MOVEMENT_EPSILON) {
    const stoppedVelocity = moveVectorToward(currentVelocity, { x: 0, y: 0 }, kinematics.brakingMps2 * deltaTimeSeconds)
    if (stoppedVelocity.x === player.velocity.x && stoppedVelocity.y === player.velocity.y) return spatial
    return updatePlayerAndBall(spatial, playerIndex, player, player.position, stoppedVelocity)
  }

  const direction = { x: dx / distance, y: dy / distance }
  const desiredSpeed = Math.min(kinematics.maxSpeedMps, Math.sqrt(2 * kinematics.brakingMps2 * distance))
  const desiredVelocity = { x: direction.x * desiredSpeed, y: direction.y * desiredSpeed }
  const movingAgainstTarget = currentVelocity.x * direction.x + currentVelocity.y * direction.y < 0
  const reducingSpeedTowardTarget = desiredSpeed < currentSpeed && currentVelocity.x * direction.x + currentVelocity.y * direction.y > 0
  const accelerationLimit = movingAgainstTarget || reducingSpeedTowardTarget ? kinematics.brakingMps2 : kinematics.accelerationMps2
  const velocity = moveVectorToward(currentVelocity, desiredVelocity, accelerationLimit * deltaTimeSeconds)
  const displacement = { x: (currentVelocity.x + velocity.x) * deltaTimeSeconds / 2, y: (currentVelocity.y + velocity.y) * deltaTimeSeconds / 2 }
  const nextPosition = { x: player.position.x + displacement.x, y: player.position.y + displacement.y }
  const passedTarget = (target.x - player.position.x) * (target.x - nextPosition.x) + (target.y - player.position.y) * (target.y - nextPosition.y) <= 0
  const reachedTarget = passedTarget || distanceBetween(nextPosition, target) <= MOVEMENT_EPSILON
  const boundedPosition = {
    x: Math.max(0, Math.min(spatial.court.lengthMeters, nextPosition.x)),
    y: Math.max(0, Math.min(spatial.court.widthMeters, nextPosition.y)),
  }
  const reachedCourtEdgeX = boundedPosition.x !== nextPosition.x
  const reachedCourtEdgeY = boundedPosition.y !== nextPosition.y
  const position = reachedTarget ? target : boundedPosition
  const nextVelocity = reachedTarget
    ? { x: 0, y: 0 }
    : { x: reachedCourtEdgeX ? 0 : velocity.x, y: reachedCourtEdgeY ? 0 : velocity.y }
  return updatePlayerAndBall(spatial, playerIndex, player, position, nextVelocity)
}

function moveVectorToward(current: CourtPosition, target: CourtPosition, maxDelta: number): CourtPosition {
  const dx = target.x - current.x
  const dy = target.y - current.y
  const distance = Math.hypot(dx, dy)
  if (distance <= maxDelta || distance === 0) return target
  const ratio = maxDelta / distance
  return { x: current.x + dx * ratio, y: current.y + dy * ratio }
}

function updatePlayerAndBall(spatial: SpatialState, playerIndex: number, player: SpatialPlayerState, position: CourtPosition, velocity: CourtPosition): SpatialState {
  const players = spatial.players.map((candidate, index) => index === playerIndex ? { ...candidate, position, velocity } : candidate)
  const ball = spatial.ball.kind === 'playerControlled' && spatial.ball.playerId === player.playerId
    ? { ...spatial.ball, position }
    : spatial.ball
  return { ...spatial, players, ball }
}

export function applySpatialSubstitution(
  spatial: SpatialState,
  teamId: TeamId,
  playerOutId: PlayerId,
  playerInId: PlayerId,
): SpatialState {
  const outgoingIndex = spatial.players.findIndex((player) => player.playerId === playerOutId && player.teamId === teamId)
  if (outgoingIndex < 0) throw new Error(`Spatial player ${playerOutId} is not active for team ${teamId}`)
  const outgoing = spatial.players[outgoingIndex]!
  const incoming: SpatialPlayerState = { playerId: playerInId, teamId, position: outgoing.position, velocity: { x: 0, y: 0 } }
  const ball = spatial.ball.kind === 'playerControlled' && spatial.ball.playerId === playerOutId
    ? { ...spatial.ball, playerId: playerInId, teamId, position: incoming.position }
    : spatial.ball
  return {
    ...spatial,
    players: spatial.players.map((player, index) => index === outgoingIndex ? incoming : player),
    ball,
  }
}

function lineupPositions(
  lineup: readonly PlayerId[],
  teamId: TeamId,
  homeTeamId: TeamId,
  awayTeamId: TeamId,
  profiles: MatchPlayerProfiles['home'],
  court: CourtGeometry,
): readonly SpatialPlayerState[] {
  const attacksRight = attackingBasketForTeam({ teamId, homeTeamId, awayTeamId, period: 1, court }) === court.baskets.right
  const assigned = new Set<(typeof SLOT_POSITIONS)[number]>()
  return lineup.map((playerId) => {
    const profile = profiles.find((candidate) => candidate.playerId === playerId)
    if (profile === undefined) throw new Error(`Active player ${playerId} has no profile for spatial bootstrap`)
    const preferred = profile.primaryPosition
    const slot = !assigned.has(preferred) ? preferred : SLOT_POSITIONS.find((position) => !assigned.has(position))!
    assigned.add(slot)
    const formation = RIGHT_ATTACKING_FORMATION[slot]
    const forwardX = formation.x * court.lengthMeters
    const leftX = court.lengthMeters - forwardX
    const y = formation.y * court.widthMeters
    return { playerId, teamId, position: { x: attacksRight ? forwardX : leftX, y }, velocity: { x: 0, y: 0 } }
  })
}
