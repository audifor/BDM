import { distanceBetween, type CourtPosition } from '@/domain/court'
import type { PlayerId, TeamId } from '@/domain/ids'
import { emitEvent } from '../events'
import { activePossession, type DefensiveAssignment, type DefensiveHelpDecision, type DefensiveStructureState, type MatchPlayerState, type MatchState } from '../state'
import type { DefensiveDecisionKind, DefensiveResponsibilityKind, PlayerResponsibility, StructuralDecision } from '../responsibility/Responsibility'
import { MOVEMENT_URGENCY_FACTORS, type MovementFacing, type MovementIntent, type MovementUrgency } from '../movement/MovementIntent'
import { attackingBasketForTeam } from '../structure/FiveOutStructure'
import { tuning } from '../tuning'
import { defensiveShape, postScore, tacticalIntent } from '../tactics/TacticalIdentity'
import { onBallCushion, onBallReactionSeconds, stanceSlideFactor } from './PointOfAttack'

const ON_BALL_CUSHION_METERS = 1.05
const GAP_DEPTH_METERS = 0.9
const GAP_SHADE_METERS = 0.65
const HELP_DEPTH_METERS = 1.5
const HELP_SHADE_METERS = 2.2
const RECOVER_START_METERS = 1.0
const RECOVER_END_METERS = 0.6
const DRIVE_PAINT_THREAT_METERS = 4.8
/** BT6.7: how far ahead along a drive the on-ball defender aims (cut-off), and how far behind his spot he turns and runs instead of sliding. */
const ON_BALL_CUTOFF_LEAD_SECONDS = 0.1
const ON_BALL_TURN_AND_RUN_METERS = 1.0
/** BT6.6: within this distance of his spot the on-ball defender is in his stance (reading the handler, a reaction late). */
const ON_BALL_STANCE_METERS = 1.5
/** BT6.4: a handler who has picked up his dribble cannot drive: his defender crowds him (a pressure defense more). */
const DEAD_DRIBBLE_CUSHION_METERS = 0.45
/** BT6.15-18 help: trigger distance from the rim (conservative .. aggressive), where the helper meets the drive, and the stunt from the nail. */
const HELP_TRIGGER_MIN_METERS = 3.4
const HELP_TRIGGER_RANGE_METERS = 3.6
const STUNT_MIN_HELP = 0.55
const STUNT_MAX_METERS = 2.2
const STUNT_REACH_METERS = 7
const STUNT_STANDOFF_METERS = 2.5
/** BT6.26: ticks of the rotation call for a team with no familiarity with its scheme (none for a team that knows it by heart). */
const ROTATION_CALL_TICKS = 5

/**
 * Where the helper meets a drive: a conservative help waits at the rim on the driver's line (vertical, protect the basket); an aggressive one
 * steps up into the driver's path, a step and a half in front of him, to stop the ball before the paint.
 */
function helpSpot(handler: CourtPosition, basket: CourtPosition, court: MatchState['court'], help: number): CourtPosition {
  const dx = handler.x - basket.x
  const dy = handler.y - basket.y
  const length = Math.hypot(dx, dy) || 1
  const atRim = Math.min(1.3, length)
  const high = Math.max(atRim, length - 1.5)
  const depth = atRim + (high - atRim) * clamp((help - 0.2) / 0.8, 0, 1)
  return { x: clamp(basket.x + (dx / length) * depth, 0.15, court.lengthMeters - 0.15), y: clamp(basket.y + (dy / length) * depth, 0.15, court.widthMeters - 0.15) }
}

/**
 * BT6.18: a stunt. With an aggressive help defense the defenders off the ball do not just stand in their gap during a drive: they take steps
 * toward the driver (to show a crowd and slow him), as far as they can and still recover, and less off a shooter who would punish it.
 */
function stuntSpot(gap: CourtPosition, handler: CourtPosition, attacker: MatchPlayerState, help: number): CourtPosition {
  const toward = { x: handler.x - gap.x, y: handler.y - gap.y }
  const length = Math.hypot(toward.x, toward.y)
  // Only the men near enough to the drive to bother it stunt; the far side stays home.
  if (length < 1e-6 || length > STUNT_REACH_METERS) return gap
  const respect = clamp((attacker.offense.shooting - 55) / 35, 0, 1)
  // A stunt is a show in the gap, not a double team: he stops well short of the driver, where he can still get back to his man.
  const step = Math.min(length - STUNT_STANDOFF_METERS, STUNT_MAX_METERS * clamp((help - STUNT_MIN_HELP) / (1 - STUNT_MIN_HELP), 0, 1) * (1 - 0.6 * respect))
  if (step <= 0) return gap
  return { x: gap.x + (toward.x / length) * step, y: gap.y + (toward.y / length) * step }
}
const CLOSEOUT_SPRINT_DISTANCE_METERS = 2.2
/** Staying with a man who is moving takes more than a jog. */
const TRACKING_RUN_DISTANCE_METERS = 0.7

