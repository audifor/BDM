import { distanceBetween, isBeyondThreePointLine, type CourtPosition } from '@/domain/court'
import type { PlayerId } from '@/domain/ids'
import type { MatchDecision, MatchDecisionKind } from './ActionState'
import { decisionNoise } from './OffenseFlow'
import { tuning } from '../tuning'
import { assessBlock } from '../defense/BlockModel'
import { assessShootingContact } from '../contact/ContactModel'
import { freeThrowProbability } from '../rules/FreeThrows'
import { FOULED_SHOT_MAKE_FACTOR } from '../contact/ContactModel'
import { guardPosition } from '../defense/ManDefense'
import { closeoutReactionTicks } from '../defense/Closeout'
import { stepPlayerKinematics } from '../movement/PlayerKinematics'
import { activePossession, INITIAL_SHOT_VALUE_MEMORY, type MatchPlayerState, type MatchState, type ScreenState } from '../state'
import { hashStringToSeed } from '@/engine/random'
import { planScreen, SCREEN_MIN_SECONDS_LEFT } from './ScreenCore'
import { attackingBasketForTeam } from '../structure/FiveOutStructure'
import { isInOffensiveFrontcourt } from '../structure/OffensiveStructure'

export interface ShotContest {
  readonly score: number
  readonly defenderPlayerId: PlayerId | null
  readonly distanceMeters: number | null
}

/** Typical points a half-court possession is worth when the offense keeps working (league-typical ~1.0 PPP). */
export const CONTINUATION_VALUE_POINTS = 0.98 // default; the live value is tuning().continuationValuePoints
/** Below this many seconds the offense has no possession left to "continue": any shot beats a violation. */
const CLOCK_EXHAUSTED_SECONDS = 2.2
/** Seconds over which the value of continuing decays to nothing as the clock runs out. */
const CLOCK_PRESSURE_SPAN_SECONDS = 12.5
/** A look at least this valuable is taken even before the offense is set (a genuinely open look). */
export const OPEN_LOOK_VALUE_POINTS = 1.2
/** Value of a shot per level of the plan's shot profile (-2..2) and per usage point over/under 50. */
const SHOT_PROFILE_VALUE_PER_LEVEL = 0.05
/** Each pace level shortens the wait for a better look and lowers the bar for an 'open enough' one. */
const PACE_OPEN_LOOK_PER_LEVEL = 0.04
const PACE_READ_TICKS_PER_LEVEL = 0.6
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
  // Near the rim a contest is a big man's job (interior defense, size); away from it, a perimeter defender's (point of attack).
  const basket = attackingBasketForTeam(teamId, state.homeTeamId, state.period, state.court)
  const nearRim = distanceBetween(position, basket) <= NEAR_RIM_CONTEST_METERS
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
          * (0.6 + clamp((nearRim ? 0.75 * defender.defense.interior + 0.25 * defender.defense.pointOfAttack : defender.defense.pointOfAttack) - defender.fatigue * 0.08, 0, 100) / 250),
      }
    })
    .sort((left, right) => right.score - left.score || String(left.defender.playerId).localeCompare(String(right.defender.playerId)))[0]
  return closest
    ? { score: closest.score, defenderPlayerId: closest.defender.playerId, distanceMeters: closest.distance }
    : { score: 0, defenderPlayerId: null, distanceMeters: null }
}

const NEAR_RIM_CONTEST_METERS = 4.6
const DEFENSIVE_REBOUND_GATHER_TICKS = 9

/** How far ahead (seconds) a closing defender's contest is projected: the shot takes time to leave the shooter's hands. */
const CONTEST_LOOKAHEAD_SECONDS = 0.3

/** Beyond this distance from the basket a three-pointer gets harder with every metre (arc is 6.75 m, corner 6.6 m). */
const THREE_POINT_COMFORT_DISTANCE_METERS = 7.4

/**
 * `finishing` is the shooter's ability to score at the rim (rimAttack): the closer to the basket, the more the shot is a finish and the
 * less it is a jump shot, so the rating that matters moves from `shooting` to `finishing`.
 */
