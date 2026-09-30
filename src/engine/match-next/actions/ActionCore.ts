import { distanceBetween, isBeyondThreePointLine, type CourtPosition } from '@/domain/court'
import { draw } from '../rng'
import { emitEvent } from '../events'
import { releasePass, releaseShot, type ReleasePassCommand } from '../ball/BallTransitions'
import { changePossessionPhase } from '../possession'
import { activePossession, type MatchPlayerState, type MatchState } from '../state'
import type { MovementIntent } from '../movement/MovementIntent'
import { attackingBasketForTeam } from '../structure/FiveOutStructure'
import { guardPosition } from '../defense/ManDefense'
import { closeoutReactionTicks } from '../defense/Closeout'
import { assessBlock, blockedBallVelocity } from '../defense/BlockModel'
import { assessDriveContact, assessShootingContact, CONTACT_DISTANCE_METERS, FOULED_SHOT_MAKE_FACTOR, updateDriveContactTrack, type ContactAssessment } from '../contact/ContactModel'
import { commitFoul } from '../rules/Fouls'
import { tuning } from '../tuning'
import { classifyShotCreation, shotZone } from '../stats/ShotEcology'
import { bestReceiver, driveTarget, estimateShotContest, evaluateShotOpportunity, floaterFactor, passQuality, pullUpFactor, putbackQuality, readDecision, readDriveStop, shotMakeProbability, shotValueAt } from './DecisionCore'
import { reconcileOffenseFlow } from './OffenseFlow'
import { createScreenState, planScreen, reconcileScreen, useScreen } from './ScreenCore'
import { reconcileOffBallMovement } from './OffBallMovement'
import type { MatchActionKind, MatchActionOutcome, MatchActionState, MatchDecision } from './ActionState'

const DRIVE_MIN_TICKS = 8
const DRIVE_MIN_PROGRESS_METERS = 2.4
const DRIVE_TARGET_RADIUS_METERS = 1.05
const DRIVE_TIMEOUT_TICKS = 36
const CLOSEOUT_ARRIVAL_METERS = 1.2
/** A defender this close to the passing line can deflect / intercept the pass. */
const LANE_STEAL_REACH_METERS = 1.3
const LANE_STEAL_MAX_CHANCE = 0.34
/** The driver has beaten his man when he has this much separation AND the defender is no longer ahead of him. */
const DRIVE_BEATEN_GAP_METERS = 1.2
const DRIVE_BEATEN_AHEAD_METERS = 0.2

/** Advances action lifecycles and autonomous decisions from MatchState only. */
export function reconcileActions(input: MatchState): MatchState {
  if (!input.autonomousActions) return input
  let state = resolveBallActions(input)
  state = startCloseoutAfterCatch(state)
  state = updateCloseouts(state)
  state = updateDrives(state)
  state = releaseReadyShots(state)
  state = reconcileOffenseFlow(state)
  state = reconcileScreen(state)
  // The screen may just have resolved its action: the flow must see it now so the handler gets his read time.
  state = reconcileOffenseFlow(state)
  state = reconcileOffBallMovement(state)
  if (!hasActiveOffensiveAction(state)) {
    const read = readDecision(state)
    if (read.decision) state = executeDecision(recordDecision(state, read.decision), read.decision)
    else if (read.holdUntilT !== undefined && state.offenseFlow !== null) state = { ...state, offenseFlow: { ...state.offenseFlow, readyAtT: read.holdUntilT } }
  }
  return applyPassReceiveIntents(applyStopIntents(applyDriveIntents(state)))
}

function resolveBallActions(state: MatchState): MatchState {
  let next = state
  for (const action of state.actions) {
    if (action.status !== 'ACTIVE') continue
    if (action.kind === 'PASS' || action.kind === 'KICK_OUT') {
      if (next.ball.kind === 'HELD' && next.ball.ownerPlayerId === action.targetPlayerId) {
        next = resolveAction(next, action.id, 'CAUGHT')
      } else if (next.ball.kind === 'LOOSE' || (next.ball.kind === 'HELD' && next.ball.ownerTeamId !== action.teamId)) {
        next = resolveAction(next, action.id, 'BAD_PASS')
      }
    } else if (action.kind === 'SHOOT' || action.kind === 'CATCH_AND_SHOOT') {
      const resolvedShot = next.events.some((event) => event.t >= action.startedT
        && (event.type === 'shotMade' || event.type === 'shotMissed')
        && event.shooterPlayerId === action.playerId)
      if (resolvedShot) {
        const made = next.events.some((event) => event.t >= action.startedT && event.type === 'shotMade' && event.shooterPlayerId === action.playerId)
        next = resolveAction(next, action.id, made ? 'MAKE' : 'MISS')
      }
    }
  }
  return next
}

