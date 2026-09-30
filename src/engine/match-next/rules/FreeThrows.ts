import { distanceBetween, type CourtPosition } from '@/domain/court'
import type { PlayerId } from '@/domain/ids'
import { emitEvent } from '../events'
import { baselineSpotBehind, FREE_THROW_LINE_DISTANCE_METERS } from '../ball/BallGeometry'
import { HELD_BALL_HEIGHT_METERS } from '../ball/BallState'
import type { MovementIntent } from '../movement/MovementIntent'
import { changePossessionPhase, endPossession } from '../possession'
import { draw } from '../rng'
import { emitAssistIfEarned } from '../stats/Assists'
import { attackingBasketForTeam } from '../structure/FiveOutStructure'
import { activePossession, type FreeThrowSequence, type MatchPlayerState, type MatchState } from '../state'

/** Ticks a free throw takes to reach the rim. */
export const FREE_THROW_FLIGHT_TICKS = 6
/** The shooter's routine before each attempt (0.9 s). */
const SHOOTER_ROUTINE_TICKS = 9
/** Players are "in their spot" within this distance of it. */
const SPOT_TOLERANCE_METERS = 1.0
const FORMATION_TIMEOUT_TICKS = 90
/** Half-width of the lane plus the lane line: players line up just outside it. */
const LANE_SPOT_LATERAL_METERS = 2.75

/**
 * Free-throw success from the canonical shooting rating and the shooter's condition. A 50 shoots ~72%, an 80 ~86%, a 30 ~64%.
 * It is a separate skill from field-goal shooting only through the rating; there is no free-throw rating in the model yet.
 */
export function freeThrowProbability(shooter: MatchPlayerState): number {
  return Math.max(0.45, Math.min(0.94, 0.5 + shooter.offense.shooting * 0.0044 - Math.max(0, Math.min(100, shooter.fatigue)) * 0.0008))
}

interface StartParams {
  readonly foulId: string
  readonly shooterId: PlayerId
  readonly total: number
  readonly oneAndOne: boolean
  readonly reason: FreeThrowSequence['reason']
}

/** Opens a free-throw sequence: from this tick the game is in the FREE_THROW lifecycle. */
export function startFreeThrowSequence(state: MatchState, params: StartParams): MatchState {
  const shooter = state.players.find((player) => player.playerId === params.shooterId)
  if (!shooter || !shooter.active) return state
  const possession = activePossession(state)
  const sequence: FreeThrowSequence = {
    id: `free-throws-${params.foulId}`, foulId: params.foulId, shooterId: shooter.playerId, shooterTeamId: shooter.teamId,
    total: params.total, taken: 0, made: 0, phase: 'FORMATION', reason: params.reason, oneAndOne: params.oneAndOne,
    startedT: state.t, readyAtT: null, ...(possession === undefined ? {} : { possessionId: possession.id }),
  }
  let next: MatchState = {
    ...state,
    freeThrows: sequence,
    clock: { gameRunning: false, shotRunning: false },
    shotClockTenths: null,
    // The dead ball keeps its `foul` reason until the first attempt: the whistle still opens a substitution window.
    ball: { kind: 'DEAD', reason: state.ball.kind === 'DEAD' && state.ball.reason === 'foul' ? 'foul' : 'freeThrow', position: { ...state.ball.position }, heightMeters: HELD_BALL_HEIGHT_METERS, restartTeamId: shooter.teamId },
  }
  if (possession !== undefined && possession.teamId === shooter.teamId && possession.phase !== 'SHOT') next = changePossessionPhase(next, 'SHOT')
  next = installFreeThrowFormation(next, sequence)
  return emitEvent(next, 'freeThrowSequenceStarted', {
    ...(possession === undefined ? {} : { possessionId: possession.id }), teamId: shooter.teamId, playerId: shooter.playerId, freeThrowsAwarded: params.total, freeThrowTotal: params.total,
  })
}

function laneSpots(basket: CourtPosition, court: MatchState['court']): { readonly defenders: readonly CourtPosition[]; readonly attackers: readonly CourtPosition[]; readonly shooter: CourtPosition } {
  const toward = basket.x >= court.lengthMeters / 2 ? -1 : 1
  const centerY = court.widthMeters / 2
  const at = (offset: number, lateral: number): CourtPosition => ({ x: basket.x + toward * offset, y: centerY + lateral })
  return {
    shooter: at(FREE_THROW_LINE_DISTANCE_METERS, 0),
    // Lane spots, low block to high: defenders take the two blocks and the two high spots, attackers the middle ones.
    defenders: [at(1.5, -LANE_SPOT_LATERAL_METERS), at(1.5, LANE_SPOT_LATERAL_METERS), at(3.7, -LANE_SPOT_LATERAL_METERS), at(3.7, LANE_SPOT_LATERAL_METERS), at(6.2, 3.4)],
    attackers: [at(2.6, -LANE_SPOT_LATERAL_METERS), at(2.6, LANE_SPOT_LATERAL_METERS), at(6.2, -3.4), at(7.6, 0)],
  }
}

