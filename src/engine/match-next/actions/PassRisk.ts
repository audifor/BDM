/**
 * BT4.5 pass risk, in three separate layers that the decision (what the passer perceives) and the physics (what happens) share:
 *
 *  1. SELECTION  - should he throw it? The value of the receiver's look minus what a lost ball costs, with the risk as the passer perceives it.
 *  2. EXECUTION  - can he throw it where he means to? Skill, distance, a defender on him, a receiver who is running.
 *  3. INTERCEPTION - can a defender physically be on the line before the ball passes? Time to the line against time of the ball, not distance alone.
 *
 * Nothing here is a rating: everything is derived from the spatial state and the existing Player Truth ratings.
 */
import { distanceBetween, type CourtPosition } from '@/domain/court'
import type { MatchPlayerState, MatchState } from '../state'
import { tuning } from '../tuning'

/** Where the ball is in the lane before this fraction of its flight (just left the passer) or after this one (at the receiver) nobody intercepts it. */
const LANE_START = 0.08
const LANE_END = 0.97
/** A defender this close to the line of the ball has his body (and hands) in it already. */
const BODY_IN_LANE_METERS = 0.45
/** A defender this close to the passer is on him: his hands cover the release. */
const ON_PASSER_METERS = 1.25
/** BT6.1: defenders this close to the receiver the passer is reading are seen in full (their momentum included). */
const WATCHED_RADIUS_METERS = 2.5
/** BT6.1: share of a defender's momentum any passer reads; vision reads the rest. */
const MOMENTUM_SEEN_FLOOR = 0.7

export interface LaneRead {
  readonly defender: MatchPlayerState | null
  /** Ball time at the point of the line minus the defender's time to have a hand there: > 0 means he can be there first. */
  readonly slack: number
  /** Point of the line where the ball passes the best placed defender. */
  readonly point: CourtPosition
  /** Share of the flight at which the ball passes that point. */
  readonly progress: number
  /** Defenders that can be on the line before the ball passes. */
  readonly threats: number
  /** Smallest perpendicular distance of any defender to the line (the old, static read; kept for the audit). */
  readonly minPerpendicular: number
}

/**
 * BT6.1: where a pass to this receiver is actually thrown: where he will be when the ball arrives (his current motion over the flight). The
 * thrower aims there (ActionCore), so the passer's read of the lane and of the look must be made there too: a cutter's lane is the line to
 * the spot he is cutting to, not to where he stands now.
 */
export function catchPoint(passer: MatchPlayerState, receiver: MatchPlayerState, court: MatchState['court']): CourtPosition {
  const distance = distanceBetween(passer.position, receiver.position)
  const seconds = passTravelTicks(distance) / 10
  return {
    x: Math.max(0.25, Math.min(court.lengthMeters - 0.25, receiver.position.x + receiver.velocity.x * seconds)),
    y: Math.max(0.25, Math.min(court.widthMeters - 0.25, receiver.position.y + receiver.velocity.y * seconds)),
  }
}

/** Ticks a pass of this length is in the air (the physics' own rule). */
export function passTravelTicks(distance: number): number {
  return Math.max(2, Math.min(8, Math.ceil(distance)))
}

export function ballFlightSeconds(distance: number): number {
  const ticks = Math.max(2, Math.min(8, Math.ceil(distance)))
  return ticks / 10
}

/** How quickly a defender reads and reacts to a ball in the air: hands and anticipation (steal), not speed. */
export function reactionSeconds(defender: MatchPlayerState): number {
  return tuning().passReactionSeconds * (1.25 - (defender.defense.steal ?? 50) / 200)
}

/**
 * Whether a defender can have a hand on the line before the ball passes, from where he is and how he is moving.
 * `awareness` (0..1) is how much of his movement the reader sees: a passer with great vision reads the defender already sliding into the lane.
 */
export function laneRead(state: MatchState, from: CourtPosition, to: CourtPosition, passerTeamId: MatchPlayerState['teamId'], flightSeconds: number, awareness = 1, watched?: CourtPosition): LaneRead {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length2 = dx * dx + dy * dy
  let best: MatchPlayerState | null = null
  let bestSlack = Number.NEGATIVE_INFINITY
  let bestPoint: CourtPosition = { ...to }
  let bestProgress = 1
  let threats = 0
  let minPerpendicular = Number.POSITIVE_INFINITY
  for (const defender of state.players) {
    if (!defender.active || defender.teamId === passerTeamId) continue
    const u = length2 < 1e-9 ? 1 : Math.max(0, Math.min(1, ((defender.position.x - from.x) * dx + (defender.position.y - from.y) * dy) / length2))
    const point = { x: from.x + u * dx, y: from.y + u * dy }
    const perpendicular = distanceBetween(defender.position, point)
    minPerpendicular = Math.min(minPerpendicular, perpendicular)
    // BT6.8: a defender on the passer (hands up, in his face) can get a hand on the ball from the moment it leaves: a pressured passer has to
    // throw around him. Every other defender can only reach the ball once it is on its way.
    const onPasser = distanceBetween(defender.position, from) <= ON_PASSER_METERS
    if ((u <= LANE_START && !onPasser) || u >= LANE_END) continue
    const reach = defender.wingspanCm / 200
    // Already moving toward the line: his current speed toward it counts (what an elite reader sees coming).
    const towardX = (point.x - defender.position.x) / Math.max(1e-6, perpendicular)
    const towardY = (point.y - defender.position.y) / Math.max(1e-6, perpendicular)
    // BT6.1: the man running with the receiver is seen in full (the passer is looking at that receiver); the rest by his vision.
    const seen = watched !== undefined && distanceBetween(defender.position, watched) <= WATCHED_RADIUS_METERS ? 1 : awareness
    const momentum = Math.max(0, defender.velocity.x * towardX + defender.velocity.y * towardY) * seen
    const closing = Math.max(0.5, defender.kinematics.maxSpeedMps * 0.85 * (0.92 + defender.defensiveMobility / 600) + momentum * 0.5)
    // A defender whose hands are already on the line does not need to react: only the distance he still has to cover beyond his reach costs time,
    // and the reaction is needed in proportion to how far from the line he starts (none within BODY_IN_LANE_METERS, all of it at his full reach).
    const reactionShare = Math.max(0, Math.min(1, (perpendicular - BODY_IN_LANE_METERS) / Math.max(0.1, reach - BODY_IN_LANE_METERS)))
    const toLine = reactionSeconds(defender) * reactionShare + Math.max(0, perpendicular - reach) / closing
    const slack = u * flightSeconds - toLine
    if (slack > 0) threats += 1
    if (slack > bestSlack) { bestSlack = slack; best = defender; bestPoint = point; bestProgress = u }
  }
  return { defender: best, slack: Number.isFinite(bestSlack) ? bestSlack : -9, point: bestPoint, progress: bestProgress, threats, minPerpendicular: Number.isFinite(minPerpendicular) ? minPerpendicular : 99 }
}