/** Reconciles one possession's assignments and defensive structure without changing player positions. */
export function reconcileManDefense(input: MatchState): MatchState {
  if (input.responsibilities.some((item) => item.kind === 'PERIOD_RESTART')) return input
  if (input.ball.kind === 'LOOSE') return input
  const possession = activePossession(input)
  if (input.ball.kind === 'REBOUNDABLE'
    || input.transition !== null && possession?.teamId === input.transition.teamId && possession.phase !== 'SETUP') return input
  if (!possession || input.ball.kind === 'DEAD') return clearDefensiveState(input)

  const defendingTeamId = possession.teamId === input.homeTeamId ? input.awayTeamId : input.homeTeamId
  const defenders = input.players.filter((player) => player.active && player.teamId === defendingTeamId)
  const attackers = input.players.filter((player) => player.active && player.teamId === possession.teamId)
  if (defenders.length !== 5 || attackers.length !== 5) return clearDefensiveState(input)

  const prior = input.defensiveStructure?.teamId === defendingTeamId ? input.defensiveStructure : null
  const assignmentsValid = prior !== null && areAssignmentsValid(prior.assignments, defenders, attackers)
  const intent = tacticalIntent(input, defendingTeamId)
  const assignments = assignmentsValid
    ? switchBack(input, prior.assignments, intent.coach.tacticalKnowledge)
    : createAssignments(input, defenders, attackers, prior !== null || input.defensiveStructure !== null)
  let state = input
  if (!assignmentsValid) {
    state = emitEvent(state, 'defensiveAssignmentsEstablished', { teamId: defendingTeamId })
  }

  const defendedBasket = attackingBasketForTeam(possession.teamId, state.homeTeamId, state.period, state.court)
  const defensiveTactics = defensiveShape(state, defendingTeamId)
  const nonReactiveBallPhase = state.ball.kind === 'SHOT_IN_FLIGHT' || state.ball.kind === 'REBOUNDABLE' || state.ball.kind === 'LOOSE'
  if (nonReactiveBallPhase && prior !== null) return state

  const liveDefense = possession.phase !== 'INBOUND'
    && state.ball.kind !== 'INBOUND'
    && state.ball.kind !== 'DEAD'
  const ballHandlerId = currentOrPriorHandler(state, possession.teamId)
  const onBallAssignment = ballHandlerId === null ? undefined : assignments.find((item) => item.attackerPlayerId === ballHandlerId)
  const playerById = new Map(state.players.map((player) => [player.playerId, player]))
  const activeDrive = state.actions.find((action) => action.kind === 'DRIVE' && action.status === 'ACTIVE')
  const helpDecision = resolveDriveHelpDecision(state, assignments, playerById, ballHandlerId, activeDrive, prior?.helpDecision, defendedBasket, intent.defense.help, intent.coach.tacticalKnowledge)
  // BT5.18: the other help responsibilities (the low man tags a roller, a defender digs at a post touch, the weak side picks up the screener of a trap).
  const screenHelp = helpDecision.status === 'TRIGGERED' || tuning().screenPostHelp === 0 ? null : resolveScreenAndPostHelp(state, assignments, playerById, ballHandlerId, defendedBasket, intent.defense.help)
  const driveHelperDefenderId = helpDecision.helperPlayerId
  const rimProtectorPlayerId = resolveRimProtector(state, assignments, playerById, ballHandlerId, prior?.rimProtectorPlayerId ?? null, helpDecision, defendedBasket)
  // BT6.26: the rotations behind the help need the call between the defenders: a team that knows its scheme rotates at once, one that does
  // not is a beat late (the helper himself goes on his own read).
  const rotationDelay = Math.round((1 - intent.familiarity) * ROTATION_CALL_TICKS)
  const rotationsLive = helpDecision.triggeredT === undefined || state.t - helpDecision.triggeredT >= rotationDelay
  const rotationByDefender = new Map(rotationsLive ? helpDecision.rotations.map((rotation) => [rotation.playerId, rotation]) : [])
  const previousResponsibilities = new Map(state.responsibilities.filter((item) => item.owner === 'defensiveStructure').map((item) => [item.playerId, item]))
  const previousDecisions = new Map(state.decisions.filter((item) => item.owner === 'defensiveStructure').map((item) => [item.playerId, item]))
  const nextResponsibilitySequenceStart = state.nextResponsibilitySequence
  const nextDecisionSequenceStart = state.nextDecisionSequence
  let nextResponsibilitySequence = nextResponsibilitySequenceStart
  let nextDecisionSequence = nextDecisionSequenceStart
  const responsibilities: PlayerResponsibility[] = []
  const decisions: StructuralDecision[] = []
  const intents: MovementIntent[] = []
  const assignmentByDefender = new Map(assignments.map((item) => [item.defenderPlayerId, item]))

  if (liveDefense) {
    for (const defender of defenders) {
      const assignment = assignmentByDefender.get(defender.playerId)
      const attacker = assignment === undefined ? undefined : playerById.get(assignment.attackerPlayerId)
      if (!assignment || !attacker) continue
      const previous = previousResponsibilities.get(defender.playerId)
      const rotation = rotationByDefender.get(defender.playerId)
      const extraHelp = screenHelp !== null && screenHelp.defenderId === defender.playerId && assignment.attackerPlayerId !== ballHandlerId ? screenHelp : null
      const baseKind: DefensiveResponsibilityKind = assignment.attackerPlayerId === ballHandlerId
        ? 'ON_BALL'
        : defender.playerId === driveHelperDefenderId
          ? helpDecision.helperKind ?? 'HELP'
          : extraHelp !== null ? extraHelp.kind : rotation?.kind ?? 'GAP'
      const rotationTarget = rotation ? rotationTargetPosition(rotation, playerById, state.ball.position, defendedBasket, state.court, defensiveTactics) : undefined
      const guardKind: 'ON_BALL' | 'GAP' | 'HELP' = baseKind === 'LOW_MAN' || baseKind === 'TAG' || baseKind === 'DIG' ? 'HELP'
        : baseKind === 'ROTATE' || baseKind === 'X_OUT' ? 'GAP' : baseKind
      const baseTarget = rotationTarget ?? guardPosition(attacker.position, state.ball.position, defendedBasket, guardKind, state.court, defensiveTactics)
      let kind: DefensiveResponsibilityKind = baseKind
      let recoveryTarget: 'GAP' | 'HELP' | undefined
      if (baseKind === 'GAP' && (previous?.kind === 'HELP' || previous?.kind === 'LOW_MAN' || previous?.kind === 'TAG' || previous?.kind === 'DIG') && distanceBetween(defender.position, baseTarget) > RECOVER_START_METERS) {
        kind = 'RECOVER'
        recoveryTarget = 'GAP'
      } else if (baseKind === 'GAP' && previous?.kind === 'RECOVER' && previous.recoveryTarget === 'GAP' && distanceBetween(defender.position, baseTarget) > RECOVER_END_METERS) {
        kind = 'RECOVER'
        recoveryTarget = 'GAP'
      } else if (baseKind === 'HELP' && previous?.kind === 'RECOVER' && previous.recoveryTarget === 'HELP' && distanceBetween(defender.position, baseTarget) > RECOVER_END_METERS) {
        kind = 'RECOVER'
        recoveryTarget = 'HELP'
      }
      const responsibilityTargetKind: 'ON_BALL' | 'GAP' | 'HELP' = kind === 'RECOVER' ? recoveryTarget!
        : kind === 'LOW_MAN' || kind === 'TAG' || kind === 'DIG' ? 'HELP' : kind === 'ROTATE' || kind === 'X_OUT' ? 'GAP' : kind
      const responsibility = previous?.kind === kind && previous.recoveryTarget === recoveryTarget
        ? previous
        : {
            id: `responsibility-${nextResponsibilitySequence++}`,
            playerId: defender.playerId,
            teamId: defender.teamId,
            kind,
            owner: 'defensiveStructure' as const,
            startedT: state.t,
            reason: kind === 'ON_BALL' ? 'Contain the ball handler from the basket side'
              : kind === 'GAP' ? 'Stay connected to the assigned man while shading the ball'
                : kind === 'HELP' || kind === 'LOW_MAN' ? helpDecision.reason
                  : kind === 'TAG' || kind === 'DIG' ? extraHelp?.reason ?? 'Help on the screen or the post'
                  : kind === 'ROTATE' ? 'Rotate to cover the low-man helper’s vacated assignment'
                    : kind === 'X_OUT' ? 'Split the next two open assignments after the help rotation'
                      : 'Recover physically to the assigned man’s current guard position',
            endCondition: { kind: 'possessionEnds' as const },
            ...(kind === 'RECOVER' ? { recoveryTarget } : {}),
          }
      responsibilities.push(responsibility)

      const decisionKind: DefensiveDecisionKind = possession.phase === 'ADVANCE'
        ? 'RETREAT_TO_DEFENSE'
        : kind === 'ON_BALL' ? 'GUARD_BALL'
          : kind === 'GAP' ? 'GUARD_GAP'
            : kind === 'HELP' || kind === 'LOW_MAN' || kind === 'TAG' || kind === 'DIG' ? 'HELP_POSITION'
              : kind === 'ROTATE' ? 'ROTATE_TO_HELP_MAN'
                : kind === 'X_OUT' ? 'X_OUT_TWO_MAN' : 'RECOVER_TO_MAN'
      const oldDecision = previousDecisions.get(defender.playerId)
      const decision = oldDecision?.responsibilityId === responsibility.id && oldDecision.kind === decisionKind
        ? oldDecision
        : {
            id: `decision-${nextDecisionSequence++}`,
            playerId: defender.playerId,
            responsibilityId: responsibility.id,
            kind: decisionKind,
            owner: 'defensiveStructure' as const,
            startedT: state.t,
            reason: decisionKind === 'RETREAT_TO_DEFENSE' ? 'Set the assigned man-side before half-court structure'
              : decisionKind === 'GUARD_BALL' ? 'Stay between the handler and the defended basket'
                : decisionKind === 'GUARD_GAP' ? 'Shade toward the ball without losing the assigned man'
                  : decisionKind === 'HELP_POSITION' ? (kind === 'TAG' || kind === 'DIG' ? extraHelp?.reason ?? helpDecision.reason : helpDecision.reason)
                    : decisionKind === 'ROTATE_TO_HELP_MAN' ? 'Cover the helper’s abandoned assignment'
                      : decisionKind === 'X_OUT_TWO_MAN' ? 'Split the open perimeter assignments'
                        : 'Return physically to the normal guard position',
          }
      decisions.push(decision)

      const rawTarget = (kind === 'TAG' || kind === 'DIG') && extraHelp !== null ? extraHelp.target
        : kind === 'HELP' || kind === 'LOW_MAN'
        ? helpSpot(handlerPosition(state, ballHandlerId, attacker.position), defendedBasket, state.court, intent.defense.help)
        : kind === 'GAP' && activeDrive !== undefined && ballHandlerId !== null && helpDecision.status === 'TRIGGERED' && intent.defense.help > STUNT_MIN_HELP
          ? stuntSpot(guardPosition(attacker.position, state.ball.position, defendedBasket, 'GAP', state.court, defensiveTactics, attacker.offense.shooting), handlerPosition(state, ballHandlerId, attacker.position), attacker, intent.defense.help)
        : kind === 'GAP' && defender.playerId === rimProtectorPlayerId && rotationTarget === undefined
          ? sagTowardRim(attacker, rimProtectorPosition(state.ball.position, defendedBasket, state.court))
          : rotationTarget ?? guardPosition(attacker.position, state.ball.position, defendedBasket, responsibilityTargetKind, state.court, defensiveTactics, attacker.offense.shooting)
      // BT6.6: the on-ball defender plays the handler at the cushion his coach asks for, and answers his first step a reaction late.
      const handlerNow = ballHandlerId === null ? undefined : playerById.get(ballHandlerId)
      const onBallRead = kind === 'ON_BALL' && handlerNow !== undefined && state.ball.kind === 'HELD' && state.ball.ownerPlayerId === handlerNow.playerId
        ? { reaction: onBallReactionSeconds(state, defender, handlerNow), cushion: state.ball.dribble === 'picked' ? DEAD_DRIBBLE_CUSHION_METERS + 0.25 * (1 - intent.defense.pressure) : onBallCushion(intent.defense.pressure, defender, handlerNow) } : null
      // Against a drive he does not backpedal: he turns and races to a spot on the driver's path (beat him to the spot), from where he read
      // the driver to be; who gets there first is the containment.
      const drivingNow = onBallRead !== null && activeDrive?.playerId === ballHandlerId
      const lead = drivingNow ? ON_BALL_CUTOFF_LEAD_SECONDS : 0
      // The read is late only for a defender who is guarding him (in his stance near his spot): one still coming up to pick him up runs
      // to where the handler is, or he would run past him.
      const settledOnBall = onBallRead !== null && handlerNow !== undefined
        && distanceBetween(defender.position, guardPosition(handlerNow.position, state.ball.position, defendedBasket, 'ON_BALL', state.court, defensiveTactics, handlerNow.offense.shooting, onBallRead.cushion)) <= ON_BALL_STANCE_METERS
      const lag = settledOnBall || drivingNow ? lead - onBallRead!.reaction : 0
      const target = onBallRead !== null && handlerNow !== undefined
        ? guardPosition({ x: handlerNow.position.x + handlerNow.velocity.x * lag, y: handlerNow.position.y + handlerNow.velocity.y * lag }, state.ball.position, defendedBasket, 'ON_BALL', state.court, defensiveTactics, handlerNow.offense.shooting, onBallRead.cushion)
        : kind === 'ON_BALL' ? rawTarget : keepGoalSide(rawTarget, state.ball.position, defendedBasket)
      const distanceToTarget = distanceBetween(defender.position, target)
      const isContainingDrive = kind === 'ON_BALL' && activeDrive?.playerId === ballHandlerId
      const urgentRotation = (kind === 'HELP' || kind === 'LOW_MAN' || kind === 'ROTATE' || kind === 'X_OUT' || kind === 'RECOVER' || kind === 'TAG' || kind === 'DIG')
        && distanceToTarget > 2
      // BT6.6: every defender goes all out to stay in front of a drive; whether he can is his read, his feet and his speed (PointOfAttack).
      const urgency: MovementUrgency = isContainingDrive
        ? 'sprint'
        : (possession.phase === 'ADVANCE' && distanceToTarget > 2) || urgentRotation ? 'run'
          // A defender who is far from where he must be (a closeout after a catch, a swing to the far side) hustles;
          // a jog is only for small adjustments around his man.
          : distanceToTarget > CLOSEOUT_SPRINT_DISTANCE_METERS ? 'sprint' : distanceToTarget > TRACKING_RUN_DISTANCE_METERS ? 'run' : 'jog'
      // With far to go he turns and runs; close to his spot he faces the ball (stance). BT4.2.
      const facing: MovementFacing = tuning().defenderTravelFacing !== 0 && (distanceToTarget > 3 || (isContainingDrive && distanceToTarget > ON_BALL_TURN_AND_RUN_METERS)) ? { kind: 'TRAVEL' } : { kind: 'BALL' }
      intents.push({
        playerId: defender.playerId,
        target,
        urgency: keepUrgencyAboveCurrentSpeed(urgency, defender),
        facing,
        ...(kind === 'ON_BALL' && facing.kind === 'BALL' && defender.kinematics.backpedalFactor !== undefined ? { stanceSlide: stanceSlideFactor(defender, defender.kinematics.backpedalFactor) } : {}),
        provenance: { responsibilityId: responsibility.id, decisionId: decision.id, owner: 'defensiveStructure' },
      })
      if (previous?.kind !== kind) state = emitEvent(state, 'defensiveResponsibilityChanged', { teamId: defender.teamId, playerId: defender.playerId, responsibilityKind: kind })
    }
  }

  const onBallDefenderPlayerId = onBallAssignment?.defenderPlayerId ?? null
  const calculatedHelpDefenders = responsibilities.filter((item) => item.kind === 'HELP' || item.kind === 'LOW_MAN' || item.kind === 'TAG' || item.kind === 'DIG').map((item) => item.playerId)
  const helpDefenderPlayerIds = prior && sameIds(prior.helpDefenderPlayerIds, calculatedHelpDefenders) ? prior.helpDefenderPlayerIds : calculatedHelpDefenders
  const structure: DefensiveStructureState = prior
    && assignments === prior.assignments
    && prior.defendedBasket.x === defendedBasket.x
    && prior.defendedBasket.y === defendedBasket.y
    && prior.onBallDefenderPlayerId === onBallDefenderPlayerId
    && helpDefenderPlayerIds === prior.helpDefenderPlayerIds
    && JSON.stringify(prior.helpDecision) === JSON.stringify(helpDecision)
    && (prior.rimProtectorPlayerId ?? null) === rimProtectorPlayerId
    ? prior
    : { teamId: defendingTeamId, scheme: 'MAN', defendedBasket, assignments, onBallDefenderPlayerId, helpDefenderPlayerIds, helpDecision, rimProtectorPlayerId }
  return {
    ...state,
    defensiveStructure: structure,
    responsibilities: [...state.responsibilities.filter((item) => item.owner !== 'defensiveStructure'), ...responsibilities],
    decisions: [...state.decisions.filter((item) => item.owner !== 'defensiveStructure'), ...decisions],
    movementIntents: [...state.movementIntents.filter((item) => item.provenance.owner !== 'defensiveStructure'), ...intents],
    nextResponsibilitySequence,
    nextDecisionSequence,
  }
}