export function shotMakeProbability(shooting: number, distanceMeters: number, points: 2 | 3, contestScore: number, fatigue = 0, finishing = shooting): number {
  const skill = points === 3 ? shooting : distanceMeters <= 2.2 ? 0.7 * finishing + 0.3 * shooting : distanceMeters <= 4.6 ? 0.35 * finishing + 0.65 * shooting : shooting
  // BT3: blocks and shooting fouls are now separate mechanisms, so the make probability of a finish at the rim no longer has to
  // carry them (an at-the-rim FG% that counts blocks as misses is ~0.60 in real basketball; BT2's 0.66 already absorbed them as
  // "contest"). The contest penalty is also smaller there: the hand in the face at the rim is what the block model judges.
  const base = points === 3 ? tuning().threeBaseMakeProbability : distanceMeters <= 2.2 ? tuning().rimBaseMakeProbability : distanceMeters <= 5 ? 0.57 : 0.44
  const ratingEffect = (clamp(skill - clamp(fatigue, 0, 100) * 0.08, 0, 100) - 50) * 0.004
  const longTwoPenalty = points === 2 ? Math.max(0, distanceMeters - 5) * 0.012 : 0
  const deepThreePenalty = points === 3 ? Math.max(0, distanceMeters - THREE_POINT_COMFORT_DISTANCE_METERS) * 0.035 : 0
  return clamp(base + ratingEffect - longTwoPenalty - deepThreePenalty - clamp(contestScore, 0, 1) * (points === 2 && distanceMeters <= 2.2 ? tuning().rimContestPenalty : 0.28), 0.04, 0.82)
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
  const teamId = activePossession(state)?.teamId
  const remembered = teamId === undefined ? INITIAL_SHOT_VALUE_MEMORY : teamId === state.homeTeamId ? state.shotValueMemory.home : state.shotValueMemory.away
  // Holding the ball is worth what this team's shots have been worth (times a factor: a possession that goes on can beat its average shot).
  return (tuning().continuationValuePoints / DEFAULT_CONTINUATION) * remembered * clamp((seconds - CLOCK_EXHAUSTED_SECONDS) / CLOCK_PRESSURE_SPAN_SECONDS, 0, 1)
}

/**
 * BT4.1: what the possession is worth when the ball keeps MOVING (a pass that starts another read, a screen, a drive), as against a
 * handler who just holds it. While the shot clock still allows several looks, the best of them is worth more than the average one.
 */
export function workingValue(state: MatchState): number {
  const shotClock = state.shotClockTenths === null ? state.clockRules.shotClockSeconds : state.shotClockTenths / 10
  const seconds = Math.min(shotClock, state.gameClockTenths / 10)
  // Waiting only pays once the floor is organised: while the offense is still getting set or the defense is still recovering
  // (transition / early offense), every second lets the defense settle, so the first good look is the look.
  const flow = state.offenseFlow
  const mode = tuning().waitGateMode
  const organised = mode === 0 || (mode === 1 ? state.transition === null
    : mode === 3 ? state.transition === null && flow !== null && !flow.resetPending && defenseIsSet(state)
      : flow !== null && flow.settledAtT !== null && state.transition === null)
  return continuationValue(state) * (1 + (organised ? tuning().waitPremium * clamp((seconds - tuning().waitPremiumEndSeconds) / 14, 0, 1) : 0))
}

/** The defense is set when most defenders are on the spot their responsibility gives them: waiting for a look only pays against a set defense. */
export function defenseIsSet(state: MatchState, radius: number = tuning().defenseSetRadiusMeters): boolean {
  const defenders = state.players.filter((player) => player.active && player.teamId === state.defensiveStructure?.teamId)
  if (defenders.length === 0) return true
  const set = defenders.filter((defender) => {
    const intent = state.movementIntents.find((item) => item.playerId === defender.playerId && item.provenance.owner === 'defensiveStructure')
    return intent !== undefined && distanceBetween(defender.position, intent.target) <= radius
  }).length
  return set >= 3
}

/** The default of `continuationValuePoints` is the factor over the remembered shot value that reproduces the calibrated behaviour. */
const DEFAULT_CONTINUATION = 1.05

export interface ShotOpportunity {
  readonly points: 2 | 3
  readonly probability: number
  /** Expected points: probability x value, shaped by the team's shot profile. */
  readonly value: number
  readonly distanceMeters: number
  readonly contestScore: number
}

/** A shot OPPORTUNITY: what taking a shot from `position` would be worth. Whether to take it is decided elsewhere. */
export interface ShotModifiers {
  /** Scale of the make probability (a pull-up or a floater is not a catch-and-shoot). */
  readonly makeScale?: number
  /** Scale of the block risk and of the foul-draw chance (a floater is released higher and earlier than a layup). */
  readonly blockScale?: number
  readonly foulScale?: number
}

