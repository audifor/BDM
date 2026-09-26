import { distanceBetween, isInsideCourt } from '@/domain/court'
import { BALL_ACQUISITION_RADIUS_METERS, REBOUND_ACQUISITION_RADIUS_METERS } from './ball/BallState'
import { MOVEMENT_URGENCY_FACTORS } from './movement/MovementIntent'
import { attackingBasketForTeam } from './structure/FiveOutStructure'
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
  readonly defensiveAssignmentCompletenessPercentage: number | null
  readonly invalidDefensiveAssignmentCount: number
  readonly duplicateDefensiveAssignmentCount: number
  readonly unassignedAttackerCount: number
  readonly defenderWithoutResponsibilityCount: number
  readonly defensiveIntentWithoutDecision: number
  readonly defensiveDecisionWithoutResponsibility: number
  readonly defensiveResponsibilityWithoutAssignment: number
  readonly defensiveAssignmentChurn: number
  readonly defensiveAssignmentEstablishmentEvents: number
  readonly defensiveResponsibilityChanges: number
  readonly onBallSampleCount: number
  readonly onBallMedianDistanceMeters: number | null
  readonly onBallP95DistanceMeters: number | null
  readonly gapSampleCount: number
  readonly gapMedianManDistanceMeters: number | null
  readonly helpSampleCount: number
  readonly helpMedianManDistanceMeters: number | null
  readonly overallDefenderToAssignedManMeanMeters: number | null
  readonly onBallWrongSideViolations: number
  readonly defensiveTargetMirrorViolations: number
  readonly defensiveOutOfBoundsViolations: readonly string[]
  readonly reboundResponsibilityViolations: readonly string[]
  readonly transitionStructureViolations: readonly string[]
  readonly transitionDirectionViolations: number
  readonly invalidReboundWinnerCount: number
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
  const reboundResponsibilityViolations: string[] = []
  const transitionStructureViolations: string[] = []
  let illegalAcquisitions = 0
  let invalidReboundWinnerCount = 0
  let transitionDirectionViolations = 0
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
    if (frame.reboundState) {
      const roles = frame.reboundState.responsibilities
      if (frame.ball.kind !== 'REBOUNDABLE') reboundResponsibilityViolations.push(`Rebound responsibilities are stale at frame ${index}`)
      if (roles.length !== 10 || new Set(roles.map((item) => item.playerId)).size !== roles.length) reboundResponsibilityViolations.push(`Rebound responsibilities do not cover ten unique players at frame ${index}`)
      for (const role of roles) {
        const player = playersById.get(role.playerId)
        const intent = frame.movementIntents.find((item) => item.playerId === role.playerId)
        if (!player || player.teamId !== role.teamId || !intent || distanceBetween(intent.target, role.target) > 1e-6) reboundResponsibilityViolations.push(`Rebound role ${role.playerId} has no matching live movement intent at frame ${index}`)
        if (role.kind === 'BOX_OUT' && !role.boxOutTarget) reboundResponsibilityViolations.push(`Box-out ${role.playerId} has no box-out target at frame ${index}`)
        if (role.kind === 'CRASH_REBOUND' || role.kind === 'PURSUE_REBOUND') {
          if (frame.ball.kind === 'REBOUNDABLE' && distanceBetween(role.target, frame.reboundState.target) > 1e-6) reboundResponsibilityViolations.push(`Rebound pursuer ${role.playerId} is not targeting the landing point at frame ${index}`)
        }
      }
      if (frame.reboundState.shootingTeamId !== frame.possession?.teamId) reboundResponsibilityViolations.push(`Rebound shooting team differs from open possession at frame ${index}`)
    } else if (frame.players.some((player) => player.reboundResponsibility !== null)) {
      reboundResponsibilityViolations.push(`Rebound player role outlived its rebound state at frame ${index}`)
    }
    if (frame.transition) {
      const transition = frame.transition
      const roles = transition.roles
      if (!frame.possession || frame.possession.teamId !== transition.teamId || (frame.possession.phase !== 'ADVANCE' && frame.possession.phase !== 'ACTION')) transitionStructureViolations.push(`Transition does not match the active possession phase at frame ${index}`)
      if (roles.length !== 10 || new Set(roles.map((role) => role.playerId)).size !== roles.length) transitionStructureViolations.push(`Transition roles do not cover ten unique players at frame ${index}`)
      const offenseKinds = roles.filter((role) => role.teamId === transition.teamId).map((role) => role.kind).sort()
      const defenseKinds = roles.filter((role) => role.teamId !== transition.teamId).map((role) => role.kind).sort()
      if (offenseKinds.join('|') !== ['BALL_ADVANCE', 'LANE_LEFT', 'LANE_RIGHT', 'RIM_RUN', 'TRAIL'].sort().join('|')) transitionStructureViolations.push(`Transition offense roles are duplicated or incomplete at frame ${index}`)
      if (defenseKinds.join('|') !== ['MATCH', 'MATCH', 'MATCH', 'PROTECT_RIM', 'STOP_BALL'].sort().join('|')) transitionStructureViolations.push(`Transition defense roles are duplicated or incomplete at frame ${index}`)
      for (const role of roles) {
        const player = playersById.get(role.playerId)
        const intent = frame.movementIntents.find((item) => item.playerId === role.playerId)
        if (!player || player.teamId !== role.teamId || !intent || distanceBetween(intent.target, role.target) > 1e-6) transitionStructureViolations.push(`Transition role ${role.playerId} has no matching live movement intent at frame ${index}`)
        if (role.kind === 'BALL_ADVANCE' && player) {
          const basket = attackingBasketForTeam(transition.teamId, frame.homeTeamId, frame.period, frame.court)
          const direction = basket.x >= frame.court.lengthMeters / 2 ? 1 : -1
          if ((role.target.x - player.position.x) * direction < -0.2) transitionDirectionViolations += 1
        }
      }
      if (frame.ball.kind === 'HELD' && frame.ball.ownerTeamId !== transition.teamId) transitionStructureViolations.push(`Transition ball owner differs from transition offense at frame ${index}`)
    } else if (frame.players.some((player) => player.transitionRole !== null)) {
      transitionStructureViolations.push(`Transition player role outlived its transition state at frame ${index}`)
    }
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
    if (index === frames.length - 1) for (const event of frame.events) {
      const acquisitionLimit = event.type === 'reboundSecured' ? REBOUND_ACQUISITION_RADIUS_METERS : BALL_ACQUISITION_RADIUS_METERS
      if (event.acquisitionDistanceMeters !== undefined && event.acquisitionDistanceMeters > acquisitionLimit) illegalAcquisitions += 1
      if (event.type === 'reboundSecured' && (event.acquisitionDistanceMeters === undefined || event.acquisitionDistanceMeters > REBOUND_ACQUISITION_RADIUS_METERS)) invalidReboundWinnerCount += 1
    }

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
    const acquisitionLimit = acquisitionEvent?.type === 'reboundSecured' ? REBOUND_ACQUISITION_RADIUS_METERS : BALL_ACQUISITION_RADIUS_METERS
    const previousHeldOwner = before.ball.kind === 'HELD' ? before.players.find((player) => player.playerId === before.ball.ownerPlayerId) : undefined
    const currentHeldOwner = frame.ball.kind === 'HELD' ? frame.players.find((player) => player.playerId === frame.ball.ownerPlayerId) : undefined
    const linkedHeldMovement = previousHeldOwner && currentHeldOwner && before.ball.kind === 'HELD' && frame.ball.kind === 'HELD' && before.ball.ownerPlayerId === frame.ball.ownerPlayerId
      ? distanceBetween(previousHeldOwner.position, currentHeldOwner.position) + 0.001
      : null
    const modeledStep = linkedHeldMovement ?? modeledBallStep(before.ball, elapsed, frame.ball.kind !== before.ball.kind ? 1 : 0)
    if (before.ball.kind !== 'DEAD' && modeledStep < ballDistance - 0.001) {
      if (frame.ball.kind === 'HELD' && acquisitionEvent && acquisitionEvent.acquisitionDistanceMeters! <= acquisitionLimit) {
        // The final within-radius catch is the only allowed snap into the owner's position.
      } else {
        ballTeleports += 1
        ballStateViolations.push(`Ball moved ${ballDistance.toFixed(2)}m without a modeled path at frame ${index}`)
      }
    }
    if (frame.ball.kind === 'HELD' && before.ball.kind !== 'HELD' && (!acquisitionEvent || acquisitionEvent.acquisitionDistanceMeters! > acquisitionLimit)) {
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
  const defensive = observeDefense(frames)
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
    reboundResponsibilityViolations,
    transitionStructureViolations,
    transitionDirectionViolations,
    invalidReboundWinnerCount,
    ...defensive,
  }
}

