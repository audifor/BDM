import type { CourtPosition } from '@/domain/court'
import { distanceBetween } from '@/domain/court'
import type { PlayerId, TeamId } from '@/domain/ids'
import { emitEvent } from '../events'
import { draw } from '../rng'
import { changePossessionPhase, endPossession, startPossession } from '../possession'
import { activePossession, type MatchState, type PossessionStartReason } from '../state'
import { advanceLooseBall, flightProgress, interpolatePosition, looseBallVelocity, passHeight, shotHeight } from './BallFlight'
import { BALL_ACQUISITION_RADIUS_METERS, HELD_BALL_HEIGHT_METERS, REBOUND_ACQUISITION_RADIUS_METERS, type BallPassKind, type BallState, type PlannedShotOutcome } from './BallState'
import { shouldStopGameClock, whenDoesClockRestart } from '../clockRules'
import { nearestSidelineSpot } from './BallGeometry'
import { emitAssistIfEarned } from '../stats/Assists'
import { resolveFouledShotArrival, resolveFreeThrowArrival } from '../rules/FreeThrows'

export type InboundStartReason = 'periodStart' | 'madeBasketInbound' | 'turnoverInbound' | 'shotClockViolation'

export interface ReleasePassCommand {
  readonly receiverPlayerId: PlayerId
  readonly target: CourtPosition
  readonly passKind: BallPassKind
  readonly travelTicks: number
  readonly catchRadiusMeters?: number
  readonly actionId?: string
  readonly passQuality?: number
  readonly contest?: { readonly defenderId: PlayerId; readonly kind: 'INTERCEPTION' | 'DEFLECTION' }
}

export interface ReleaseShotCommand {
  readonly targetBasket: CourtPosition
  readonly travelTicks: number
  readonly plannedOutcome: PlannedShotOutcome
  readonly actionId?: string
  readonly shotValue?: 2 | 3
  readonly shotProbability?: number
  readonly contestScore?: number
  readonly contestDefenderPlayerId?: PlayerId
  readonly shotZone?: string
  readonly shotCreation?: string
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
        : state.ball.reason === 'outOfBounds' || state.ball.reason === 'other' || state.ball.reason === 'foul'
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
  next = { ...next, ball: { kind: 'INBOUND', teamId, inbounderPlayerId, spot, position: spot, heightMeters: HELD_BALL_HEIGHT_METERS, startedT: next.t, deadlineT: null }, clock: { gameRunning: next.clock.gameRunning, shotRunning: false }, shotClockTenths: null }
  const possession = activePossession(next)
  return emitEvent(next, 'inboundStarted', { possessionId: possession?.id, teamId, playerId: inbounderPlayerId, phase: 'INBOUND', ...(existing ? {} : { startReason: reason }) })
}

/** Starts the regulation opening tip; physical reach and the seeded outcome stream decide the tip. */
export function startOpeningJumpBall(state: MatchState, homeLineup: readonly PlayerId[], awayLineup: readonly PlayerId[]): MatchState {
  if (state.period !== 1 || state.t !== 0 || state.ball.kind !== 'DEAD' || state.ball.reason !== 'foundation' || state.possessions.length > 0) {
    throw new Error('Opening jump ball can only start at the beginning of period one')
  }
  const homeJumper = tallestPlayer(state, homeLineup)
  const awayJumper = tallestPlayer(state, awayLineup)
  const drawResult = draw(state.rng, 'outcome')
  const homeScore = homeJumper.standingReachCm + drawResult.value * 30
  const awayScore = awayJumper.standingReachCm + (1 - drawResult.value) * 30
  const winner = homeScore >= awayScore ? homeJumper : awayJumper
  const winningLineup = winner.teamId === state.homeTeamId ? homeLineup : awayLineup
  const receiverPlayerId = winningLineup.find((playerId) => playerId !== winner.playerId)!
  const center = { x: state.court.lengthMeters / 2, y: state.court.widthMeters / 2 }
  const jumpPositions = jumpBallFormation(homeLineup, awayLineup, homeJumper.playerId, awayJumper.playerId, center)
  const players = state.players.map((player) => {
    const position = jumpPositions.get(player.playerId)
    return position ? { ...player, position, velocity: { x: 0, y: 0 } } : player
  })
  const jumpBall: BallState = {
    kind: 'JUMP_BALL', homeJumperPlayerId: homeJumper.playerId, awayJumperPlayerId: awayJumper.playerId,
    tippedByPlayerId: winner.playerId, receiverPlayerId, winningTeamId: winner.teamId,
    position: center, heightMeters: 0.6, startedT: state.t, resolvesAtT: state.t + 20,
  }
  const next = { ...state, players, rng: drawResult.state, ball: jumpBall }
  return emitEvent(next, 'jumpBallStarted', { playerId: homeJumper.playerId })
}