/** Keep a foot in the paint: the man-to-man defender whose attacker is farthest from the ball sags to the rim. */
const RIM_PROTECTOR_DISTANCE_METERS = 2.4
/** The protector stays until his man is this close to the ball (then he has to be his man's defender again). */
const RIM_PROTECTOR_KEEP_BALL_DISTANCE_METERS = 4.5
const RIM_PROTECTOR_MIN_BALL_DISTANCE_METERS = 6

/** How much sense it makes to leave this attacker alone: far from the ball and unable to punish the space. */
function sagScore(attacker: MatchPlayerState, ballDistance: number): number {
  return ballDistance * 0.6 + (100 - attacker.offense.shooting) * 0.12
}

function resolveRimProtector(
  state: MatchState,
  assignments: readonly DefensiveAssignment[],
  playerById: ReadonlyMap<PlayerId, MatchPlayerState>,
  ballHandlerId: PlayerId | null,
  prior: PlayerId | null,
  helpDecision: DefensiveHelpDecision,
  basket: CourtPosition,
): PlayerId | null {
  if (helpDecision.status === 'TRIGGERED' || ballHandlerId === null) return null
  const candidates = assignments
    .filter((item) => item.attackerPlayerId !== ballHandlerId)
    .map((item) => ({ item, attacker: playerById.get(item.attackerPlayerId), defender: playerById.get(item.defenderPlayerId) }))
    .filter((entry): entry is { item: DefensiveAssignment; attacker: MatchPlayerState; defender: MatchPlayerState } => entry.attacker !== undefined && entry.defender !== undefined)
    .map((entry) => ({ ...entry, ballDistance: distanceBetween(entry.attacker.position, state.ball.position) }))
  const kept = prior === null ? undefined : candidates.find((entry) => entry.item.defenderPlayerId === prior)
  if (kept !== undefined && kept.ballDistance >= RIM_PROTECTOR_KEEP_BALL_DISTANCE_METERS) return prior
  const chosen = candidates
    .filter((entry) => entry.ballDistance >= RIM_PROTECTOR_MIN_BALL_DISTANCE_METERS && distanceBetween(entry.attacker.position, basket) >= 4)
    // BT4L: the man who sags into the paint is the one who can least punish it: far from the ball AND the worst shooter. An elite
    // spot-up shooter is never the one left alone.
    .sort((left, right) => sagScore(right.attacker, right.ballDistance) - sagScore(left.attacker, left.ballDistance) || comparePlayerId(left.defender, right.defender))[0]
  return chosen?.item.defenderPlayerId ?? null
}

