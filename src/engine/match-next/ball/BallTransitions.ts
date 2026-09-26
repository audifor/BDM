import type { CourtPosition } from '@/domain/court'
import { distanceBetween } from '@/domain/court'
import type { PlayerId, TeamId } from '@/domain/ids'
import { emitEvent } from '../events'
import { changePossessionPhase, endPossession, startPossession } from '../possession'
import { activePossession, type MatchState, type PossessionStartReason } from '../state'
import { advanceLooseBall, flightProgress, interpolatePosition, looseBallVelocity, passHeight, shotHeight } from './BallFlight'
import { BALL_ACQUISITION_RADIUS_METERS, HELD_BALL_HEIGHT_METERS, type BallPassKind, type BallState, type PlannedShotOutcome } from './BallState'

export type InboundStartReason = 'periodStart' | 'madeBasketInbound' | 'turnoverInbound' | 'shotClockViolation'

export interface ReleasePassCommand {
  readonly receiverPlayerId: PlayerId
  readonly target: CourtPosition
  readonly passKind: BallPassKind
  readonly travelTicks: number
}

export interface ReleaseShotCommand {
  readonly targetBasket: CourtPosition
  readonly travelTicks: number
  readonly plannedOutcome: PlannedShotOutcome
}

export function startInbound(state: MatchState, teamId: TeamId, inbounderPlayerId: PlayerId, reason: InboundStartReason): MatchState {
  if (state.isComplete) throw new Error('Cannot start an inbound after the match is complete')
  if (state.ball.kind !== 'DEAD') throw new Error(`Cannot start an inbound while the ball is ${state.ball.kind}`)
  const reasonMatchesDeadBall = reason === 'periodStart'
    ? state.ball.reason === 'foundation' || state.ball.reason === 'periodEnd'
    : reason === 'madeBasketInbound'
      ? state.ball.reason === 'madeBasket'
      : reason === 'shotClockViolation'
        ? state.ball.reason === 'shotClockViolation'
        : state.ball.reason === 'outOfBounds' || state.ball.reason === 'other'
  if (!reasonMatchesDeadBall) throw new Error(`Inbound reason ${reason} does not match DEAD(${state.ball.reason})`)
  const spot = state.ball.restartSpot ?? restartSpot(state, reason)
  if (state.ball.restartTeamId !== undefined && state.ball.restartTeamId !== teamId) throw new Error('Inbound team does not match the dead-ball restart team')
  const inbounder = activePlayer(state, inbounderPlayerId)
  if (inbounder.teamId !== teamId) throw new Error('Inbounder does not belong to the inbounding team')
  const distance = distanceBetween(inbounder.position, spot)
  if (distance > BALL_ACQUISITION_RADIUS_METERS) throw new Error(`Inbounder is ${distance.toFixed(2)}m from the restart spot`)

  const existing = activePossession(state)
  let next = state
  if (existing) {
    if (existing.teamId !== teamId) throw new Error('Open possession team does not match the inbounding team')
    next = changePossessionPhase(next, 'INBOUND')
  } else {
    next = startPossession(next, teamId, reason as PossessionStartReason, 'INBOUND', false)
  }
  next = { ...next, ball: { kind: 'INBOUND', teamId, inbounderPlayerId, spot, position: spot, heightMeters: HELD_BALL_HEIGHT_METERS, startedT: next.t, deadlineT: null }, clock: { gameRunning: false, shotRunning: false }, shotClockTenths: null }
  const possession = activePossession(next)
  return emitEvent(next, 'inboundStarted', { possessionId: possession?.id, teamId, playerId: inbounderPlayerId, phase: 'INBOUND', ...(existing ? {} : { startReason: reason }) })
}

export function releaseInbound(state: MatchState, receiverPlayerId: PlayerId, passKind: BallPassKind, travelTicks: number): MatchState {
  if (state.ball.kind !== 'INBOUND') throw new Error('Inbound release requires an INBOUND ball')
  const receiver = activePlayer(state, receiverPlayerId)
  if (receiver.teamId !== state.ball.teamId) throw new Error('Inbound receiver must be on the inbounding team')
  const ball = createPass(state, state.ball.inbounderPlayerId, receiverPlayerId, receiver.position, passKind, travelTicks, true, state.ball.position)
  let next: MatchState = { ...state, ball }
  const possession = activePossession(next)
  next = emitEvent(next, 'inboundReleased', { possessionId: possession?.id, teamId: state.ball.teamId, playerId: state.ball.inbounderPlayerId, receiverPlayerId })
  return emitEvent(next, 'passReleased', { possessionId: possession?.id, teamId: state.ball.teamId, passerPlayerId: state.ball.inbounderPlayerId, receiverPlayerId })
}