export function evaluateShotOpportunity(state: MatchState, shooter: MatchPlayerState, position: CourtPosition, basket: CourtPosition, contestScore: number, mods: ShotModifiers = {}): ShotOpportunity {
  const points = shotValueAt(position, basket, state)
  const distanceMeters = distanceBetween(position, basket)
  const probability = Math.min(0.9, shotMakeProbability(shooter.offense.shooting, distanceMeters, points, contestScore, shooter.fatigue, shooter.offense.rimAttack) * putbackQuality(state, shooter, position, basket) * (mods.makeScale ?? 1))
  const plan = shooter.teamId === state.homeTeamId ? state.tacticalPlans.home : state.tacticalPlans.away
  const preference = points === 3 ? plan.shotProfile.threePoint : distanceMeters <= 2.2 ? plan.shotProfile.rim : plan.shotProfile.midRange
  // BT3D/H: the attempt is worth what it earns on the scoreboard AND at the line, and it can be rejected. A shot from a spot
  // where defenders are within reach risks a block and draws fouls in proportion to the same geometry the game will judge.
  const defenders = state.players.filter((player) => player.active && player.teamId !== shooter.teamId)
  const at = { ...shooter, position }
  const block = assessBlock(at, defenders, basket, distanceMeters)
  const contact = assessShootingContact(at, defenders, basket, false)
  const blockRisk = Math.min(0.9, (block?.probability ?? 0) * tuning().blockRiskWeight * (mods.blockScale ?? 1))
  const foulChance = contact.foulType === null ? 0 : Math.min(0.95, contact.callProbability * tuning().foulDrawWeight * (mods.foulScale ?? 1))
  const freeThrow = freeThrowProbability(shooter)
  const madeWhenFouled = probability * FOULED_SHOT_MAKE_FACTOR
  const whenFouled = madeWhenFouled * (points + freeThrow) + (1 - madeWhenFouled) * points * freeThrow
  const expected = (1 - blockRisk) * ((1 - foulChance) * probability * points + foulChance * whenFouled)
  // BT3Q: the plan's shot profile (-2..2 per zone) and the shooter's own usage decide how much this look is WANTED, on top of
  // what it is worth. A star with high usage takes more of the team's shots; a role player defers; a three-heavy plan wants threes.
  const usageWant = 1 + (shooter.offense.usage - 50) * tuning().usageValuePerPoint
  return { points, probability, value: expected * (1 + preference * SHOT_PROFILE_VALUE_PER_LEVEL) * usageWant, distanceMeters, contestScore }
}

/** Ticks after grabbing an offensive rebound during which the first attempt is a putback. */
const PUTBACK_WINDOW_TICKS = 30
const PUTBACK_MAX_DISTANCE_METERS = 3.2

/**
 * BT3N: a putback is not a free layup. The rebounder has just landed with the ball: how well he controls it (ball security,
 * his own fatigue), from what angle he is (under or behind the board is awkward), how many defenders are already on him and how
 * off balance he is decide whether the immediate attempt is worth taking, or whether he should reset or kick it out.
 * Returns a multiplier of the shot probability (1 outside the putback window and away from the rim).
 */
export function putbackQuality(state: MatchState, shooter: MatchPlayerState, position: CourtPosition, basket: CourtPosition): number {
  if (distanceBetween(position, basket) > PUTBACK_MAX_DISTANCE_METERS) return 1
  let grabbed = false
  for (let index = state.events.length - 1; index >= 0; index -= 1) {
    const event = state.events[index]!
    if (event.t < state.t - PUTBACK_WINDOW_TICKS) break
    if (event.type === 'reboundSecured' && event.reboundType === 'offensive' && event.playerId === shooter.playerId) { grabbed = true; break }
  }
  if (!grabbed) return 1
  const control = 0.72 + shooter.offense.ballSecurity * 0.002 + shooter.offense.rimAttack * 0.0016 - shooter.fatigue * 0.0012
  const forwardDirection = basket.x <= state.court.lengthMeters / 2 ? 1 : -1
  const forward = (position.x - basket.x) * forwardDirection
  const lateral = Math.abs(position.y - basket.y)
  // In front of the rim the angle is fine; on the baseline side of the board or far off to the side it is not.
  const angle = forward < 0.2 ? 0.8 : 1 - Math.min(0.2, (lateral / Math.max(forward, 0.4)) * 0.07)
  const crowd = state.players.filter((player) => player.active && player.teamId !== shooter.teamId && distanceBetween(player.position, position) <= 1.6).length
  const balance = 1 - Math.min(0.3, crowd * 0.09 + speedOfPlayer(shooter) * 0.03)
  return 1 - (1 - Math.max(0.5, Math.min(1, control * angle * balance))) * tuning().putbackQualityWeight
}