/**
 * BT4.1: the weak-side helper keeps a foot in the paint but does not abandon his man: he sags along the line from his man to the
 * help spot, no farther than he can recover from, and less against a man who can punish the space.
 */
/** A defender never takes a spot farther from his basket than the ball: he stays goal-side, level with the ball at most, and does not follow a trailer into the other half. */
function keepGoalSide(target: CourtPosition, ball: CourtPosition, basket: CourtPosition): CourtPosition {
  const margin = tuning().goalSideMarginMeters
  if (margin <= 0) return target
  const limit = distanceBetween(ball, basket) + margin
  const current = distanceBetween(target, basket)
  if (current <= limit || current < 1e-6) return target
  const k = limit / current
  return { x: basket.x + (target.x - basket.x) * k, y: basket.y + (target.y - basket.y) * k }
}

function sagTowardRim(attacker: MatchPlayerState, helpSpot: CourtPosition): CourtPosition {
  const reach = Math.min(tuning().helpSagMaxMeters, tuning().helpSagBaseMeters + (100 - attacker.offense.shooting) * 0.025)
  const gap = distanceBetween(attacker.position, helpSpot)
  if (gap <= reach) return helpSpot
  const k = reach / gap
  return { x: attacker.position.x + (helpSpot.x - attacker.position.x) * k, y: attacker.position.y + (helpSpot.y - attacker.position.y) * k }
}

function rimProtectorPosition(ball: CourtPosition, basket: CourtPosition, court: MatchState['court']): CourtPosition {
  const towardBall = unitVector({ x: ball.x - basket.x, y: ball.y - basket.y }, { x: basket.x >= court.lengthMeters / 2 ? -1 : 1, y: 0 })
  return { x: clamp(basket.x + towardBall.x * RIM_PROTECTOR_DISTANCE_METERS, 0.15, court.lengthMeters - 0.15), y: clamp(basket.y + towardBall.y * RIM_PROTECTOR_DISTANCE_METERS * 0.6, 0.15, court.widthMeters - 0.15) }
}