export function releasePass(state: MatchState, command: ReleasePassCommand): MatchState {
  if (state.ball.kind !== 'HELD') throw new Error('Pass release requires a HELD ball')
  const owner = activePlayer(state, state.ball.ownerPlayerId)
  const receiver = activePlayer(state, command.receiverPlayerId)
  const possession = activePossession(state)
  if (!possession || possession.teamId !== owner.teamId) throw new Error('Pass release requires an open possession for the ball owner team')
  if (receiver.teamId !== owner.teamId) throw new Error('Intended pass receiver must be on the passer team')
  validateCourtPosition(state, command.target, 'Pass target')
  const ball = createPass(state, owner.playerId, receiver.playerId, command.target, command.passKind, command.travelTicks, false)
  const next = { ...state, ball }
  return emitEvent(next, 'passReleased', { possessionId: possession.id, teamId: owner.teamId, passerPlayerId: owner.playerId, receiverPlayerId: receiver.playerId })
}

export function interceptPass(state: MatchState, defenderPlayerId: PlayerId): MatchState {
  if (state.ball.kind !== 'PASS_IN_FLIGHT') throw new Error('Interception requires a PASS_IN_FLIGHT ball')
  const defender = activePlayer(state, defenderPlayerId)
  if (defender.teamId === state.ball.passerTeamId) throw new Error('An interception must be made by a defender')
  const acquisitionDistanceMeters = distanceBetween(defender.position, state.ball.position)
  if (acquisitionDistanceMeters > BALL_ACQUISITION_RADIUS_METERS) throw new Error(`Defender is ${acquisitionDistanceMeters.toFixed(2)}m from the pass`)
  let next: MatchState = { ...state, ball: heldBall(defender.playerId, defender.teamId, defender.position) }
  const previousPossession = activePossession(next)
  next = emitEvent(next, 'passIntercepted', { possessionId: previousPossession?.id, teamId: defender.teamId, passerPlayerId: state.ball.passerPlayerId, receiverPlayerId: defender.playerId, playerId: defender.playerId, acquisitionDistanceMeters })
  next = endPossession(next, 'turnover')
  next = startPossession(next, defender.teamId, 'steal', 'ADVANCE', true)
  return next
}

export function releaseShot(state: MatchState, command: ReleaseShotCommand): MatchState {
  if (state.ball.kind !== 'HELD') throw new Error('Shot release requires a HELD ball')
  const owner = activePlayer(state, state.ball.ownerPlayerId)
  const possession = activePossession(state)
  if (!possession || possession.teamId !== owner.teamId) throw new Error('Shot release requires an open possession for the ball owner team')
  validateCourtPosition(state, command.targetBasket, 'Shot target')
  validateTravelTicks(command.travelTicks)
  const arrivalT = state.t + command.travelTicks
  if (command.plannedOutcome.kind === 'MISS') {
    validateCourtPosition(state, command.plannedOutcome.reboundTarget, 'Rebound target')
    if (!Number.isSafeInteger(command.plannedOutcome.reboundAvailableT) || command.plannedOutcome.reboundAvailableT <= arrivalT) throw new Error('Rebound availability must be after shot arrival')
  }
  const ball: BallState = {
    kind: 'SHOT_IN_FLIGHT', shooterPlayerId: owner.playerId, shooterTeamId: owner.teamId,
    from: state.ball.position, targetBasket: command.targetBasket, releaseT: state.t, arrivalT,
    position: state.ball.position, heightMeters: state.ball.heightMeters, previousPosition: state.ball.position,
    plannedOutcome: command.plannedOutcome,
  }
  let next: MatchState = { ...state, ball }
  next = changePossessionPhase(next, 'SHOT')
  return emitEvent(next, 'shotReleased', { possessionId: possession.id, teamId: owner.teamId, shooterPlayerId: owner.playerId })
}

