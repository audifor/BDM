import { distanceBetween, type CourtPosition } from '@/domain/court'
import type { PlayerId } from '@/domain/ids'
import { emitEvent } from '../events'
import type { MovementIntent } from '../movement/MovementIntent'
import { activePossession, type MatchPlayerState, type MatchState, type OffBallMove } from '../state'
import { attackingBasketForTeam } from '../structure/FiveOutStructure'
import { decisionNoise } from './OffenseFlow'

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
const MAX_CUTS_PER_POSSESSION = 3
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

  if (holder !== undefined && halfCourt && state.t % EVALUATION_PERIOD_TICKS === 0 && state.t >= flow.readyAtT - 2) {
    if (driveActive === undefined && flow.stage === 'HALF_COURT' && flow.settledAtT !== null) {
      const cutsSoFar = state.events.filter((event) => event.type === 'offBallMove' && event.t >= possession.startedT && (event.ballReason === 'BASKET_CUT' || event.ballReason === 'BACKDOOR_CUT')).length
      if (cutsSoFar < MAX_CUTS_PER_POSSESSION && !moves.some((move) => move.kind === 'BASKET_CUT' || move.kind === 'BACKDOOR_CUT')) {
        const cut = pickCut(state, holder, basket, busy)
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
    const intent: MovementIntent = {
      playerId: move.playerId, target: { ...move.target }, urgency: move.kind === 'BASKET_CUT' || move.kind === 'BACKDOOR_CUT' ? 'sprint' : 'run',
      facing: move.kind === 'BASKET_CUT' || move.kind === 'BACKDOOR_CUT' ? { kind: 'BASKET' } : { kind: 'BALL' },
      provenance: { responsibilityId: responsibility.id, decisionId: state.decisions.find((item) => item.playerId === move.playerId && item.responsibilityId === responsibility.id)?.id ?? `move-${move.playerId}`, owner: 'action' },
    }
    state = { ...state, movementIntents: [...state.movementIntents.filter((item) => item.playerId !== move.playerId), intent] }
  }
  return state
}

function stillValid(state: MatchState, move: OffBallMove): boolean {
  const player = state.players.find((candidate) => candidate.playerId === move.playerId)
  if (!player || !player.active) return false
  // A cut ends when the cutter has arrived; a drift ends with the drive that caused it.
  if (move.kind === 'BASKET_CUT' || move.kind === 'BACKDOOR_CUT') return distanceBetween(player.position, move.target) > 0.8 && state.ball.kind !== 'SHOT_IN_FLIGHT'
  return state.actions.some((action) => action.kind === 'DRIVE' && action.status === 'ACTIVE' && action.teamId === player.teamId)
}

function pickCut(state: MatchState, holder: MatchPlayerState, basket: CourtPosition, busy: ReadonlySet<PlayerId>): OffBallMove | undefined {
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
    const sagging = gap >= SAG_DISTANCE_METERS
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
