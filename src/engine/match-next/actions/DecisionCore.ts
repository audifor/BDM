import { distanceBetween, isBeyondThreePointLine, type CourtPosition } from '@/domain/court'
import type { PlayerId } from '@/domain/ids'
import type { MatchDecision, MatchDecisionKind } from './ActionState'
import { decisionNoise } from './OffenseFlow'
import { activePossession, type MatchPlayerState, type MatchState, type ScreenState } from '../state'
import { planScreen, SCREEN_MIN_SECONDS_LEFT } from './ScreenCore'
import { attackingBasketForTeam } from '../structure/FiveOutStructure'
import { isInOffensiveFrontcourt } from '../structure/OffensiveStructure'

export interface ShotContest {
  readonly score: number
  readonly defenderPlayerId: PlayerId | null
  readonly distanceMeters: number | null
}

/** Typical points a half-court possession is worth when the offense keeps working (league-typical ~1.0 PPP). */
export const CONTINUATION_VALUE_POINTS = 0.98
/** Below this many seconds the offense has no possession left to "continue": any shot beats a violation. */
const CLOCK_EXHAUSTED_SECONDS = 2.2
/** Seconds over which the value of continuing decays to nothing as the clock runs out. */
const CLOCK_PRESSURE_SPAN_SECONDS = 12.5
/** A look at least this valuable is taken even before the offense is set (a genuinely open look). */
export const OPEN_LOOK_VALUE_POINTS = 1.2
const HOLD_DISCOUNT = 0.95
/** Below this many seconds an unsettled offense may no longer wait to be organised. */
const UNSETTLED_HOLD_MIN_SECONDS = 9

export function shotValueAt(position: CourtPosition, basket: CourtPosition, state: Pick<MatchState, 'court'>): 2 | 3 {
  return isBeyondThreePointLine(position, basket, state.court) ? 3 : 2
}

export function estimateShotContest(state: MatchState, shooterPlayerId: PlayerId): ShotContest {
  const shooter = state.players.find((player) => player.playerId === shooterPlayerId)
  if (!shooter) return { score: 0, defenderPlayerId: null, distanceMeters: null }
  return estimateContestAt(state, shooter.teamId, shooter.position)
}

/** Contest a shooter of `teamId` would face standing at `position` given where the defenders are right now. */
export function estimateContestAt(state: MatchState, teamId: MatchPlayerState['teamId'], position: CourtPosition): ShotContest {
  const closest = state.players
    .filter((player) => player.active && player.teamId !== teamId)
    .map((defender) => {
      // A defender who is closing out keeps coming while the shot goes up: his hand arrives where he is heading.
      const reach = distanceBetween({ x: defender.position.x + defender.velocity.x * CONTEST_LOOKAHEAD_SECONDS, y: defender.position.y + defender.velocity.y * CONTEST_LOOKAHEAD_SECONDS }, position)
      const effective = Math.min(distanceBetween(defender.position, position), reach)
      return {
        defender,
        distance: distanceBetween(defender.position, position),
        score: clamp((3.4 - effective) / 2.8, 0, 1)
          * (0.6 + clamp(defender.defense.pointOfAttack - defender.fatigue * 0.08, 0, 100) / 250),
      }
    })
    .sort((left, right) => right.score - left.score || String(left.defender.playerId).localeCompare(String(right.defender.playerId)))[0]
  return closest
    ? { score: closest.score, defenderPlayerId: closest.defender.playerId, distanceMeters: closest.distance }
    : { score: 0, defenderPlayerId: null, distanceMeters: null }
}

/** How far ahead (seconds) a closing defender's contest is projected: the shot takes time to leave the shooter's hands. */
const CONTEST_LOOKAHEAD_SECONDS = 0.3

/** Beyond this distance from the basket a three-pointer gets harder with every metre (arc is 6.75 m, corner 6.6 m). */
const THREE_POINT_COMFORT_DISTANCE_METERS = 7.4