export function secureRebound(state: MatchState, playerId: PlayerId): MatchState {
  if (state.ball.kind !== 'REBOUNDABLE') throw new Error('Rebound acquisition requires a REBOUNDABLE ball')
  if (state.t < state.ball.availableAtT) throw new Error('Rebound is not available yet')
  const player = activePlayer(state, playerId)
  const acquisitionDistanceMeters = distanceBetween(player.position, state.ball.position)
  if (acquisitionDistanceMeters > BALL_ACQUISITION_RADIUS_METERS) throw new Error(`Rebounder is ${acquisitionDistanceMeters.toFixed(2)}m from the ball`)
  const shootingTeamId = state.ball.shootingTeamId
  let next: MatchState = { ...state, ball: heldBall(player.playerId, player.teamId, player.position) }
  const oldPossession = activePossession(next)
  next = emitEvent(next, 'reboundSecured', { possessionId: oldPossession?.id, teamId: player.teamId, playerId, acquisitionDistanceMeters })
  if (player.teamId === shootingTeamId) {
    if (!oldPossession || oldPossession.teamId !== shootingTeamId) throw new Error('Offensive rebound does not match the open shooting possession')
    const possessions = next.possessions.map((item) => item.id === oldPossession.id ? { ...item, offensiveRebounds: item.offensiveRebounds + 1 } : item)
    const resetSeconds = next.clockRules.offensiveReboundShotClockSeconds
    next = { ...next, possessions, shotClockTenths: resetSeconds == null ? next.shotClockTenths : Math.round(resetSeconds * 10), clock: { ...next.clock, gameRunning: true, shotRunning: true } }
    next = changePossessionPhase(next, 'SETUP')
    return resetSeconds == null && next.shotClockTenths === 0 ? violateShotClock(next) : next
  }
  next = endPossession(next, 'defensiveRebound')
  return startPossession(next, player.teamId, 'defensiveRebound', 'ADVANCE', true)
}

export function recoverLooseBall(state: MatchState, playerId: PlayerId): MatchState {
  if (state.ball.kind !== 'LOOSE') throw new Error('Loose-ball recovery requires a LOOSE ball')
  const player = activePlayer(state, playerId)
  const acquisitionDistanceMeters = distanceBetween(player.position, state.ball.position)
  if (acquisitionDistanceMeters > BALL_ACQUISITION_RADIUS_METERS) throw new Error(`Recoverer is ${acquisitionDistanceMeters.toFixed(2)}m from the ball`)
  const oldPossession = activePossession(state)
  let next: MatchState = { ...state, ball: heldBall(player.playerId, player.teamId, player.position) }
  next = emitEvent(next, 'looseBallRecovered', { possessionId: oldPossession?.id, teamId: player.teamId, playerId, acquisitionDistanceMeters })
  if (oldPossession && oldPossession.teamId !== player.teamId) {
    next = endPossession(next, 'turnover')
    return startPossession(next, player.teamId, 'other', 'ADVANCE', true)
  }
  if (!oldPossession) return startPossession(next, player.teamId, 'other', 'ADVANCE', true)
  if (oldPossession.phase === 'INBOUND') {
    next = { ...next, shotClockTenths: next.clockRules.shotClockSeconds * 10, clock: { gameRunning: true, shotRunning: true } }
    next = markShotClockStarted(next)
  }
  return changePossessionPhase(next, 'ADVANCE')
}

export function putBallDead(state: MatchState, reason: 'outOfBounds' | 'other', restartTeamId?: TeamId): MatchState {
  if (state.ball.kind === 'DEAD' || state.ball.kind === 'INBOUND') throw new Error(`Cannot make the ball dead from ${state.ball.kind}`)
  const active = activePossession(state)
  const restartTeam = restartTeamId ?? active?.teamId
  if (restartTeam !== undefined && restartTeam !== state.homeTeamId && restartTeam !== state.awayTeamId) throw new Error('Restart team is not part of this match')
  let next: MatchState = {
    ...state,
    ball: {
      kind: 'DEAD', reason, position: state.ball.position, heightMeters: 0.08,
      ...(restartTeam === undefined ? {} : { restartTeamId: restartTeam, restartSpot: { x: state.court.lengthMeters / 2, y: state.court.widthMeters / 2 } }),
    },
    clock: { gameRunning: false, shotRunning: false },
    shotClockTenths: null,
  }
  if (active && restartTeam !== undefined && active.teamId !== restartTeam) next = endPossession(next, 'turnover')
  return emitEvent(next, 'ballDead', { teamId: restartTeam, ballReason: reason })
}

export function violateShotClock(state: MatchState): MatchState {
  const possession = activePossession(state)
  if (!possession || state.ball.kind === 'SHOT_IN_FLIGHT' || state.ball.kind === 'DEAD' || state.ball.kind === 'INBOUND') return state
  const restartTeamId = possession.teamId === state.homeTeamId ? state.awayTeamId : state.homeTeamId
  const position = state.ball.position
  let next: MatchState = {
    ...state,
    ball: { kind: 'DEAD', reason: 'shotClockViolation', position, heightMeters: 0.08, restartTeamId, restartSpot: { x: state.court.lengthMeters / 2, y: state.court.widthMeters / 2 } },
    clock: { gameRunning: false, shotRunning: false },
    shotClockTenths: 0,
  }
  next = emitEvent(next, 'shotClockViolation', { possessionId: possession.id, teamId: possession.teamId })
  next = endPossession(next, 'shotClock')
  next = { ...next, shotClockTenths: 0 }
  return emitEvent(next, 'ballDead', { teamId: restartTeamId, ballReason: 'shotClockViolation' })
}