function speedOfPlayer(player: MatchPlayerState): number {
  return Math.hypot(player.velocity.x, player.velocity.y)
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
/**
 * Where a defender will be when the pass has arrived and the receiver has gathered: forecast with the SAME kinematics the
 * simulation uses (acceleration, top speed, fatigue), sprinting to his closeout spot after a reaction delay. There is no
 * "closeout speed" knob: the belief about the closeout is the closeout the engine will actually produce.
 */
function forecastCloseout(state: MatchState, defender: MatchPlayerState, receiver: MatchPlayerState, seconds: number): CourtPosition {
  const totalTicks = Math.round(seconds * 10)
  const runTicks = Math.max(0, totalTicks - closeoutReactionTicks())
  const basket = attackingBasketForTeam(receiver.teamId, state.homeTeamId, state.period, state.court)
  const tactics = defender.teamId === state.homeTeamId ? state.tacticalPlans.home.defense : state.tacticalPlans.away.defense
  const target = guardPosition(receiver.position, receiver.position, basket, 'ON_BALL', state.court, tactics)
  const intent = { playerId: defender.playerId, target, urgency: 'sprint' as const, facing: { kind: 'BALL' as const }, provenance: { responsibilityId: 'forecast', decisionId: 'forecast', owner: 'defensiveStructure' as const } }
  let position = { ...defender.position }
  let velocity = { ...defender.velocity }
  for (let tick = 0; tick < runTicks; tick += 1) {
    const step = stepPlayerKinematics({ ...defender, position, velocity }, defender.kinematics, intent, receiver.position, basket, [], state.court)
    position = step.position
    velocity = step.velocity
  }
  return position
}

/**
 * How contested the receiver's shot will be when it is released. His own defender closes out (forecast with the real
 * kinematics); everybody else contributes from where he stands now, projected 0.3 s along his current motion.
 */
function predictContestAfterPass(state: MatchState, passer: MatchPlayerState, receiver: MatchPlayerState): number {
  const flightSeconds = Math.max(0.2, Math.min(0.8, distanceBetween(passer.position, receiver.position) / 10))
  const seconds = flightSeconds + CATCH_TO_RELEASE_SECONDS
  const guardId = state.defensiveStructure?.assignments.find((item) => item.attackerPlayerId === receiver.playerId)?.defenderPlayerId
  let worst = 0
  for (const defender of state.players) {
    if (!defender.active || defender.teamId === receiver.teamId) continue
    const at = defender.playerId === guardId ? forecastCloseout(state, defender, receiver, seconds)
      : { x: defender.position.x + defender.velocity.x * CONTEST_LOOKAHEAD_SECONDS, y: defender.position.y + defender.velocity.y * CONTEST_LOOKAHEAD_SECONDS }
    const helpReach = defender.playerId === guardId ? 0 : defender.kinematics.maxSpeedMps * (1 - defender.fatigue * 0.0012) * tuning().helpCloseoutBelief * Math.max(0, seconds - closeoutReactionTicks() / 10)
    const distance = Math.max(0, distanceBetween(at, receiver.position) - helpReach)
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
      // A passer who sees the floor values his teammates' looks at what they are worth; one who does not, misses some of them.
      const sight = 1 - tuning().passSightSpread / 2 + tuning().passSightSpread * (passer.passing.vision / 100)
      return { player, opportunity, completion, value: completion * opportunity.value * sight }
    })
    .sort((left, right) => right.value - left.value || String(left.player.playerId).localeCompare(String(right.player.playerId)))
}

function guardOf(state: MatchState, attacker: MatchPlayerState): MatchPlayerState | undefined {
  const id = state.defensiveStructure?.assignments.find((item) => item.attackerPlayerId === attacker.playerId)?.defenderPlayerId
  return id === undefined ? undefined : state.players.find((player) => player.playerId === id)
}

/** Expected points of attacking the on-ball defender off the dribble (finish, or collapse the defense and pass). */
interface DriveEdge {
  readonly edge: number
  readonly defender: MatchPlayerState | undefined
}