function startCloseoutAfterCatch(state: MatchState): MatchState {
  if (state.ball.kind !== 'HELD') return state
  const ownerPlayerId = state.ball.ownerPlayerId
  const passAction = [...state.actions].reverse().find((action) => (action.kind === 'PASS' || action.kind === 'KICK_OUT')
    && action.status === 'COMPLETED' && action.outcome === 'CAUGHT' && action.targetPlayerId === ownerPlayerId)
  if (!passAction || state.actions.some((action) => action.kind === 'CLOSEOUT' && action.sourceActionId === passAction.id)) return state
  const defenderId = state.defensiveStructure?.onBallDefenderPlayerId
  const defender = defenderId ? state.players.find((player) => player.playerId === defenderId) : undefined
  if (!defender) return state
  const intent = state.movementIntents.find((item) => item.playerId === defender.playerId)
  const action: MatchActionState = {
    id: `match-action-${state.nextActionSequence}`,
    kind: 'CLOSEOUT',
    playerId: defender.playerId,
    teamId: defender.teamId,
    startedT: state.t,
    status: 'ACTIVE',
    phase: 'CLOSING_OUT',
    sourceActionId: passAction.id,
    targetPlayerId: ownerPlayerId,
    startPosition: { ...defender.position },
    ...(intent ? { target: { ...intent.target } } : {}),
    closestDefenderDistanceMeters: distanceBetween(defender.position, state.ball.position),
  }
  let next = { ...state, actions: [...state.actions, action], nextActionSequence: state.nextActionSequence + 1 }
  return emitEvent(next, 'actionStarted', { teamId: action.teamId, playerId: action.playerId, actionId: action.id, actionKind: action.kind })
}

function updateCloseouts(state: MatchState): MatchState {
  let next = state
  for (const action of state.actions) {
    if (action.kind !== 'CLOSEOUT' || action.status !== 'ACTIVE' || !action.targetPlayerId) continue
    const defender = next.players.find((player) => player.playerId === action.playerId)
    const shooter = next.players.find((player) => player.playerId === action.targetPlayerId)
    if (!defender || !shooter) continue
    const distance = distanceBetween(defender.position, shooter.position)
    const structuralIntent = next.movementIntents.find((intent) => intent.playerId === defender.playerId)
    const contest = contestAtDistance(distance, defender.defense.pointOfAttack)
    next = updateAction(next, action.id, {
      closestDefenderDistanceMeters: distance,
      contestScore: contest,
      ...(structuralIntent ? { target: { ...structuralIntent.target } } : {}),
    })
    if (distance <= CLOSEOUT_ARRIVAL_METERS || next.ball.kind === 'SHOT_IN_FLIGHT' || next.ball.kind === 'REBOUNDABLE' || next.ball.kind === 'DEAD') {
      next = resolveAction(next, action.id, contest >= 0.35 ? 'CONTESTED' : 'ARRIVED')
    }
  }
  return next
}

function updateDrives(state: MatchState): MatchState {
  let next = state
  for (const action of state.actions) {
    if (action.kind !== 'DRIVE' || action.status !== 'ACTIVE') continue
    if (next.ball.kind !== 'HELD' || next.ball.ownerPlayerId !== action.playerId) {
      next = resolveAction(next, action.id, 'CANCELLED')
      continue
    }
    const driver = next.players.find((player) => player.playerId === action.playerId)
    if (!driver || !action.startPosition || !action.target) continue
    const progress = distanceBetween(driver.position, action.startPosition)
    const targetDistance = distanceBetween(driver.position, action.target)
    const elapsed = next.t - action.startedT
    next = updateAction(next, action.id, { progressMeters: progress })
    // Track the closest approach to the on-ball defender; once the bodies have met and parted, the referee judges it once.
    const contactGuardId = next.defensiveStructure?.assignments.find((item) => item.attackerPlayerId === driver.playerId)?.defenderPlayerId
    const contactGuard = next.players.find((player) => player.playerId === contactGuardId && player.active)
    if (contactGuard !== undefined) {
      const track = updateDriveContactTrack(next.actions.find((item) => item.id === action.id)?.contact, driver, contactGuard, next.t)
      next = updateAction(next, action.id, { contact: track })
      const current = next.actions.find((item) => item.id === action.id)!
      if (current.contactAssessed !== true && track.minGap <= CONTACT_DISTANCE_METERS && next.t - track.atT >= 2) {
        const judged = judgeDriveContact(next, current, driver, contactGuard)
        next = judged.state
        if (judged.fouled) continue
      }
    }
    // BT4G/H: when the lane closes the driver may stop and shoot (pull-up) or float it; evaluated once per window, from the shot model.
    if (tuning().driveStopEnabled > 0 && elapsed >= DRIVE_STOP_MIN_TICKS && progress >= DRIVE_STOP_MIN_PROGRESS_METERS) {
      const basketNow = action.targetBasket ?? next.court.baskets.left
      const distanceToRim = distanceBetween(driver.position, basketNow)
      const window = distanceToRim <= DRIVE_STOP_NEAR_METERS ? 'NEAR' as const : distanceToRim <= DRIVE_STOP_FAR_METERS ? 'FAR' as const : undefined
      const checked = next.actions.find((item) => item.id === action.id)?.stopWindows ?? []
      if (window !== undefined && !checked.includes(window)) {
        next = updateAction(next, action.id, { stopWindows: [...checked, window] })
        const read = readDriveStop(next, driver, basketNow)
        if (read.kind !== 'CONTINUE') {
          next = beginStopShot(next, action, driver, read.kind, basketNow)
          continue
        }
        // He keeps going: whether he gets through is what the model just believed (his edge over the men in the lane), and the
        // game draws it. A driver who loses that draw is contained: he is stopped where he is and has to read again.
        if (window === 'NEAR' && read.values.pFinish < 0.9 && read.values.continue >= read.values.pass) {
          const containDraw = draw(next.rng, 'outcome')
          next = { ...next, rng: containDraw.state }
          if (containDraw.value >= read.values.pFinish) {
            next = resolveAction(next, action.id, 'CONTAINED')
            next = setPossessionPhase(next, 'SETUP')
            continue
          }
        }
      }
    }
    const helpDecision = next.defensiveStructure?.helpDecision
    const helperId = helpDecision?.status === 'TRIGGERED' && helpDecision.sourceActionId === action.id
      ? helpDecision.helperPlayerId : undefined
    // The drive only becomes an ADVANTAGE when the handler has really beaten his man: help has to come because the
    // on-ball defender is no longer in front of him, not merely because the ball is near the paint.
    const guardId = next.defensiveStructure?.assignments.find((item) => item.attackerPlayerId === driver.playerId)?.defenderPlayerId
    const onBallDefender = next.players.find((player) => player.playerId === guardId)
    const beatAndHelped = elapsed >= DRIVE_MIN_TICKS && progress >= DRIVE_MIN_PROGRESS_METERS && helperId && driverBeatDefender(driver, onBallDefender, action.target)
    let choice = next.actions.find((item) => item.id === action.id)?.advantageChoice
    if (beatAndHelped && choice === undefined && action.targetBasket !== undefined) {
      // Help has come: keep going to the rim, or kick it to the man the help left? The shot model decides (once).
      const read = readDriveStop(next, driver, action.targetBasket)
      choice = read.values.continue >= read.values.pass ? 'FINISH' : 'KICK'
      next = updateAction(next, action.id, { advantageChoice: choice })
    }
    if (beatAndHelped && choice !== 'FINISH') {
      next = updateAction(next, action.id, { helpDefenderPlayerId: helperId })
      next = resolveAction(next, action.id, 'ADVANTAGE')
      next = setPossessionPhase(next, 'SETUP')
    } else if (elapsed >= DRIVE_MIN_TICKS && targetDistance <= DRIVE_TARGET_RADIUS_METERS) {
      const onBallId = next.defensiveStructure?.onBallDefenderPlayerId
      const onBall = next.players.find((player) => player.playerId === onBallId)
      const outcome: MatchActionOutcome = onBall && distanceBetween(onBall.position, driver.position) <= 1.4
        && Math.max(onBall.defense.interior, onBall.defense.pointOfAttack) - onBall.fatigue * 0.05
          > (driver.offense.rimAttack + driver.offense.creation) / 2 - driver.fatigue * 0.06
        ? 'CONTAINED' : 'FINISH'
      next = resolveAction(next, action.id, outcome)
      next = setPossessionPhase(next, 'SETUP')
    } else if (elapsed >= DRIVE_TIMEOUT_TICKS) {
      next = resolveAction(next, action.id, 'CONTAINED')
      next = setPossessionPhase(next, 'SETUP')
    }
  }
  return next
}