export function shotMakeProbability(shooting: number, distanceMeters: number, points: 2 | 3, contestScore: number, fatigue = 0): number {
  const base = points === 3 ? 0.35 : distanceMeters <= 2.2 ? 0.66 : distanceMeters <= 5 ? 0.53 : 0.44
  const ratingEffect = (clamp(shooting - clamp(fatigue, 0, 100) * 0.08, 0, 100) - 50) * 0.004
  const longTwoPenalty = points === 2 ? Math.max(0, distanceMeters - 5) * 0.012 : 0
  const deepThreePenalty = points === 3 ? Math.max(0, distanceMeters - THREE_POINT_COMFORT_DISTANCE_METERS) * 0.035 : 0
  return clamp(base + ratingEffect - longTwoPenalty - deepThreePenalty - clamp(contestScore, 0, 1) * 0.28, 0.04, 0.82)
}

export function passQuality(state: MatchState, passer: MatchPlayerState, receiver: MatchPlayerState): number {
  const average = (passer.passing.accuracy + passer.passing.vision + passer.passing.timing) / 3
  const laneDistance = Math.min(...state.players
    .filter((player) => player.active && player.teamId !== passer.teamId)
    .map((player) => distanceToSegment(player.position, passer.position, receiver.position)), Number.POSITIVE_INFINITY)
  const pressure = clamp((2.1 - laneDistance) / 2.1, 0, 1)
  const effectivePassing = average - passer.fatigue * 0.06
  return clamp(0.55 + (clamp(effectivePassing, 0, 100) - 50) * 0.004 - pressure * 0.22, 0.28, 0.94)
}

export interface DecisionRead {
  readonly decision: MatchDecision | null
  /** When the handler chose to keep reading instead of acting, the tick of his next read. */
  readonly holdUntilT?: number
}

/** Selects one possession action from current MatchState and the completed action that led here. */
export function selectDecision(state: MatchState): MatchDecision | null {
  return readDecision(state).decision
}

/** Expected points of the possession if the offense keeps working: falls as the clock runs out. */
export function continuationValue(state: MatchState): number {
  const shotClock = state.shotClockTenths === null ? state.clockRules.shotClockSeconds : state.shotClockTenths / 10
  const seconds = Math.min(shotClock, state.gameClockTenths / 10)
  return CONTINUATION_VALUE_POINTS * clamp((seconds - CLOCK_EXHAUSTED_SECONDS) / CLOCK_PRESSURE_SPAN_SECONDS, 0, 1)
}

export interface ShotOpportunity {
  readonly points: 2 | 3
  readonly probability: number
  /** Expected points: probability x value, shaped by the team's shot profile. */
  readonly value: number
  readonly distanceMeters: number
  readonly contestScore: number
}

/** A shot OPPORTUNITY: what taking a shot from `position` would be worth. Whether to take it is decided elsewhere. */
export function evaluateShotOpportunity(state: MatchState, shooter: MatchPlayerState, position: CourtPosition, basket: CourtPosition, contestScore: number): ShotOpportunity {
  const points = shotValueAt(position, basket, state)
  const distanceMeters = distanceBetween(position, basket)
  const probability = shotMakeProbability(shooter.offense.shooting, distanceMeters, points, contestScore, shooter.fatigue)
  const plan = shooter.teamId === state.homeTeamId ? state.tacticalPlans.home : state.tacticalPlans.away
  const preference = points === 3 ? plan.shotProfile.threePoint : distanceMeters <= 2.2 ? plan.shotProfile.rim : plan.shotProfile.midRange
  return { points, probability, value: probability * points * (1 + preference * 0.03), distanceMeters, contestScore }
}

interface ReceiverRead {
  readonly player: MatchPlayerState
  readonly opportunity: ShotOpportunity
  readonly completion: number
  /** Expected points of passing to him: he must catch it and then still get the shot. */
  readonly value: number
}