/**
 * The standard opening tip (FIBA 12.2): each jumper stands in the half of the centre circle nearer to his own basket, with one foot
 * near the centre line; the other eight players stand around the circle, outside it, and the two teams alternate around it (a team
 * cannot take two adjacent places if an opponent wants one of them).
 */
const JUMP_CIRCLE_PLACE_RADIUS_METERS = 2.45
function jumpBallFormation(homeLineup: readonly PlayerId[], awayLineup: readonly PlayerId[], homeJumperId: PlayerId, awayJumperId: PlayerId, center: CourtPosition): ReadonlyMap<PlayerId, CourtPosition> {
  const positions = new Map<PlayerId, CourtPosition>([
    [homeJumperId, { x: center.x - 0.65, y: center.y }],
    [awayJumperId, { x: center.x + 0.65, y: center.y }],
  ])
  const home = homeLineup.filter((playerId) => playerId !== homeJumperId)
  const away = awayLineup.filter((playerId) => playerId !== awayJumperId)
  const places = 8
  for (let index = 0; index < places; index += 1) {
    const angle = (Math.PI * 2 * (index + 0.5)) / places
    const position = { x: center.x + Math.cos(angle) * JUMP_CIRCLE_PLACE_RADIUS_METERS, y: center.y + Math.sin(angle) * JUMP_CIRCLE_PLACE_RADIUS_METERS }
    const playerId = index % 2 === 0 ? home[Math.floor(index / 2)] : away[Math.floor(index / 2)]
    if (playerId !== undefined) positions.set(playerId, position)
  }
  return positions
}

function tallestPlayer(state: MatchState, lineup: readonly PlayerId[]) {
  const players = lineup.map((playerId) => activePlayer(state, playerId))
  return players.sort((left, right) => right.standingReachCm - left.standingReachCm || String(left.playerId).localeCompare(String(right.playerId)))[0]!
}

export function releaseInbound(state: MatchState, receiverPlayerId: PlayerId, passKind: BallPassKind, travelTicks: number): MatchState {
  if (state.ball.kind !== 'INBOUND') throw new Error('Inbound release requires an INBOUND ball')
  const receiver = activePlayer(state, receiverPlayerId)
  if (receiver.teamId !== state.ball.teamId) throw new Error('Inbound receiver must be on the inbounding team')
  const ball = createPass(state, state.ball.inbounderPlayerId, receiverPlayerId, receiver.position, passKind, travelTicks, true, state.ball.position)
  let next: MatchState = { ...state, ball, ...(whenDoesClockRestart(state.clockRules) === 'release' ? { clock: { gameRunning: true, shotRunning: false } } : {}) }
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
  if (command.catchRadiusMeters !== undefined && (!Number.isFinite(command.catchRadiusMeters) || command.catchRadiusMeters <= 0 || command.catchRadiusMeters > BALL_ACQUISITION_RADIUS_METERS)) throw new Error('Pass catch radius must be positive and cannot exceed physical acquisition range')
  const ball = createPass(state, owner.playerId, receiver.playerId, command.target, command.passKind, command.travelTicks, false, undefined, command)
  const next = { ...state, ball }
  return emitEvent(next, 'passReleased', {
    possessionId: possession.id, teamId: owner.teamId, passerPlayerId: owner.playerId, receiverPlayerId: receiver.playerId,
    ...(command.actionId === undefined ? {} : { actionId: command.actionId }),
    ...(command.passQuality === undefined ? {} : { passQuality: command.passQuality }),
  })
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
  next = emitEvent(next, 'steal', { possessionId: previousPossession?.id, teamId: defender.teamId, playerId: defender.playerId, victimPlayerId: state.ball.passerPlayerId, stealKind: 'PASS_INTERCEPTION' })
  next = emitEvent(next, 'turnover', { possessionId: previousPossession?.id, teamId: state.ball.passerTeamId, playerId: state.ball.passerPlayerId, turnoverType: 'INTERCEPTION' })
  next = endPossession(next, 'turnover')
  next = startPossession(next, defender.teamId, 'steal', 'ADVANCE', true)
  return next
}

