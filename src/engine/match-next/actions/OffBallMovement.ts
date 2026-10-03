import { distanceBetween, type CourtPosition } from '@/domain/court'
import type { PlayerId } from '@/domain/ids'
import { emitEvent } from '../events'
import type { MovementIntent } from '../movement/MovementIntent'
import { activePossession, type MatchPlayerState, type MatchState, type OffBallMove } from '../state'
import { attackingBasketForTeam } from '../structure/FiveOutStructure'
import { tuning } from '../tuning'
import { decisionNoise } from './OffenseFlow'
import { tacticalIntent } from '../tactics/TacticalIdentity'

/** Off-ball moves are re-evaluated on this cadence (ticks); nobody reads the floor every tick. */
const EVALUATION_PERIOD_TICKS = 4
const CUT_MAX_TICKS = 24
const DRIFT_MAX_TICKS = 30
/** A cutter must start closer than this to the rim area: cuts are short, decisive movements. */
const CUT_MAX_DISTANCE_METERS = 9
/** A defender within this distance of the cutting lane blocks it. */
const CUT_LANE_CLEARANCE_METERS = 1.3
/** A defender that is this far from his man is sagging off him (ball-watching or helping). */
const SAG_DISTANCE_METERS = 2.1
/** A defender this close on the ball side of his man is denying the pass: the man goes backdoor. */
const DENIAL_DISTANCE_METERS = 1.7
/** BT5.10: how many cuts a possession has room for, and how far a defender must sag before a cut is worth it, follow the off-ball identity. */
function maxCutsPerPossession(offBall: number): number { return Math.round(1.5 + 4 * offBall) }
function sagDistanceFor(offBall: number): number { return SAG_DISTANCE_METERS - (offBall - 0.35) * 1.2 }
const PIN_DOWN_MAX_TICKS = 34
const COME_OFF_MAX_TICKS = 26
const PIN_DOWN_SET_METERS = 1.1
const MAX_PIN_DOWNS_PER_POSSESSION = 2
/** A handler who has kept the ball this long, pressured or with nobody close, gets a teammate who comes to offer himself. */
const OFFER_AFTER_TICKS = 12
const OFFER_MAX_TICKS = 26
const OFFER_DISTANCE_METERS = 5
const OFFER_PRESSURE_METERS = 2.3
const OFFER_COOLDOWN_TICKS = 14
const DRIFT_SHIFT_METERS = 1.6
const DRIFT_MIN_IMPROVEMENT_METERS = 0.5

function guardOf(state: MatchState, attacker: MatchPlayerState): MatchPlayerState | undefined {
  const id = state.defensiveStructure?.assignments.find((item) => item.attackerPlayerId === attacker.playerId)?.defenderPlayerId
  return id === undefined ? undefined : state.players.find((player) => player.playerId === id)
}

function distanceToSegment(point: CourtPosition, start: CourtPosition, end: CourtPosition): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared <= 1e-9) return distanceBetween(point, start)
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared))
  return distanceBetween(point, { x: start.x + t * dx, y: start.y + t * dy })
}

function nearestDefenderDistance(state: MatchState, teamId: MatchPlayerState['teamId'], position: CourtPosition): number {
  return Math.min(...state.players.filter((player) => player.active && player.teamId !== teamId).map((player) => distanceBetween(player.position, position)), Number.POSITIVE_INFINITY)
}

/** Where a cutter finishes: at the rim, on the side he is cutting from. */
function cutTarget(state: MatchState, cutter: MatchPlayerState, basket: CourtPosition): CourtPosition {
  const direction = basket.x >= state.court.lengthMeters / 2 ? -1 : 1
  return { x: basket.x + direction * 1.3, y: basket.y + Math.max(-1.2, Math.min(1.2, (cutter.position.y - basket.y) * 0.25)) }
}

/**
 * BT2D: context-dependent off-ball movement.
 *  - BACKDOOR_CUT: his defender denies the pass, so he goes behind him to the rim;
 *  - BASKET_CUT: his defender sags off (helping / ball-watching) and the lane to the rim is open;
 *  - DRIFT: when a teammate drives, the spacers slide along the arc into the gap away from the defenders that are helping.
 * Only the players who have a reason move, at most one cutter and one drifter per beat, and every move ends.
 */