/** Time the receiver needs after the ball leaves the passer's hands: read, gather and release (seconds). */
const CATCH_TO_RELEASE_SECONDS = 0.8
/** A defender never closes out in a straight line at full speed: this share of his top speed becomes distance covered. */
const CLOSEOUT_EFFICIENCY = 0.40
/** Defenders start closing out only after they have seen the pass leave (seconds). */
const CLOSEOUT_REACTION_SECONDS = 0.3

/**
 * How contested the receiver's shot will be when it is released: every defender keeps running at him while the ball is in
 * the air and while he gathers, so a long pass to a "wide open" shooter arrives with the closeout already there.
 */
function predictContestAfterPass(state: MatchState, passer: MatchPlayerState, receiver: MatchPlayerState): number {
  const flightSeconds = Math.max(0.2, Math.min(0.8, distanceBetween(passer.position, receiver.position) / 10))
  const seconds = Math.max(0, flightSeconds + CATCH_TO_RELEASE_SECONDS - CLOSEOUT_REACTION_SECONDS)
  let worst = 0
  for (const defender of state.players) {
    if (!defender.active || defender.teamId === receiver.teamId) continue
    const closing = defender.kinematics.maxSpeedMps * (1 - defender.fatigue * 0.0012) * CLOSEOUT_EFFICIENCY * seconds
    const distance = Math.max(0, distanceBetween(defender.position, receiver.position) - closing)
    const score = clamp((3.4 - distance) / 2.8, 0, 1) * (0.6 + clamp(defender.defense.pointOfAttack - defender.fatigue * 0.08, 0, 100) / 250)
    worst = Math.max(worst, score)
  }
  return worst
}

function readReceivers(state: MatchState, passer: MatchPlayerState, basket: CourtPosition): ReceiverRead[] {
  return state.players
    .filter((player) => player.active && player.teamId === passer.teamId && player.playerId !== passer.playerId)
    .map((player) => {
      const contest = predictContestAfterPass(state, passer, player)
      const opportunity = evaluateShotOpportunity(state, player, player.position, basket, contest)
      const completion = 0.72 + 0.28 * passQuality(state, passer, player)
      return { player, opportunity, completion, value: completion * opportunity.value }
    })
    .sort((left, right) => right.value - left.value || String(left.player.playerId).localeCompare(String(right.player.playerId)))
}

function guardOf(state: MatchState, attacker: MatchPlayerState): MatchPlayerState | undefined {
  const id = state.defensiveStructure?.assignments.find((item) => item.attackerPlayerId === attacker.playerId)?.defenderPlayerId
  return id === undefined ? undefined : state.players.find((player) => player.playerId === id)
}

/** Expected points of attacking the on-ball defender off the dribble (finish, or collapse the defense and pass). */
function driveValue(state: MatchState, actor: MatchPlayerState, basket: CourtPosition): number {
  const defender = guardOf(state, actor)
  const gap = defender ? distanceBetween(defender.position, actor.position) : 4
  // A defender standing on the line to the rim obstructs the drive; one who is out of position (closing out) does not.
  const lane = defender ? distanceToSegment(defender.position, actor.position, basket) : 3
  const attack = (actor.offense.rimAttack + actor.offense.creation) / 2 - actor.fatigue * 0.06
  const defend = defender ? (defender.defense.pointOfAttack + defender.defensiveMobility) / 2 : 50
  const edge = clamp((attack - defend) / 60 + (gap - 1.1) / 5 + Math.min(0.3, (lane - 0.9) * 0.15), -0.4, 0.6)
  const plan = actor.teamId === state.homeTeamId ? state.tacticalPlans.home : state.tacticalPlans.away
  // Each drive already taken this possession has the help defense more set: the next one is worth less.
  const drivesSoFar = state.actions.filter((action) => action.kind === 'DRIVE' && action.teamId === actor.teamId && action.startedT >= (activePossession(state)?.startedT ?? 0)).length
  return (0.9 + 0.9 * edge) * (1 + plan.shotProfile.rim * 0.03) * Math.pow(0.8, drivesSoFar)
}

