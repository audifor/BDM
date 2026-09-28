import { distanceBetween, type CourtGeometry, type CourtPosition } from '@/domain/court'
import type { MatchNextPlayerProfile } from '../setup'
import type { MatchPlayerState, MatchState } from '../state'
import { MOVEMENT_URGENCY_FACTORS, type MovementIntent } from './MovementIntent'

export const MOVEMENT_DT_SECONDS = 0.1
export const TARGET_ARRIVAL_TOLERANCE_METERS = 0.15
export const TARGET_ARRIVAL_SPEED_MPS = 0.15
export const MIN_PLAYER_SEPARATION_METERS = 0.6
const SEPARATION_STEERING_MPS = 0.35

export interface KinematicsResult {
  readonly position: CourtPosition
  readonly velocity: CourtPosition
  readonly facing: CourtPosition
}

export function integrateMatchPlayers(state: MatchState): readonly MatchPlayerState[] {
  if (state.movementIntents.length === 0) return state.players
  const intents = new Map(state.movementIntents.map((intent) => [intent.playerId, intent]))
  const activePositions = state.players.filter((player) => player.active).map(({ playerId, position }) => ({ playerId, position }))
  return state.players.map((player) => {
    const intent = intents.get(player.playerId)
    if (!intent) return player
    const others = activePositions.filter((other) => other.playerId !== player.playerId).map((other) => other.position)
    const basket = state.offensiveStructure?.attackingBasket ?? state.defensiveStructure?.defendedBasket ?? state.court.baskets.left
    const result = stepPlayerKinematics(player, player.kinematics, intent, state.ball.position, basket, others, state.court)
    return { ...player, position: result.position, velocity: result.velocity, facing: result.facing }
  })
}

export function stepPlayerKinematics(
  player: MatchPlayerState,
  profile: MatchNextPlayerProfile['kinematics'],
  intent: MovementIntent | undefined,
  ballPosition: CourtPosition,
  attackingBasket: CourtPosition,
  otherPositions: readonly CourtPosition[],
  court: CourtGeometry,
): KinematicsResult {
  if (!intent) return { position: player.position, velocity: player.velocity, facing: player.facing }

  const dx = intent.target.x - player.position.x
  const dy = intent.target.y - player.position.y
  const distance = Math.hypot(dx, dy)
  const speed = Math.hypot(player.velocity.x, player.velocity.y)
  const braking = Math.max(0.01, profile.brakingMps2)
  const maxSpeed = Math.max(0, profile.maxSpeedMps) * MOVEMENT_URGENCY_FACTORS[intent.urgency]
  const remaining = Math.max(0, distance - TARGET_ARRIVAL_TOLERANCE_METERS)
  const brakingSpeed = distance <= TARGET_ARRIVAL_TOLERANCE_METERS
    ? 0
    : Math.min(maxSpeed, Math.sqrt(2 * braking * remaining))
  const headingAlignment = speed <= 1e-6 || distance <= 1e-6 ? 1
    : clamp(((player.velocity.x * dx + player.velocity.y * dy) / (speed * distance) + 1) * 0.5, 0, 1)
  const desiredSpeed = Math.min(brakingSpeed, maxSpeed * headingAlignment)
  let desiredVelocity = distance <= 1e-9
    ? { x: 0, y: 0 }
    : { x: dx / distance * desiredSpeed, y: dy / distance * desiredSpeed }

  const separation = separationSteering(player.playerId, player.position, otherPositions)
  desiredVelocity = {
    x: desiredVelocity.x + separation.x,
    y: desiredVelocity.y + separation.y,
  }
  const desiredMagnitude = Math.hypot(desiredVelocity.x, desiredVelocity.y)
  if (desiredMagnitude > maxSpeed && desiredMagnitude > 0) {
    desiredVelocity = { x: desiredVelocity.x / desiredMagnitude * maxSpeed, y: desiredVelocity.y / desiredMagnitude * maxSpeed }
  }

  const deltaVelocity = { x: desiredVelocity.x - player.velocity.x, y: desiredVelocity.y - player.velocity.y }
  const deltaMagnitude = Math.hypot(deltaVelocity.x, deltaVelocity.y)
  const maxDelta = (desiredSpeed < speed ? braking : Math.max(0.01, profile.accelerationMps2)) * MOVEMENT_DT_SECONDS
  const scale = deltaMagnitude > maxDelta && deltaMagnitude > 0 ? maxDelta / deltaMagnitude : 1
  let velocity = { x: player.velocity.x + deltaVelocity.x * scale, y: player.velocity.y + deltaVelocity.y * scale }
  let nextPosition = {
    x: player.position.x + (player.velocity.x + velocity.x) * 0.5 * MOVEMENT_DT_SECONDS,
    y: player.position.y + (player.velocity.y + velocity.y) * 0.5 * MOVEMENT_DT_SECONDS,
  }

  const nextDistance = distanceBetween(nextPosition, intent.target)
  if (nextDistance <= TARGET_ARRIVAL_TOLERANCE_METERS
    && Math.hypot(velocity.x, velocity.y) <= TARGET_ARRIVAL_SPEED_MPS
    && speed <= braking * MOVEMENT_DT_SECONDS + 1e-9) {
    nextPosition = { ...intent.target }
    velocity = { x: 0, y: 0 }
  }
  nextPosition = {
    x: clamp(nextPosition.x, 0, court.lengthMeters),
    y: clamp(nextPosition.y, 0, court.widthMeters),
  }

  const facing = resolveFacing(intent, player.position, velocity, ballPosition, attackingBasket, player.facing)
  return { position: nextPosition, velocity, facing }
}