/** A defender tips the pass: it drops loose beside him, last touched by his team (so it is the offense's ball if it goes out). */
function deflectPass(state: MatchState, ball: Extract<BallState, { kind: 'PASS_IN_FLIGHT' }>, defenderPlayerId: PlayerId, position: CourtPosition): MatchState {
  const defender = activePlayer(state, defenderPlayerId)
  const along = { x: ball.target.x - ball.from.x, y: ball.target.y - ball.from.y }
  const length = Math.hypot(along.x, along.y) || 1
  const side = ((defender.position.x - position.x) * -along.y + (defender.position.y - position.y) * along.x) >= 0 ? 1 : -1
  const velocity = { x: (along.x / length) * 1.8 + (-along.y / length) * 3.4 * side, y: (along.y / length) * 1.8 + (along.x / length) * 3.4 * side }
  const possession = activePossession(state)
  let next: MatchState = {
    ...state,
    ball: { kind: 'LOOSE', position: { ...position }, heightMeters: 1.6, velocity, cause: 'deflection', previousPosition: { ...position }, lastTouchTeamId: defender.teamId, lastTouchPlayerId: ball.passerPlayerId },
  }
  next = emitEvent(next, 'deflection', { possessionId: possession?.id, teamId: defender.teamId, playerId: defender.playerId, victimPlayerId: ball.passerPlayerId, stealKind: 'DEFLECTION' })
  return emitEvent(next, 'looseBallCreated', { possessionId: possession?.id, teamId: defender.teamId, playerId: defender.playerId, ballReason: 'deflection' })
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
    ...(command.actionId === undefined ? {} : { actionId: command.actionId }),
    ...(command.shotValue === undefined ? {} : { shotValue: command.shotValue }),
    ...(command.shotProbability === undefined ? {} : { shotProbability: command.shotProbability }),
    ...(command.contestScore === undefined ? {} : { contestScore: command.contestScore }),
    ...(command.contestDefenderPlayerId === undefined ? {} : { contestDefenderPlayerId: command.contestDefenderPlayerId }),
  }
  let next: MatchState = { ...state, ball }
  next = changePossessionPhase(next, 'SHOT')
  return emitEvent(next, 'shotReleased', {
    possessionId: possession.id, teamId: owner.teamId, shooterPlayerId: owner.playerId, shotDistanceMeters: Number(distanceBetween(state.ball.position, command.targetBasket).toFixed(2)),
    ...(command.actionId === undefined ? {} : { actionId: command.actionId }),
    ...(command.shotValue === undefined ? {} : { points: command.shotValue }),
    ...(command.shotProbability === undefined ? {} : { shotProbability: command.shotProbability }),
    ...(command.contestScore === undefined ? {} : { contestScore: command.contestScore }),
    ...(command.shotZone === undefined ? {} : { shotZone: command.shotZone }),
    ...(command.shotCreation === undefined ? {} : { shotCreation: command.shotCreation }),
  })
}