/** How much better the driver is than the man in front of him, from real ratings, the gap and the lane to the rim. */
function driveEdge(state: MatchState, actor: MatchPlayerState, basket: CourtPosition): DriveEdge {
  const defender = guardOf(state, actor)
  const gap = defender ? distanceBetween(defender.position, actor.position) : 4
  // A defender standing on the line to the rim obstructs the drive; one who is out of position (closing out) does not.
  const lane = defender ? distanceToSegment(defender.position, actor.position, basket) : 3
  const attack = (actor.offense.rimAttack + actor.offense.creation) / 2 - actor.fatigue * 0.06
  const defend = defender ? (defender.defense.pointOfAttack + defender.defensiveMobility) / 2 : 50
  return { edge: clamp((attack - defend) / 60 + (gap - 1.1) / 5 + Math.min(0.3, (lane - 0.9) * 0.15), -0.4, 0.6), defender }
}

/** A spot at the rim on the driver's side, where a drive that gets through ends. */
function rimSpotFor(from: CourtPosition, basket: CourtPosition): CourtPosition {
  const dx = from.x - basket.x
  const dy = from.y - basket.y
  const length = Math.hypot(dx, dy) || 1
  return { x: basket.x + (dx / length) * 1.1, y: basket.y + (dy / length) * 1.1 }
}

/**
 * BT4K: the value of attacking the on-ball defender, from the same shot model everything else uses. A drive either gets past
 * him (probability from the ratings edge: then the finish at the rim, with its blocks and its free throws) or it is contained
 * (then the handler is back to a read with a rim protector stepping up). No constant "a drive is worth 0.9 + ..." any more:
 * a better handler against a worse defender drives more, and a finisher who draws fouls is worth more driving.
 */
function driveValue(state: MatchState, actor: MatchPlayerState, basket: CourtPosition): number {
  const { edge } = driveEdge(state, actor, basket)
  const plan = actor.teamId === state.homeTeamId ? state.tacticalPlans.home : state.tacticalPlans.away
  // Each drive already taken this possession has the help defense more set: the next one is worth less.
  const drivesSoFar = state.actions.filter((action) => action.kind === 'DRIVE' && action.teamId === actor.teamId && action.startedT >= (activePossession(state)?.startedT ?? 0)).length
  const spot = rimSpotFor(actor.position, basket)
  // The help is already at the rim (a big in the paint, a weak-side man tagging): it lowers the chance to get through and contests the finish.
  const guardId = guardOf(state, actor)?.playerId
  const atRim = state.players.filter((player) => player.active && player.teamId !== actor.teamId && player.playerId !== guardId && distanceBetween(player.position, spot) <= 2.8).length
  const pBeat = clamp(tuning().driveBeatBase + 0.9 * edge - 0.09 * atRim, 0.06, 0.85)
  const rimContest = estimateContestAt(state, actor.teamId, spot).score
  const beaten = evaluateShotOpportunity(state, actor, spot, basket, Math.max(0.3, rimContest * 0.7)).value
  const contested = evaluateShotOpportunity(state, actor, spot, basket, Math.max(0.8, rimContest)).value
  const contained = (tuning().driveContainedPremium !== 0 ? workingValue(state) : continuationValue(state)) * 0.9
  const value = pBeat * beaten + (1 - pBeat) * (0.35 * contested + 0.65 * contained)
  return value * (1 + plan.shotProfile.rim * SHOT_PROFILE_VALUE_PER_LEVEL) * Math.pow(0.8, drivesSoFar)
}

/** Pull-up and floater: how well this shooter makes a shot he takes on the move, from his own ratings. */
export function pullUpFactor(player: MatchPlayerState): number {
  return clamp(tuning().pullUpBaseFactor + (player.offense.shooting - 50) * 0.0015 + (player.offense.creation - 50) * 0.001 - player.fatigue * 0.0005, 0.75, 1)
}

export function floaterFactor(player: MatchPlayerState): number {
  return clamp(tuning().floaterBaseFactor + (player.offense.rimAttack - 50) * 0.0012 + (player.offense.shooting - 50) * 0.0008 - player.fatigue * 0.0005, 0.75, 1)
}

export interface DriveStopRead {
  readonly kind: 'CONTINUE' | 'PULL_UP' | 'FLOATER'
  readonly values: { readonly continue: number; readonly pullUp: number; readonly floater: number; readonly pass: number; readonly pFinish: number }
}