export function readDecision(state: MatchState): DecisionRead {
  const possession = activePossession(state)
  const liveTransition = possession !== undefined && state.transition?.teamId === possession.teamId
    && (possession.phase === 'ADVANCE' || possession.phase === 'ACTION')
  if (!possession || (possession.phase !== 'SETUP' && possession.phase !== 'ACTION' && !liveTransition) || state.ball.kind !== 'HELD' || state.ball.ownerTeamId !== possession.teamId) return { decision: null }
  const ownerPlayerId = state.ball.ownerPlayerId
  const actor = state.players.find((player) => player.playerId === ownerPlayerId)
  if (!actor) return { decision: null }
  const flow = state.offenseFlow?.possessionId === possession.id ? state.offenseFlow : null
  // The handler is still gathering the ball / reading the floor: no new decision before he is ready.
  if (flow !== null && state.t < flow.readyAtT) return { decision: null }
  const basket = attackingBasketForTeam(possession.teamId, state.homeTeamId, state.period, state.court)
  if (liveTransition && state.transition?.trigger === 'madeBasketInbound'
    && !isInOffensiveFrontcourt(actor.position, basket, state.court.lengthMeters)) return { decision: null }
  if (liveTransition && state.transition?.trigger === 'defensiveRebound' && state.t - state.transition.startedT < 4) return { decision: null }
  const lastOffensive = [...state.actions].reverse().find((action) => action.teamId === possession.teamId && action.kind !== 'CLOSEOUT')
  const containedThisPossession = state.actions.some((action) => action.kind === 'DRIVE'
    && action.playerId === actor.playerId && action.teamId === possession.teamId
    && action.startedT >= possession.startedT && action.status === 'COMPLETED' && action.outcome === 'CONTAINED')
  let kind: MatchDecisionKind
  let targetPlayerId: PlayerId | undefined
  let reason: string
  let utility: MatchDecision['utility']

  const outletAlreadyCaught = state.actions.some((action) => action.teamId === possession.teamId
    && action.startedT >= (state.transition?.startedT ?? Number.POSITIVE_INFINITY)
    && (action.kind === 'PASS' || action.kind === 'KICK_OUT') && action.status === 'COMPLETED' && action.outcome === 'CAUGHT')
  const outlet = liveTransition && state.transition && !outletAlreadyCaught
    && (state.transition.trigger === 'defensiveRebound' || state.transition.advantage === 'ADVANTAGE')
    ? bestTransitionReceiver(state, actor, basket) ?? (state.transition.trigger === 'defensiveRebound' ? bestReceiver(state, actor, false) : undefined)
    : undefined

  if (outlet) {
    kind = 'PASS'
    targetPlayerId = outlet.playerId
    reason = state.transition?.trigger === 'defensiveRebound'
      ? 'Outlet the defensive rebound to a teammate advancing into open court'
      : 'Pass ahead to preserve the transition advantage'
  } else if (lastOffensive?.kind === 'SCREEN' && lastOffensive.status === 'COMPLETED' && lastOffensive.outcome === 'ARRIVED'
    && state.screen?.phase === 'SET' && state.screen.handlerId === actor.playerId) {
    // The screen is set: use it (attack off it, pull up, or move the ball); the handler cannot stand still on it.
    const read = readTheFloor(state, actor, basket, flow, containedThisPossession, 'PASS', true, state.screen)
    kind = read.kind === 'HOLD' ? 'DRIVE' : read.kind
    targetPlayerId = read.kind === 'HOLD' ? undefined : read.targetPlayerId
    reason = read.kind === 'HOLD' ? 'The screen is set: attack it' : `Off the screen: ${read.reason}`
    utility = read.kind === 'HOLD' ? undefined : read.utility
  } else if (lastOffensive?.kind === 'DRIVE' && lastOffensive.status === 'COMPLETED' && lastOffensive.playerId === actor.playerId && lastOffensive.outcome === 'FINISH') {
    // He beat his man and reached the rim without help arriving: finish.
    kind = 'SHOOT'
    reason = 'Finish the drive with a shot at the rim'
  } else if (lastOffensive?.kind === 'DRIVE' && lastOffensive.status === 'COMPLETED' && lastOffensive.playerId === actor.playerId
    && (lastOffensive.outcome === 'ADVANTAGE' || lastOffensive.outcome === 'CONTAINED')) {
    // After a drive the handler is at the rim (or stopped short): finish or move the ball, valued like any other read.
    const read = readTheFloor(state, actor, basket, flow, true, lastOffensive.outcome === 'ADVANTAGE' ? 'KICK_OUT' : 'PASS', true)
    kind = read.kind === 'HOLD' ? 'SHOOT' : read.kind
    targetPlayerId = read.kind === 'HOLD' ? undefined : read.targetPlayerId
    reason = read.kind === 'HOLD' ? 'The drive ended and there is nothing better than to finish' : `After the drive (${lastOffensive.outcome}): ${read.reason}`
    utility = read.kind === 'HOLD' ? undefined : read.utility
  } else {
    const read = readTheFloor(state, actor, basket, flow, containedThisPossession, 'PASS')
    if (read.kind === 'HOLD') return { decision: null, holdUntilT: read.holdUntilT }
    kind = read.kind
    targetPlayerId = read.targetPlayerId
    reason = read.reason
    utility = read.utility
  }

  return {
    decision: {
      id: `match-decision-${state.nextMatchDecisionSequence}`,
      kind,
      playerId: actor.playerId,
      teamId: actor.teamId,
      decidedT: state.t,
      reason,
      ...(targetPlayerId === undefined ? {} : { targetPlayerId }),
      ...(utility === undefined ? {} : { utility }),
    },
  }
}