const DRIVE_STOP_MIN_TICKS = 3
/** How fast the remembered value of a team's shots follows the shots it takes (about the last 16). */
const SHOT_VALUE_MEMORY_RATE = 0.06
const DRIVE_STOP_MIN_PROGRESS_METERS = 1.2
/** Decision windows of a drive: when the driver is inside these distances of the rim (first time only). */
const DRIVE_STOP_FAR_METERS = 7.4
const DRIVE_STOP_NEAR_METERS = 3.9
const STOP_GATHER_TICKS = { PULL_UP: 3, FLOATER: 2 } as const

/**
 * The driver stops where he is: the drive ends (STOPPED) and the shot starts right there. He brakes for the gather (his intent is
 * to stand where he stands), so the shot is taken from the place the lane closed, not from a slot he would otherwise run back to.
 */
function beginStopShot(state: MatchState, drive: MatchActionState, driver: MatchPlayerState, kind: 'PULL_UP' | 'FLOATER', basket: CourtPosition): MatchState {
  let next = resolveAction(state, drive.id, 'STOPPED')
  next = setPossessionPhase(next, 'SETUP')
  const action: MatchActionState = {
    id: `match-action-${next.nextActionSequence}`, kind: 'SHOOT', playerId: driver.playerId, teamId: driver.teamId, startedT: next.t, status: 'ACTIVE',
    ...(drive.decisionId === undefined ? {} : { decisionId: drive.decisionId }), phase: 'GATHER', releaseAtT: next.t + STOP_GATHER_TICKS[kind], targetBasket: { ...basket }, shotStop: kind,
    target: { ...driver.position },
  }
  next = startAction(next, action)
  return setPossessionPhase(next, 'ACTION')
}

/** True when the on-ball defender no longer cuts off the line from the driver to the rim. */
function driverBeatDefender(driver: MatchPlayerState, defender: MatchPlayerState | undefined, rim: CourtPosition): boolean {
  if (defender === undefined) return true
  const gap = distanceBetween(defender.position, driver.position)
  const toRimX = rim.x - driver.position.x
  const toRimY = rim.y - driver.position.y
  const toRim = Math.hypot(toRimX, toRimY)
  if (toRim < 1e-6) return true
  const ahead = ((defender.position.x - driver.position.x) * toRimX + (defender.position.y - driver.position.y) * toRimY) / toRim
  return gap >= DRIVE_BEATEN_GAP_METERS && ahead < DRIVE_BEATEN_AHEAD_METERS
}