type DefensiveObservation = Pick<MatchObservationReport,
  | 'defensiveAssignmentCompletenessPercentage'
  | 'invalidDefensiveAssignmentCount'
  | 'duplicateDefensiveAssignmentCount'
  | 'unassignedAttackerCount'
  | 'defenderWithoutResponsibilityCount'
  | 'defensiveIntentWithoutDecision'
  | 'defensiveDecisionWithoutResponsibility'
  | 'defensiveResponsibilityWithoutAssignment'
  | 'defensiveAssignmentChurn'
  | 'defensiveAssignmentEstablishmentEvents'
  | 'defensiveResponsibilityChanges'
  | 'onBallSampleCount'
  | 'onBallMedianDistanceMeters'
  | 'onBallP95DistanceMeters'
  | 'gapSampleCount'
  | 'gapMedianManDistanceMeters'
  | 'helpSampleCount'
  | 'helpMedianManDistanceMeters'
  | 'overallDefenderToAssignedManMeanMeters'
  | 'onBallWrongSideViolations'
  | 'defensiveTargetMirrorViolations'
  | 'defensiveOutOfBoundsViolations'
>

function observeDefense(frames: readonly MatchFrame[]): DefensiveObservation {
  let validAssignmentFrames = 0
  let assignmentFrames = 0
  let invalidDefensiveAssignmentCount = 0
  let duplicateDefensiveAssignmentCount = 0
  let unassignedAttackerCount = 0
  let defenderWithoutResponsibilityCount = 0
  let defensiveIntentWithoutDecision = 0
  let defensiveDecisionWithoutResponsibility = 0
  let defensiveResponsibilityWithoutAssignment = 0
  let defensiveAssignmentChurn = 0
  let onBallWrongSideViolations = 0
  let defensiveTargetMirrorViolations = 0
  const defensiveOutOfBoundsViolations: string[] = []
  const onBallDistances: number[] = []
  const gapDistances: number[] = []
  const helpDistances: number[] = []
  const allManDistances: number[] = []
  const settledTickByPossession = new Map<string, number>()
  let defensiveAssignmentEstablishmentEvents = 0
  let defensiveResponsibilityChanges = 0

  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index]!
    if (index === frames.length - 1) {
      defensiveAssignmentEstablishmentEvents = frame.events.filter((event) => event.type === 'defensiveAssignmentsEstablished').length
      defensiveResponsibilityChanges = frame.events.filter((event) => event.type === 'defensiveResponsibilityChanged').length
    }
    const structure = frame.defensiveStructure
    if (!structure) continue
    assignmentFrames += 1
    const defenders = frame.players.filter((player) => player.teamId === structure.teamId)
    const attackers = frame.players.filter((player) => player.teamId !== structure.teamId)
    const defenderIds = new Set(structure.assignments.map((item) => item.defenderPlayerId))
    const attackerIds = new Set(structure.assignments.map((item) => item.attackerPlayerId))
    const duplicateCount = structure.assignments.length - defenderIds.size + structure.assignments.length - attackerIds.size
    duplicateDefensiveAssignmentCount += duplicateCount
    let frameValid = structure.scheme === 'MAN'
      && structure.assignments.length === 5
      && defenders.length === 5
      && attackers.length === 5
      && duplicateCount === 0
    for (const assignment of structure.assignments) {
      const defender = frame.players.find((player) => player.playerId === assignment.defenderPlayerId)
      const attacker = frame.players.find((player) => player.playerId === assignment.attackerPlayerId)
      if (!defender || defender.teamId !== structure.teamId || !attacker || attacker.teamId === structure.teamId || assignment.teamId !== structure.teamId) {
        invalidDefensiveAssignmentCount += 1
        frameValid = false
      }
      if (defender && !isInsideCourt(defender.position, frame.court)) defensiveOutOfBoundsViolations.push(`Defender ${defender.playerId} is outside court at frame ${index}`)
      const intent = frame.movementIntents.find((item) => item.playerId === assignment.defenderPlayerId && item.provenance.owner === 'defensiveStructure')
      if (intent && !isInsideCourt(intent.target, frame.court)) defensiveOutOfBoundsViolations.push(`Defender ${assignment.defenderPlayerId} has an out-of-court target at frame ${index}`)
    }
    for (const attacker of attackers) if (!attackerIds.has(attacker.playerId)) {
      unassignedAttackerCount += 1
      frameValid = false
    }
    if (frameValid) validAssignmentFrames += 1

    const liveDefense = frame.possession !== null && frame.possession.phase !== 'INBOUND' && frame.ball.kind !== 'DEAD' && frame.ball.kind !== 'INBOUND'
    const stableSetup = liveDefense && frame.possession?.phase === 'SETUP' && frame.ball.kind === 'HELD'
    const stableKey = frame.possession?.id
    let stableSetupReached = false
    if (stableSetup && stableKey) {
      const firstSetupTick = settledTickByPossession.get(stableKey) ?? frame.t
      settledTickByPossession.set(stableKey, firstSetupTick)
      stableSetupReached = frame.t - firstSetupTick >= STRUCTURE_SETTLING_TICKS
    }
    const assignmentByDefender = new Map(structure.assignments.map((item) => [item.defenderPlayerId, item]))
    for (const defender of defenders) {
      const assignment = assignmentByDefender.get(defender.playerId)
      const responsibility = frame.responsibilities.find((item) => item.playerId === defender.playerId && item.owner === 'defensiveStructure')
      const decision = frame.decisions.find((item) => item.playerId === defender.playerId && item.owner === 'defensiveStructure')
      const intent = frame.movementIntents.find((item) => item.playerId === defender.playerId && item.provenance.owner === 'defensiveStructure')
      if (liveDefense && !responsibility) defenderWithoutResponsibilityCount += 1
      if (responsibility && !assignment) defensiveResponsibilityWithoutAssignment += 1
      if (intent && (!decision || intent.provenance.decisionId !== decision.id || intent.provenance.responsibilityId !== responsibility?.id)) defensiveIntentWithoutDecision += 1
      if (decision && (!responsibility || decision.responsibilityId !== responsibility.id)) defensiveDecisionWithoutResponsibility += 1
      if (assignment && responsibility) {
        const attacker = frame.players.find((player) => player.playerId === assignment.attackerPlayerId)
        if (!attacker) continue
        const manDistance = distanceBetween(defender.position, attacker.position)
        if (stableSetupReached) {
          allManDistances.push(manDistance)
          if (responsibility.kind === 'ON_BALL') onBallDistances.push(manDistance)
          if (responsibility.kind === 'GAP') gapDistances.push(manDistance)
          if (responsibility.kind === 'HELP') helpDistances.push(manDistance)
          if (responsibility.kind === 'ON_BALL') {
            const transitionedRecently = frame.t - responsibility.startedT < 8
            const toBasket = { x: structure.defendedBasket.x - attacker.position.x, y: structure.defendedBasket.y - attacker.position.y }
            const defenderFromMan = { x: defender.position.x - attacker.position.x, y: defender.position.y - attacker.position.y }
            if (!transitionedRecently && toBasket.x * defenderFromMan.x + toBasket.y * defenderFromMan.y < -0.15) onBallWrongSideViolations += 1
          }
        }
      }
    }
    const defenseResponsibilities = frame.responsibilities.filter((item) => item.owner === 'defensiveStructure')
    const defenseDecisions = frame.decisions.filter((item) => item.owner === 'defensiveStructure')
    for (const decision of defenseDecisions) if (!defenseResponsibilities.some((item) => item.playerId === decision.playerId && item.id === decision.responsibilityId)) defensiveDecisionWithoutResponsibility += 1

    if (index > 0) {
      const before = frames[index - 1]!
      const oldStructure = before.defensiveStructure
      if (oldStructure && before.possession?.id === frame.possession?.id && oldStructure.teamId === structure.teamId) {
        for (const assignment of oldStructure.assignments) {
          if (structure.assignments.find((item) => item.defenderPlayerId === assignment.defenderPlayerId)?.attackerPlayerId !== assignment.attackerPlayerId) defensiveAssignmentChurn += 1
        }
        const offense = frame.offensiveStructure
        const oldOffense = before.offensiveStructure
        if (offense && oldOffense) for (const assignment of structure.assignments) {
          const priorAssignment = oldStructure.assignments.find((item) => item.defenderPlayerId === assignment.defenderPlayerId)
          const defender = frame.players.find((item) => item.playerId === assignment.defenderPlayerId)
          const priorDefender = before.players.find((item) => item.playerId === assignment.defenderPlayerId)
          const attacker = frame.players.find((item) => item.playerId === assignment.attackerPlayerId)
          const priorAttacker = before.players.find((item) => item.playerId === assignment.attackerPlayerId)
          const intent = frame.movementIntents.find((item) => item.playerId === assignment.defenderPlayerId)
          const priorIntent = before.movementIntents.find((item) => item.playerId === assignment.defenderPlayerId)
          const slot = offense.assignments.find((item) => item.playerId === assignment.attackerPlayerId)?.slot
          const oldSlot = oldOffense.assignments.find((item) => item.playerId === assignment.attackerPlayerId)?.slot
          const target = offense.slots.find((item) => item.slot === slot)?.position
          const oldTarget = oldOffense.slots.find((item) => item.slot === oldSlot)?.position
          if (priorAssignment?.attackerPlayerId === assignment.attackerPlayerId && defender && priorDefender && attacker && priorAttacker && intent && priorIntent && target && oldTarget
            && distanceBetween(attacker.position, priorAttacker.position) <= 0.01
            && distanceBetween(frame.ball.position, before.ball.position) <= 0.01
            && distanceBetween(target, oldTarget) >= 2
            && distanceBetween(intent.target, priorIntent.target) > 0.05) defensiveTargetMirrorViolations += 1
        }
      }
    }
  }

  return {
    defensiveAssignmentCompletenessPercentage: assignmentFrames === 0 ? null : 100 * validAssignmentFrames / assignmentFrames,
    invalidDefensiveAssignmentCount,
    duplicateDefensiveAssignmentCount,
    unassignedAttackerCount,
    defenderWithoutResponsibilityCount,
    defensiveIntentWithoutDecision,
    defensiveDecisionWithoutResponsibility,
    defensiveResponsibilityWithoutAssignment,
    defensiveAssignmentChurn,
    defensiveAssignmentEstablishmentEvents,
    defensiveResponsibilityChanges,
    onBallSampleCount: onBallDistances.length,
    onBallMedianDistanceMeters: median(onBallDistances),
    onBallP95DistanceMeters: percentile(onBallDistances, 0.95),
    gapSampleCount: gapDistances.length,
    gapMedianManDistanceMeters: median(gapDistances),
    helpSampleCount: helpDistances.length,
    helpMedianManDistanceMeters: median(helpDistances),
    overallDefenderToAssignedManMeanMeters: allManDistances.length === 0 ? null : allManDistances.reduce((sum, distance) => sum + distance, 0) / allManDistances.length,
    onBallWrongSideViolations,
    defensiveTargetMirrorViolations,
    defensiveOutOfBoundsViolations,
  }
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!
}

function percentile(values: readonly number[], percentileValue: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * percentileValue) - 1)]!
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
