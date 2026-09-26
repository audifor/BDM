import { distanceBetween } from '@/domain/court'
import { BALL_ACQUISITION_RADIUS_METERS } from './ball/BallState'
import type { MatchFrame, MatchFrameBall } from './frame'

export interface MatchObservationReport {
  readonly frameCount: number
  readonly maxPlayerDisplacementPerTick: number | null
  readonly maxBallDisplacementPerTick: number | null
  readonly ballStateViolations: readonly string[]
  readonly playerContinuityViolations: readonly string[]
  readonly possessionViolations: readonly string[]
  readonly clockViolations: readonly string[]
  readonly ballTeleports: number
  readonly illegalAcquisitions: number
  readonly invalidPossessions: number
  readonly clockViolationCount: number
}

export const MAX_FOUNDATION_PLAYER_DISPLACEMENT_METERS_PER_TICK = 1

export function observeFrames(frames: readonly MatchFrame[]): MatchObservationReport {
  let maxPlayerDisplacementPerTick = 0
  let maxBallDisplacementPerTick: number | null = null
  const ballStateViolations: string[] = []
  const playerContinuityViolations: string[] = []
  const possessionViolations: string[] = []
  const clockViolations: string[] = []
  let illegalAcquisitions = 0
  let ballTeleports = 0
  let invalidPossessions = 0
  let clockViolationCount = 0

  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index]!
    const playersById = new Map(frame.players.map((player) => [player.playerId, player]))
    if (frame.ball.kind === 'HELD') {
      const owner = frame.ball.ownerPlayerId ? playersById.get(frame.ball.ownerPlayerId) : undefined
      if (!owner) ballStateViolations.push(`Held ball references a missing player at frame ${index}`)
      else {
        if (owner.teamId !== frame.ball.ownerTeamId) ballStateViolations.push(`Held ball owner team is inconsistent at frame ${index}`)
        if (distanceBetween(owner.position, frame.ball.position) > 0.001) ballStateViolations.push(`Held ball is detached from its owner at frame ${index}`)
      }
    }
    if (frame.possession && frame.ball.teamId !== undefined && frame.ball.teamId !== frame.possession.teamId) possessionViolations.push(`Live ball team differs from possession team at frame ${index}`)
    if (frame.ball.kind === 'DEAD' && frame.clock.gameRunning) clockViolations.push(`Game clock runs during DEAD at frame ${index}`)
    if (frame.ball.kind === 'DEAD' && frame.clock.shotRunning) clockViolations.push(`Shot clock runs during DEAD at frame ${index}`)
    if (frame.gameClock < 0 || frame.shotClock !== null && frame.shotClock < 0) clockViolations.push(`Negative clock at frame ${index}`)
    if (frame.clock.shotRunning && frame.shotClock === null) clockViolations.push(`Shot clock is marked running without a value at frame ${index}`)
    if (frame.possession && frame.possession.teamId !== frame.ball.ownerTeamId && frame.ball.kind === 'HELD') possessionViolations.push(`Held ball team differs from possession team at frame ${index}`)
    const seenPossessionIds = new Set<string>()
    for (const [possessionIndex, possession] of frame.possessionHistory.entries()) {
      if (seenPossessionIds.has(possession.id)) possessionViolations.push(`Duplicate possession ID ${possession.id} at frame ${index}`)
      seenPossessionIds.add(possession.id)
      if (possession.id !== `possession-${possessionIndex + 1}`) possessionViolations.push(`Possession ID sequence is not deterministic at frame ${index}`)
      if (possession.teamId !== frame.homeTeamId && possession.teamId !== frame.awayTeamId) possessionViolations.push(`Possession ${possession.id} belongs to a team outside the match at frame ${index}`)
      if (possession.id === frame.activePossessionId && possession.endReason !== undefined) possessionViolations.push(`Active possession ${possession.id} is already closed at frame ${index}`)
      if (possession.id !== frame.activePossessionId && possession.endReason === undefined) possessionViolations.push(`Closed possession ${possession.id} has no endReason at frame ${index}`)
    }
    if (frame.activePossessionId !== null && !seenPossessionIds.has(frame.activePossessionId)) possessionViolations.push(`Active possession ${frame.activePossessionId} is missing at frame ${index}`)
    const openPossessions = frame.possessionHistory.filter((item) => item.endReason === undefined)
    if (openPossessions.length > 1) possessionViolations.push(`More than one open possession at frame ${index}`)
    if (frame.activePossessionId === null && openPossessions.length !== 0) possessionViolations.push(`Open possession is not referenced at frame ${index}`)
    if (frame.activePossessionId !== null && (openPossessions.length !== 1 || openPossessions[0]?.id !== frame.activePossessionId)) possessionViolations.push(`Active possession reference is inconsistent at frame ${index}`)
    if (index === frames.length - 1) for (const event of frame.events) {
      if (event.acquisitionDistanceMeters !== undefined && event.acquisitionDistanceMeters > BALL_ACQUISITION_RADIUS_METERS) illegalAcquisitions += 1
    }

    if (index === 0) continue
    const before = frames[index - 1]!
    const elapsed = frame.t - before.t
    if (elapsed < 0) {
      playerContinuityViolations.push(`Frame ${index} moves simulation time backwards`)
      continue
    }
    for (const player of frame.players) {
      const previous = before.players.find((candidate) => candidate.playerId === player.playerId)
      if (!previous) { playerContinuityViolations.push(`Player ${player.playerId} is missing from frame ${index - 1}`); continue }
      if (previous.teamId !== player.teamId) playerContinuityViolations.push(`Player ${player.playerId} changed teams between frames ${index - 1} and ${index}`)
      const playerDistance = distanceBetween(previous.position, player.position)
      const displacement = elapsed === 0 ? (playerDistance === 0 ? 0 : Number.POSITIVE_INFINITY) : playerDistance / elapsed
      maxPlayerDisplacementPerTick = Math.max(maxPlayerDisplacementPerTick, displacement)
      if (displacement > MAX_FOUNDATION_PLAYER_DISPLACEMENT_METERS_PER_TICK) playerContinuityViolations.push(`Player ${player.playerId} moved ${displacement.toFixed(2)}m per tick at frame ${index}`)
    }
    for (const player of before.players) if (!frame.players.some((candidate) => candidate.playerId === player.playerId)) playerContinuityViolations.push(`Player ${player.playerId} is missing from frame ${index}`)

    const ballDistance = distanceBetween(before.ball.position, frame.ball.position)
    maxBallDisplacementPerTick = Math.max(maxBallDisplacementPerTick ?? 0, elapsed === 0 ? (ballDistance === 0 ? 0 : Number.POSITIVE_INFINITY) : ballDistance / elapsed)
    const acquisitionEvent = frame.events.find((event) => event.t === frame.t && event.acquisitionDistanceMeters !== undefined)
    if (before.ball.kind !== 'DEAD' && modeledBallStep(before.ball, elapsed, frame.ball.kind !== before.ball.kind ? 1 : 0) < ballDistance - 0.001) {
      if (frame.ball.kind === 'HELD' && acquisitionEvent && acquisitionEvent.acquisitionDistanceMeters! <= BALL_ACQUISITION_RADIUS_METERS) {
        // The final within-radius catch is the only allowed snap into the owner's static position.
      } else {
        ballTeleports += 1
        ballStateViolations.push(`Ball moved ${ballDistance.toFixed(2)}m without a modeled path at frame ${index}`)
      }
    }
    if (frame.ball.kind === 'HELD' && before.ball.kind !== 'HELD' && (!acquisitionEvent || acquisitionEvent.acquisitionDistanceMeters! > BALL_ACQUISITION_RADIUS_METERS)) {
      illegalAcquisitions += 1
      ballStateViolations.push(`Transition into HELD has no legal acquisition evidence at frame ${index}`)
    }

    if (before.clock.gameRunning && frame.period === before.period && frame.gameClock !== Math.max(0, before.gameClock - elapsed)) clockViolations.push(`Game clock did not decrement exactly while running at frame ${index}`)
    if (before.clock.shotRunning && before.shotClock !== null && frame.shotClock !== null && frame.possession?.id === before.possession?.id) {
      const reset = frame.events.some((event) => event.t === frame.t && event.type === 'possessionPhaseChanged' && event.phase === 'SETUP')
      if (!reset && frame.shotClock !== Math.max(0, before.shotClock - elapsed)) clockViolations.push(`Shot clock did not decrement exactly while running at frame ${index}`)
    }
  }

  const finalFrame = frames.at(-1)
  if (finalFrame) {
    const sequences = finalFrame.events.map((event) => event.sequence)
    for (let index = 1; index < sequences.length; index += 1) if (sequences[index]! <= sequences[index - 1]!) ballStateViolations.push(`Event sequence is not strictly increasing at event ${index}`)
    for (let index = 1; index < finalFrame.events.length; index += 1) if (finalFrame.events[index]!.t < finalFrame.events[index - 1]!.t) ballStateViolations.push(`Event time moved backwards at event ${index}`)
  }
  invalidPossessions = possessionViolations.length
  clockViolationCount = clockViolations.length
  return {
    frameCount: frames.length,
    maxPlayerDisplacementPerTick,
    maxBallDisplacementPerTick,
    ballStateViolations,
    playerContinuityViolations,
    possessionViolations,
    clockViolations,
    ballTeleports,
    illegalAcquisitions,
    invalidPossessions,
    clockViolationCount,
  }
}

function modeledBallStep(ball: MatchFrameBall, elapsedTicks: number, acquisitionAllowance: number): number {
  const allowance = acquisitionAllowance ? BALL_ACQUISITION_RADIUS_METERS : 0
  if (ball.flight) {
    const duration = Math.max(1, ball.flight.arrivalT - ball.flight.releaseT)
    return distanceBetween(ball.flight.from, ball.flight.target) / duration * elapsedTicks + allowance
  }
  if (ball.kind === 'LOOSE' && ball.velocity) return Math.hypot(ball.velocity.x, ball.velocity.y) * 0.1 * elapsedTicks + allowance
  return allowance
}
