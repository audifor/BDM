import { distanceBetween, type CourtPosition } from '@/domain/court'
import type { PlayerId } from '@/domain/ids'
import { emitEvent } from '../events'
import type { MovementIntent } from '../movement/MovementIntent'
import { activePossession, type MatchPlayerState, type MatchState, type ScreenCoverage, type ScreenState } from '../state'
import { attackingBasketForTeam } from '../structure/FiveOutStructure'
import { guardPosition } from '../defense/ManDefense'

/** Ticks a screener may take to arrive before the ball screen is abandoned. */
const SCREEN_APPROACH_TIMEOUT_TICKS = 40
/** The screener counts as set when he is this close to the screen location. */
const SCREEN_SET_RADIUS_METERS = 0.55
/** How long the screen keeps shaping both defenses after the handler uses it. */
const SCREEN_USED_WINDOW_TICKS = 40
const SCREEN_CONTACT_WINDOW_TICKS = 14
/** The screener holds his position until the handler has moved this far past him toward the basket. */
const SCREEN_CLEAR_PROGRESS_METERS = 0.6
const SCREEN_MAX_HOLD_TICKS = 10
/** Ball screens are set where the handler can attack from: not in the paint and not too far from the basket. */
const SCREEN_MIN_HANDLER_DISTANCE_METERS = 6
const SCREEN_MAX_HANDLER_DISTANCE_METERS = 13
const SCREEN_MIN_DEPTH_METERS = 4
const SCREEN_MAX_LATERAL_METERS = 5.2
const SCREENER_MIN_DISTANCE_METERS = 2.5
const SCREENER_MAX_DISTANCE_METERS = 10
export const SCREEN_MIN_SECONDS_LEFT = 8
const MAX_SCREENS_PER_POSSESSION = 2
/** Value of a ball screen before player quality: the advantage a well-set screen is expected to create, plus the option value of keeping every read (drive, pull-up, roll pass) open after it. */
const SCREEN_BASE_VALUE_POINTS = 1.25

export interface ScreenPlan {
  readonly screenerId: PlayerId
  readonly handlerDefenderId: PlayerId
  readonly screenerDefenderId: PlayerId
  readonly location: CourtPosition
  readonly waypoint: CourtPosition
  readonly side: 1 | -1
  readonly coverage: ScreenCoverage
  readonly exit: 'ROLL' | 'POP'
  /** Expected points of running this ball screen: player quality and the defense's coverage. */
  readonly value: number
}

export function screenCoverageFor(state: MatchState, defendingTeamId: MatchPlayerState['teamId']): ScreenCoverage {
  const plan = defendingTeamId === state.homeTeamId ? state.tacticalPlans.home : state.tacticalPlans.away
  const value = plan.defense.pickAndRollCoverage
  return value === 'switch' || value === 'hedge' || value === 'blitz' ? value : 'drop'
}

function unit(dx: number, dy: number, fallback: CourtPosition): CourtPosition {
  const length = Math.hypot(dx, dy)
  return length > 1e-9 ? { x: dx / length, y: dy / length } : fallback
}

/** How dangerous a player is as the man who rolls to the rim / who pops for the shot after screening. */
function rollThreat(player: MatchPlayerState): number {
  return (player.offense.rimAttack + player.reboundingImpact + (player.heightCm - 170) * 0.6) / 3
}