/** The referee judges the contact of a drive once: a charge, a blocking foul, a reach, or nothing at all. */
function judgeDriveContact(state: MatchState, action: MatchActionState, driver: MatchPlayerState, guard: MatchPlayerState): { readonly state: MatchState; readonly fouled: boolean } {
  let next = updateAction(state, action.id, { contactAssessed: true })
  const assessment = assessDriveContact(action.contact, driver, guard)
  next = emitContact(next, assessment, driver.playerId, guard.playerId)
  if (assessment.foulType === null || assessment.offenderId === null || assessment.victimId === null) return { state: next, fouled: false }
  const roll = draw(next.rng, 'outcome')
  next = { ...next, rng: roll.state }
  if (roll.value >= assessment.callProbability) return { state: next, fouled: false }
  // A called foul always has its contact on record (a light touch can still be whistled).
  if (assessment.severity < 0.12) next = emitContact(next, assessment, driver.playerId, guard.playerId, true)
  const possession = activePossession(next)
  const offender = next.players.find((player) => player.playerId === assessment.offenderId)
  const outcome = commitFoul(next, { offenderId: assessment.offenderId, victimId: assessment.victimId, type: assessment.foulType, contact: assessment.kind, severity: assessment.severity, offensive: offender !== undefined && possession !== undefined && offender.teamId === possession.teamId })
  if (outcome.record === null) return { state: next, fouled: false }
  return { state: resolveAction(outcome.state, action.id, 'FOULED'), fouled: true }
}

function emitContact(state: MatchState, assessment: ContactAssessment, moverId: MatchPlayerState["playerId"], otherId: MatchPlayerState["playerId"], force = false): MatchState {
  if (assessment.severity < 0.12 && !force) return state
  return emitEvent(state, 'contact', { playerId: moverId, victimPlayerId: otherId, contactKind: assessment.kind, severity: Number(assessment.severity.toFixed(3)), ...(assessment.foulType === null ? {} : { foulType: assessment.foulType }) })
}

function isDriveFinish(state: MatchState, shooterId: string): boolean {
  return state.actions.some((action) => action.kind === 'DRIVE' && action.playerId === shooterId && action.status === 'COMPLETED' && action.resolvedT !== undefined && state.t - action.resolvedT <= 15)
}

function releaseReadyShots(state: MatchState): MatchState {
  let next = state
  for (const action of state.actions) {
    if ((action.kind !== 'SHOOT' && action.kind !== 'CATCH_AND_SHOOT') || action.status !== 'ACTIVE' || action.phase !== 'GATHER') continue
    if (!action.releaseAtT || next.t < action.releaseAtT || next.ball.kind !== 'HELD' || next.ball.ownerPlayerId !== action.playerId) continue
    const shooter = next.players.find((player) => player.playerId === action.playerId)
    if (!shooter) continue
    const possession = activePossession(next)
    if (!possession) continue
    const basket = attackingBasketForTeam(possession.teamId, next.homeTeamId, next.period, next.court)
    const points = shotValueAt(shooter.position, basket, next)
    const distance = distanceBetween(shooter.position, basket)
    const contest = estimateShotContest(next, shooter.playerId)
    const probability = shotMakeProbability(shooter.offense.shooting, distance, points, contest.score, shooter.fatigue, shooter.offense.rimAttack) * putbackQuality(next, shooter, shooter.position, basket) * stopFactor(action, shooter)
    // Everything that can happen to the shot in the act, from the geometry of the defenders around the shooter (BT3D/BT3H).
    const defenders = next.players.filter((player) => player.active && player.teamId !== shooter.teamId)
    const block = assessBlock(shooter, defenders, basket, distance)
    const shootingContact = assessShootingContact(shooter, defenders, basket, isDriveFinish(next, shooter.playerId))
    const zone = shotZone(shooter.position, basket, points, next.court)
    const creation = classifyShotCreation(next, shooter.playerId, shooter.position, basket, action.shotStop === undefined ? {} : { stopKind: action.shotStop })
    const blockRoll = draw(next.rng, 'outcome')
    const foulRoll = draw(blockRoll.state, 'outcome')
    const drawResult = draw(foulRoll.state, 'outcome')
    const bounceDistance = draw(drawResult.state, 'outcome')
    const bounceAngle = draw(bounceDistance.state, 'outcome')
    const swatAngle = draw(bounceAngle.state, 'outcome')
    const swatSpeed = draw(swatAngle.state, 'outcome')
    next = { ...next, rng: swatSpeed.state }
    if (block !== null && blockRoll.value < block.probability) {
      next = blockShot(next, action, shooter, block.blockerId, block.reachAdvantageCm, basket, points, probability, contest.score, swatAngle.value, swatSpeed.value, zone, creation)
      next = finishCloseoutsForShooter(next, shooter.playerId, contest.score)
      continue
    }
    const fouled = shootingContact.foulType !== null && shootingContact.offenderId !== null && foulRoll.value < shootingContact.callProbability
    next = emitContact(next, shootingContact, shootingContact.offenderId ?? shooter.playerId, shooter.playerId, fouled)
    // A shot with a hand in the face or a body into the shooter goes in less often.
    const goesIn = drawResult.value < (fouled ? probability * FOULED_SHOT_MAKE_FACTOR : probability)
    const arrivalT = next.t + 6
    const missTarget = reboundLandingTarget(shooter.position, basket, bounceDistance.value, bounceAngle.value, next.court)
    const plannedOutcome = goesIn
      ? { kind: 'MAKE' as const, points }
      : { kind: 'MISS' as const, reboundTarget: missTarget, reboundAvailableT: arrivalT + reboundHangTicks(distanceBetween(missTarget, basket)) }
    next = releaseShot(next, {
      targetBasket: basket,
      shotZone: zone,
      shotCreation: creation,
      travelTicks: 6,
      plannedOutcome,
      actionId: action.id,
      shotValue: points,
      shotProbability: probability,
      contestScore: contest.score,
      contestDefenderPlayerId: contest.defenderPlayerId ?? undefined,
    })
    // What the team's shots are worth: the running mean that sets what holding the ball is worth (BT4).
    const worth = evaluateShotOpportunity(next, shooter, shooter.position, basket, contest.score, action.shotStop === undefined ? {} : { makeScale: action.shotStop === 'PULL_UP' ? pullUpFactor(shooter) : floaterFactor(shooter) }).value
    next = { ...next, shotValueMemory: shooter.teamId === next.homeTeamId ? { ...next.shotValueMemory, home: next.shotValueMemory.home * (1 - SHOT_VALUE_MEMORY_RATE) + worth * SHOT_VALUE_MEMORY_RATE } : { ...next.shotValueMemory, away: next.shotValueMemory.away * (1 - SHOT_VALUE_MEMORY_RATE) + worth * SHOT_VALUE_MEMORY_RATE } }
    next = updateAction(next, action.id, {
      phase: 'SHOT_IN_FLIGHT',
      targetBasket: { ...basket },
      shotValue: points,
      shotProbability: probability,
      contestScore: contest.score,
      contestDefenderPlayerId: contest.defenderPlayerId ?? undefined,
    })
    if (fouled && shootingContact.offenderId !== null) {
      const outcome = commitFoul(next, { offenderId: shootingContact.offenderId, victimId: shooter.playerId, type: 'SHOOTING', contact: 'SHOOTING', severity: shootingContact.severity, offensive: false, shot: { points, goesIn, inFlight: true } })
      next = outcome.state
      if (outcome.record !== null && next.ball.kind === 'SHOT_IN_FLIGHT') next = { ...next, ball: { ...next.ball, foul: { foulId: outcome.record.id, freeThrows: outcome.record.freeThrows, points } } }
    }
    next = finishCloseoutsForShooter(next, shooter.playerId, contest.score)
  }
  return next
}

