import { distanceBetween, isInsideCourt } from '@/domain/court'
import { BALL_ACQUISITION_RADIUS_METERS } from './ball/BallState'
import { MOVEMENT_URGENCY_FACTORS } from './movement/MovementIntent'
import type { MatchFrame, MatchFrameBall } from './frame'

export interface MatchObservationReport {
  readonly frameCount: number
  readonly maxPlayerDisplacementPerTick: number | null
  readonly maxPlayerSpeed: number
  readonly maxAccelerationObserved: number
  readonly maxBrakingObserved: number
  readonly maxBallDisplacementPerTick: number | null
  readonly ballStateViolations: readonly string[]
  readonly playerContinuityViolations: readonly string[]
  readonly speedBoundViolations: readonly string[]
  readonly accelerationBrakingViolations: readonly string[]
  readonly outOfBoundsViolations: readonly string[]
  readonly movementWithoutIntentViolations: readonly string[]
  readonly intentWithoutResponsibilityViolations: readonly string[]
  readonly decisionWithoutResponsibilityViolations: readonly string[]
  readonly responsibilityCountViolations: readonly string[]
  readonly slotAssignmentViolations: readonly string[]
  readonly possessionViolations: readonly string[]
  readonly clockViolations: readonly string[]
  readonly ballTeleports: number
  readonly movementTeleports: number
  readonly illegalAcquisitions: number
  readonly invalidPossessions: number
  readonly clockViolationCount: number
  readonly minimumOffensiveSpacing: number | null
  readonly spacingViolationTicks: number
  readonly spacingSampleTicks: number
  readonly settledSpacingPercentage: number | null
  readonly maximumContinuousDistanceFromTargetSeconds: number
  readonly longTargetDistanceViolations: readonly string[]
  readonly slotChurn: number
}

export const MAX_FOUNDATION_PLAYER_DISPLACEMENT_METERS_PER_TICK = 1
const SPEED_TOLERANCE_MPS = 0.2
const ACCELERATION_TOLERANCE_MPS2 = 0.2
const POSITION_TOLERANCE_METERS = 0.16
const STRUCTURE_SETTLING_TICKS = 50