function assign(players: readonly MatchPlayerState[], spots: readonly CourtPosition[]): Map<PlayerId, CourtPosition> {
  const result = new Map<PlayerId, CourtPosition>()
  const free = [...players]
  for (const spot of spots) {
    if (free.length === 0) break
    free.sort((left, right) => distanceBetween(left.position, spot) - distanceBetween(right.position, spot) || String(left.playerId).localeCompare(String(right.playerId)))
    const player = free.shift()!
    result.set(player.playerId, spot)
  }
  return result
}

/** Everybody walks to his spot: shooter at the line, four attackers and five defenders around the lane. */
function installFreeThrowFormation(state: MatchState, sequence: FreeThrowSequence): MatchState {
  const basket = attackingBasketForTeam(sequence.shooterTeamId, state.homeTeamId, state.period, state.court)
  const spots = laneSpots(basket, state.court)
  const active = state.players.filter((player) => player.active)
  const attackers = active.filter((player) => player.teamId === sequence.shooterTeamId && player.playerId !== sequence.shooterId)
  const defenders = active.filter((player) => player.teamId !== sequence.shooterTeamId)
  const targets = new Map<PlayerId, CourtPosition>([[sequence.shooterId, spots.shooter]])
  for (const [id, spot] of assign(attackers, spots.attackers)) targets.set(id, spot)
  for (const [id, spot] of assign(defenders, spots.defenders)) targets.set(id, spot)
  let nextResponsibilitySequence = state.nextResponsibilitySequence
  let nextDecisionSequence = state.nextDecisionSequence
  const responsibilities: MatchState['responsibilities'][number][] = []
  const decisions: MatchState['decisions'][number][] = []
  const intents: MovementIntent[] = []
  for (const player of active) {
    const target = targets.get(player.playerId)
    if (target === undefined) continue
    const ours = player.teamId === sequence.shooterTeamId
    const owner = ours ? 'possession' as const : 'defensiveStructure' as const
    const responsibilityId = `responsibility-${nextResponsibilitySequence++}`
    const decisionId = `decision-${nextDecisionSequence++}`
    responsibilities.push({
      id: responsibilityId, playerId: player.playerId, teamId: player.teamId, kind: 'PERIOD_RESTART', owner, startedT: state.t,
      reason: player.playerId === sequence.shooterId ? 'Take the free throws' : 'Line up for the free throws', endCondition: { kind: 'phaseChanges' },
    })
    decisions.push({ id: decisionId, playerId: player.playerId, responsibilityId, kind: 'PERIOD_RESTART', owner, startedT: state.t, reason: 'Free-throw formation' })
    intents.push({ playerId: player.playerId, target, urgency: 'run', facing: player.playerId === sequence.shooterId ? { kind: 'BASKET' } : { kind: 'BASKET' }, provenance: { responsibilityId, decisionId, owner } })
  }
  const covered = new Set(targets.keys())
  return {
    ...state,
    responsibilities: [...state.responsibilities.filter((item) => !covered.has(item.playerId)), ...responsibilities],
    decisions: [...state.decisions.filter((item) => !covered.has(item.playerId)), ...decisions],
    movementIntents: [...state.movementIntents.filter((item) => !covered.has(item.playerId)), ...intents],
    nextResponsibilitySequence, nextDecisionSequence,
  }
}

function clearFormation(state: MatchState): MatchState {
  const ids = new Set(state.responsibilities.filter((item) => item.kind === 'PERIOD_RESTART').map((item) => item.id))
  return {
    ...state,
    responsibilities: state.responsibilities.filter((item) => !ids.has(item.id)),
    decisions: state.decisions.filter((item) => !ids.has(item.responsibilityId)),
    movementIntents: state.movementIntents.filter((item) => !ids.has(item.provenance.responsibilityId)),
  }
}

function formationComplete(state: MatchState): boolean {
  const intents = new Map(state.movementIntents.map((intent) => [intent.playerId, intent]))
  return state.players.filter((player) => player.active).every((player) => {
    const intent = intents.get(player.playerId)
    return intent === undefined || distanceBetween(player.position, intent.target) <= SPOT_TOLERANCE_METERS
  })
}