function separationSteering(playerId: string, position: CourtPosition, others: readonly CourtPosition[]): CourtPosition {
  let x = 0
  let y = 0
  for (const other of others) {
    const dx = position.x - other.x
    const dy = position.y - other.y
    const distance = Math.hypot(dx, dy)
    if (distance >= MIN_PLAYER_SEPARATION_METERS) continue
    const amount = (MIN_PLAYER_SEPARATION_METERS - distance) / MIN_PLAYER_SEPARATION_METERS * SEPARATION_STEERING_MPS
    if (distance > 1e-6) {
      x += dx / distance * amount
      y += dy / distance * amount
    } else {
      const angle = deterministicAngle(playerId)
      x += Math.cos(angle) * amount
      y += Math.sin(angle) * amount
    }
  }
  const magnitude = Math.hypot(x, y)
  return magnitude > SEPARATION_STEERING_MPS
    ? { x: x / magnitude * SEPARATION_STEERING_MPS, y: y / magnitude * SEPARATION_STEERING_MPS }
    : { x, y }
}

function deterministicAngle(playerId: string): number {
  let hash = 2166136261
  for (let index = 0; index < playerId.length; index += 1) hash = Math.imul(hash ^ playerId.charCodeAt(index), 16777619)
  return ((hash >>> 0) % 360) * Math.PI / 180
}

function resolveFacing(intent: MovementIntent, position: CourtPosition, velocity: CourtPosition, ball: CourtPosition, basket: CourtPosition, fallback: CourtPosition): CourtPosition {
  let target: CourtPosition | undefined
  if (intent.facing.kind === 'BALL') target = ball
  else if (intent.facing.kind === 'BASKET') target = basket
  else if (intent.facing.kind === 'POINT') target = intent.facing.position
  else {
    const travel = Math.hypot(velocity.x, velocity.y)
    return travel > 1e-5 ? { x: velocity.x / travel, y: velocity.y / travel } : fallback
  }
  const dx = target.x - position.x
  const dy = target.y - position.y
  const length = Math.hypot(dx, dy)
  return length > 1e-6 ? { x: dx / length, y: dy / length } : fallback
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}