export function reconcileOffBallMovement(input: MatchState): MatchState {
  const possession = activePossession(input)
  const flow = input.offenseFlow
  if (!possession || flow === null || flow.possessionId !== possession.id) return input
  if (input.ball.kind === 'DEAD' || input.ball.kind === 'REBOUNDABLE') {
    // No new moves while the ball is dead or loose, but the ones that ended (a drive stopped by a whistle, a block) retire now.
    const stale = flow.moves.filter((move) => input.t >= move.endsT || !stillValid(input, move))
    return stale.length === 0 ? input : { ...input, offenseFlow: { ...flow, moves: flow.moves.filter((move) => !stale.includes(move)) } }
  }
  let state = input
  const basket = attackingBasketForTeam(possession.teamId, state.homeTeamId, state.period, state.court)
  // Retire finished moves.
  const live = flow.moves.filter((move) => state.t < move.endsT && stillValid(state, move))
  if (live.length !== flow.moves.length) state = { ...state, offenseFlow: { ...flow, moves: live } }
  let moves = state.offenseFlow!.moves

  const holder = state.ball.kind === 'HELD' && state.ball.ownerTeamId === possession.teamId
    ? state.players.find((player) => state.ball.kind === 'HELD' && player.playerId === state.ball.ownerPlayerId) : undefined
  const busy = new Set<PlayerId>([...moves.map((move) => move.playerId), ...(state.screen === null ? [] : [state.screen.screenerId, state.screen.handlerId])])
  const driveActive = state.actions.find((action) => action.kind === 'DRIVE' && action.status === 'ACTIVE' && action.teamId === possession.teamId)
  const halfCourt = flow.stage === 'HALF_COURT' || flow.stage === 'ADVANTAGE' || flow.stage === 'ACTION'

  if (holder !== undefined && tuning().offerEnabled !== 0 && driveActive === undefined && state.t % EVALUATION_PERIOD_TICKS === 0 && state.screen === null
    && state.t - flow.holderSinceT >= OFFER_AFTER_TICKS && !moves.some((move) => move.kind === 'OFFER') && state.ball.kind === 'HELD') {
    const recentOffer = state.events.some((event) => event.type === 'offBallMove' && event.ballReason === 'OFFER' && event.t >= state.t - OFFER_COOLDOWN_TICKS)
    const pressure = nearestDefenderDistance(state, holder.teamId, holder.position)
    const nearestTeammate = Math.min(...state.players.filter((p) => p.active && p.teamId === holder.teamId && p.playerId !== holder.playerId).map((p) => distanceBetween(p.position, holder.position)), Number.POSITIVE_INFINITY)
    // Only a handler who is really stuck gets one: nobody he could pass to along a clear line. A handler with an outlet already has
    // his teammates where they should be (their spots), and pulling them to the ball would bunch the floor.
    const defendersNow = state.players.filter((p) => p.active && p.teamId !== holder.teamId)
    const hasOutlet = state.players.some((p) => p.active && p.teamId === holder.teamId && p.playerId !== holder.playerId
      && distanceBetween(p.position, holder.position) >= 2.5 && distanceBetween(p.position, holder.position) <= 14
      && Math.min(...defendersNow.map((d) => distanceToSegment(d.position, holder.position, p.position)), 99) >= 1.3)
    if (!recentOffer && !hasOutlet && (pressure <= OFFER_PRESSURE_METERS || nearestTeammate > 8)) {
      const offer = pickOffer(state, holder, basket, busy)
      if (offer !== undefined) {
        moves = [...moves, offer]
        state = emitEvent({ ...state, offenseFlow: { ...state.offenseFlow!, moves } }, 'offBallMove', { teamId: offer.teamId, playerId: offer.playerId, ballReason: offer.kind })
        busy.add(offer.playerId)
      }
    }
  }

  const offBall = tacticalIntent(state, possession.teamId).offense.offBall
  if (holder !== undefined && halfCourt && state.t % EVALUATION_PERIOD_TICKS === 0 && state.t >= flow.readyAtT - 2) {
    // BT5.10: a movement set frees its shooter with an off-ball screen (pin-down) before anything else.
    const call = flow.call
    if (driveActive === undefined && flow.stage === 'HALF_COURT' && flow.settledAtT !== null && call?.family === 'MOVEMENT' && state.screen === null
      && !moves.some((move) => move.kind === 'PIN_DOWN' || move.kind === 'COME_OFF')) {
      const pinDownsSoFar = state.events.filter((event) => event.type === 'offBallMove' && event.t >= possession.startedT && event.ballReason === 'PIN_DOWN').length
      const pair = pinDownsSoFar < MAX_PIN_DOWNS_PER_POSSESSION ? pickPinDown(state, holder, basket, busy, call.targetId, call.screenerId) : undefined
      if (pair !== undefined) {
        moves = [...moves, ...pair]
        state = { ...state, offenseFlow: { ...state.offenseFlow!, moves } }
        for (const move of pair) { state = emitEvent(state, 'offBallMove', { teamId: move.teamId, playerId: move.playerId, ballReason: move.kind }); busy.add(move.playerId) }
      }
    }
    if (driveActive === undefined && flow.stage === 'HALF_COURT' && flow.settledAtT !== null) {
      const cutsSoFar = state.events.filter((event) => event.type === 'offBallMove' && event.t >= possession.startedT && (event.ballReason === 'BASKET_CUT' || event.ballReason === 'BACKDOOR_CUT')).length
      if (cutsSoFar < maxCutsPerPossession(offBall) && !moves.some((move) => move.kind === 'BASKET_CUT' || move.kind === 'BACKDOOR_CUT')) {
        const cut = pickCut(state, holder, basket, busy, sagDistanceFor(offBall))
        if (cut !== undefined) {
          moves = [...moves, cut]
          state = emitEvent({ ...state, offenseFlow: { ...state.offenseFlow!, moves } }, 'offBallMove', { teamId: cut.teamId, playerId: cut.playerId, ballReason: cut.kind })
          busy.add(cut.playerId)
        }
      }
    }
    if (driveActive !== undefined && !moves.some((move) => move.kind === 'DRIFT')) {
      const drifts = pickDrifts(state, driveActive.playerId, basket, busy)
      if (drifts.length > 0) {
        moves = [...moves, ...drifts]
        state = { ...state, offenseFlow: { ...state.offenseFlow!, moves } }
        for (const drift of drifts) state = emitEvent(state, 'offBallMove', { teamId: drift.teamId, playerId: drift.playerId, ballReason: drift.kind })
      }
    }
  }

  // Apply the intents of every active move (owner 'action': they override the structural slot intent).
  for (const move of state.offenseFlow!.moves) {
    const responsibility = state.responsibilities.find((item) => item.playerId === move.playerId && item.owner !== 'defensiveStructure')
    if (!responsibility) continue
    const player = state.players.find((candidate) => candidate.playerId === move.playerId)
    // The shooter of a pin-down waits (setting up his man) until the screener is there, then comes off it.
    const released = move.kind !== 'COME_OFF' || pinDownSet(state, move)
    const target = released ? move.target : player?.position ?? move.target
    const intent: MovementIntent = {
      playerId: move.playerId, target: { ...target }, urgency: move.kind === 'BASKET_CUT' || move.kind === 'BACKDOOR_CUT' || move.kind === 'OFFER' || move.kind === 'COME_OFF' || move.kind === 'PIN_DOWN' ? 'sprint' : 'run',
      facing: move.kind === 'BASKET_CUT' || move.kind === 'BACKDOOR_CUT' ? { kind: 'BASKET' } : { kind: 'BALL' },
      provenance: { responsibilityId: responsibility.id, decisionId: state.decisions.find((item) => item.playerId === move.playerId && item.responsibilityId === responsibility.id)?.id ?? `move-${move.playerId}`, owner: 'action' },
    }
    state = { ...state, movementIntents: [...state.movementIntents.filter((item) => item.playerId !== move.playerId), intent] }
    if (move.kind === 'COME_OFF' && released) state = trailAroundScreen(state, move)
  }
  return state
}