export function observeFrames(frames: readonly MatchFrame[]): MatchObservationReport {
  let maxPlayerDisplacementPerTick = 0
  let maxPlayerSpeed = 0
  let maxAccelerationObserved = 0
  let maxBrakingObserved = 0
  let maxBallDisplacementPerTick: number | null = null
  const ballStateViolations: string[] = []
  const playerContinuityViolations: string[] = []
  const speedBoundViolations: string[] = []
  const accelerationBrakingViolations: string[] = []
  const outOfBoundsViolations: string[] = []
  const movementWithoutIntentViolations: string[] = []
  const intentWithoutResponsibilityViolations: string[] = []
  const decisionWithoutResponsibilityViolations: string[] = []
  const responsibilityCountViolations: string[] = []
  const slotAssignmentViolations: string[] = []
  const possessionViolations: string[] = []
  const clockViolations: string[] = []
  const longTargetDistanceViolations: string[] = []
  let illegalAcquisitions = 0
  let ballTeleports = 0
  let movementTeleports = 0
  let invalidPossessions = 0
  let clockViolationCount = 0
  let minimumOffensiveSpacing: number | null = null
  let spacingViolationTicks = 0
  let spacingSampleTicks = 0
  let maximumContinuousDistanceFromTargetSeconds = 0
  let slotChurn = 0
  let previousReassignmentCount = 0
  const farFromTargetTicks = new Map<string, number>()

  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index]!
    const playersById = new Map(frame.players.map((player) => [player.playerId, player]))
    for (const player of frame.players) {
      if (!isInsideCourt(player.position, frame.court)) outOfBoundsViolations.push(`Player ${player.playerId} is outside court at frame ${index}`)
      if (frame.movementIntents.some((item) => item.playerId === player.playerId) && !frame.responsibilities.some((item) => item.playerId === player.playerId)) intentWithoutResponsibilityViolations.push(`Player ${player.playerId} has an intent without responsibility at frame ${index}`)
      if (frame.decisions.some((item) => item.playerId === player.playerId) && !frame.responsibilities.some((item) => item.playerId === player.playerId)) decisionWithoutResponsibilityViolations.push(`Player ${player.playerId} has a decision without responsibility at frame ${index}`)
      if (player.intent && (!player.decision || player.intent.provenance.decisionId !== player.decision.id || player.intent.provenance.responsibilityId !== player.responsibility?.id)) {
        intentWithoutResponsibilityViolations.push(`Player ${player.playerId} has invalid intent provenance at frame ${index}`)
      }
      if (player.decision && player.decision.responsibilityId !== player.responsibility?.id) decisionWithoutResponsibilityViolations.push(`Player ${player.playerId} decision references another responsibility at frame ${index}`)
      if (player.intent && !isInsideCourt(player.intent.target, frame.court)) outOfBoundsViolations.push(`Player ${player.playerId} has an out-of-court target at frame ${index}`)
    }
    for (const decision of frame.decisions) if (!frame.responsibilities.some((item) => item.id === decision.responsibilityId && item.playerId === decision.playerId)) decisionWithoutResponsibilityViolations.push(`Decision ${decision.id} has no matching responsibility at frame ${index}`)
    for (const intent of frame.movementIntents) {
      if (!isInsideCourt(intent.target, frame.court)) outOfBoundsViolations.push(`Player ${intent.playerId} has an out-of-court canonical target at frame ${index}`)
      const responsibility = frame.responsibilities.find((item) => item.id === intent.provenance.responsibilityId && item.playerId === intent.playerId)
      const decision = frame.decisions.find((item) => item.id === intent.provenance.decisionId && item.playerId === intent.playerId)
      if (!responsibility || !decision || decision.responsibilityId !== responsibility.id || intent.provenance.owner !== responsibility.owner) intentWithoutResponsibilityViolations.push(`Intent ${intent.playerId} has invalid provenance at frame ${index}`)
    }

    const liveOffense = frame.possession !== null
      && frame.possession.phase !== 'INBOUND'
      && frame.ball.kind !== 'DEAD'
      && frame.ball.kind !== 'INBOUND'
    if (liveOffense) {
      const activeOffense = frame.players.filter((player) => player.teamId === frame.possession!.teamId)
      for (const player of activeOffense) {
        const responsibilityCount = frame.responsibilities.filter((candidate) => candidate.playerId === player.playerId).length
        if (responsibilityCount !== 1) responsibilityCountViolations.push(`Player ${player.playerId} has ${responsibilityCount} base responsibilities at frame ${index}`)
        if (!player.intent) movementWithoutIntentViolations.push(`Offensive player ${player.playerId} has no movement intent at frame ${index}`)
      }
    }

    const structure = frame.offensiveStructure
    if (structure) {
      if (structure.reassignmentCount >= previousReassignmentCount) slotChurn += structure.reassignmentCount - previousReassignmentCount
      previousReassignmentCount = structure.reassignmentCount
      const assignments = structure.assignments
      const ids = new Set(assignments.map((item) => item.playerId))
      const slots = new Set(assignments.map((item) => item.slot))
      const ballCount = assignments.filter((item) => item.slot === 'BALL').length
      const space = assignments.filter((item) => item.slot !== 'BALL')
      if (assignments.length !== 5 || ids.size !== 5 || slots.size !== 5 || ballCount !== 1 || space.length !== 4) slotAssignmentViolations.push(`Invalid 5OUT assignment cardinality at frame ${index}`)
      if (new Set(space.map((item) => item.slot)).size !== 4 || space.some((item) => !playersById.has(item.playerId))) slotAssignmentViolations.push(`Invalid 5OUT SPACE assignments at frame ${index}`)
      const offenseIds = frame.players.filter((player) => player.teamId === structure.teamId).map((player) => player.playerId)
      if (offenseIds.length !== 5 || offenseIds.some((playerId) => !ids.has(playerId)) || assignments.some((item) => !offenseIds.includes(item.playerId))) slotAssignmentViolations.push(`5OUT assignments do not match its offensive lineup at frame ${index}`)
      for (const target of structure.slots) if (!isInsideCourt(target.position, frame.court)) slotAssignmentViolations.push(`5OUT target ${target.slot} is outside court at frame ${index}`)
      const settledAt = Math.max(structure.lastReassignmentT, structure.setupStartedT ?? structure.lastReassignmentT)
      if (frame.possession?.phase === 'SETUP' && frame.ball.kind === 'HELD' && frame.t - settledAt >= STRUCTURE_SETTLING_TICKS) {
        const offense = frame.players.filter((player) => player.teamId === structure.teamId)
        const minSpacing = minimumPairwiseDistance(offense)
        if (minSpacing !== null) {
          minimumOffensiveSpacing = minimumOffensiveSpacing === null ? minSpacing : Math.min(minimumOffensiveSpacing, minSpacing)
          spacingSampleTicks += 1
          if (minSpacing < 3) spacingViolationTicks += 1
        }
      }
    } else previousReassignmentCount = 0

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
    if (index === frames.length - 1) for (const event of frame.events) if (event.acquisitionDistanceMeters !== undefined && event.acquisitionDistanceMeters > BALL_ACQUISITION_RADIUS_METERS) illegalAcquisitions += 1

    if (index === 0) continue
    const before = frames[index - 1]!
    const elapsed = frame.t - before.t
    if (elapsed < 0) {
      playerContinuityViolations.push(`Frame ${index} moves simulation time backwards`)
      continue
    }
    if (elapsed === 0) {
      for (const player of frame.players) {
        const previous = before.players.find((candidate) => candidate.playerId === player.playerId)
        if (previous && distanceBetween(previous.position, player.position) > 1e-6) playerContinuityViolations.push(`Player ${player.playerId} moved without simulation time at frame ${index}`)
      }
    }
    const elapsedSeconds = elapsed * 0.1
    for (const player of frame.players) {
      const previous = before.players.find((candidate) => candidate.playerId === player.playerId)
      if (!previous) { playerContinuityViolations.push(`Player ${player.playerId} is missing from frame ${index - 1}`); continue }
      if (previous.teamId !== player.teamId) playerContinuityViolations.push(`Player ${player.playerId} changed teams between frames ${index - 1} and ${index}`)
      const playerDistance = distanceBetween(previous.position, player.position)
      const displacement = elapsed === 0 ? (playerDistance === 0 ? 0 : Number.POSITIVE_INFINITY) : playerDistance / elapsed
      maxPlayerDisplacementPerTick = Math.max(maxPlayerDisplacementPerTick, displacement)
      const averageSpeed = elapsedSeconds > 0 ? playerDistance / elapsedSeconds : 0
      const speed = Math.hypot(player.velocity.x, player.velocity.y)
      maxPlayerSpeed = Math.max(maxPlayerSpeed, speed, averageSpeed)
      if (playerDistance > 0.001 && !player.intent) movementWithoutIntentViolations.push(`Player ${player.playerId} moved without an intent at frame ${index}`)
      const allowedDistance = player.kinematics.maxSpeedMps * elapsedSeconds + POSITION_TOLERANCE_METERS
      if (playerDistance > allowedDistance) {
        movementTeleports += 1
        playerContinuityViolations.push(`Player ${player.playerId} moved ${playerDistance.toFixed(2)}m beyond physical reach at frame ${index}`)
      }
      if (player.intent && speed > player.kinematics.maxSpeedMps * MOVEMENT_URGENCY_FACTORS[player.intent.urgency] + SPEED_TOLERANCE_MPS) speedBoundViolations.push(`Player ${player.playerId} exceeded urgency speed at frame ${index}`)
      if (elapsedSeconds > 0) {
        const beforeSpeed = Math.hypot(previous.velocity.x, previous.velocity.y)
        const speedChange = speed - beforeSpeed
        const acceleration = Math.max(0, speedChange / elapsedSeconds)
        const braking = Math.max(0, -speedChange / elapsedSeconds)
        maxAccelerationObserved = Math.max(maxAccelerationObserved, acceleration)
        maxBrakingObserved = Math.max(maxBrakingObserved, braking)
        if (acceleration > player.kinematics.accelerationMps2 + ACCELERATION_TOLERANCE_MPS2) accelerationBrakingViolations.push(`Player ${player.playerId} exceeded acceleration bound at frame ${index}`)
        if (braking > player.kinematics.brakingMps2 + ACCELERATION_TOLERANCE_MPS2) accelerationBrakingViolations.push(`Player ${player.playerId} exceeded braking bound at frame ${index}`)
      }

      const stableSetup = frame.possession?.phase === 'SETUP' && frame.ball.kind === 'HELD'
      const distanceFromTarget = stableSetup && player.intent ? distanceBetween(player.position, player.intent.target) : 0
      if (stableSetup && player.intent && distanceFromTarget > 6) {
        const ticks = (farFromTargetTicks.get(String(player.playerId)) ?? 0) + elapsed
        farFromTargetTicks.set(String(player.playerId), ticks)
        maximumContinuousDistanceFromTargetSeconds = Math.max(maximumContinuousDistanceFromTargetSeconds, ticks * 0.1)
        if (ticks > 30 && !longTargetDistanceViolations.some((message) => message.includes(String(player.playerId)))) longTargetDistanceViolations.push(`Player ${player.playerId} stayed over 6m from target for more than 3 seconds`)
      } else farFromTargetTicks.set(String(player.playerId), 0)
    }
    for (const player of before.players) if (!frame.players.some((candidate) => candidate.playerId === player.playerId)) playerContinuityViolations.push(`Player ${player.playerId} is missing from frame ${index}`)

    const ballDistance = distanceBetween(before.ball.position, frame.ball.position)
    maxBallDisplacementPerTick = Math.max(maxBallDisplacementPerTick ?? 0, elapsed === 0 ? (ballDistance === 0 ? 0 : Number.POSITIVE_INFINITY) : ballDistance / elapsed)
    const acquisitionEvent = frame.events.find((event) => event.t === frame.t && event.acquisitionDistanceMeters !== undefined)
    const previousHeldOwner = before.ball.kind === 'HELD' ? before.players.find((player) => player.playerId === before.ball.ownerPlayerId) : undefined
    const currentHeldOwner = frame.ball.kind === 'HELD' ? frame.players.find((player) => player.playerId === frame.ball.ownerPlayerId) : undefined
    const linkedHeldMovement = previousHeldOwner && currentHeldOwner && before.ball.kind === 'HELD' && frame.ball.kind === 'HELD' && before.ball.ownerPlayerId === frame.ball.ownerPlayerId
      ? distanceBetween(previousHeldOwner.position, currentHeldOwner.position) + 0.001
      : null
    const modeledStep = linkedHeldMovement ?? modeledBallStep(before.ball, elapsed, frame.ball.kind !== before.ball.kind ? 1 : 0)
    if (before.ball.kind !== 'DEAD' && modeledStep < ballDistance - 0.001) {
      if (frame.ball.kind === 'HELD' && acquisitionEvent && acquisitionEvent.acquisitionDistanceMeters! <= BALL_ACQUISITION_RADIUS_METERS) {
        // The final within-radius catch is the only allowed snap into the owner's position.
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
    maxPlayerSpeed,
    maxAccelerationObserved,
    maxBrakingObserved,
    maxBallDisplacementPerTick,
    ballStateViolations,
    playerContinuityViolations,
    speedBoundViolations,
    accelerationBrakingViolations,
    outOfBoundsViolations,
    movementWithoutIntentViolations,
    intentWithoutResponsibilityViolations,
    decisionWithoutResponsibilityViolations,
    responsibilityCountViolations,
    slotAssignmentViolations,
    possessionViolations,
    clockViolations,
    ballTeleports,
    movementTeleports,
    illegalAcquisitions,
    invalidPossessions,
    clockViolationCount,
    minimumOffensiveSpacing,
    spacingViolationTicks,
    spacingSampleTicks,
    settledSpacingPercentage: spacingSampleTicks === 0 ? null : 100 * (spacingSampleTicks - spacingViolationTicks) / spacingSampleTicks,
    maximumContinuousDistanceFromTargetSeconds,
    longTargetDistanceViolations,
    slotChurn,
  }
}

function minimumPairwiseDistance(players: readonly MatchFrame['players'][number][]): number | null {
  let minimum: number | null = null
  for (let left = 0; left < players.length; left += 1) for (let right = left + 1; right < players.length; right += 1) {
    const distance = distanceBetween(players[left]!.position, players[right]!.position)
    minimum = minimum === null ? distance : Math.min(minimum, distance)
  }
  return minimum
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