/**
 * BT4G/H: a driver whose lane closes decides whether to keep going, stop and shoot, or (near the rim) float it over the help. All
 * three are valued with the shot model: continuing is the chance to still reach the rim (defenders between him and it lower
 * it) times the finish, or being contained; the pull-up is the shot from where he is, with his balance (speed), his ratings and
 * the defender's contest; the floater trades make probability for a much smaller block risk. A pass to an open teammate is the
 * alternative that keeps him from stopping at all. Where the shot ends up is wherever the drive was when the lane closed.
 */
export function readDriveStop(state: MatchState, driver: MatchPlayerState, basket: CourtPosition): DriveStopRead {
  const distance = distanceBetween(driver.position, basket)
  const opponents = state.players.filter((player) => player.active && player.teamId !== driver.teamId)
  const ahead = opponents.filter((defender) => distanceBetween(defender.position, basket) < distance - 0.2 && distanceToSegment(defender.position, driver.position, basket) < 1.3)
  const { edge } = driveEdge(state, driver, basket)
  const pFinish = ahead.length === 0 ? 0.9 : clamp(0.28 + 0.9 * edge - 0.12 * (ahead.length - 1), 0.08, 0.8)
  const spot = rimSpotFor(driver.position, basket)
  const rimFinish = evaluateShotOpportunity(state, driver, spot, basket, estimateContestAt(state, driver.teamId, spot).score).value
  const contained = (tuning().driveContainedPremium !== 0 ? workingValue(state) : continuationValue(state)) * 0.9
  const cont = pFinish * rimFinish + (1 - pFinish) * contained
  const contestNow = estimateContestAt(state, driver.teamId, driver.position).score
  const speed = Math.hypot(driver.velocity.x, driver.velocity.y)
  const balance = 1 - Math.max(0, speed - 2) * 0.025
  const pullUp = distance >= 3.4 ? evaluateShotOpportunity(state, driver, driver.position, basket, contestNow, { makeScale: pullUpFactor(driver) * balance }).value : Number.NEGATIVE_INFINITY
  const floater = distance >= 2.0 && distance <= 4.8
    ? evaluateShotOpportunity(state, driver, driver.position, basket, contestNow * 0.85, { makeScale: floaterFactor(driver) * balance, blockScale: 0.35, foulScale: 0.6 }).value : Number.NEGATIVE_INFINITY
  const best = bestReceiverValue(state, driver, basket)
  const pass = best === undefined ? Number.NEGATIVE_INFINITY : best
  const temperature = tuning().decisionTemperaturePoints
  const gumbel = (salt: string): number => temperature <= 0 ? 0 : -temperature * Math.log(-Math.log(Math.min(0.999, Math.max(0.001, decisionNoise(state, driver.playerId, `stop-${salt}`)))))
  const scored = (
    [['CONTINUE', cont], ['PULL_UP', pullUp], ['FLOATER', floater], ['CONTINUE', pass]] as const
  ).map(([kind, value]) => ({ kind, value: Number.isFinite(value) ? value + gumbel(`${kind}${value.toFixed(2)}`) : value }))
  const top = scored.sort((left, right) => right.value - left.value)[0]!
  return { kind: top.kind, values: { continue: cont, pullUp, floater, pass, pFinish } }
}