export function advanceBallAtTick(state: MatchState): MatchState {
  const ball = state.ball
  if (ball.kind === 'PASS_IN_FLIGHT') {
    const progress = flightProgress(state.t, ball.releaseT, ball.arrivalT)
    const position = interpolatePosition(ball.from, ball.target, progress)
    const moved: MatchState = { ...state, ball: { ...ball, previousPosition: ball.position, position, heightMeters: passHeight(ball.passKind, progress) } }
    if (state.t < ball.arrivalT) return moved
    const receiver = findActivePlayer(moved, ball.intendedReceiverPlayerId)
    if (receiver && receiver.teamId === ball.passerTeamId) {
      const acquisitionDistanceMeters = distanceBetween(receiver.position, position)
      if (acquisitionDistanceMeters <= BALL_ACQUISITION_RADIUS_METERS) return receivePass(moved, receiver.playerId, receiver.teamId, acquisitionDistanceMeters, ball.isInbound)
    }
    const loose: BallState = { kind: 'LOOSE', position, heightMeters: Math.max(0.08, moved.ball.heightMeters), velocity: looseBallVelocity(ball.from, ball.target), cause: 'badPass', previousPosition: position }
    let next: MatchState = { ...moved, ball: loose }
    const possession = activePossession(next)
    next = emitEvent(next, 'passBecameLoose', { possessionId: possession?.id, teamId: ball.passerTeamId, passerPlayerId: ball.passerPlayerId, receiverPlayerId: ball.intendedReceiverPlayerId })
    return emitEvent(next, 'looseBallCreated', { possessionId: possession?.id, teamId: ball.passerTeamId, ballReason: 'badPass' })
  }
  if (ball.kind === 'SHOT_IN_FLIGHT') {
    const progress = flightProgress(state.t, ball.releaseT, ball.arrivalT)
    const position = interpolatePosition(ball.from, ball.targetBasket, progress)
    const moved: MatchState = { ...state, ball: { ...ball, previousPosition: ball.position, position, heightMeters: shotHeight(progress) } }
    if (state.t < ball.arrivalT) return moved
    if (ball.plannedOutcome.kind === 'MAKE') return resolveMadeShot(moved, ball.plannedOutcome.points)
    const rebound: BallState = {
      kind: 'REBOUNDABLE', shotByPlayerId: ball.shooterPlayerId, shootingTeamId: ball.shooterTeamId,
      position, heightMeters: 3.05, landingFrom: position, landingStartedT: state.t,
      landingTarget: ball.plannedOutcome.reboundTarget, availableAtT: ball.plannedOutcome.reboundAvailableT, previousPosition: position,
    }
    let next: MatchState = { ...moved, ball: rebound }
    next = changePossessionPhase(next, 'LIVE_REBOUND')
    next = emitEvent(next, 'shotMissed', { possessionId: activePossession(next)?.id, teamId: ball.shooterTeamId, shooterPlayerId: ball.shooterPlayerId })
    if (state.t >= rebound.availableAtT) return emitEvent(next, 'reboundBecameAvailable', { possessionId: activePossession(next)?.id, teamId: ball.shooterTeamId, shooterPlayerId: ball.shooterPlayerId })
    return next
  }
  if (ball.kind === 'REBOUNDABLE') {
    const progress = ball.availableAtT <= ball.landingStartedT ? 1 : Math.max(0, Math.min(1, (state.t - ball.landingStartedT) / (ball.availableAtT - ball.landingStartedT)))
    const position = interpolatePosition(ball.landingFrom, ball.landingTarget, progress)
    const next: MatchState = { ...state, ball: { ...ball, previousPosition: ball.position, position, heightMeters: 3.05 * (1 - progress) + 0.08 * progress } }
    if (state.t >= ball.availableAtT && state.t - 1 < ball.availableAtT) return emitEvent(next, 'reboundBecameAvailable', { possessionId: activePossession(next)?.id, teamId: ball.shootingTeamId, shooterPlayerId: ball.shotByPlayerId })
    return next
  }
  if (ball.kind === 'LOOSE') return { ...state, ball: advanceLooseBall(ball, state.court) }
  return state
}

