import { distanceBetween } from '@/domain/court'
import type { MatchFrame } from './frame'

export interface MatchObservationReport {
  readonly frameCount: number
  readonly maxPlayerDisplacementPerTick: number | null
  readonly maxBallDisplacementPerTick: number | null
  readonly ballStateViolations: readonly string[]
  readonly playerContinuityViolations: readonly string[]
}

export const MAX_FOUNDATION_PLAYER_DISPLACEMENT_METERS_PER_TICK = 1
export const MAX_FOUNDATION_BALL_DISPLACEMENT_METERS_PER_TICK = 2

export function observeFrames(frames: readonly MatchFrame[]): MatchObservationReport {
  let maxPlayerDisplacementPerTick = 0
  let maxBallDisplacementPerTick: number | null = null
  const ballStateViolations: string[] = []
  const playerContinuityViolations: string[] = []
  for (let index = 1; index < frames.length; index += 1) {
    const before = frames[index - 1]!
    const after = frames[index]!
    const elapsed = after.t - before.t
    if (elapsed <= 0) {
      playerContinuityViolations.push(`Frame ${index} has non-positive time progression`)
      continue
    }
    for (const player of after.players) {
      const previous = before.players.find((candidate) => candidate.playerId === player.playerId)
      if (!previous) { playerContinuityViolations.push(`Player ${player.playerId} is missing from frame ${index - 1}`); continue }
      if (previous.teamId !== player.teamId) playerContinuityViolations.push(`Player ${player.playerId} changed teams between frames ${index - 1} and ${index}`)
      const displacement = distanceBetween(previous.position, player.position) / elapsed
      maxPlayerDisplacementPerTick = Math.max(maxPlayerDisplacementPerTick, displacement)
      if (displacement > MAX_FOUNDATION_PLAYER_DISPLACEMENT_METERS_PER_TICK) playerContinuityViolations.push(`Player ${player.playerId} moved ${displacement.toFixed(2)}m per tick at frame ${index}`)
    }
    for (const player of before.players) {
      if (!after.players.some((candidate) => candidate.playerId === player.playerId)) playerContinuityViolations.push(`Player ${player.playerId} is missing from frame ${index}`)
    }
    if (before.ball.kind !== after.ball.kind) ballStateViolations.push(`Ball state changed from ${before.ball.kind} to ${after.ball.kind} without a modeled transition at frame ${index}`)
    if (after.ball.kind === 'HELD') {
      const heldBall = after.ball
      const holder = after.players.find((player) => player.playerId === heldBall.playerId)
      if (!holder) ballStateViolations.push(`Held ball references missing player ${heldBall.playerId} at frame ${index}`)
      else if (distanceBetween(holder.position, heldBall.position) > 0.001) ballStateViolations.push(`Held ball is detached from player ${heldBall.playerId} at frame ${index}`)
    }
    const ballDistance = distanceBetween(before.ball.position, after.ball.position) / elapsed
    maxBallDisplacementPerTick = Math.max(maxBallDisplacementPerTick ?? 0, ballDistance)
    if (ballDistance > MAX_FOUNDATION_BALL_DISPLACEMENT_METERS_PER_TICK) ballStateViolations.push(`Ball moved ${ballDistance.toFixed(2)}m per tick at frame ${index}`)
  }
  return { frameCount: frames.length, maxPlayerDisplacementPerTick, maxBallDisplacementPerTick, ballStateViolations, playerContinuityViolations }
}