function resolveDriveHelpDecision(
  state: MatchState,
  assignments: readonly DefensiveAssignment[],
  playerById: ReadonlyMap<PlayerId, MatchPlayerState>,
  ballHandlerId: PlayerId | null,
  drive: MatchState['actions'][number] | undefined,
  prior: DefensiveHelpDecision | undefined,
  basket: CourtPosition,
  helpAggression = 0.5,
  tacticalKnowledge = 50,
): DefensiveHelpDecision {
  const source = drive?.kind === 'DRIVE' && drive.playerId === ballHandlerId
    && (drive.status === 'ACTIVE' || drive.outcome === 'ADVANTAGE') ? drive : undefined
  if (!source || !source.startPosition || !source.target || !ballHandlerId) {
    return { status: 'NOT_NEEDED', ballHandlerPlayerId: ballHandlerId, reason: 'No active paint drive; stay connected to assigned players.', rotations: [] }
  }
  if (prior?.status === 'TRIGGERED' && prior.sourceActionId === source.id) return prior

  const handler = playerById.get(ballHandlerId)
  const onBallAssignment = assignments.find((item) => item.attackerPlayerId === ballHandlerId)
  const onBallDefender = onBallAssignment ? playerById.get(onBallAssignment.defenderPlayerId) : undefined
  if (!handler || !onBallDefender) return { status: 'NOT_NEEDED', ballHandlerPlayerId: ballHandlerId, sourceActionId: source.id, reason: 'No valid on-ball matchup; preserve the current shell.', rotations: [] }

  const progress = distanceBetween(handler.position, source.startPosition)
  const basketDistance = distanceBetween(handler.position, basket)
  const direction = unitVector({ x: basket.x - onBallDefender.position.x, y: basket.y - onBallDefender.position.y }, { x: basket.x >= state.court.lengthMeters / 2 ? -1 : 1, y: 0 })
  const handlerPastDefender = (handler.position.x - onBallDefender.position.x) * direction.x
    + (handler.position.y - onBallDefender.position.y) * direction.y > 0.5
  // BT6.15: an aggressive help defense reads the drive early and meets it high (protects the rim, leaves the kick-out); a conservative one
  // waits for the driver at the rim. The trigger distance runs from 3.4 m (stay home) to 7 m (help early).
  const enteredPaintThreat = basketDistance <= HELP_TRIGGER_MIN_METERS + helpAggression * HELP_TRIGGER_RANGE_METERS
  const containment = clamp((onBallDefender.defense.pointOfAttack + onBallDefender.defense.mobility
    - handler.offense.rimAttack - handler.offense.creation) / 200, -0.12, 0.12)
  const beaten = handlerPastDefender && basketDistance <= DRIVE_PAINT_THREAT_METERS + 2 + containment
  if (progress < 1 || !enteredPaintThreat && !beaten) {
    return {
      status: 'NOT_NEEDED', ballHandlerPlayerId: ballHandlerId, sourceActionId: source.id,
      reason: `No help: ball handler has not entered the paint threat area or beaten the on-ball defender (${basketDistance.toFixed(1)}m from rim).`,
      rotations: [],
    }
  }

  const centerY = state.court.widthMeters / 2
  const ballSide = Math.sign(state.ball.position.y - centerY)
  const candidates = assignments.filter((item) => item.attackerPlayerId !== ballHandlerId)
    .map((assignment) => ({ assignment, defender: playerById.get(assignment.defenderPlayerId), attacker: playerById.get(assignment.attackerPlayerId) }))
    .filter((item): item is { assignment: DefensiveAssignment; defender: MatchPlayerState; attacker: MatchPlayerState } => item.defender !== undefined && item.attacker !== undefined)
  // BT5.20: a defense that knows its matchups does not help off an elite shooter when someone else can.
  const stayHome = (attacker: MatchPlayerState): boolean => tacticalKnowledge >= 45 && attacker.offense.shooting >= 80
  const weaksideLowMan = candidates.filter(({ attacker }) => ballSide !== 0 && Math.sign(attacker.position.y - centerY) !== 0 && Math.sign(attacker.position.y - centerY) !== ballSide && !stayHome(attacker))
    .sort((left, right) => distanceBetween(left.attacker.position, basket) - distanceBetween(right.attacker.position, basket)
      || distanceBetween(left.defender.position, basket) - distanceBetween(right.defender.position, basket)
      || String(left.assignment.defenderPlayerId).localeCompare(String(right.assignment.defenderPlayerId)))[0]
  const helper = weaksideLowMan ?? candidates
    .sort((left, right) => distanceBetween(left.defender.position, basket) - distanceBetween(right.defender.position, basket)
      || distanceBetween(left.attacker.position, basket) - distanceBetween(right.attacker.position, basket)
      || String(left.assignment.defenderPlayerId).localeCompare(String(right.assignment.defenderPlayerId)))[0]
  if (!helper) return { status: 'NOT_NEEDED', ballHandlerPlayerId: ballHandlerId, sourceActionId: source.id, reason: 'No valid help defender; keep the on-ball matchup and rim coverage.', rotations: [] }

  const available = candidates.filter((candidate) => candidate.assignment.defenderPlayerId !== helper.assignment.defenderPlayerId)
  const helperMan = helper.attacker
  const rotator = available.slice().sort((left, right) => distanceBetween(left.defender.position, helperMan.position) - distanceBetween(right.defender.position, helperMan.position)
    || String(left.assignment.defenderPlayerId).localeCompare(String(right.assignment.defenderPlayerId)))[0]
  const xOut = rotator ? available.filter((candidate) => candidate.assignment.defenderPlayerId !== rotator.assignment.defenderPlayerId)
    .sort((left, right) => distanceBetween(left.attacker.position, state.ball.position) - distanceBetween(right.attacker.position, state.ball.position)
      || String(left.assignment.defenderPlayerId).localeCompare(String(right.assignment.defenderPlayerId)))[0] : undefined
  const rotations: DefensiveHelpDecision['rotations'] = [
    ...(rotator ? [{ playerId: rotator.assignment.defenderPlayerId, kind: 'ROTATE' as const, targetAttackerPlayerId: helperMan.playerId }] : []),
    ...(xOut && rotator ? [{ playerId: xOut.assignment.defenderPlayerId, kind: 'X_OUT' as const, targetAttackerPlayerId: rotator.attacker.playerId, secondaryAttackerPlayerId: xOut.attacker.playerId }] : []),
  ]
  const cause = enteredPaintThreat ? 'handler entered the paint threat area' : 'on-ball defender was beaten before the paint'
  return {
    status: 'TRIGGERED', ballHandlerPlayerId: ballHandlerId, sourceActionId: source.id,
    reason: `Help triggered because ${cause}; ${weaksideLowMan ? 'weak side low man' : 'nearest rim-side assignment'} helps, then ROTATE and X_OUT cover the vacated matchups.`,
    helperPlayerId: helper.assignment.defenderPlayerId,
    helperKind: weaksideLowMan ? 'LOW_MAN' : 'HELP',
    triggeredT: state.t,
    rotations,
  }
}