function receivePass(state: MatchState, receiverPlayerId: PlayerId, receiverTeamId: TeamId, acquisitionDistanceMeters: number, isInbound: boolean): MatchState {
  const flight = state.ball
  if (flight.kind !== 'PASS_IN_FLIGHT') return state
  const held = heldBall(receiverPlayerId, receiverTeamId, activePlayer(state, receiverPlayerId).position)
  const possession = activePossession(state)
  let next: MatchState = { ...state, ball: held }
  next = emitEvent(next, 'passReceived', { possessionId: possession?.id, teamId: receiverTeamId, passerPlayerId: flight.passerPlayerId, receiverPlayerId, playerId: receiverPlayerId, acquisitionDistanceMeters })
  if (isInbound) {
    next = { ...next, clock: { gameRunning: true, shotRunning: true }, shotClockTenths: next.clockRules.shotClockSeconds * 10 }
    next = markShotClockStarted(next)
    return changePossessionPhase(next, 'ADVANCE')
  }
  return next
}

function resolveMadeShot(state: MatchState, points: 2 | 3): MatchState {
  const ball = state.ball
  if (ball.kind !== 'SHOT_IN_FLIGHT') return state
  const isHome = ball.shooterTeamId === state.homeTeamId
  const opponent = isHome ? state.awayTeamId : state.homeTeamId
  const restartSpot = { x: ball.targetBasket.x <= state.court.lengthMeters / 2 ? 0.5 : state.court.lengthMeters - 0.5, y: ball.targetBasket.y }
  let next: MatchState = {
    ...state,
    score: isHome ? { ...state.score, home: state.score.home + points } : { ...state.score, away: state.score.away + points },
    ball: { kind: 'DEAD', reason: 'madeBasket', position: ball.targetBasket, heightMeters: 0.08, restartTeamId: opponent, restartSpot },
    clock: { gameRunning: false, shotRunning: false },
    shotClockTenths: null,
  }
  next = emitEvent(next, 'shotMade', { possessionId: activePossession(next)?.id, teamId: ball.shooterTeamId, shooterPlayerId: ball.shooterPlayerId, points })
  next = endPossession(next, 'made')
  return emitEvent(next, 'ballDead', { teamId: opponent, ballReason: 'madeBasket' })
}

function createPass(state: MatchState, passerPlayerId: PlayerId, receiverPlayerId: PlayerId, target: CourtPosition, passKind: BallPassKind, travelTicks: number, isInbound: boolean, releasePosition?: CourtPosition) {
  validateTravelTicks(travelTicks)
  validateCourtPosition(state, target, 'Pass target')
  const passer = activePlayer(state, passerPlayerId)
  return {
    kind: 'PASS_IN_FLIGHT' as const,
    passerPlayerId,
    passerTeamId: passer.teamId,
    intendedReceiverPlayerId: receiverPlayerId,
    passKind,
    from: { ...(releasePosition ?? passer.position) },
    target: { ...target },
    releaseT: state.t,
    arrivalT: state.t + travelTicks,
    position: { ...(releasePosition ?? passer.position) },
    heightMeters: HELD_BALL_HEIGHT_METERS,
    previousPosition: { ...passer.position },
    isInbound,
  }
}

function heldBall(ownerPlayerId: PlayerId, ownerTeamId: TeamId, position: CourtPosition) {
  return { kind: 'HELD' as const, ownerPlayerId, ownerTeamId, position: { ...position }, heightMeters: HELD_BALL_HEIGHT_METERS, dribble: 'live' as const }
}

function restartSpot(state: MatchState, reason: InboundStartReason): CourtPosition {
  if (reason === 'periodStart') return { x: state.court.lengthMeters / 2, y: state.court.widthMeters / 2 }
  return { x: state.court.lengthMeters / 2, y: state.court.widthMeters / 2 }
}

function activePlayer(state: MatchState, playerId: PlayerId) {
  const player = findActivePlayer(state, playerId)
  if (!player || !player.active) throw new Error(`Player ${playerId} is not active`)
  return player
}

function findActivePlayer(state: MatchState, playerId: PlayerId) {
  return state.players.find((player) => player.playerId === playerId)
}

function validateTravelTicks(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Ball travelTicks must be a positive integer number of 0.1-second ticks')
}

function validateCourtPosition(state: MatchState, position: CourtPosition, label: string): void {
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y) || position.x < 0 || position.x > state.court.lengthMeters || position.y < 0 || position.y > state.court.widthMeters) throw new Error(`${label} must be inside the court`)
}

function markShotClockStarted(state: MatchState): MatchState {
  const active = activePossession(state)
  if (!active || active.shotClockStartedT !== undefined) return state
  return { ...state, possessions: state.possessions.map((item) => item.id === active.id ? { ...item, shotClockStartedT: state.t } : item) }
}