function bestReceiverValue(state: MatchState, passer: MatchPlayerState, basket: CourtPosition): number | undefined {
  const reads = readReceivers(state, passer, basket)
  return reads.length === 0 ? undefined : Math.max(...reads.map((read) => read.value))
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
  // A defensive rebounder lands, secures and turns before he can look up the floor (BT4D: 0.4 s was less than any real rebound).
  if (liveTransition && state.transition?.trigger === 'defensiveRebound' && state.t - state.transition.startedT < DEFENSIVE_REBOUND_GATHER_TICKS) return { decision: null }
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

export type PlayKind = 'BALL_SCREEN' | 'DRIVE_KICK' | 'SWING'

/** What the offense is running in this half court, chosen once per possession from who is on the floor (stable: static ratings and the possession id). */
export function playFor(state: MatchState, teamId: MatchPlayerState['teamId']): PlayKind {
  const possession = activePossession(state)
  const players = state.players.filter((player) => player.active && player.teamId === teamId)
  const top = (score: (player: MatchPlayerState) => number, count: number): number => {
    const values = players.map(score).sort((a, b) => b - a).slice(0, count)
    return values.reduce((a, b) => a + b, 0) / Math.max(1, values.length)
  }
  const plan = teamId === state.homeTeamId ? state.tacticalPlans.home : state.tacticalPlans.away
  const screenWeight = 1 + 0.012 * (top((p) => p.offense.creation, 2) - 50) + 0.012 * (top((p) => (p.offense.rimAttack + p.reboundingImpact + (p.heightCm - 170) * 0.6) / 3, 1) - 50)
  const driveWeight = 0.9 + 0.012 * (top((p) => p.offense.rimAttack, 3) - 50) + plan.shotProfile.rim * 0.15
  const swingWeight = 0.9 + 0.012 * (top((p) => p.offense.shooting, 3) - 50) + plan.shotProfile.threePoint * 0.15
  const total = Math.max(0.3, screenWeight) + Math.max(0.3, driveWeight) + Math.max(0.3, swingWeight)
  const u = hashStringToSeed(`bt43-play:${possession?.id ?? 'none'}:${possession?.offensiveRebounds ?? 0}`) / 0x1_0000_0000 * total
  if (u < Math.max(0.3, screenWeight)) return 'BALL_SCREEN'
  return u < Math.max(0.3, screenWeight) + Math.max(0.3, driveWeight) ? 'DRIVE_KICK' : 'SWING'
}

interface PlayRead { readonly kind: PlayKind; readonly committed: boolean; readonly screensDone: number; readonly drivesDone: number; readonly passesDone: number }

/** The set the team is running and whether it is still committed to it (it ends when it has been run, or after the commitment window). */
function playRead(state: MatchState, flow: MatchState['offenseFlow'], teamId: MatchPlayerState['teamId']): PlayRead | null {
  if (tuning().playsEnabled === 0 || flow === null || flow.halfCourtSinceT === null || state.transition !== null) return null
  const since = flow.halfCourtSinceT
  const mine = state.actions.filter((action) => action.teamId === teamId && action.startedT >= since && action.status === 'COMPLETED')
  const screensDone = mine.filter((action) => action.kind === 'SCREEN').length
  const drivesDone = mine.filter((action) => action.kind === 'DRIVE').length
  const passesDone = mine.filter((action) => action.kind === 'PASS' || action.kind === 'KICK_OUT').length
  const kind = playFor(state, teamId)
  const elapsed = (state.t - since) / 10
  const extra = tuning().playExtraPasses
  const executed = kind === 'BALL_SCREEN' ? screensDone >= 1 && passesDone + drivesDone >= 1 + extra : kind === 'DRIVE_KICK' ? drivesDone >= 1 && passesDone >= 1 + extra : passesDone >= 3 + extra
  return { kind, committed: !executed && elapsed < tuning().playCommitSeconds, screensDone, drivesDone, passesDone }
}

/** A fast break in basketball terms: between the ball and the basket there are at least as many attackers as defenders. */
function hasNumericAdvantage(state: MatchState, actor: MatchPlayerState, basket: CourtPosition): boolean {
  const reach = distanceBetween(actor.position, basket)
  let attackers = 0
  let defenders = 0
  for (const player of state.players) {
    if (!player.active || player.playerId === actor.playerId || distanceBetween(player.position, basket) >= reach) continue
    if (player.teamId === actor.teamId) attackers += 1
    else defenders += 1
  }
  return defenders <= attackers
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
  const hold = workingValue(state) * tuning().holdDiscount
  const noise = (salt: string): number => 1 + (decisionNoise(state, actor.playerId, salt) - 0.5) * 0.12
  const play = playRead(state, flow, actor.teamId)
  const committed = play !== null && play.committed
  const gift = shot.value >= tuning().playGiftValue && contest.score <= tuning().playGiftContest
  const shootPlayFactor = committed && !gift ? tuning().playShotFactor : 1
  const drivePlayFactor = committed && play!.kind === 'DRIVE_KICK' && play!.drivesDone === 0 ? tuning().playDriveBoost : 1
  const passPlayFactor = committed && (play!.kind === 'SWING' || (play!.kind === 'DRIVE_KICK' && play!.drivesDone >= 1)) ? tuning().playPassBoost : 1
  const options = {
    shoot: shot.value * tuning().shootValueScale * shootPlayFactor * noise('shoot'),
    drive: drive * drivePlayFactor * tuning().driveValueScale * (1 + (actor.offense.usage - 50) * tuning().usageDrivePerPoint) * noise('drive'),
    // Off a set screen the handler first USES it (attack, pull up); the ball only moves early if he is being trapped.
    pass: (secondsLeft > 3.5 && (screen === null || screen.coverage === 'blitz' || tuning().passOffScreen !== 0) ? (bestReceiver?.value ?? Number.NEGATIVE_INFINITY) * tuning().passValueScale * passPlayFactor * (1 - (actor.offense.usage - 50) * tuning().usagePassPerPoint) : Number.NEGATIVE_INFINITY) * noise('pass'),
    screen: ((screenPlan?.value ?? Number.NEGATIVE_INFINITY) + (committed && play!.kind === 'BALL_SCREEN' && play!.screensDone === 0 ? tuning().playScreenBonus : 0)) * noise('screen'),
    hold,
  }
  const utility = { shoot: round(shot.value), drive: round(Number.isFinite(drive) ? drive : 0), pass: round(bestReceiver?.value ?? 0), hold: round(hold), ...(screenPlan === null ? {} : { screen: round(screenPlan.value) }) }
  // A handler who has just finished a drive cannot "keep reading": he acts with what he has.
  // BT3A: a choice with a hard argmax flips whole shot types when one parameter moves a hair. Adding Gumbel noise scaled by
  // the temperature (from the same deterministic per-tick hash, no RNG stream consumed) turns it into a softmax choice:
  // a near tie is split between options and the mix responds progressively to the parameters.
  const temperature = tuning().decisionTemperaturePoints
  const gumbel = (salt: string): number => temperature <= 0 ? 0 : -temperature * Math.log(-Math.log(Math.min(0.999, Math.max(0.001, decisionNoise(state, actor.playerId, `gumbel-${salt}`)))))
  // BT4.3: with the floor set the handler does not wait: waiting is not a basketball action, the possession is made of actions.
  const noHold = mustAct || (tuning().settledHandlerActs !== 0 && flow !== null && flow.settledAtT !== null && state.transition === null && secondsLeft > 1)
  const settled = flow === null || flow.settledAtT !== null
  // After an offensive rebound the floor is a scramble, not a set: the rebounder reads it as it is (putback, kick-out or reset).
  // With the clock nearly gone there is nothing left to organise: the possession must produce a look now.
  const halfCourtUnsettled = flow !== null && !settled && flow.stage === 'HALF_COURT' && secondsLeft > UNSETTLED_HOLD_MIN_SECONDS
  // BT4.4: an offense that is not set may act on a look that is already there (a shot, a pass), but a drive is a play: it is only a legitimate early attack
  // with a real transition advantage or while the defense is not set either. A transition the defense has already stopped (STOPPED/NEUTRAL) grants nothing:
  // the handler is bringing the ball up. Before, any open look (or a stopped transition in the EARLY stage) let the handler act and the best option could be a drive.
  const transitionAdvantage = state.transition !== null && state.transition.teamId === actor.teamId && state.transition.advantage === 'ADVANTAGE'
  const notSetYet = flow !== null && !settled && (flow.stage === 'HALF_COURT' || flow.stage === 'EARLY') && secondsLeft > UNSETTLED_HOLD_MIN_SECONDS
  const earlyDriveAllowed = transitionAdvantage || hasNumericAdvantage(state, actor, basket)
  const driveIsAPlay = tuning().playsEnabled !== 0 && notSetYet && !mustAct && !earlyDriveAllowed
  const candidates = (Object.entries(options) as [keyof typeof options, number][])
    .filter(([name]) => (!noHold || name !== 'hold') && !(driveIsAPlay && name === 'drive'))
    .map(([name, value]): [keyof typeof options, number] => [name, Number.isFinite(value) ? value + gumbel(name) : value])
  const best = candidates.sort((left, right) => right[1] - left[1])[0]![0]
  // Until the floor is organised only a genuinely open look justifies acting: otherwise keep reading.
  const pace = actor.teamId === state.homeTeamId ? state.tacticalPlans.home.pace : state.tacticalPlans.away.pace
  // BT4.3: an offense that is not set does not attack on its own: only a shot or a pass that is already there justifies acting; a drive is a play, not a look.
  const openLook = Math.max(options.shoot, options.pass, tuning().playsEnabled !== 0 && !earlyDriveAllowed ? Number.NEGATIVE_INFINITY : options.drive) >= OPEN_LOOK_VALUE_POINTS * (1 - pace * PACE_OPEN_LOOK_PER_LEVEL)
  const readAgain = state.t + Math.max(1, Math.round(3 - pace * PACE_READ_TICKS_PER_LEVEL)) + Math.floor(decisionNoise(state, actor.playerId, 'hold') * 4)
  if (!noHold && (best === 'hold' || (halfCourtUnsettled && !openLook))) return { kind: 'HOLD', holdUntilT: readAgain }
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