function pinDownSet(state: MatchState, move: OffBallMove): boolean {
  const screener = state.players.find((candidate) => candidate.playerId === move.partnerId)
  return move.screenPoint === undefined || screener === undefined || distanceBetween(screener.position, move.screenPoint) <= PIN_DOWN_SET_METERS || state.t - move.startedT >= 16
}

/**
 * The shooter's defender is behind the screener's body: he has to go around it (trail), which costs him the step the shooter needs.
 * Once he is past the screener, or the shooter is gone, his own structure takes him back.
 */
function trailAroundScreen(state: MatchState, move: OffBallMove): MatchState {
  const shooter = state.players.find((candidate) => candidate.playerId === move.playerId)
  const screener = state.players.find((candidate) => candidate.playerId === move.partnerId)
  const defender = shooter === undefined ? undefined : guardOf(state, shooter)
  if (shooter === undefined || screener === undefined || defender === undefined) return state
  const toDestination = { x: move.target.x - screener.position.x, y: move.target.y - screener.position.y }
  const length = Math.hypot(toDestination.x, toDestination.y) || 1
  const along = ((defender.position.x - screener.position.x) * toDestination.x + (defender.position.y - screener.position.y) * toDestination.y) / length
  if (along > 0.4 || distanceBetween(defender.position, screener.position) > 2.4) return state
  const away = { x: -toDestination.x / length, y: -toDestination.y / length }
  const side = { x: -away.y, y: away.x }
  const sign = (defender.position.x - screener.position.x) * side.x + (defender.position.y - screener.position.y) * side.y >= 0 ? 1 : -1
  const detour = { x: screener.position.x + side.x * sign * 1.1 + away.x * 0.3, y: screener.position.y + side.y * sign * 1.1 + away.y * 0.3 }
  const base = state.movementIntents.find((item) => item.playerId === defender.playerId)
  if (base === undefined) return state
  return { ...state, movementIntents: [...state.movementIntents.filter((item) => item.playerId !== defender.playerId), { ...base, target: detour, urgency: 'run' }] }
}

