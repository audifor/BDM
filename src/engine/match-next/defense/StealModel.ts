import { activeActions } from '../actions/ActionIndex'
import { distanceBetween, type CourtPosition } from '@/domain/court'
import { closingSpeed, contactSeverity, speedOf } from '../contact/ContactModel'
import { emitEvent } from '../events'
import { commitFoul } from '../rules/Fouls'
import { HELD_BALL_HEIGHT_METERS } from '../ball/BallState'
import { endPossession, startPossession } from '../possession'
import { draw } from '../rng'
import { activePossession, type MatchPlayerState, type MatchState } from '../state'
import { nearestSidelineSpot } from '../ball/BallGeometry'
import { tacticalIntent } from '../tactics/TacticalIdentity'

/** Per-tick chance that an on-ball defender within reach of the dribble goes for the ball, before exposure and skill. */
const STEAL_ATTEMPT_RATE_PER_TICK = 0.009
/** The defender's hands reach the ball only inside this distance. */
const STEAL_REACH_METERS = 1.15
/** Per-tick chance a handler under contact pressure loses the handle on his own, before ball security. */
const LOST_DRIBBLE_RATE_PER_TICK = 0.0011
/** Ticks a defender who reached and missed stays off balance. */
const OFF_BALANCE_TICKS = 6

function guardOf(state: MatchState, handlerId: MatchPlayerState['playerId']): MatchPlayerState | undefined {
  const id = state.defensiveStructure?.assignments.find((item) => item.attackerPlayerId === handlerId)?.defenderPlayerId
  return id === undefined ? undefined : state.players.find((player) => player.playerId === id && player.active)
}

function looseFrom(handler: MatchPlayerState, defender: MatchPlayerState, cause: 'pokeLoose' | 'lostDribble', angleDraw: number, speedDraw: number, byDefender: boolean): MatchState['ball'] {
  const away = Math.atan2(handler.position.y - defender.position.y, handler.position.x - defender.position.x)
  const moving = speedOf(handler) > 0.5
  const angle = (byDefender || !moving ? away : Math.atan2(handler.velocity.y, handler.velocity.x)) + (angleDraw - 0.5) * 1.8
  const speed = 2.6 + speedDraw * 2.6
  return {
    kind: 'LOOSE', position: { ...handler.position }, heightMeters: 0.7, velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed }, cause,
    previousPosition: { ...handler.position }, lastTouchTeamId: byDefender ? defender.teamId : handler.teamId, lastTouchPlayerId: handler.playerId,
  }
}

/**
 * BT3I/J: defensive risk on the ball handler. Once per tick, the on-ball defender may go for the ball (poke it loose, take it
 * clean, miss, or reach in and foul) and a handler under pressure may lose his own dribble. Every outcome comes from the
 * pair's geometry (reach, exposure of the ball while he moves) and their ratings (steal vs ball security, interior/point of
 * attack), never from a flat per-possession turnover probability.
 */