/** A shot rejected at the release point: the ball is swatted loose, the attempt counts, the offense may recover it. */
function blockShot(state: MatchState, action: MatchActionState, shooter: MatchPlayerState, blockerId: MatchPlayerState['playerId'], reachAdvantageCm: number, basket: CourtPosition, points: 2 | 3, probability: number, contestScore: number, angleDraw: number, speedDraw: number, zone: string, creation: string): MatchState {
  const blocker = state.players.find((player) => player.playerId === blockerId)
  const possession = activePossession(state)
  if (!blocker || !possession) return state
  let next = emitEvent(state, 'shotReleased', { possessionId: possession.id, teamId: shooter.teamId, shooterPlayerId: shooter.playerId, actionId: action.id, points, shotProbability: probability, contestScore, shotZone: zone, shotCreation: creation, shotDistanceMeters: Number(distanceBetween(shooter.position, basket).toFixed(2)) })
  const velocity = blockedBallVelocity(shooter, blocker, basket, reachAdvantageCm, angleDraw, speedDraw)
  next = {
    ...next,
    ball: { kind: 'LOOSE', position: { ...shooter.position }, heightMeters: 2.4, velocity, cause: 'block', previousPosition: { ...shooter.position }, lastTouchTeamId: blocker.teamId, lastTouchPlayerId: shooter.playerId },
  }
  next = changePossessionPhase(next, 'LIVE_REBOUND')
  next = emitEvent(next, 'shotBlocked', { possessionId: possession.id, teamId: blocker.teamId, playerId: blocker.playerId, shooterPlayerId: shooter.playerId, victimPlayerId: shooter.playerId, blockOutcome: 'BLOCKED_LOOSE', points })
  next = emitEvent(next, 'looseBallCreated', { possessionId: possession.id, teamId: blocker.teamId, playerId: blocker.playerId, ballReason: 'block' })
  return resolveAction(next, action.id, 'BLOCKED')
}

/**
 * Where a missed shot comes down. Short misses drop near the rim; the longer the shot, the harder it comes off the rim
 * and the farther it bounces (long rebounds), always on the shooter side of the basket, with lateral scatter.
 */
/**
 * How long the ball hangs before anyone can take it: it comes off the rim and falls to where it lands. A short rebound drops almost
 * at once; a long one (off a three, off the far side of the rim) takes noticeably longer. BT3 gave every miss the same 1.2 s.
 */
function reboundHangTicks(landingDistanceFromRim: number): number {
  return Math.round(clamp(8 + landingDistanceFromRim * 2.6, 9, 20))
}

function reboundLandingTarget(shooter: CourtPosition, basket: CourtPosition, distanceDraw: number, angleDraw: number, court: MatchState['court']): CourtPosition {
  const dx = shooter.x - basket.x
  const dy = shooter.y - basket.y
  const shotDistance = Math.hypot(dx, dy)
  if (shotDistance <= 1e-9) return { ...basket }
  const meanBounce = clamp(0.9 + shotDistance * 0.3, 1.2, 4.6)
  const reboundDistance = clamp(meanBounce * (0.65 + distanceDraw * 0.7), 0.8, 5.5)
  const angle = Math.atan2(dy, dx) + (angleDraw - 0.5) * 1.6
  return {
    x: clamp(basket.x + Math.cos(angle) * reboundDistance, 0.3, court.lengthMeters - 0.3),
    y: clamp(basket.y + Math.sin(angle) * reboundDistance, 0.3, court.widthMeters - 0.3),
  }
}