type FloorRead =
  | { readonly kind: 'HOLD'; readonly holdUntilT: number }
  | { readonly kind: 'SHOOT' | 'CATCH_AND_SHOOT' | 'DRIVE' | 'PASS' | 'KICK_OUT' | 'SCREEN'; readonly targetPlayerId?: PlayerId; readonly reason: string; readonly utility: NonNullable<MatchDecision['utility']> }

/**
 * BT2G/BT2H: the half-court read. Every option is valued in expected points of the possession and compared with what
 * simply continuing the possession is worth; nothing here depends on the shooter's Overall or on a fixed distance.
 */
/** What the set screen is worth to the handler, given how the defense has chosen to cover it. */
function screenSeparationFor(state: MatchState, screen: ScreenState, handler: MatchPlayerState): { readonly driveGain: number; readonly contestRelief: number } {
  const screenerDefender = state.players.find((player) => player.playerId === screen.screenerDefenderId)
  switch (screen.coverage) {
    case 'switch': {
      // A switch is only good for the offense if the new defender cannot stay in front of the handler.
      const mismatch = screenerDefender === undefined ? 0 : (handler.offense.creation - screenerDefender.defensiveMobility) / 250
      return { driveGain: 0.05 + Math.max(-0.05, mismatch), contestRelief: 0.05 }
    }
    case 'drop': return { driveGain: 0.12, contestRelief: 0.22 }
    case 'hedge': return { driveGain: 0.1, contestRelief: 0.1 }
    case 'blitz': return { driveGain: -0.05, contestRelief: 0 }
  }
}