/**
 * A pin-down: the screener walks into the path of the shooter's defender and the shooter comes off him toward the ball, onto the arc.
 * Only for the set's shooter and screener, when neither has the ball, both are free and the shooter's man is close enough to be screened.
 */
function pickPinDown(state: MatchState, holder: MatchPlayerState, basket: CourtPosition, busy: ReadonlySet<PlayerId>, shooterId: PlayerId | undefined, screenerId: PlayerId | undefined): OffBallMove[] | undefined {
  const shooter = state.players.find((player) => player.active && player.playerId === shooterId && player.teamId === holder.teamId)
  const screener = state.players.find((player) => player.active && player.playerId === screenerId && player.teamId === holder.teamId)
  if (shooter === undefined || screener === undefined || shooter.playerId === holder.playerId || screener.playerId === holder.playerId || busy.has(shooter.playerId) || busy.has(screener.playerId)) return undefined
  const defender = guardOf(state, shooter)
  if (defender === undefined || distanceBetween(defender.position, shooter.position) > 2.6) return undefined
  const arc = state.court.threePointLine.arcRadiusMeters + 0.7
  const angle = Math.atan2(shooter.position.y - basket.y, shooter.position.x - basket.x)
  const holderAngle = Math.atan2(holder.position.y - basket.y, holder.position.x - basket.x)
  // Come off toward the ball (a catch facing the basket), about 0.6 rad along the arc.
  const delta = Math.sign(Math.atan2(Math.sin(holderAngle - angle), Math.cos(holderAngle - angle))) || 1
  const destination = { x: Math.max(0.8, Math.min(state.court.lengthMeters - 0.8, basket.x + Math.cos(angle + delta * 0.6) * arc)), y: Math.max(0.8, Math.min(state.court.widthMeters - 0.8, basket.y + Math.sin(angle + delta * 0.6) * arc)) }
  if (distanceBetween(destination, holder.position) < 3.5 || distanceBetween(screener.position, shooter.position) > 11) return undefined
  // The screen goes on the defender's side of the shooter, a step toward where the shooter is going.
  const screenPoint = { x: (shooter.position.x + defender.position.x) / 2 + (destination.x - shooter.position.x) * 0.2, y: (shooter.position.y + defender.position.y) / 2 + (destination.y - shooter.position.y) * 0.2 }
  return [
    { playerId: screener.playerId, teamId: screener.teamId, kind: 'PIN_DOWN', target: screenPoint, startedT: state.t, endsT: state.t + PIN_DOWN_MAX_TICKS, reason: 'Screen the shooter\'s man so he comes off free', partnerId: shooter.playerId, screenPoint },
    { playerId: shooter.playerId, teamId: shooter.teamId, kind: 'COME_OFF', target: destination, startedT: state.t, endsT: state.t + PIN_DOWN_MAX_TICKS + COME_OFF_MAX_TICKS, reason: 'Come off the pin-down toward the ball for the catch', partnerId: screener.playerId, screenPoint },
  ]
}