export function secureRebound(state: MatchState, playerId: PlayerId): MatchState {
  if (state.ball.kind !== 'REBOUNDABLE') throw new Error('Rebound acquisition requires a REBOUNDABLE ball')
  if (state.t < state.ball.availableAtT) throw new Error('Rebound is not available yet')
  const player = activePlayer(state, playerId)
  const acquisitionDistanceMeters = distanceBetween(player.position, state.ball.position)
  if (acquisitionDistanceMeters > REBOUND_ACQUISITION_RADIUS_METERS) throw new Error(`Rebounder is ${acquisitionDistanceMeters.toFixed(2)}m from the ball`)
  const shootingTeamId = state.ball.shootingTeamId
  let next: MatchState = { ...state, ball: heldBall(player.playerId, player.teamId, player.position) }
  const oldPossession = activePossession(next)
  next = emitEvent(next, 'reboundSecured', {
    possessionId: oldPossession?.id, teamId: player.teamId, playerId, shootingTeamId,
    reboundType: player.teamId === shootingTeamId ? 'offensive' : 'defensive', acquisitionDistanceMeters,
  })
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
  const loose = state.ball
  const acquisitionDistanceMeters = distanceBetween(player.position, state.ball.position)
  if (acquisitionDistanceMeters > BALL_ACQUISITION_RADIUS_METERS) throw new Error(`Recoverer is ${acquisitionDistanceMeters.toFixed(2)}m from the ball`)
  const oldPossession = activePossession(state)
  let next: MatchState = { ...state, ball: heldBall(player.playerId, player.teamId, player.position) }
  next = emitEvent(next, 'looseBallRecovered', { possessionId: oldPossession?.id, teamId: player.teamId, playerId, acquisitionDistanceMeters })
  if (oldPossession && oldPossession.teamId !== player.teamId) {
    if (loose.cause === 'block') {
      // A blocked shot that the defense gathers is a defensive rebound: the shot was a miss, not a turnover.
      next = emitEvent(next, 'reboundSecured', { possessionId: oldPossession.id, teamId: player.teamId, playerId, shootingTeamId: oldPossession.teamId, reboundType: 'defensive', acquisitionDistanceMeters })
      next = endPossession(next, 'defensiveRebound')
      return startPossession(next, player.teamId, 'defensiveRebound', 'ADVANCE', true)
    }
    const stolen = loose.cause === 'deflection' || loose.cause === 'pokeLoose'
    if (stolen) next = emitEvent(next, 'steal', { possessionId: oldPossession.id, teamId: player.teamId, playerId, ...(loose.lastTouchPlayerId === undefined ? {} : { victimPlayerId: loose.lastTouchPlayerId }), stealKind: loose.cause === 'deflection' ? 'DEFLECTION' : 'POKE_LOOSE' })
    if (loose.lastTouchPlayerId !== undefined) {
      next = emitEvent(next, 'turnover', { possessionId: oldPossession.id, teamId: oldPossession.teamId, playerId: loose.lastTouchPlayerId, turnoverType: loose.cause === 'lostDribble' || loose.cause === 'pokeLoose' ? 'LOST_DRIBBLE' : 'BAD_PASS' })
    }
    next = endPossession(next, 'turnover')
    return startPossession(next, player.teamId, stolen ? 'steal' : 'other', 'ADVANCE', true)
  }
  if (!oldPossession) return startPossession(next, player.teamId, 'other', 'ADVANCE', true)
  if (loose.cause === 'block') {
    // The offense gathers its own blocked shot: an offensive rebound (no shot-clock reset: the ball never touched the rim).
    next = emitEvent(next, 'reboundSecured', { possessionId: oldPossession.id, teamId: player.teamId, playerId, shootingTeamId: oldPossession.teamId, reboundType: 'offensive', acquisitionDistanceMeters })
    next = { ...next, possessions: next.possessions.map((item) => item.id === oldPossession.id ? { ...item, offensiveRebounds: item.offensiveRebounds + 1 } : item), clock: { ...next.clock, gameRunning: true, shotRunning: true } }
  }
  if (oldPossession.phase === 'INBOUND') {
    next = { ...next, shotClockTenths: next.clockRules.shotClockSeconds * 10, clock: { gameRunning: true, shotRunning: true } }
    next = markShotClockStarted(next)
  }
  return changePossessionPhase(next, 'ADVANCE')
}