function readTheFloor(state: MatchState, actor: MatchPlayerState, basket: CourtPosition, flow: MatchState['offenseFlow'], contained: boolean, passKind: 'PASS' | 'KICK_OUT', mustAct = false, screen: ScreenState | null = null): FloorRead {
  const contest = estimateContestAt(state, actor.teamId, actor.position)
  // Off a set screen the handler's defender is about to be delayed: the pull-up is less contested than it looks now.
  const screenSeparation = screen === null ? { driveGain: 0, contestRelief: 0 } : screenSeparationFor(state, screen, actor)
  const shot = evaluateShotOpportunity(state, actor, actor.position, basket, Math.max(0, contest.score - screenSeparation.contestRelief))
  const receivers = readReceivers(state, actor, basket)
  const bestReceiver = receivers[0]
  const distanceToBasket = distanceBetween(actor.position, basket)
  const secondsLeft = Math.min(state.shotClockTenths === null ? state.clockRules.shotClockSeconds : state.shotClockTenths / 10, state.gameClockTenths / 10)
  // Actions take time: a drive needs ~3 s to develop and a pass ~1.5 s before the receiver can shoot.
  const drive = !contained && distanceToBasket > 3.2 && distanceToBasket < 14 && secondsLeft > 5 ? driveValue(state, actor, basket) + screenSeparation.driveGain : Number.NEGATIVE_INFINITY
  const screenPlan = screen === null && !contained && !mustAct && flow !== null && flow.stage === 'HALF_COURT' && flow.settledAtT !== null && secondsLeft > SCREEN_MIN_SECONDS_LEFT
    ? planScreen(state, actor, basket) : null
  const hold = continuationValue(state) * HOLD_DISCOUNT
  const noise = (salt: string): number => 1 + (decisionNoise(state, actor.playerId, salt) - 0.5) * 0.12
  const options = {
    shoot: shot.value * noise('shoot'),
    drive: drive * noise('drive'),
    // Off a set screen the handler first USES it (attack, pull up); the ball only moves early if he is being trapped.
    pass: (secondsLeft > 3.5 && (screen === null || screen.coverage === 'blitz') ? bestReceiver?.value ?? Number.NEGATIVE_INFINITY : Number.NEGATIVE_INFINITY) * noise('pass'),
    screen: (screenPlan?.value ?? Number.NEGATIVE_INFINITY) * noise('screen'),
    hold,
  }
  const utility = { shoot: round(shot.value), drive: round(Number.isFinite(drive) ? drive : 0), pass: round(bestReceiver?.value ?? 0), hold: round(hold), ...(screenPlan === null ? {} : { screen: round(screenPlan.value) }) }
  // A handler who has just finished a drive cannot "keep reading": he acts with what he has.
  const candidates = (Object.entries(options) as [keyof typeof options, number][]).filter(([name]) => !mustAct || name !== 'hold')
  const best = candidates.sort((left, right) => right[1] - left[1])[0]![0]
  const settled = flow === null || flow.settledAtT !== null
  // After an offensive rebound the floor is a scramble, not a set: the rebounder reads it as it is (putback, kick-out or reset).
  // With the clock nearly gone there is nothing left to organise: the possession must produce a look now.
  const halfCourtUnsettled = flow !== null && !settled && flow.stage === 'HALF_COURT' && secondsLeft > UNSETTLED_HOLD_MIN_SECONDS
  // Until the floor is organised only a genuinely open look justifies acting: otherwise keep reading.
  const openLook = Math.max(options.shoot, options.pass, options.drive) >= OPEN_LOOK_VALUE_POINTS
  const readAgain = state.t + 3 + Math.floor(decisionNoise(state, actor.playerId, 'hold') * 4)
  if (!mustAct && (best === 'hold' || (halfCourtUnsettled && !openLook))) return { kind: 'HOLD', holdUntilT: readAgain }
  const recentCatch = flow !== null && flow.caughtFromPass && state.t - flow.holderSinceT <= 14
  if (best === 'shoot') {
    return {
      kind: recentCatch ? 'CATCH_AND_SHOOT' : 'SHOOT', utility,
      reason: recentCatch ? 'Catch in shooting range: the shot is worth more than keeping the possession alive' : 'The shot is worth more than continuing the possession',
    }
  }
  if (best === 'screen' && screenPlan !== null) {
    return { kind: 'SCREEN', targetPlayerId: screenPlan.screenerId, utility, reason: 'No look is good enough yet: run a ball screen to create one' }
  }
  if (best === 'drive') return { kind: 'DRIVE', utility, reason: 'Attack the on-ball defender: the drive is worth more than the shot or the pass' }
  return { kind: passKind, targetPlayerId: bestReceiver!.player.playerId, utility, reason: 'A teammate has a better look than mine' }
}