function stillValid(state: MatchState, move: OffBallMove): boolean {
  const player = state.players.find((candidate) => candidate.playerId === move.playerId)
  if (!player || !player.active) return false
  // A cut ends when the cutter has arrived; a drift ends with the drive that caused it.
  if (move.kind === 'BASKET_CUT' || move.kind === 'BACKDOOR_CUT') return distanceBetween(player.position, move.target) > 0.8 && state.ball.kind !== 'SHOT_IN_FLIGHT'
  if (move.kind === 'OFFER') return distanceBetween(player.position, move.target) > 0.7 && state.ball.kind === 'HELD' && state.ball.ownerTeamId === player.teamId
  // The pin-down holds until the shooter has come off it; the shooter's move ends at his spot or when the ball leaves the team.
  if (move.kind === 'PIN_DOWN') return state.ball.kind === 'HELD' && state.ball.ownerTeamId === player.teamId && (state.offenseFlow?.moves.some((other) => other.kind === 'COME_OFF' && other.playerId === move.partnerId) ?? false)
  if (move.kind === 'COME_OFF') {
    const ballWithTeam = (state.ball.kind === 'HELD' && state.ball.ownerTeamId === player.teamId) || (state.ball.kind === 'PASS_IN_FLIGHT' && state.ball.passerTeamId === player.teamId)
    const hasBall = state.ball.kind === 'HELD' && state.ball.ownerPlayerId === player.playerId
    return distanceBetween(player.position, move.target) > 0.8 && ballWithTeam && !hasBall
  }
  return state.actions.some((action) => action.kind === 'DRIVE' && action.status === 'ACTIVE' && action.teamId === player.teamId)
}

/**
 * A teammate comes to the ball: a spot about five metres from the handler, to one side, where no defender stands on the passing
 * line, away from the defenders, inside the court. The nearest teammate who can get there takes it.
 */
function pickOffer(state: MatchState, holder: MatchPlayerState, basket: CourtPosition, busy: ReadonlySet<PlayerId>): OffBallMove | undefined {
  const toBasket = { x: basket.x - holder.position.x, y: basket.y - holder.position.y }
  const length = Math.hypot(toBasket.x, toBasket.y) || 1
  const u = { x: toBasket.x / length, y: toBasket.y / length }
  const defenders = state.players.filter((player) => player.active && player.teamId !== holder.teamId)
  let best: { move: OffBallMove; score: number } | undefined
  for (const angle of [Math.PI / 2, -Math.PI / 2, (3 * Math.PI) / 4, (-3 * Math.PI) / 4, Math.PI / 4, -Math.PI / 4]) {
    const c = Math.cos(angle)
    const si = Math.sin(angle)
    const target = { x: holder.position.x + (u.x * c - u.y * si) * OFFER_DISTANCE_METERS, y: holder.position.y + (u.x * si + u.y * c) * OFFER_DISTANCE_METERS }
    if (target.x < 1 || target.x > state.court.lengthMeters - 1 || target.y < 1 || target.y > state.court.widthMeters - 1) continue
    const laneClearance = Math.min(...defenders.map((d) => distanceToSegment(d.position, holder.position, target)), 99)
    const room = Math.min(...defenders.map((d) => distanceBetween(d.position, target)), 99)
    if (laneClearance < 1.1) continue
    for (const mate of state.players) {
      if (!mate.active || mate.teamId !== holder.teamId || mate.playerId === holder.playerId || busy.has(mate.playerId)) continue
      const travel = distanceBetween(mate.position, target)
      if (travel > 13) continue
      const score = Math.min(room, 3) * 1.2 + Math.min(laneClearance, 3) - travel * 0.35
      if (best === undefined || score > best.score) best = { score, move: { playerId: mate.playerId, teamId: mate.teamId, kind: 'OFFER', target, startedT: state.t, endsT: state.t + OFFER_MAX_TICKS, reason: 'Come to the ball: the handler has no outlet' } }
    }
  }
  return best?.move
}