/** Called once per tick: walks the sequence through FORMATION -> READY -> a shot in the air. */
export function reconcileFreeThrows(state: MatchState): MatchState {
  const sequence = state.freeThrows
  if (sequence === null || !state.autonomousActions) return state
  state = carryBallWithShooter(state, sequence)
  // A substitution during the whistle brings a player who has no spot yet.
  if (sequence.phase !== 'IN_FLIGHT' && state.players.some((player) => player.active && !state.movementIntents.some((intent) => intent.playerId === player.playerId && state.responsibilities.some((item) => item.id === intent.provenance.responsibilityId && item.kind === 'PERIOD_RESTART')))) {
    state = installFreeThrowFormation(state, sequence)
  }
  if (sequence.phase === 'FORMATION') {
    if (!formationComplete(state) && state.t - sequence.startedT < FORMATION_TIMEOUT_TICKS) return state
    return { ...state, freeThrows: { ...sequence, phase: 'READY', readyAtT: state.t + SHOOTER_ROUTINE_TICKS } }
  }
  if (sequence.phase === 'READY' && state.t >= (sequence.readyAtT ?? state.t)) return releaseFreeThrow(state, sequence)
  return state
}

/** The official hands the ball to the shooter: while the sequence waits, the ball is in his hands, wherever he walks. */
function carryBallWithShooter(state: MatchState, sequence: FreeThrowSequence): MatchState {
  if (state.ball.kind !== 'DEAD') return state
  const shooter = state.players.find((player) => player.playerId === sequence.shooterId)
  if (!shooter || (state.ball.position.x === shooter.position.x && state.ball.position.y === shooter.position.y)) return state
  return { ...state, ball: { ...state.ball, position: { ...shooter.position } } }
}

function reboundAfterFreeThrow(from: CourtPosition, basket: CourtPosition, court: MatchState['court'], distanceDraw: number, angleDraw: number): CourtPosition {
  const away = Math.atan2(from.y - basket.y, from.x - basket.x)
  const angle = away + (angleDraw - 0.5) * 2.4
  const distance = 1.3 + distanceDraw * 1.6
  return {
    x: Math.max(0.3, Math.min(court.lengthMeters - 0.3, basket.x + Math.cos(angle) * distance)),
    y: Math.max(0.3, Math.min(court.widthMeters - 0.3, basket.y + Math.sin(angle) * distance)),
  }
}

function releaseFreeThrow(state: MatchState, sequence: FreeThrowSequence): MatchState {
  const shooter = state.players.find((player) => player.playerId === sequence.shooterId)
  if (!shooter) return state
  const basket = attackingBasketForTeam(sequence.shooterTeamId, state.homeTeamId, state.period, state.court)
  const probability = freeThrowProbability(shooter)
  const result = draw(state.rng, 'outcome')
  const distanceDraw = draw(result.state, 'outcome')
  const angleDraw = draw(distanceDraw.state, 'outcome')
  const arrivalT = state.t + FREE_THROW_FLIGHT_TICKS
  const last = sequence.taken + 1 >= sequence.total
  const made = result.value < probability
  const plannedOutcome = made
    ? { kind: 'MAKE' as const, points: 1 as const }
    : { kind: 'MISS' as const, reboundTarget: reboundAfterFreeThrow(shooter.position, basket, state.court, distanceDraw.value, angleDraw.value), reboundAvailableT: arrivalT + 8 }
  return {
    ...state,
    rng: angleDraw.state,
    freeThrows: { ...sequence, phase: 'IN_FLIGHT' },
    ball: {
      kind: 'SHOT_IN_FLIGHT', shooterPlayerId: shooter.playerId, shooterTeamId: shooter.teamId, from: { ...shooter.position }, targetBasket: basket, releaseT: state.t, arrivalT,
      position: { ...shooter.position }, heightMeters: HELD_BALL_HEIGHT_METERS + 1.2, previousPosition: { ...shooter.position }, plannedOutcome,
      shotProbability: probability, freeThrow: { sequenceId: sequence.id, index: sequence.taken + 1, last },
    },
  }
}

function addScore(state: MatchState, teamId: MatchState['homeTeamId'], points: number): MatchState {
  return { ...state, score: teamId === state.homeTeamId ? { ...state.score, home: state.score.home + points } : { ...state.score, away: state.score.away + points } }
}