function finishCloseoutsForShooter(state: MatchState, shooterPlayerId: string, contestScore: number): MatchState {
  let next = state
  for (const action of state.actions) {
    if (action.kind === 'CLOSEOUT' && action.status === 'ACTIVE' && action.targetPlayerId === shooterPlayerId) {
      next = resolveAction(next, action.id, contestScore >= 0.35 ? 'CONTESTED' : 'ARRIVED')
    }
  }
  return next
}

function executeDecision(state: MatchState, decision: MatchDecision): MatchState {
  const actor = state.players.find((player) => player.playerId === decision.playerId)
  const possession = activePossession(state)
  if (!actor || !possession || state.ball.kind !== 'HELD' || state.ball.ownerPlayerId !== actor.playerId) return state
  const basket = attackingBasketForTeam(possession.teamId, state.homeTeamId, state.period, state.court)
  if (decision.kind === 'SCREEN') {
    const plan = planScreen(state, actor, basket)
    if (plan === null) return state
    const action = createAction(state, decision, 'SCREEN', { phase: 'SCREEN_APPROACH', targetPlayerId: plan.screenerId, target: { ...plan.location }, startPosition: { ...actor.position } })
    let next = setPossessionPhase(startAction(state, action), 'ACTION')
    next = { ...next, screen: createScreenState(next, plan, actor.playerId, action.id) }
    return next
  }
  const screenSet = state.screen?.phase === 'SET' && state.screen.handlerId === actor.playerId ? state.screen : null
  if (decision.kind === 'DRIVE') {
    const target = driveTarget(state, actor)
    const action = createAction(state, decision, 'DRIVE', {
      phase: 'DRIVING', startPosition: { ...actor.position }, target, targetBasket: { ...basket },
      ...(screenSet === null ? {} : { waypoint: { ...screenSet.waypoint }, screenId: screenSet.id }),
    })
    return useScreen(setPossessionPhase(startAction(state, action), 'ACTION'), actor.playerId)
  }
  if (decision.kind === 'SHOOT' || decision.kind === 'CATCH_AND_SHOOT') {
    const action = createAction(state, decision, decision.kind, {
      phase: 'GATHER', releaseAtT: state.t + (decision.kind === 'CATCH_AND_SHOOT' ? 4 : 3), targetBasket: { ...basket },
      ...(screenSet === null ? {} : { screenId: screenSet.id }),
    })
    return useScreen(setPossessionPhase(startAction(state, action), 'ACTION'), actor.playerId)
  }
  const receiver = decision.targetPlayerId
    ? state.players.find((player) => player.playerId === decision.targetPlayerId)
    : bestReceiver(state, actor, decision.kind === 'KICK_OUT')
  if (!receiver || receiver.teamId !== actor.teamId) return state
  const quality = passQuality(state, actor, receiver)
  const distance = distanceBetween(actor.position, receiver.position)
  const travelTicks = Math.max(2, Math.min(8, Math.ceil(distance / 10 * 10)))
  const predictionSeconds = travelTicks * 0.1
  const led: CourtPosition = {
    x: receiver.position.x + receiver.velocity.x * predictionSeconds,
    y: receiver.position.y + receiver.velocity.y * predictionSeconds,
  }
  // A pass can be thrown badly: worse passers and tighter lanes miss the receiver by more than he can reach.
  const errorDraw = draw(state.rng, 'outcome')
  const directionDraw = draw(errorDraw.state, 'outcome')
  state = { ...state, rng: directionDraw.state }
  const badPass = errorDraw.value < clamp(0.015 + (0.94 - quality) * 0.16, 0.01, 0.2)
  const angle = directionDraw.value * Math.PI * 2
  const miss = badPass ? 1.9 : 0
  // A defender in the passing lane may get a hand on it: the ball ends up where he is instead of where the receiver is.
  const contested = passLaneContest(state, actor, led, errorDraw.value, directionDraw.value)
  const target: CourtPosition = contested?.position ?? {
    x: clamp(led.x + Math.cos(angle) * miss, 0.25, state.court.lengthMeters - 0.25),
    y: clamp(led.y + Math.sin(angle) * miss, 0.25, state.court.widthMeters - 0.25),
  }
  const action = createAction(state, decision, decision.kind, {
    phase: 'PASS_IN_FLIGHT', targetPlayerId: receiver.playerId, target: { x: clamp(led.x, 0.25, state.court.lengthMeters - 0.25), y: clamp(led.y, 0.25, state.court.widthMeters - 0.25) }, passQuality: quality,
  })
  let next = setPossessionPhase(startAction(state, action), 'ACTION')
  const command: ReleasePassCommand = {
    receiverPlayerId: receiver.playerId,
    target,
    passKind: 'chest',
    travelTicks,
    catchRadiusMeters: 0.55 + quality * 0.45,
    actionId: action.id,
    passQuality: quality,
    ...(contested === undefined ? {} : { contest: { defenderId: contested.defender.playerId, kind: contested.kind } }),
  }
  next = releasePass(next, command)
  return useScreen(next, actor.playerId)
}