interface ExtraHelp { readonly defenderId: PlayerId; readonly kind: 'TAG' | 'DIG'; readonly target: CourtPosition; readonly reason: string }

/**
 * BT5.18 help responsibilities beyond the drive:
 *  - TAG: a roller diving to the rim behind a hedge, a trap, or a drop that has lost him is met by the low man (the weak-side defender
 *    nearest the rim), who leaves his own man for the kick-out;
 *  - TAG (pick-up): a screener who pops while his defender traps the handler is picked up by the nearest defender who is not trapping;
 *  - DIG: a post touch (the ball held within 4.2 m of the rim without a drive) draws the nearest ball-side defender a step toward the ball.
 * How readily the defense does each follows its help aggression.
 */
function resolveScreenAndPostHelp(state: MatchState, assignments: readonly DefensiveAssignment[], playerById: ReadonlyMap<PlayerId, MatchPlayerState>, ballHandlerId: PlayerId | null, basket: CourtPosition, help: number): ExtraHelp | null {
  if (ballHandlerId === null) return null
  const handler = playerById.get(ballHandlerId)
  if (handler === undefined) return null
  const screen = state.screen
  const defenderOf = (attackerId: PlayerId): PlayerId | undefined => assignments.find((item) => item.attackerPlayerId === attackerId)?.defenderPlayerId
  const centerY = state.court.widthMeters / 2
  if (screen !== null && screen.phase === 'USED' && !screen.switched && help >= 0.25) {
    const screener = playerById.get(screen.screenerId)
    const screenerDefender = playerById.get(screen.screenerDefenderId)
    if (screener !== undefined && screenerDefender !== undefined) {
      const busy = new Set<PlayerId>([screen.handlerDefenderId, screen.screenerDefenderId])
      const free = assignments.filter((item) => !busy.has(item.defenderPlayerId) && item.attackerPlayerId !== ballHandlerId)
        .map((item) => ({ item, defender: playerById.get(item.defenderPlayerId)!, attacker: playerById.get(item.attackerPlayerId)! }))
        .filter((entry) => entry.defender !== undefined && entry.attacker !== undefined)
      const rollerFree = distanceBetween(screenerDefender.position, screener.position) > 2.2
      if (screen.exit === 'ROLL' && distanceBetween(screener.position, basket) <= 5.5 && (screen.coverage === 'hedge' || screen.coverage === 'blitz' || rollerFree)) {
        const lowSide = Math.sign(handler.position.y - centerY) || 1
        const tagger = free
          .sort((left, right) => (Math.sign(left.attacker.position.y - centerY) === lowSide ? 1 : 0) - (Math.sign(right.attacker.position.y - centerY) === lowSide ? 1 : 0)
            || distanceBetween(left.defender.position, basket) - distanceBetween(right.defender.position, basket) || String(left.defender.playerId).localeCompare(String(right.defender.playerId)))[0]
        if (tagger !== undefined) {
          const toRim = unitVector({ x: basket.x - screener.position.x, y: basket.y - screener.position.y }, { x: 1, y: 0 })
          return { defenderId: tagger.defender.playerId, kind: 'TAG', target: { x: screener.position.x + toRim.x * 1.0, y: screener.position.y + toRim.y * 1.0 }, reason: `Low man tags the roller (${screen.coverage})` }
        }
      }
      if (screen.exit === 'POP' && screen.coverage === 'blitz') {
        const picker = free.sort((left, right) => distanceBetween(left.defender.position, screener.position) - distanceBetween(right.defender.position, screener.position) || String(left.defender.playerId).localeCompare(String(right.defender.playerId)))[0]
        if (picker !== undefined) return { defenderId: picker.defender.playerId, kind: 'TAG', target: guardPosition(screener.position, state.ball.position, basket, 'GAP', state.court), reason: 'Rotate to the popping screener the trap left open' }
      }
    }
  }
  // A post touch is a CATCH near the block (not a driver who stopped there, not a rebounder): the dig comes while he is still deciding.
  const flow = state.offenseFlow
  const postTouch = flow !== null && flow.caughtFromPass && flow.holderPlayerId === ballHandlerId && state.t - flow.holderSinceT <= 25 && state.transition === null
  if (postTouch && state.ball.kind === 'HELD' && distanceBetween(handler.position, basket) <= 4.2 && postScore(handler) >= 62 - (help - 0.5) * 30) {
    const ballSide = Math.sign(handler.position.y - centerY) || 1
    const digger = assignments.filter((item) => item.attackerPlayerId !== ballHandlerId)
      .map((item) => ({ defender: playerById.get(item.defenderPlayerId), attacker: playerById.get(item.attackerPlayerId) }))
      .filter((entry): entry is { defender: MatchPlayerState; attacker: MatchPlayerState } => entry.defender !== undefined && entry.attacker !== undefined
        && Math.sign(entry.attacker.position.y - centerY) === ballSide && distanceBetween(entry.attacker.position, handler.position) <= 7.5)
      .sort((left, right) => distanceBetween(left.defender.position, handler.position) - distanceBetween(right.defender.position, handler.position) || String(left.defender.playerId).localeCompare(String(right.defender.playerId)))[0]
    if (digger !== undefined) {
      const toward = unitVector({ x: handler.position.x - digger.attacker.position.x, y: handler.position.y - digger.attacker.position.y }, { x: 1, y: 0 })
      const distance = distanceBetween(handler.position, digger.attacker.position)
      const step = Math.max(0, distance - 1.4)
      return { defenderId: digger.defender.playerId, kind: 'DIG', target: { x: digger.attacker.position.x + toward.x * step, y: digger.attacker.position.y + toward.y * step }, reason: 'Dig at the post touch from the ball side' }
    }
  }
  return null
}

/**
 * BT5.15 switch back: after a switch, once the action is over and the two switched attackers are away from the ball, a defense that
 * knows its matchups trades back the mismatch it cannot live with (a small on a big who is posting near the rim).
 */