/** Chance that the defender who can reach the line goes for the ball (the physics then decides whether he gets it). */
export function interceptAttemptChance(read: LaneRead): number {
  if (read.defender === null || read.slack <= -0.02) return 0
  const hands = 0.6 + (read.defender.defense.steal ?? 50) / 125
  const reach = 1 - Math.exp(-(read.slack + 0.02) / tuning().passInterceptSlackScale)
  const gamble = tuning().passInterceptMax * reach * hands
  // BT6.11: a defender who is on the line well before the ball is not gambling: he is standing in the lane, and he takes it (his hands
  // decide whether it is a catch or a tip). Only a ball that barely beats him or arrives with him is a gamble.
  const there = Math.max(0, Math.min(1, (read.slack - tuning().passLaneOwnedSlack) / 0.35)) * Math.min(1, hands / 1.27) * 0.85
  return Math.min(0.95, Math.max(gamble, there))
}

/** What the passer perceives: a poor reader underestimates how fast a defender gets to the line; an elite reader sees it all. */
export function perceivedLaneRead(state: MatchState, passer: MatchPlayerState, from: CourtPosition, to: CourtPosition, flightSeconds: number, watched?: CourtPosition): LaneRead {
  const vision = passer.passing.vision / 100
  // BT6.1: every passer sees that men are running (most of their momentum); vision adds the rest and reads how soon they get to the line
  // (the slack bias below). Scaling momentum by vision from zero made a 0.7 passer blind to 30% of a retreating defender's speed.
  const read = laneRead(state, from, to, passer.teamId, flightSeconds, MOMENTUM_SEEN_FLOOR + (1 - MOMENTUM_SEEN_FLOOR) * vision, watched)
  return { ...read, slack: read.slack - (1 - vision) * tuning().passPerceptionBiasSeconds }
}

/** Probability that the throw itself goes wrong: where the ball ends is not where the receiver is. */
export function passExecutionError(state: MatchState, passer: MatchPlayerState, receiver: MatchPlayerState, distance: number): number {
  const skill = ((passer.passing.accuracy * 0.6 + passer.passing.timing * 0.4) - passer.fatigue * 0.06)
  const skillFactor = 1.6 - 1.2 * Math.max(0, Math.min(100, skill)) / 100
  // A defender on the passer (hands up, in his face) makes any pass harder.
  const onHim = Math.min(...state.players.filter((player) => player.active && player.teamId !== passer.teamId).map((player) => distanceBetween(player.position, passer.position)), 9)
  const pressure = Math.max(0, (1.6 - onHim) / 1.6)
  const speed = Math.hypot(receiver.velocity.x, receiver.velocity.y)
  const difficulty = 1 + 0.07 * Math.max(0, distance - 6) + 0.9 * pressure + 0.12 * speed
  return Math.max(0.002, Math.min(0.25, tuning().passErrorBase * skillFactor * difficulty))
}

/** The old 0.28..0.94 "pass quality" (catch radius, events): now the execution quality only, the lane is no longer part of it. */
export function executionQuality(errorProbability: number): number {
  return Math.max(0.28, Math.min(0.94, 0.94 - (errorProbability - 0.01) / 0.16))
}

/**
 * Whether the receiver is really available: a defender on top of him or standing between him and the passer takes the catch away
 * even when the line is clear. 0 = wide open, 1 = denied.
 */
export function receiverDenial(state: MatchState, passer: MatchPlayerState, receiver: MatchPlayerState): number {
  const toReceiver = distanceBetween(passer.position, receiver.position)
  let denial = 0
  for (const defender of state.players) {
    if (!defender.active || defender.teamId === passer.teamId) continue
    const close = distanceBetween(defender.position, receiver.position)
    if (close > 2) continue
    const inFront = distanceBetween(defender.position, passer.position) < toReceiver - 0.4
    denial = Math.max(denial, (2 - close) / 2 * (inFront ? 1 : 0.35))
  }
  return denial
}