export function putBallDead(state: MatchState, reason: 'outOfBounds' | 'other', restartTeamId?: TeamId): MatchState {
  if (state.ball.kind === 'DEAD' || state.ball.kind === 'INBOUND') throw new Error(`Cannot make the ball dead from ${state.ball.kind}`)
  const active = activePossession(state)
  const defaultRestartTeam = active === undefined
    ? undefined
    : reason === 'outOfBounds'
      ? active.teamId === state.homeTeamId ? state.awayTeamId : state.homeTeamId
      : active.teamId
  const restartTeam = restartTeamId ?? defaultRestartTeam
  if (restartTeam !== undefined && restartTeam !== state.homeTeamId && restartTeam !== state.awayTeamId) throw new Error('Restart team is not part of this match')
  let next: MatchState = {
    ...state,
    ball: {
      kind: 'DEAD', reason, position: state.ball.position, heightMeters: 0.08,
      ...(restartTeam === undefined ? {} : {
        restartTeamId: restartTeam,
        restartSpot: reason === 'outOfBounds'
          ? { ...state.ball.position }
          : nearestSidelineSpot(state.ball.position, state.court),
      }),
    },
    clock: { gameRunning: !shouldStopGameClock(reason, state.period, state.gameClockTenths, state.clockRules), shotRunning: false },
    shotClockTenths: null,
  }
  if (active && restartTeam !== undefined && active.teamId !== restartTeam) next = endPossession(next, 'turnover')
  return emitEvent(next, 'ballDead', { teamId: restartTeam, ballReason: reason })
}

/** FIBA 28: the team did not take the ball into its frontcourt in time. Turnover; the opponents throw in from the nearest sideline. */
export function violateBackcourt(state: MatchState): MatchState {
  const possession = activePossession(state)
  if (!possession || state.ball.kind === 'DEAD' || state.ball.kind === 'INBOUND' || state.ball.kind === 'SHOT_IN_FLIGHT') return state
  const restartTeamId = possession.teamId === state.homeTeamId ? state.awayTeamId : state.homeTeamId
  let next = emitEvent(state, 'turnover', { possessionId: possession.id, teamId: possession.teamId, turnoverType: 'EIGHT_SECOND' })
  next = putBallDead(next, 'other', restartTeamId)
  return { ...next, backcourtControl: null }
}

export function violateShotClock(state: MatchState): MatchState {
  const possession = activePossession(state)
  if (!possession || state.ball.kind === 'SHOT_IN_FLIGHT' || state.ball.kind === 'DEAD' || state.ball.kind === 'INBOUND') return state
  const restartTeamId = possession.teamId === state.homeTeamId ? state.awayTeamId : state.homeTeamId
  const position = state.ball.position
  let next: MatchState = {
    ...state,
    ball: { kind: 'DEAD', reason: 'shotClockViolation', position, heightMeters: 0.08, restartTeamId, restartSpot: nearestSidelineSpot(position, state.court) },
    clock: { gameRunning: !shouldStopGameClock('shotClockViolation', state.period, state.gameClockTenths, state.clockRules), shotRunning: false },
    shotClockTenths: 0,
  }
  next = emitEvent(next, 'shotClockViolation', { possessionId: possession.id, teamId: possession.teamId })
  next = emitEvent(next, 'turnover', { possessionId: possession.id, teamId: possession.teamId, turnoverType: 'SHOT_CLOCK' })
  next = endPossession(next, 'shotClock')
  next = { ...next, shotClockTenths: 0 }
  return emitEvent(next, 'ballDead', { teamId: restartTeamId, ballReason: 'shotClockViolation' })
}

/** A made basket: the ball leaves the net at rim height, falls to the floor and is carried to the inbound spot (also used for the ball dead at the horn). */
const MADE_BASKET_BALL_HEIGHT_METERS = 3.05
const MADE_BASKET_FALL_METERS_PER_TICK = 0.42
const MADE_BASKET_FLOOR_HEIGHT_METERS = 0.12
const MADE_BASKET_RETRIEVAL_METERS_PER_TICK = 0.4