/** Geometry and value of the best ball screen this handler could run with a teammate, or null if none makes sense. */
export function planScreen(state: MatchState, handler: MatchPlayerState, basket: CourtPosition): ScreenPlan | null {
  const possession = activePossession(state)
  if (!possession || state.defensiveStructure === null) return null
  if (state.screen !== null) return null
  const screensSoFar = state.actions.filter((action) => action.kind === 'SCREEN' && action.teamId === handler.teamId && action.startedT >= possession.startedT).length
  if (screensSoFar >= MAX_SCREENS_PER_POSSESSION) return null
  const handlerDistance = distanceBetween(handler.position, basket)
  if (handlerDistance < SCREEN_MIN_HANDLER_DISTANCE_METERS || handlerDistance > SCREEN_MAX_HANDLER_DISTANCE_METERS) return null
  // A ball screen needs room on both sides of the handler: at the top or on a wing, never in a corner or on the baseline.
  const depthFromBasket = Math.abs(basket.x - handler.position.x)
  const towardMidcourt = (state.court.lengthMeters / 2 - basket.x) * (state.court.lengthMeters / 2 - handler.position.x) > 0 && Math.abs(state.court.lengthMeters / 2 - handler.position.x) < Math.abs(state.court.lengthMeters / 2 - basket.x)
  if (!towardMidcourt || depthFromBasket < SCREEN_MIN_DEPTH_METERS || Math.abs(handler.position.y - state.court.widthMeters / 2) > SCREEN_MAX_LATERAL_METERS) return null
  const assignments = state.defensiveStructure.assignments
  const handlerDefenderId = assignments.find((item) => item.attackerPlayerId === handler.playerId)?.defenderPlayerId
  const handlerDefender = state.players.find((player) => player.playerId === handlerDefenderId)
  if (!handlerDefender) return null
  const coverage = screenCoverageFor(state, handlerDefender.teamId)
  const toBasket = unit(basket.x - handler.position.x, basket.y - handler.position.y, { x: -1, y: 0 })
  // The handler attacks toward the middle of the floor, off the shoulder of the screener.
  const centerY = state.court.widthMeters / 2
  const perpendicular = { x: -toBasket.y, y: toBasket.x }
  const towardCenter = (centerY - handler.position.y) * perpendicular.y >= 0 ? 1 : -1
  const side = (Math.abs(centerY - handler.position.y) < 0.6 ? (handler.position.y < centerY ? 1 : -1) * (perpendicular.y >= 0 ? 1 : -1) : towardCenter) as 1 | -1
  const p = { x: perpendicular.x * side, y: perpendicular.y * side }
  const candidates = state.players
    .filter((player) => player.active && player.teamId === handler.teamId && player.playerId !== handler.playerId)
    .map((screener) => {
      const distance = distanceBetween(screener.position, handler.position)
      const screenerDefenderId = assignments.find((item) => item.attackerPlayerId === screener.playerId)?.defenderPlayerId
      return { screener, distance, screenerDefenderId }
    })
    .filter((item) => item.screenerDefenderId !== undefined && item.screenerDefenderId !== handlerDefenderId
      && item.distance >= SCREENER_MIN_DISTANCE_METERS && item.distance <= SCREENER_MAX_DISTANCE_METERS)
  let best: ScreenPlan | null = null
  for (const { screener, distance, screenerDefenderId } of candidates) {
    // Screen location: beside the handler's defender, on the side the handler will attack, slightly toward the handler.
    const location: CourtPosition = {
      x: clamp(handlerDefender.position.x + p.x * 0.95 + toBasket.x * 0.15, 0.6, state.court.lengthMeters - 0.6),
      y: clamp(handlerDefender.position.y + p.y * 0.95 + toBasket.y * 0.15, 0.6, state.court.widthMeters - 0.6),
    }
    // The handler comes off the far shoulder of the screener, toward the basket.
    const waypoint: CourtPosition = {
      x: clamp(location.x + p.x * 1.05 + toBasket.x * 0.7, 0.6, state.court.lengthMeters - 0.6),
      y: clamp(location.y + p.y * 1.05 + toBasket.y * 0.7, 0.6, state.court.widthMeters - 0.6),
    }
    const threat = rollThreat(screener)
    const popThreat = screener.offense.shooting
    const coveragePenalty = coverage === 'switch' ? 0.14 : coverage === 'blitz' ? 0.04 : 0
    const value = SCREEN_BASE_VALUE_POINTS + 0.3 * (handler.offense.creation - 50) / 50 + 0.2 * (Math.max(threat, popThreat) - 50) / 50
      - coveragePenalty - distance * 0.008
    if (best === null || value > best.value) {
      best = {
        screenerId: screener.playerId, handlerDefenderId: handlerDefender.playerId, screenerDefenderId: screenerDefenderId!, location, waypoint, side,
        coverage, exit: popThreat >= 62 && popThreat >= screener.offense.rimAttack + 6 ? 'POP' : 'ROLL', value,
      }
    }
  }
  return best
}