export function reconcileOnBallPressure(state: MatchState): MatchState {
  const possession = activePossession(state)
  if (!state.autonomousActions || !possession || state.ball.kind !== 'HELD' || state.ball.ownerTeamId !== possession.teamId) return state
  if (possession.phase === 'INBOUND' || possession.phase === 'SHOT') return state
  if (activeActions(state).some((action) => action.status === 'ACTIVE' && (action.kind === 'SHOOT' || action.kind === 'CATCH_AND_SHOOT') && action.teamId === possession.teamId)) return state
  const handler = state.players.find((player) => player.playerId === (state.ball.kind === 'HELD' ? state.ball.ownerPlayerId : ''))
  if (!handler) return state
  const defender = guardOf(state, handler.playerId)
  if (!defender) return state
  const gap = distanceBetween(handler.position, defender.position)
  if (gap > STEAL_REACH_METERS) return state

  const speed = speedOf(handler)
  // A ball being dribbled at speed is exposed; one held still and shielded is much less (BT6: a handler standing with a live dribble protects it).
  const exposure = Math.max(0.15, Math.min(1, 0.1 + speed / 5))
  const stealRating = defender.defense.steal ?? 50
  const advantage = Math.max(-0.5, Math.min(0.5, (stealRating - handler.offense.ballSecurity) / 100))
  const roll = draw(state.rng, 'outcome')
  let next: MatchState = { ...state, rng: roll.state }
  // BT5.19: a pressure defense goes for the ball more often (more steals, more reach fouls, more blow-bys); a conservative one sits.
  const pressureIntent = tacticalIntent(state, defender.teamId).defense.pressure
  const attemptRate = STEAL_ATTEMPT_RATE_PER_TICK * (stealRating / 50) * exposure * Math.max(0.4, Math.min(1.3, (1.25 - gap / 3))) * (0.6 + 0.8 * pressureIntent)
  const pressure = Math.max(0, Math.min(1, (STEAL_REACH_METERS - gap) / 0.6))
  const lostRate = LOST_DRIBBLE_RATE_PER_TICK * Math.pow(1 - handler.offense.ballSecurity / 100, 1) * 2 * pressure * exposure
  if (roll.value >= attemptRate && roll.value < 1 - lostRate) return next

  const angleDraw = draw(next.rng, 'outcome')
  const speedDraw = draw(angleDraw.state, 'outcome')
  const outcomeDraw = draw(speedDraw.state, 'outcome')
  next = { ...next, rng: outcomeDraw.state }

  if (roll.value >= 1 - lostRate) {
    // Lost dribble: the handler loses control on his own under pressure.
    next = { ...next, ball: looseFrom(handler, defender, 'lostDribble', angleDraw.value, speedDraw.value, false) }
    return emitEvent(next, 'looseBallCreated', { possessionId: possession.id, teamId: handler.teamId, playerId: handler.playerId, ballReason: 'lostDribble' })
  }

  const closing = Math.max(0, closingSpeed(defender, handler))
  const clean = Math.max(0.04, Math.min(0.4, 0.14 + 0.3 * advantage))
  const poke = Math.max(0.08, Math.min(0.5, 0.26 + 0.25 * advantage))
  const reachFoul = Math.min(0.38, 0.12 + contactSeverity(closing + 0.8, defender.weightKg) * 0.4 * (1.3 - (defender.defense.pointOfAttack + defender.defense.mobility) / 200))
  const u = outcomeDraw.value
  if (u < clean) {
    next = { ...next, ball: { kind: 'HELD', ownerPlayerId: defender.playerId, ownerTeamId: defender.teamId, position: { ...defender.position }, heightMeters: HELD_BALL_HEIGHT_METERS, dribble: 'live' } }
    next = emitEvent(next, 'steal', { possessionId: possession.id, teamId: defender.teamId, playerId: defender.playerId, victimPlayerId: handler.playerId, stealKind: 'CLEAN_STEAL' })
    next = emitEvent(next, 'turnover', { possessionId: possession.id, teamId: handler.teamId, playerId: handler.playerId, turnoverType: 'LOST_DRIBBLE' })
    next = endPossession(next, 'turnover')
    return startPossession(next, defender.teamId, 'steal', 'ADVANCE', true)
  }
  if (u < clean + poke) {
    next = { ...next, ball: looseFrom(handler, defender, 'pokeLoose', angleDraw.value, speedDraw.value, true) }
    next = emitEvent(next, 'stealAttempt', { possessionId: possession.id, teamId: defender.teamId, playerId: defender.playerId, victimPlayerId: handler.playerId, stealKind: 'POKE_LOOSE' })
    return emitEvent(next, 'looseBallCreated', { possessionId: possession.id, teamId: defender.teamId, playerId: defender.playerId, ballReason: 'pokeLoose' })
  }
  if (u < clean + poke + reachFoul) {
    const outcome = commitFoul(next, { offenderId: defender.playerId, victimId: handler.playerId, type: 'REACH', contact: 'LEGAL_DEFENSIVE', severity: Math.max(0.1, contactSeverity(closing + 0.8, defender.weightKg)), offensive: false })
    return outcome.state
  }
  // BT6.5: a reach that misses has a price: his weight went to the ball, and he is late to the handler's next step.
  next = { ...next, players: next.players.map((player) => player.playerId === defender.playerId ? { ...player, offBalanceUntilT: next.t + OFF_BALANCE_TICKS } : player) }
  return emitEvent(next, 'stealAttempt', { possessionId: possession.id, teamId: defender.teamId, playerId: defender.playerId, victimPlayerId: handler.playerId, stealKind: 'FAILED_ATTEMPT' })
}

/**
 * The handler stands on the line: stepping out of bounds is a turnover, from the sideline spot next to him, to the defense.
 * Only a handler pressured while moving outward steps out (an unpressured player controls his feet).
 */
export function reconcileSteppedOut(state: MatchState): MatchState {
  const possession = activePossession(state)
  if (!state.autonomousActions || !possession || state.ball.kind !== 'HELD' || state.ball.ownerTeamId !== possession.teamId) return state
  const handler = state.players.find((player) => player.playerId === (state.ball.kind === 'HELD' ? state.ball.ownerPlayerId : ''))
  if (!handler) return state
  const court = state.court
  const nearSideline = handler.position.y <= 0.12 || handler.position.y >= court.widthMeters - 0.12
  const nearBaseline = handler.position.x <= 0.12 || handler.position.x >= court.lengthMeters - 0.12
  if (!nearSideline && !nearBaseline) return state
  const outward = (handler.position.y <= 0.12 && handler.velocity.y < -0.4) || (handler.position.y >= court.widthMeters - 0.12 && handler.velocity.y > 0.4)
    || (handler.position.x <= 0.12 && handler.velocity.x < -0.4) || (handler.position.x >= court.lengthMeters - 0.12 && handler.velocity.x > 0.4)
  if (!outward) return state
  const defender = guardOf(state, handler.playerId)
  if (!defender || distanceBetween(handler.position, defender.position) > 1.6) return state
  const restartTeamId = defender.teamId
  const spot: CourtPosition = nearestSidelineSpot(handler.position, court)
  let next: MatchState = {
    ...state, clock: { gameRunning: false, shotRunning: false }, shotClockTenths: null,
    ball: { kind: 'DEAD', reason: 'outOfBounds', position: { ...handler.position }, heightMeters: 0.08, restartTeamId, restartSpot: spot },
  }
  next = emitEvent(next, 'turnover', { possessionId: possession.id, teamId: handler.teamId, playerId: handler.playerId, turnoverType: 'STEPPED_OUT' })
  next = endPossession(next, 'turnover')
  return emitEvent(next, 'ballDead', { teamId: restartTeamId, ballReason: 'outOfBounds' })
}