export function bestReceiver(state: MatchState, passer: MatchPlayerState, preferOpenShooter: boolean): MatchPlayerState | undefined {
  const possession = activePossession(state)
  const basket = attackingBasketForTeam(possession?.teamId ?? passer.teamId, state.homeTeamId, state.period, state.court)
  const featuredId = passer.teamId === state.homeTeamId ? state.tacticalPlans.home.featuredPlayerId : state.tacticalPlans.away.featuredPlayerId
  return readReceivers(state, passer, basket)
    .map((read) => ({ read, score: read.value + (read.player.playerId === featuredId ? 0.08 : 0) + (preferOpenShooter ? read.player.offense.shooting * 0.0004 : read.player.offense.creation * 0.0002) }))
    .sort((left, right) => right.score - left.score || String(left.read.player.playerId).localeCompare(String(right.read.player.playerId)))[0]?.read.player
}

function bestTransitionReceiver(state: MatchState, passer: MatchPlayerState, basket: CourtPosition): MatchPlayerState | undefined {
  const direction = basket.x >= state.court.lengthMeters / 2 ? 1 : -1
  return state.players.filter((player) => player.active && player.teamId === passer.teamId && player.playerId !== passer.playerId)
    .map((player) => {
      const progress = (player.position.x - passer.position.x) * direction
      const nearestDefender = Math.min(...state.players.filter((candidate) => candidate.active && candidate.teamId !== passer.teamId)
        .map((defender) => distanceBetween(defender.position, player.position)), Number.POSITIVE_INFINITY)
      const lane = Math.min(...state.players.filter((candidate) => candidate.active && candidate.teamId !== passer.teamId)
        .map((defender) => distanceToSegment(defender.position, passer.position, player.position)), Number.POSITIVE_INFINITY)
      const score = progress + Math.min(nearestDefender, 8) * 0.28 + player.offense.creation * 0.008
        - Math.max(0, 1.1 - lane) * 3
      return { player, score, progress, lane }
    })
    .filter((candidate) => candidate.progress > 0.75 && candidate.lane > 0.45)
    .sort((left, right) => right.score - left.score || String(left.player.playerId).localeCompare(String(right.player.playerId)))[0]?.player
}

/** A drive attacks the rim: it ends in the restricted area, on the side the driver started from. */
export function driveTarget(state: MatchState, player: MatchPlayerState): CourtPosition {
  const possession = activePossession(state)
  const basket = attackingBasketForTeam(possession?.teamId ?? player.teamId, state.homeTeamId, state.period, state.court)
  const direction = basket.x >= state.court.lengthMeters / 2 ? -1 : 1
  return {
    x: clamp(basket.x + direction * 1.0, 0.8, state.court.lengthMeters - 0.8),
    y: clamp(basket.y + clamp((player.position.y - basket.y) * 0.4, -1.6, 1.6), 2.5, state.court.widthMeters - 2.5),
  }
}

function distanceToSegment(point: CourtPosition, start: CourtPosition, end: CourtPosition): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared <= 1e-9) return distanceBetween(point, start)
  const projection = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1)
  return distanceBetween(point, { x: start.x + projection * dx, y: start.y + projection * dy })
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}