export function createScreenState(state: MatchState, plan: ScreenPlan, handlerId: PlayerId, actionId: string): ScreenState {
  const possession = activePossession(state)!
  return {
    id: `screen-${actionId}`, possessionId: possession.id, teamId: possession.teamId, handlerId, screenerId: plan.screenerId,
    handlerDefenderId: plan.handlerDefenderId, screenerDefenderId: plan.screenerDefenderId, phase: 'APPROACH', startedT: state.t,
    setAtT: null, usedAtT: null, location: plan.location, waypoint: plan.waypoint, side: plan.side, coverage: plan.coverage, exit: plan.exit, actionId, switched: false,
  }
}

function setIntent(state: MatchState, intent: MovementIntent): MatchState {
  return { ...state, movementIntents: [...state.movementIntents.filter((item) => item.playerId !== intent.playerId), intent] }
}

/** Overrides the structural intent of `playerId` with a screen-driven one, keeping his existing responsibility. */
function drive(state: MatchState, playerId: PlayerId, target: CourtPosition, urgency: MovementIntent['urgency'], owner: MovementIntent['provenance']['owner'], facing: MovementIntent['facing'] = { kind: 'BALL' }): MatchState {
  const responsibility = state.responsibilities.find((item) => item.playerId === playerId && (owner === 'defensiveStructure' ? item.owner === 'defensiveStructure' : item.owner !== 'defensiveStructure'))
  const decisionId = state.decisions.find((item) => item.playerId === playerId && item.responsibilityId === responsibility?.id)?.id ?? `screen-${playerId}`
  if (!responsibility) return state
  return setIntent(state, { playerId, target, urgency, facing, provenance: { responsibilityId: responsibility.id, decisionId, owner } })
}

function dropTarget(state: MatchState, screen: ScreenState, handler: MatchPlayerState, screener: MatchPlayerState, basket: CourtPosition): CourtPosition {
  // Screener's defender protects the rim below the screen, on the line between the handler and the basket.
  const toBasket = unit(basket.x - handler.position.x, basket.y - handler.position.y, { x: -1, y: 0 })
  const depth = Math.max(2.6, Math.min(4.2, distanceBetween(handler.position, basket) - 2.4))
  void screen
  void screener
  return { x: basket.x - toBasket.x * depth, y: basket.y - toBasket.y * depth }
}