function recordDecision(state: MatchState, decision: MatchDecision): MatchState {
  const offenseFlow = state.offenseFlow === null ? null : { ...state.offenseFlow, reads: state.offenseFlow.reads + 1, resetPending: false }
  let next = { ...state, offenseFlow, currentDecision: decision, nextMatchDecisionSequence: state.nextMatchDecisionSequence + 1 }
  return emitEvent(next, 'decisionSelected', { teamId: decision.teamId, playerId: decision.playerId, decisionId: decision.id, decisionKind: decision.kind, ...(decision.utility === undefined ? {} : { utility: decision.utility }) })
}

function createAction(
  state: MatchState,
  decision: MatchDecision,
  kind: MatchActionKind,
  details: Partial<Omit<MatchActionState, 'id' | 'kind' | 'playerId' | 'teamId' | 'startedT' | 'status' | 'decisionId'>>,
): MatchActionState {
  return {
    id: `match-action-${state.nextActionSequence}`,
    kind,
    playerId: decision.playerId,
    teamId: decision.teamId,
    startedT: state.t,
    status: 'ACTIVE',
    decisionId: decision.id,
    ...details,
  }
}

function startAction(state: MatchState, action: MatchActionState): MatchState {
  const next = { ...state, actions: [...state.actions, action], nextActionSequence: state.nextActionSequence + 1 }
  return emitEvent(next, 'actionStarted', { teamId: action.teamId, playerId: action.playerId, actionId: action.id, actionKind: action.kind })
}

function resolveAction(state: MatchState, actionId: string, outcome: MatchActionOutcome): MatchState {
  const action = state.actions.find((candidate) => candidate.id === actionId)
  if (!action || action.status !== 'ACTIVE') return state
  const actions = state.actions.map((candidate) => candidate.id === actionId
    ? { ...candidate, status: outcome === 'CANCELLED' ? 'CANCELLED' as const : 'COMPLETED' as const, outcome, resolvedT: state.t }
    : candidate)
  const currentDecision = action.kind !== 'CLOSEOUT' && state.currentDecision?.id === action.decisionId ? null : state.currentDecision
  const next = { ...state, actions, currentDecision }
  return emitEvent(next, 'actionResolved', { teamId: action.teamId, playerId: action.playerId, actionId, actionKind: action.kind, actionOutcome: outcome, shotProbability: action.shotProbability, contestScore: action.contestScore })
}

function updateAction(state: MatchState, actionId: string, patch: Partial<MatchActionState>): MatchState {
  return {
    ...state,
    actions: state.actions.map((action) => action.id === actionId && action.status === 'ACTIVE' ? { ...action, ...patch } : action),
  }
}

function setPossessionPhase(state: MatchState, phase: 'SETUP' | 'ACTION'): MatchState {
  const possession = activePossession(state)
  if (!possession || possession.phase === phase) return state
  const possessions = state.possessions.map((item) => item.id === possession.id ? { ...item, phase } : item)
  return emitEvent({ ...state, possessions }, 'possessionPhaseChanged', { possessionId: possession.id, teamId: possession.teamId, phase })
}

function hasActiveOffensiveAction(state: MatchState): boolean {
  const teamId = activePossession(state)?.teamId
  return teamId !== undefined && state.actions.some((action) => action.status === 'ACTIVE' && action.teamId === teamId && action.kind !== 'CLOSEOUT')
}

/** A shot taken on the move is harder than a catch-and-shoot: his own ratings and his speed at the stop decide how much. */
function stopFactor(action: MatchActionState, shooter: MatchPlayerState): number {
  if (action.shotStop === undefined) return 1
  const speed = Math.hypot(shooter.velocity.x, shooter.velocity.y)
  const balance = 1 - Math.max(0, speed - 2) * 0.025
  return (action.shotStop === 'PULL_UP' ? pullUpFactor(shooter) : floaterFactor(shooter)) * balance
}

/** A shooter who stopped a drive stands where he stopped while he gathers. */
function applyStopIntents(state: MatchState): MatchState {
  let next = state
  for (const action of state.actions) {
    if (action.kind !== 'SHOOT' || action.status !== 'ACTIVE' || action.shotStop === undefined || action.decisionId === undefined) continue
    const player = next.players.find((candidate) => candidate.playerId === action.playerId)
    const responsibility = next.responsibilities.find((item) => item.playerId === action.playerId && item.owner !== 'defensiveStructure')
    if (!player || !responsibility) continue
    const intent: MovementIntent = {
      playerId: action.playerId, target: { ...player.position }, urgency: 'walk', facing: { kind: 'BASKET' },
      provenance: { responsibilityId: responsibility.id, decisionId: action.decisionId, owner: 'action' },
    }
    next = { ...next, movementIntents: [...next.movementIntents.filter((item) => item.playerId !== action.playerId), intent] }
  }
  return next
}