function switchBack(state: MatchState, assignments: readonly DefensiveAssignment[], tacticalKnowledge: number): readonly DefensiveAssignment[] {
  if (tacticalKnowledge < 40 || state.screen !== null || state.ball.kind !== 'HELD') return assignments
  const switched = assignments.filter((item) => item.source === 'SWITCH' && state.t - item.startedT >= 15)
  if (switched.length !== 2 || switched[0]!.startedT !== switched[1]!.startedT) return assignments
  const [a, b] = switched as [DefensiveAssignment, DefensiveAssignment]
  const find = (id: PlayerId): MatchPlayerState | undefined => state.players.find((player) => player.playerId === id)
  const basket = state.defensiveStructure?.defendedBasket
  if (basket === undefined) return assignments
  const holder = state.ball.ownerPlayerId
  const badMismatch = (assignment: DefensiveAssignment): boolean => {
    const defender = find(assignment.defenderPlayerId)
    const attacker = find(assignment.attackerPlayerId)
    return defender !== undefined && attacker !== undefined && attacker.heightCm - defender.heightCm >= 12 && distanceBetween(attacker.position, basket) <= 5 && attacker.playerId !== holder
  }
  if (!badMismatch(a) && !badMismatch(b)) return assignments
  if (a.attackerPlayerId === holder || b.attackerPlayerId === holder) return assignments
  return assignments.map((item) => item === a ? { ...a, attackerPlayerId: b.attackerPlayerId, source: 'STRUCTURAL_REASSIGNMENT' as const, startedT: state.t }
    : item === b ? { ...b, attackerPlayerId: a.attackerPlayerId, source: 'STRUCTURAL_REASSIGNMENT' as const, startedT: state.t } : item)
}

function rotationTargetPosition(
  rotation: DefensiveHelpDecision['rotations'][number],
  playerById: ReadonlyMap<PlayerId, MatchPlayerState>,
  ball: CourtPosition,
  basket: CourtPosition,
  court: MatchState['court'],
  tactics: MatchState['tacticalPlans']['home']['defense'],
): CourtPosition | undefined {
  const first = playerById.get(rotation.targetAttackerPlayerId)
  if (!first) return undefined
  const firstTarget = guardPosition(first.position, ball, basket, 'GAP', court, tactics)
  if (!rotation.secondaryAttackerPlayerId) return firstTarget
  const second = playerById.get(rotation.secondaryAttackerPlayerId)
  if (!second) return firstTarget
  const secondTarget = guardPosition(second.position, ball, basket, 'GAP', court, tactics)
  return { x: (firstTarget.x + secondTarget.x) / 2, y: (firstTarget.y + secondTarget.y) / 2 }
}

function handlerPosition(state: MatchState, handlerId: PlayerId | null, fallback: CourtPosition): CourtPosition {
  return state.players.find((player) => player.playerId === handlerId)?.position ?? fallback
}

/** A defender who is already running fast does not get a slower urgency than his current speed: he brakes, he does not snap. */
function keepUrgencyAboveCurrentSpeed(urgency: MovementUrgency, defender: MatchPlayerState): MovementUrgency {
  const speed = Math.hypot(defender.velocity.x, defender.velocity.y)
  const order: readonly MovementUrgency[] = ['walk', 'jog', 'run', 'sprint']
  for (let index = order.indexOf(urgency); index < order.length; index += 1) {
    const candidate = order[index]!
    if (speed <= defender.kinematics.maxSpeedMps * MOVEMENT_URGENCY_FACTORS[candidate] + 0.05) return candidate
  }
  return 'sprint'
}

/** Positions a defender from live man/ball/basket geometry, never an offensive slot target. */
export function guardPosition(
  attackerPosition: CourtPosition,
  ballPosition: CourtPosition,
  defendedBasket: CourtPosition,
  responsibility: 'ON_BALL' | 'GAP' | 'HELP',
  court: MatchState['court'],
  tactics?: MatchState['tacticalPlans']['home']['defense'],
  /** Shooting rating of the man being guarded: a defender crowds a shooter who can punish space and sags off one who cannot. */
  attackerShooting = 55,
  /** BT6: the on-ball cushion from the point-of-attack model (pressure and matchup); omitted: the shape's perimeter level. */
  onBallCushionMeters?: number,
): CourtPosition {
  const threatScale = clamp(1.5 - attackerShooting * 0.009, 0.65, 1.4)
  const basketSideFallback = { x: defendedBasket.x >= court.lengthMeters / 2 ? -1 : 1, y: 0 }
  const towardBasket = unitVector({ x: defendedBasket.x - attackerPosition.x, y: defendedBasket.y - attackerPosition.y }, basketSideFallback)
  const towardBall = unitVector({ x: ballPosition.x - attackerPosition.x, y: ballPosition.y - attackerPosition.y }, { x: 0, y: 0 })
  const basketDistance = distanceBetween(attackerPosition, defendedBasket)
  const onBallCushion = onBallCushionMeters ?? clamp(ON_BALL_CUSHION_METERS - (tactics?.perimeter ?? 0) * 0.12, 0.6, 1.5)
  const gapDepth = clamp((GAP_DEPTH_METERS + (tactics?.interior ?? 0) * 0.1) * threatScale, 0.4, 1.6)
  const helpDepth = clamp(HELP_DEPTH_METERS + (tactics?.interior ?? 0) * 0.2, 0.7, 2.3)
  const gapShade = clamp((GAP_SHADE_METERS + (tactics?.perimeter ?? 0) * 0.1) * threatScale, 0.25, 1.2)
  const depth = responsibility === 'ON_BALL' ? Math.min(onBallCushion, Math.max(0, basketDistance - 0.45))
    : responsibility === 'GAP' ? Math.min(gapDepth, Math.max(0, basketDistance - 0.6))
      : Math.min(helpDepth, Math.max(0, basketDistance - 0.6))
  const ballLateral = (ballPosition.x - attackerPosition.x) * -towardBasket.y + (ballPosition.y - attackerPosition.y) * towardBasket.x
  const shade = responsibility === 'ON_BALL' ? clamp(ballLateral * 0.05, -0.12, 0.12)
    : responsibility === 'GAP' ? gapShade : responsibility === 'HELP' ? HELP_SHADE_METERS : 0
  const target = {
    x: attackerPosition.x + towardBasket.x * depth + (responsibility === 'ON_BALL' ? -towardBasket.y : towardBall.x) * shade,
    y: attackerPosition.y + towardBasket.y * depth + (responsibility === 'ON_BALL' ? towardBasket.x : towardBall.y) * shade,
  }
  const basketDirection = defendedBasket.x >= court.lengthMeters / 2 ? 1 : -1
  if (responsibility === 'GAP' && (ballPosition.x - attackerPosition.x) * basketDirection > 2) {
    const shellDepth = Math.min(1.8, Math.max(0, Math.abs(defendedBasket.x - ballPosition.x) - 0.6))
    const shellX = ballPosition.x + basketDirection * shellDepth
    if ((target.x - shellX) * basketDirection < 0) target.x = shellX
  }
  return { x: clamp(target.x, 0.15, court.lengthMeters - 0.15), y: clamp(target.y, 0.15, court.widthMeters - 0.15) }
}