/** Runs the ball screen: approach, set, use, exit. Called from reconcileActions after the structural intents exist. */
export function reconcileScreen(input: MatchState): MatchState {
  let state = input
  const screen = state.screen
  if (screen === null) return state
  const possession = activePossession(state)
  const handler = state.players.find((player) => player.playerId === screen.handlerId)
  const screener = state.players.find((player) => player.playerId === screen.screenerId)
  const handlerDefender = state.players.find((player) => player.playerId === screen.handlerDefenderId)
  const screenerDefender = state.players.find((player) => player.playerId === screen.screenerDefenderId)
  const basket = possession ? attackingBasketForTeam(possession.teamId, state.homeTeamId, state.period, state.court) : undefined
  const ballWithHandler = state.ball.kind === 'HELD' && state.ball.ownerPlayerId === screen.handlerId
  const ballGone = state.ball.kind === 'SHOT_IN_FLIGHT' || state.ball.kind === 'REBOUNDABLE' || state.ball.kind === 'DEAD' || state.ball.kind === 'LOOSE'
  const expired = screen.usedAtT !== null && state.t - screen.usedAtT > SCREEN_USED_WINDOW_TICKS
  const abandoned = screen.phase !== 'USED' && (!ballWithHandler || state.t - screen.startedT > SCREEN_APPROACH_TIMEOUT_TICKS + 20)
  if (!possession || possession.id !== screen.possessionId || !handler || !screener || !handlerDefender || !screenerDefender || !basket || ballGone || expired || abandoned) {
    return endScreen(state, screen, screen.usedAtT !== null ? 'exit' : 'abandoned')
  }

  if (screen.phase === 'APPROACH') {
    const distance = distanceBetween(screener.position, screen.location)
    if (distance <= SCREEN_SET_RADIUS_METERS) {
      state = { ...state, screen: { ...screen, phase: 'SET', setAtT: state.t } }
      state = emitEvent(state, 'screenSet', { teamId: screen.teamId, playerId: screen.screenerId, receiverPlayerId: screen.handlerId })
      state = closeScreenAction(state, screen, 'ARRIVED')
    } else if (state.t - screen.startedT > SCREEN_APPROACH_TIMEOUT_TICKS) {
      return endScreen(state, screen, 'abandoned')
    } else {
      state = drive(state, screen.screenerId, screen.location, 'sprint', 'action')
      state = drive(state, screen.handlerId, handler.position, 'walk', 'action', { kind: 'BASKET' })
      return state
    }
  }

  const current = state.screen!
  // Screener stays planted while the handler reads the screen.
  if (current.phase === 'SET') {
    state = drive(state, current.screenerId, current.location, 'walk', 'action')
    state = applyCoverage(state, current, handler, screener, handlerDefender, screenerDefender, basket)
    return state
  }

  // USED: the screener holds the screen until the handler has cleared it, then exits (roll to the rim or pop to the arc).
  const sinceUse = state.t - (current.usedAtT ?? state.t)
  const toBasket = unit(basket.x - screener.position.x, basket.y - screener.position.y, { x: -1, y: 0 })
  const handlerProgress = (handler.position.x - current.location.x) * toBasket.x + (handler.position.y - current.location.y) * toBasket.y
  const handlerClear = handlerProgress >= SCREEN_CLEAR_PROGRESS_METERS || sinceUse >= SCREEN_MAX_HOLD_TICKS
  if (handlerClear) {
    const exitTarget = current.exit === 'ROLL' ? rollTarget(state, screener, basket) : popTarget(state, screener, basket)
    state = drive(state, current.screenerId, exitTarget, 'sprint', 'action', current.exit === 'ROLL' ? { kind: 'BASKET' } : { kind: 'BALL' })
  } else {
    state = drive(state, current.screenerId, current.location, 'walk', 'action')
  }
  state = applyCoverage(state, current, handler, screener, handlerDefender, screenerDefender, basket)
  // The screener is a body: the handler's defender cannot walk through him. He has to go around, which costs him
  // ground on the handler. Under a drop he goes under (toward the basket); otherwise over the top (behind the screener).
  if (sinceUse <= SCREEN_CONTACT_WINDOW_TICKS && !current.switched && current.coverage !== 'blitz') {
    const away = unit(current.location.x - current.waypoint.x, current.location.y - current.waypoint.y, { x: 0, y: 1 })
    const detour: CourtPosition = current.coverage === 'drop'
      ? { x: current.location.x + toBasket.x * 1.1 + away.x * 0.3, y: current.location.y + toBasket.y * 1.1 + away.y * 0.3 }
      : { x: current.location.x + away.x * 1.15, y: current.location.y + away.y * 1.15 }
    const pastScreen = distanceBetween(handlerDefender.position, detour) <= 0.7
      || (handlerDefender.position.x - current.location.x) * toBasket.x + (handlerDefender.position.y - current.location.y) * toBasket.y > 1.2
    if (!pastScreen) state = drive(state, handlerDefender.playerId, detour, 'run', 'defensiveStructure')
  }
  return state
}

function rollTarget(state: MatchState, screener: MatchPlayerState, basket: CourtPosition): CourtPosition {
  const direction = basket.x >= state.court.lengthMeters / 2 ? -1 : 1
  return { x: basket.x + direction * 1.6, y: basket.y + Math.max(-1.4, Math.min(1.4, (screener.position.y - basket.y) * 0.3)) }
}

function popTarget(state: MatchState, screener: MatchPlayerState, basket: CourtPosition): CourtPosition {
  const radius = state.court.threePointLine.arcRadiusMeters + 0.6
  const away = unit(screener.position.x - basket.x, screener.position.y - basket.y, { x: -1, y: 0 })
  return { x: clamp(basket.x + away.x * radius, 0.6, state.court.lengthMeters - 0.6), y: clamp(basket.y + away.y * radius, 0.6, state.court.widthMeters - 0.6) }
}