/** A free throw reaches the rim: it scores or it does not, and the sequence decides what happens next. */
export function resolveFreeThrowArrival(state: MatchState): MatchState {
  const ball = state.ball
  const sequence = state.freeThrows
  if (ball.kind !== 'SHOT_IN_FLIGHT' || ball.freeThrow === undefined || sequence === null) return state
  const made = ball.plannedOutcome.kind === 'MAKE'
  const taken = sequence.taken + 1
  const makes = sequence.made + (made ? 1 : 0)
  let next: MatchState = made ? addScore(state, sequence.shooterTeamId, 1) : state
  next = emitEvent(next, made ? 'freeThrowMade' : 'freeThrowMissed', {
    ...(sequence.possessionId === undefined ? {} : { possessionId: sequence.possessionId }), teamId: sequence.shooterTeamId, shooterPlayerId: sequence.shooterId, playerId: sequence.shooterId,
    points: 1, freeThrowIndex: taken, freeThrowTotal: sequence.total,
  })
  // A one-and-one only earns its second shot when the first goes in.
  const total = sequence.oneAndOne && taken === 1 ? (made ? 2 : 1) : sequence.total
  const last = taken >= total
  if (!last) {
    const position = { ...ball.from }
    return {
      ...next,
      freeThrows: { ...sequence, taken, made: makes, total, phase: 'READY', readyAtT: next.t + SHOOTER_ROUTINE_TICKS },
      ball: { kind: 'DEAD', reason: 'freeThrow', position, heightMeters: HELD_BALL_HEIGHT_METERS, restartTeamId: sequence.shooterTeamId },
    }
  }
  next = clearFormation({ ...next, freeThrows: null })
  if (made) {
    const opponent = sequence.shooterTeamId === next.homeTeamId ? next.awayTeamId : next.homeTeamId
    next = { ...next, ball: { kind: 'DEAD', reason: 'madeBasket', position: ball.targetBasket, heightMeters: 3.05, restartTeamId: opponent, restartSpot: baselineSpotBehind(ball.targetBasket, next.court) }, clock: { gameRunning: false, shotRunning: false }, shotClockTenths: null }
    const possession = activePossession(next)
    if (possession !== undefined && possession.endReason === undefined) next = endPossession(next, 'made')
    return emitEvent(next, 'ballDead', { teamId: opponent, ballReason: 'madeBasket' })
  }
  if (ball.plannedOutcome.kind !== 'MISS') return next
  // The last free throw missed: the ball is live for the rebound.
  next = {
    ...next,
    ball: {
      kind: 'REBOUNDABLE', shotByPlayerId: sequence.shooterId, shootingTeamId: sequence.shooterTeamId, position: { ...ball.targetBasket }, heightMeters: 3.05,
      landingFrom: { ...ball.targetBasket }, landingStartedT: next.t, landingTarget: ball.plannedOutcome.reboundTarget, availableAtT: ball.plannedOutcome.reboundAvailableT, previousPosition: { ...ball.targetBasket },
    },
  }
  return changePossessionPhase(next, 'LIVE_REBOUND')
}

/** A shot that was fouled in the act arrives: it counts if it goes in (AND-ONE), and the free throws follow either way. */
export function resolveFouledShotArrival(state: MatchState): MatchState {
  const ball = state.ball
  if (ball.kind !== 'SHOT_IN_FLIGHT' || ball.foul === undefined) return state
  const record = { made: ball.plannedOutcome.kind === 'MAKE', points: ball.foul.points, freeThrows: ball.foul.freeThrows }
  const foulId = ball.foul.foulId
  let next: MatchState = state
  if (record.made) {
    next = addScore(next, ball.shooterTeamId, record.points)
    next = emitEvent(next, 'shotMade', { possessionId: activePossession(next)?.id, teamId: ball.shooterTeamId, shooterPlayerId: ball.shooterPlayerId, points: record.points })
    next = emitAssistIfEarned(next, ball.shooterPlayerId)
  } else {
    next = emitEvent(next, 'shotMissed', { possessionId: activePossession(next)?.id, teamId: ball.shooterTeamId, shooterPlayerId: ball.shooterPlayerId })
  }
  next = { ...next, ball: { kind: 'DEAD', reason: 'foul', position: { ...ball.position }, heightMeters: 0.08, restartTeamId: ball.shooterTeamId, foulId }, shotClockTenths: null }
  next = emitEvent(next, 'ballDead', { teamId: ball.shooterTeamId, ballReason: 'foul' })
  return startFreeThrowSequence(next, { foulId, shooterId: ball.shooterPlayerId, total: record.freeThrows, oneAndOne: false, reason: record.made ? 'AND_ONE' : 'SHOOTING' })
}