function applyDriveIntents(state: MatchState): MatchState {
  const activeDrive = state.actions.find((action) => action.kind === 'DRIVE' && action.status === 'ACTIVE')
  if (!activeDrive || !activeDrive.target || !activeDrive.decisionId) return state
  const responsibility = state.responsibilities.find((item) => item.playerId === activeDrive.playerId && item.owner !== 'defensiveStructure')
  if (!responsibility) return state
  // A drive off a screen first brushes past the screener's shoulder, then attacks the basket.
  const driver = state.players.find((player) => player.playerId === activeDrive.playerId)
  const viaWaypoint = activeDrive.waypoint !== undefined && driver !== undefined && distanceBetween(driver.position, activeDrive.waypoint) > 0.7
    && distanceBetween(driver.position, activeDrive.target) > distanceBetween(activeDrive.waypoint, activeDrive.target) + 0.3
  const intent: MovementIntent = {
    playerId: activeDrive.playerId,
    target: viaWaypoint ? { ...activeDrive.waypoint! } : { ...activeDrive.target },
    urgency: 'sprint',
    facing: { kind: 'BASKET' },
    provenance: { responsibilityId: responsibility.id, decisionId: activeDrive.decisionId, owner: 'action' },
  }
  return { ...state, movementIntents: [...state.movementIntents.filter((item) => item.playerId !== activeDrive.playerId), intent] }
}

/**
 * A defender standing in the passing lane may get a hand on the ball (closer to the line and better hands make it likelier).
 * Whether he takes it clean (interception) or only tips it (deflection) depends on his hands against the passer's accuracy.
 */
function passLaneContest(state: MatchState, passer: MatchPlayerState, receiverTarget: CourtPosition, draw1: number, draw2: number): { readonly position: CourtPosition; readonly defender: MatchPlayerState; readonly kind: 'INTERCEPTION' | 'DEFLECTION' } | undefined {
  let best: { defender: MatchPlayerState; distance: number; point: CourtPosition } | undefined
  const dx = receiverTarget.x - passer.position.x
  const dy = receiverTarget.y - passer.position.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared < 1) return undefined
  for (const defender of state.players) {
    if (!defender.active || defender.teamId === passer.teamId) continue
    const t = clamp(((defender.position.x - passer.position.x) * dx + (defender.position.y - passer.position.y) * dy) / lengthSquared, 0, 1)
    if (t < 0.15 || t > 0.9) continue
    const point = { x: passer.position.x + t * dx, y: passer.position.y + t * dy }
    const distance = distanceBetween(defender.position, point)
    if (distance <= LANE_STEAL_REACH_METERS && (best === undefined || distance < best.distance)) best = { defender, distance, point }
  }
  if (best === undefined) return undefined
  const chance = (1 - best.distance / LANE_STEAL_REACH_METERS) * LANE_STEAL_MAX_CHANCE * (0.6 + (best.defender.defense.steal ?? 50) / 125)
  if (draw1 * 4 >= chance) return undefined
  const interceptShare = clamp(0.4 + ((best.defender.defense.steal ?? 50) - passer.passing.accuracy) / 200, 0.15, 0.7)
  return { position: { ...best.defender.position }, defender: best.defender, kind: draw2 < interceptShare ? 'INTERCEPTION' : 'DEFLECTION' }
}

/** The intended receiver of a pass in flight goes to meet it instead of drifting to a slot while the ball is on its way. */
function applyPassReceiveIntents(state: MatchState): MatchState {
  if (state.ball.kind !== 'PASS_IN_FLIGHT' || state.ball.isInbound) return state
  const ball = state.ball
  const receiverId = ball.intendedReceiverPlayerId
  const responsibility = state.responsibilities.find((item) => item.playerId === receiverId && item.owner !== 'defensiveStructure')
  const action = state.actions.find((item) => item.status === 'ACTIVE' && (item.kind === 'PASS' || item.kind === 'KICK_OUT') && item.targetPlayerId === receiverId)
  if (!responsibility || !action?.decisionId || !action.target) return state
  const intent: MovementIntent = {
    playerId: receiverId,
    target: { ...action.target },
    urgency: 'run',
    facing: { kind: 'BALL' },
    provenance: { responsibilityId: responsibility.id, decisionId: action.decisionId, owner: 'action' },
  }
  let next: MatchState = { ...state, movementIntents: [...state.movementIntents.filter((item) => item.playerId !== receiverId), intent] }
  // The receiver's defender closes out while the ball is still in the air (his responsibility does not change until the
  // catch; only his movement does). Waiting for the catch gave every kick-out a free look.
  const defenderId = next.defensiveStructure?.assignments.find((item) => item.attackerPlayerId === receiverId)?.defenderPlayerId
  const defender = next.players.find((player) => player.playerId === defenderId)
  const defenderIntent = next.movementIntents.find((item) => item.playerId === defenderId)
  const basket = next.defensiveStructure?.defendedBasket
  if (defender !== undefined && defenderIntent !== undefined && basket !== undefined && defender.teamId !== ball.passerTeamId && state.t - ball.releaseT >= closeoutReactionTicks()) {
    const tactics = defender.teamId === next.homeTeamId ? next.tacticalPlans.home.defense : next.tacticalPlans.away.defense
    const target = guardPosition(action.target, action.target, basket, 'ON_BALL', next.court, tactics)
    next = { ...next, movementIntents: [...next.movementIntents.filter((item) => item.playerId !== defender.playerId), { ...defenderIntent, target, urgency: 'sprint' as const }] }
  }
  return next
}

function contestAtDistance(distanceMeters: number, pointOfAttack: number): number {
  return clamp((3.4 - distanceMeters) / 2.8, 0, 1) * (0.6 + clamp(pointOfAttack, 0, 100) / 250)
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}