/** Defensive response to the screen: switch, drop, hedge or blitz. No coverage ignores the screen. */
function applyCoverage(state: MatchState, screen: ScreenState, handler: MatchPlayerState, screener: MatchPlayerState, handlerDefender: MatchPlayerState, screenerDefender: MatchPlayerState, basket: CourtPosition): MatchState {
  let next = state
  const sinceUse = screen.usedAtT === null ? -1 : state.t - screen.usedAtT
  const structure = next.defensiveStructure
  if (screen.coverage === 'switch') {
    if (!screen.switched && structure !== null) {
      const assignments = structure.assignments.map((item) => item.defenderPlayerId === screen.handlerDefenderId
        ? { ...item, attackerPlayerId: screen.screenerId, source: 'SWITCH' as const, startedT: state.t }
        : item.defenderPlayerId === screen.screenerDefenderId
          ? { ...item, attackerPlayerId: screen.handlerId, source: 'SWITCH' as const, startedT: state.t }
          : item)
      next = { ...next, defensiveStructure: { ...structure, assignments, onBallDefenderPlayerId: screen.screenerDefenderId }, screen: { ...screen, switched: true } }
    }
    return next
  }
  if (screen.coverage === 'drop') {
    // Screener's defender drops to protect the rim; the handler's defender chases over the top, never through the screener.
    next = drive(next, screen.screenerDefenderId, dropTarget(next, screen, handler, screener, basket), 'run', 'defensiveStructure')
    return next
  }
  if (screen.coverage === 'hedge') {
    const showing = sinceUse >= 0 && sinceUse > 9
    if (!showing) {
      const toward = unit(basket.x - handler.position.x, basket.y - handler.position.y, { x: -1, y: 0 })
      const hedge: CourtPosition = { x: handler.position.x + toward.x * 1.4 + (screen.waypoint.x - screener.position.x) * 0.3, y: handler.position.y + toward.y * 1.4 + (screen.waypoint.y - screener.position.y) * 0.3 }
      next = drive(next, screen.screenerDefenderId, hedge, 'sprint', 'defensiveStructure')
    }
    return next
  }
  // blitz: both defenders trap the handler; the screener is left alone.
  const trapA: CourtPosition = { x: handler.position.x + (screen.waypoint.x - handler.position.x) * 0.35, y: handler.position.y + (screen.waypoint.y - handler.position.y) * 0.35 }
  next = drive(next, screen.screenerDefenderId, trapA, 'sprint', 'defensiveStructure')
  void handlerDefender
  void screenerDefender
  return next
}

function closeScreenAction(state: MatchState, screen: ScreenState, outcome: 'ARRIVED' | 'CANCELLED'): MatchState {
  const action = state.actions.find((item) => item.id === screen.actionId)
  if (!action || action.status !== 'ACTIVE') return state
  const actions = state.actions.map((item) => item.id === action.id ? { ...item, status: outcome === 'CANCELLED' ? 'CANCELLED' as const : 'COMPLETED' as const, outcome, resolvedT: state.t } : item)
  const currentDecision = state.currentDecision?.id === action.decisionId ? null : state.currentDecision
  return emitEvent({ ...state, actions, currentDecision }, 'actionResolved', { teamId: action.teamId, playerId: action.playerId, actionId: action.id, actionKind: action.kind, actionOutcome: outcome })
}

function endScreen(state: MatchState, screen: ScreenState, reason: 'exit' | 'abandoned'): MatchState {
  let next = closeScreenAction(state, screen, 'CANCELLED')
  next = { ...next, screen: null }
  return emitEvent(next, 'screenEnded', { teamId: screen.teamId, playerId: screen.screenerId, receiverPlayerId: screen.handlerId, ballReason: reason })
}

/** Marks the screen as used when the handler acts on it (drive, pull-up or pass). Returns the waypoint for a drive. */
export function useScreen(state: MatchState, handlerId: PlayerId): MatchState {
  const screen = state.screen
  if (screen === null || screen.phase !== 'SET' || screen.handlerId !== handlerId) return state
  const next = { ...state, screen: { ...screen, phase: 'USED' as const, usedAtT: state.t } }
  return emitEvent(next, 'screenUsed', { teamId: screen.teamId, playerId: screen.handlerId, receiverPlayerId: screen.screenerId })
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

export { guardPosition }