function pickCut(state: MatchState, holder: MatchPlayerState, basket: CourtPosition, busy: ReadonlySet<PlayerId>, sagDistance: number = SAG_DISTANCE_METERS): OffBallMove | undefined {
  let best: { move: OffBallMove; score: number } | undefined
  for (const cutter of state.players) {
    if (!cutter.active || cutter.teamId !== holder.teamId || cutter.playerId === holder.playerId || busy.has(cutter.playerId)) continue
    const distanceToBasket = distanceBetween(cutter.position, basket)
    if (distanceToBasket > CUT_MAX_DISTANCE_METERS || distanceToBasket < 3) continue
    const defender = guardOf(state, cutter)
    if (defender === undefined) continue
    const gap = distanceBetween(defender.position, cutter.position)
    const towardBall = { x: state.ball.position.x - cutter.position.x, y: state.ball.position.y - cutter.position.y }
    const ballDistance = Math.hypot(towardBall.x, towardBall.y)
    if (ballDistance < 1e-6 || ballDistance > 14) continue
    const denialAlignment = ((defender.position.x - cutter.position.x) * towardBall.x + (defender.position.y - cutter.position.y) * towardBall.y) / (ballDistance * Math.max(gap, 1e-6))
    const denying = gap <= DENIAL_DISTANCE_METERS && denialAlignment > 0.55
    const sagging = gap >= sagDistance
    if (!denying && !sagging) continue
    const target = cutTarget(state, cutter, basket)
    // The lane to the rim must be open (the man who is being cut past does not count against a backdoor cut).
    const blocked = state.players.some((other) => other.active && other.teamId !== cutter.teamId && other.playerId !== defender.playerId
      && distanceToSegment(other.position, cutter.position, target) < CUT_LANE_CLEARANCE_METERS)
    if (blocked) continue
    // Sagging defenders cut off the rim themselves: they only make a cut sensible when they are well away from the lane.
    if (sagging && distanceToSegment(defender.position, cutter.position, target) < CUT_LANE_CLEARANCE_METERS * 0.8) continue
    const passLaneClear = !state.players.some((other) => other.active && other.teamId !== cutter.teamId && distanceToSegment(other.position, holder.position, target) < 0.9)
    if (!passLaneClear) continue
    const arrival = nearestDefenderDistance(state, cutter.teamId, target)
    const score = (denying ? 1.0 : 0.6) + arrival * 0.15 - distanceToBasket * 0.04 + decisionNoise(state, cutter.playerId, 'cut') * 0.15
    if (best === undefined || score > best.score) {
      best = {
        score,
        move: { playerId: cutter.playerId, teamId: cutter.teamId, kind: denying ? 'BACKDOOR_CUT' : 'BASKET_CUT', target, startedT: state.t, endsT: state.t + CUT_MAX_TICKS,
          reason: denying ? 'His defender denies the pass: cut backdoor behind him' : 'His defender sagged off: cut to the rim through the open lane' },
      }
    }
  }
  return best?.move
}

function pickDrifts(state: MatchState, driverId: PlayerId, basket: CourtPosition, busy: ReadonlySet<PlayerId>): OffBallMove[] {
  const driver = state.players.find((player) => player.playerId === driverId)
  if (!driver) return []
  const arc = state.court.threePointLine.arcRadiusMeters + 0.4
  const moves: OffBallMove[] = []
  for (const player of state.players) {
    if (!player.active || player.teamId !== driver.teamId || player.playerId === driverId || busy.has(player.playerId)) continue
    const distanceToBasket = distanceBetween(player.position, basket)
    // Only true spacers drift: players on or near the arc, not the ones already cutting or inside.
    if (distanceToBasket < arc - 1.2 || distanceToBasket > arc + 2.5) continue
    const current = nearestDefenderDistance(state, player.teamId, player.position)
    const angle = Math.atan2(player.position.y - basket.y, player.position.x - basket.x)
    let bestTarget: CourtPosition | undefined
    let bestScore = current + DRIFT_MIN_IMPROVEMENT_METERS
    for (const sign of [-1, 1]) {
      const shifted = angle + sign * (DRIFT_SHIFT_METERS / arc)
      const target: CourtPosition = {
        x: Math.max(0.6, Math.min(state.court.lengthMeters - 0.6, basket.x + Math.cos(shifted) * Math.max(arc, distanceToBasket))),
        y: Math.max(0.6, Math.min(state.court.widthMeters - 0.6, basket.y + Math.sin(shifted) * Math.max(arc, distanceToBasket))),
      }
      if (distanceBetween(target, driver.position) < 3) continue
      const score = nearestDefenderDistance(state, player.teamId, target)
      if (score > bestScore) { bestScore = score; bestTarget = target }
    }
    if (bestTarget !== undefined) moves.push({ playerId: player.playerId, teamId: player.teamId, kind: 'DRIFT', target: bestTarget, startedT: state.t, endsT: state.t + DRIFT_MAX_TICKS, reason: 'A teammate is driving: slide into the gap the help defense left open' })
  }
  return moves
}