function createAssignments(state: MatchState, defenders: readonly MatchPlayerState[], attackers: readonly MatchPlayerState[], structural: boolean): readonly DefensiveAssignment[] {
  const defenseTeam = defenders[0]!.teamId
  const overrides = defenseTeam === state.homeTeamId ? state.defensiveMatchupOverrides.home : state.defensiveMatchupOverrides.away
  const defenderIds = new Set(defenders.map((player) => player.playerId))
  const attackerIds = new Set(attackers.map((player) => player.playerId))
  const selectedDefenders = new Set<PlayerId>()
  const selectedAttackers = new Set<PlayerId>()
  const assignmentByDefender = new Map<PlayerId, DefensiveAssignment>()
  for (const override of overrides) {
    if (!defenderIds.has(override.playerId) || !attackerIds.has(override.opponentPlayerId)) continue
    selectedDefenders.add(override.playerId)
    selectedAttackers.add(override.opponentPlayerId)
    assignmentByDefender.set(override.playerId, {
      defenderPlayerId: override.playerId,
      attackerPlayerId: override.opponentPlayerId,
      teamId: defenseTeam,
      startedT: state.t,
      source: 'OVERRIDE',
    })
  }

  const remainingDefenders = defenders.filter((player) => !selectedDefenders.has(player.playerId)).sort(comparePlayerId)
  const remainingAttackers = attackers.filter((player) => !selectedAttackers.has(player.playerId)).sort(comparePlayerId)
  const best = minimumCostMatching(remainingDefenders, remainingAttackers)
  for (const [defender, attacker] of best) assignmentByDefender.set(defender.playerId, {
    defenderPlayerId: defender.playerId,
    attackerPlayerId: attacker.playerId,
    teamId: defenseTeam,
    startedT: state.t,
    source: structural ? 'STRUCTURAL_REASSIGNMENT' : 'INITIAL',
  })
  return defenders.slice().sort(comparePlayerId).map((defender) => assignmentByDefender.get(defender.playerId)!)
}

function minimumCostMatching(defenders: readonly MatchPlayerState[], attackers: readonly MatchPlayerState[]): readonly (readonly [MatchPlayerState, MatchPlayerState])[] {
  let bestCost = Number.POSITIVE_INFINITY
  let bestPairs: readonly (readonly [MatchPlayerState, MatchPlayerState])[] = []
  const visit = (index: number, remaining: readonly MatchPlayerState[], pairs: readonly (readonly [MatchPlayerState, MatchPlayerState])[], cost: number) => {
    if (index === defenders.length) {
      if (cost < bestCost - 1e-9 || Math.abs(cost - bestCost) <= 1e-9 && lexicographicallyBefore(pairs, bestPairs)) {
        bestCost = cost
        bestPairs = pairs
      }
      return
    }
    const defender = defenders[index]!
    for (let candidateIndex = 0; candidateIndex < remaining.length; candidateIndex += 1) {
      const attacker = remaining[candidateIndex]!
      visit(index + 1, remaining.filter((_, itemIndex) => itemIndex !== candidateIndex), [...pairs, [defender, attacker]], cost + matchupCost(defender, attacker))
    }
  }
  visit(0, attackers, [], 0)
  return bestPairs
}

function matchupCost(defender: MatchPlayerState, attacker: MatchPlayerState): number {
  const positions = ['PG', 'SG', 'SF', 'PF', 'C'] as const
  const positionCost = Math.abs(positions.indexOf(defender.primaryPosition) - positions.indexOf(attacker.primaryPosition)) * 0.8
  const heightCost = Math.abs(defender.heightCm - attacker.heightCm) / 100 * 0.12
  const mobilityCost = Math.abs(defender.defensiveMobility - attacker.defensiveMobility) / 100 * 0.35
  return positionCost + heightCost + mobilityCost
}

function areAssignmentsValid(assignments: readonly DefensiveAssignment[], defenders: readonly MatchPlayerState[], attackers: readonly MatchPlayerState[]): boolean {
  const defenderIds = new Set(assignments.map((item) => item.defenderPlayerId))
  const attackerIds = new Set(assignments.map((item) => item.attackerPlayerId))
  return assignments.length === 5
    && defenderIds.size === 5
    && attackerIds.size === 5
    && defenders.every((player) => defenderIds.has(player.playerId))
    && attackers.every((player) => attackerIds.has(player.playerId))
    && assignments.every((item) => item.teamId === defenders[0]!.teamId)
}

function clearDefensiveState(state: MatchState): MatchState {
  if (state.defensiveStructure === null
    && state.responsibilities.every((item) => item.owner !== 'defensiveStructure')
    && state.decisions.every((item) => item.owner !== 'defensiveStructure')
    && state.movementIntents.every((item) => item.provenance.owner !== 'defensiveStructure')) return state
  return {
    ...state,
    defensiveStructure: null,
    responsibilities: state.responsibilities.filter((item) => item.owner !== 'defensiveStructure'),
    decisions: state.decisions.filter((item) => item.owner !== 'defensiveStructure'),
    movementIntents: state.movementIntents.filter((item) => item.provenance.owner !== 'defensiveStructure'),
  }
}

function currentOrPriorHandler(state: MatchState, offenseTeamId: TeamId): PlayerId | null {
  if (state.ball.kind === 'HELD' && state.ball.ownerTeamId === offenseTeamId) return state.ball.ownerPlayerId
  if (state.ball.kind === 'PASS_IN_FLIGHT' && state.ball.passerTeamId === offenseTeamId) return state.ball.passerPlayerId
  if (state.ball.kind === 'SHOT_IN_FLIGHT' && state.ball.shooterTeamId === offenseTeamId) return state.ball.shooterPlayerId
  if (state.ball.kind === 'REBOUNDABLE' && state.ball.shootingTeamId === offenseTeamId) return state.ball.shotByPlayerId
  if (state.offensiveStructure?.teamId === offenseTeamId) return state.offensiveStructure.ballPlayerId
  return null
}

function unitVector(vector: CourtPosition, fallback: CourtPosition): CourtPosition {
  const magnitude = Math.hypot(vector.x, vector.y)
  if (magnitude > 1e-9) return { x: vector.x / magnitude, y: vector.y / magnitude }
  return fallback
}

function comparePlayerId(left: MatchPlayerState, right: MatchPlayerState): number {
  return String(left.playerId).localeCompare(String(right.playerId))
}

function lexicographicallyBefore(left: readonly (readonly [MatchPlayerState, MatchPlayerState])[], right: readonly (readonly [MatchPlayerState, MatchPlayerState])[]): boolean {
  if (right.length === 0) return true
  const leftKey = left.map((pair) => String(pair[1].playerId)).join('\u0000')
  const rightKey = right.map((pair) => String(pair[1].playerId)).join('\u0000')
  return leftKey.localeCompare(rightKey) < 0
}

function sameIds(left: readonly PlayerId[], right: readonly PlayerId[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index])
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}