export function advanceBallAtTick(state: MatchState): MatchState {
  const ball = state.ball
  if (ball.kind === 'DEAD' && (ball.reason === 'madeBasket' || ball.reason === 'periodEnd' || ball.restartSpot !== undefined)) {
    // Only a ball that came through the net falls; after a whistle or the horn an official carries it, at hand height.
    const height = ball.reason === 'madeBasket' ? Math.max(MADE_BASKET_FLOOR_HEIGHT_METERS, ball.heightMeters - MADE_BASKET_FALL_METERS_PER_TICK) : Math.max(MADE_BASKET_FLOOR_HEIGHT_METERS, ball.heightMeters)
    // After the horn the ball is carried to where the next period restarts (the centre spot) instead of jumping there.
    const target = ball.restartSpot ?? (ball.reason === 'periodEnd' ? { x: state.court.lengthMeters / 2, y: state.court.widthMeters / 2 } : ball.position)
    const dx = target.x - ball.position.x
    const dy = target.y - ball.position.y
    const distance = Math.hypot(dx, dy)
    const position = (ball.reason === 'madeBasket' && height > MADE_BASKET_FLOOR_HEIGHT_METERS) || distance <= 1e-9 ? ball.position
      : distance <= MADE_BASKET_RETRIEVAL_METERS_PER_TICK ? { ...target }
        : { x: ball.position.x + dx / distance * MADE_BASKET_RETRIEVAL_METERS_PER_TICK, y: ball.position.y + dy / distance * MADE_BASKET_RETRIEVAL_METERS_PER_TICK }
    return height === ball.heightMeters && position === ball.position ? state : { ...state, ball: { ...ball, heightMeters: height, position } }
  }
  if (ball.kind === 'JUMP_BALL') {
    const progress = Math.max(0, Math.min(1, (state.t - ball.startedT) / (ball.resolvesAtT - ball.startedT)))
    const receiver = findActivePlayer(state, ball.receiverPlayerId)
    const tapProgress = Math.max(0, Math.min(1, (progress - 0.55) / 0.45))
    const position = interpolatePosition(
      { x: state.court.lengthMeters / 2, y: state.court.widthMeters / 2 },
      receiver?.position ?? ball.position,
      tapProgress,
    )
    const heightMeters = progress <= 0.5 ? 0.6 + 3.2 * progress : 2.2 * (1 - progress) + 0.1
    if (state.t < ball.resolvesAtT || !receiver) return { ...state, ball: { ...ball, position, heightMeters } }
    let next: MatchState = { ...state, ball: heldBall(receiver.playerId, receiver.teamId, receiver.position) }
    next = emitEvent(next, 'jumpBallResolved', { teamId: ball.winningTeamId, playerId: ball.tippedByPlayerId, receiverPlayerId: receiver.playerId })
    return startPossession(next, ball.winningTeamId, 'openingJumpBall', 'ADVANCE', true)
  }
  if (ball.kind === 'PASS_IN_FLIGHT') {
    const progress = flightProgress(state.t, ball.releaseT, ball.arrivalT)
    const position = interpolatePosition(ball.from, ball.target, progress)
    const moved: MatchState = { ...state, ball: { ...ball, previousPosition: ball.position, position, heightMeters: passHeight(ball.passKind, progress) } }
    const receiver = findActivePlayer(moved, ball.intendedReceiverPlayerId)
    const receiverDistance = receiver && receiver.teamId === ball.passerTeamId
      ? distanceBetween(receiver.position, position) : Number.POSITIVE_INFINITY
    const receiverCanCatch = receiverDistance <= (ball.catchRadiusMeters ?? BALL_ACQUISITION_RADIUS_METERS)
    if (state.t < ball.arrivalT) return moved
    if (ball.contest?.kind === 'DEFLECTION' && !ball.isInbound) {
      const deflector = findActivePlayer(moved, ball.contest.defenderId)
      if (deflector && deflector.active && distanceBetween(deflector.position, position) <= 1.3) return deflectPass(moved, ball, deflector.playerId, position)
    }
    const defender = ball.isInbound ? undefined : moved.players.filter((player) => player.active && player.teamId !== ball.passerTeamId)
      .map((player) => ({ player, distance: distanceBetween(player.position, position) }))
      .sort((left, right) => left.distance - right.distance || String(left.player.playerId).localeCompare(String(right.player.playerId)))
      .find((item) => item.distance <= BALL_ACQUISITION_RADIUS_METERS)
    if (defender && (!receiverCanCatch || defender.distance < receiverDistance)) return interceptPass(moved, defender.player.playerId)
    if (receiverCanCatch) return receivePass(moved, receiver!.playerId, receiver!.teamId, receiverDistance, ball.isInbound)
    const loose: BallState = { kind: 'LOOSE', position, heightMeters: Math.max(0.08, moved.ball.heightMeters), velocity: looseBallVelocity(ball.from, ball.target), cause: 'badPass', previousPosition: position, lastTouchTeamId: ball.passerTeamId, lastTouchPlayerId: ball.passerPlayerId }
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
    if (ball.freeThrow !== undefined) return resolveFreeThrowArrival(moved)
    if (ball.foul !== undefined) return resolveFouledShotArrival(moved)
    if (ball.plannedOutcome.kind === 'MAKE') return resolveMadeShot(moved, ball.plannedOutcome.points === 1 ? 2 : ball.plannedOutcome.points)
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
  if (ball.kind === 'LOOSE') {
    const nextX = ball.position.x + ball.velocity.x * 0.1
    const nextY = ball.position.y + ball.velocity.y * 0.1
    const moved = advanceLooseBall(ball, state.court)
    if (nextX < 0 || nextX > state.court.lengthMeters || nextY < 0 || nextY > state.court.widthMeters) {
      const possession = activePossession(state)
      const opponentOf = (teamId: TeamId): TeamId => teamId === state.homeTeamId ? state.awayTeamId : state.homeTeamId
      // The team that touched it last loses it: a blocked or deflected ball keeps the offense's possession.
      const restartTeamId = ball.lastTouchTeamId !== undefined ? opponentOf(ball.lastTouchTeamId)
        : possession === undefined ? undefined : opponentOf(possession.teamId)
      let next: MatchState = { ...state, ball: moved }
      if (possession !== undefined && restartTeamId !== undefined && restartTeamId !== possession.teamId && ball.lastTouchPlayerId !== undefined) {
        next = emitEvent(next, 'turnover', { possessionId: possession.id, teamId: possession.teamId, playerId: ball.lastTouchPlayerId, turnoverType: ball.cause === 'lostDribble' ? 'LOST_DRIBBLE' : 'OUT_OF_BOUNDS' })
      }
      next = emitEvent(next, 'outOfBounds', { possessionId: possession?.id, ...(restartTeamId === undefined ? {} : { teamId: restartTeamId }), ...(ball.lastTouchPlayerId === undefined ? {} : { playerId: ball.lastTouchPlayerId }), ballReason: ball.cause })
      return putBallDead(next, 'outOfBounds', restartTeamId)
    }
    return { ...state, ball: moved }
  }
  return state
}

/** A HELD ball is physically linked to its owner; follow the kinematics-owned position. */
export function syncHeldBallToOwner(state: MatchState): MatchState {
  if (state.ball.kind !== 'HELD') return state
  const owner = findActivePlayer(state, state.ball.ownerPlayerId)
  if (!owner || owner.position.x === state.ball.position.x && owner.position.y === state.ball.position.y) return state
  return { ...state, ball: { ...state.ball, position: { ...owner.position } } }
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
    ball: { kind: 'DEAD', reason: 'madeBasket', position: ball.targetBasket, heightMeters: MADE_BASKET_BALL_HEIGHT_METERS, restartTeamId: opponent, restartSpot },
    clock: { gameRunning: !shouldStopGameClock('madeBasket', state.period, state.gameClockTenths, state.clockRules), shotRunning: false },
    shotClockTenths: null,
  }
  next = emitEvent(next, 'shotMade', { possessionId: activePossession(next)?.id, teamId: ball.shooterTeamId, shooterPlayerId: ball.shooterPlayerId, points })
  next = emitAssistIfEarned(next, ball.shooterPlayerId)
  next = endPossession(next, 'made')
  return emitEvent(next, 'ballDead', { teamId: opponent, ballReason: 'madeBasket' })
}

function createPass(state: MatchState, passerPlayerId: PlayerId, receiverPlayerId: PlayerId, target: CourtPosition, passKind: BallPassKind, travelTicks: number, isInbound: boolean, releasePosition?: CourtPosition, command?: ReleasePassCommand) {
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
    ...(command?.catchRadiusMeters === undefined ? {} : { catchRadiusMeters: command.catchRadiusMeters }),
    ...(command?.actionId === undefined ? {} : { actionId: command.actionId }),
    ...(command?.passQuality === undefined ? {} : { passQuality: command.passQuality }),
    ...(command?.contest === undefined ? {} : { contest: command.contest }),
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
