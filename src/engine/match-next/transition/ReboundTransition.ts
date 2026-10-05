import { activeActions } from '../actions/ActionIndex'
import { distanceBetween, type CourtPosition } from '@/domain/court'
import type { PlayerId, TeamId } from '@/domain/ids'
import { draw } from '../rng'
import { judgeBallContestContact } from '../contact/BallContestFouls'
import { emitEvent, findLastEvent } from '../events'
import { secureRebound } from '../ball/BallTransitions'
import { REBOUND_ACQUISITION_RADIUS_METERS } from '../ball/BallState'
import { changePossessionPhase } from '../possession'
import { activePossession, type MatchPlayerState, type MatchState, type MatchTransitionState, type ReboundResponsibility, type TransitionAdvantage, type TransitionRole, type TransitionRoleKind, type TransitionTrigger } from '../state'
import type { ResponsibilityOwner } from '../responsibility/Responsibility'
import type { MovementIntent } from '../movement/MovementIntent'
import { advanceTarget } from '../structure/OffensiveStructure'
import { attackingBasketForTeam } from '../structure/FiveOutStructure'
import { guardPosition } from '../defense/ManDefense'
import { tuning } from '../tuning'
import { defensiveShape, tacticalIntent } from '../tactics/TacticalIdentity'

const REBOUND_PURSUERS_PER_TEAM = 2
/** Beyond this distance from the landing point an offensive player cannot win the ball: he retreats instead. */
const CRASH_MAX_DISTANCE_METERS = 5.5
/** An offensive player who is this much farther than the nearest defender has no realistic chance either. */
const CRASH_MAX_DISADVANTAGE_METERS = 2.0
const FRONTCOURT_ADVANTAGE_DISTANCE_METERS = 0.5

/** Clears temporary roles before their normal structural authorities run again. */
export function clearExpiredReboundTransition(state: MatchState): MatchState {
  let next = state
  const missedShotInFlight = next.ball.kind === 'SHOT_IN_FLIGHT' && next.ball.plannedOutcome.kind === 'MISS' && next.ball.freeThrow === undefined && next.ball.foul === undefined
  if (next.reboundState && next.ball.kind !== 'REBOUNDABLE' && !missedShotInFlight) {
    next = removeTemporaryRoles(next, next.reboundState.responsibilities.map((item) => item.responsibilityId))
    next = { ...next, reboundState: null }
  }
  if (next.transition && transitionHasEnded(next)) {
    const transition = next.transition
    next = removeTemporaryRoles(next, transition.roles.map((item) => item.responsibilityId))
    next = { ...next, transition: null }
    next = emitEvent(next, 'transitionResolved', {
      teamId: transition.teamId,
      transitionTrigger: transition.trigger,
      transitionAdvantage: transition.advantage,
    })
  }
  return next
}

/** Adds real kinematic intents for a live rebound or a possession-changing transition. */
export function reconcileReboundTransition(input: MatchState): MatchState {
  // A free throw or a fouled shot never opens a rebound in flight: the lane is held until the ball hits the rim (BT3E).
  if (input.ball.kind === 'REBOUNDABLE' || input.ball.kind === 'SHOT_IN_FLIGHT' && input.ball.plannedOutcome.kind === 'MISS' && input.ball.freeThrow === undefined && input.ball.foul === undefined) return reconcileRebound(input)
  return reconcileTransition(input)
}

/** How far a player can reach to control a falling ball: taller players cover more air around them. */
export function reboundReachMeters(player: MatchPlayerState): number {
  return clamp(0.85 + (player.standingReachCm - 190) * 0.008, 0.7, REBOUND_ACQUISITION_RADIUS_METERS)
}

/**
 * BT2I: a rebound is contested by everyone who can reach the ball when it comes down. Who controls it is decided by
 * ability and physical size, by how close each contender is to the ball, and by position: a player who has an opponent
 * sealed behind him (the opponent is on the far side of him from the ball) is boxing that opponent out.
 */
export function securePhysicalRebound(state: MatchState): MatchState {
  if (state.ball.kind !== 'REBOUNDABLE' || state.t < state.ball.availableAtT) return state
  const rebound = state.ball
  const eligible = state.players.filter((player) => player.active
    && distanceBetween(player.position, rebound.position) <= reboundReachMeters(player))
  if (eligible.length === 0) return state
  const drawResult = draw(state.rng, 'outcome')
  let next = { ...state, rng: drawResult.state }
  const weighted = eligible.map((player) => ({
    player,
    weight: reboundWeight(player, rebound.position, state),
  }))
  const total = weighted.reduce((sum, item) => sum + item.weight, 0)
  let roll = drawResult.value * total
  let winner = weighted.at(-1)!.player
  for (const item of weighted) {
    roll -= item.weight
    if (roll <= 0) { winner = item.player; break }
  }
  const judged = judgeBallContestContact(next, winner, 'REBOUNDING')
  if (judged.fouled) return judged.state
  next = secureRebound(judged.state, winner.playerId)
  return next
}

/** A stopped transition becomes ordinary half-court SETUP after players finish this movement tick. */
export function finishStoppedTransition(state: MatchState): MatchState {
  const possession = activePossession(state)
  if (!state.transition || !possession || possession.phase !== 'ADVANCE' || state.transition.advantage !== 'STOPPED') return state
  if (state.transition.trigger === 'defensiveRebound' && state.t - state.transition.startedT < 4) return state
  // A transition the defense has stopped is still a possession that has not crossed midcourt: the carrier brings it up (or the ball is
  // passed up) before the half-court offense begins. A rebounder with a man on him at the rim is not a half court (BT4.2).
  if (state.transition.trigger === 'madeBasketInbound' || tuning().transitionHoldsUntilFrontcourt !== 0) {
    const handler = state.ball.kind === 'HELD' ? findPlayer(state, state.ball.ownerPlayerId) : undefined
    if (state.transition.trigger !== 'madeBasketInbound' && handler === undefined) return state
    if (handler && !isInFrontcourt(handler.position, possession.teamId, state)) return state
  }
  return changePossessionPhase(state, 'SETUP')
}

function reconcileRebound(input: MatchState): MatchState {
  if (input.ball.kind !== 'REBOUNDABLE' && !(input.ball.kind === 'SHOT_IN_FLIGHT' && input.ball.plannedOutcome.kind === 'MISS' && input.ball.freeThrow === undefined && input.ball.foul === undefined)) return input
  const rebound = input.ball.kind === 'REBOUNDABLE' ? {
    phase: 'LIVE' as const,
    shootingTeamId: input.ball.shootingTeamId,
    availableAtT: input.ball.availableAtT,
    position: input.ball.position,
    target: input.ball.landingTarget,
  } : input.ball.plannedOutcome.kind === 'MISS' ? {
    phase: 'SHOT_FLIGHT' as const,
    shootingTeamId: input.ball.shooterTeamId,
    availableAtT: input.ball.plannedOutcome.reboundAvailableT,
    position: input.ball.plannedOutcome.reboundTarget,
    target: input.ball.plannedOutcome.reboundTarget,
  } : null
  if (!rebound) return input
  const prior = input.reboundState
  const shootingPlayers = input.players.filter((player) => player.active && player.teamId === rebound.shootingTeamId)
  const defendingTeamId = rebound.shootingTeamId === input.homeTeamId ? input.awayTeamId : input.homeTeamId
  const defendingPlayers = input.players.filter((player) => player.active && player.teamId === defendingTeamId)
  const reboundTarget = rebound.target
  // An offensive player crashes only when he can contest: he is close enough to the landing point and not
  // outnumbered by defenders already inside. Everyone else gets back (transition safety) instead of arriving late.
  const nearestDefenderDistance = Math.min(...defendingPlayers.map((player) => distanceBetween(player.position, rebound.position)), Number.POSITIVE_INFINITY)
  // BT5.12/5.19: how many go to the offensive glass is the shooting team's crash commitment (1 to 3); the rest get back.
  const crashCount = Math.max(1, Math.min(3, Math.round(1 + 2 * tacticalIntent(input, rebound.shootingTeamId).offense.crash)))
  const crashers = shootingPlayers
    .map((player) => ({ player, distance: distanceBetween(player.position, rebound.position), score: distanceBetween(player.position, rebound.position) - effectiveReboundingImpact(player) * 0.02 - player.standingReachCm * 0.001 }))
    .filter((item) => item.distance <= CRASH_MAX_DISTANCE_METERS && item.distance <= nearestDefenderDistance + CRASH_MAX_DISADVANTAGE_METERS)
    .sort((left, right) => left.score - right.score || comparePlayerId(left.player, right.player))
    .slice(0, crashCount)
  const crasherIds = new Set(crashers.map(({ player }) => player.playerId))
  // The nearest defenders go for the landing point from the moment the shot is released, exactly like the offensive
  // crashers. Waiting until the ball became collectible gave the shooting team the whole flight time as a head start
  // (BT1-Next audit: 121 of 123 rebounds, 98%, were offensive; seed 424242 t74).
  const pursuingDefenderIds = new Set(defendingPlayers.map((player) => player.playerId)
    .map((playerId) => ({ playerId, distance: distanceBetween(findPlayer(input, playerId)!.position, rebound.position) - effectiveReboundingImpact(findPlayer(input, playerId)!) * 0.02 }))
    .sort((left, right) => left.distance - right.distance || String(left.playerId).localeCompare(String(right.playerId)))
    .slice(0, REBOUND_PURSUERS_PER_TEAM).map((item) => item.playerId))

  // A fast team leaks its best runner out as the shot goes up (it gives up a body on the glass for the break).
  const defendingTempo = tacticalIntent(input, defendingTeamId).offense.tempo
  const leakerId = defendingTempo > 0.35 && tuning().leakOut !== 0 ? defendingPlayers.filter((player) => !pursuingDefenderIds.has(player.playerId))
    .sort((left, right) => distanceBetween(right.position, rebound.position) - distanceBetween(left.position, rebound.position) || comparePlayerId(left, right))[0]?.playerId : undefined
  let nextResponsibilitySequence = input.nextResponsibilitySequence
  let nextDecisionSequence = input.nextDecisionSequence
  const responsibilities: ReboundResponsibility[] = []
  const generalResponsibilities = [] as MatchState['responsibilities'][number][]
  const generalDecisions = [] as MatchState['decisions'][number][]
  const intents: MovementIntent[] = []
  const assignments = input.defensiveStructure?.teamId === defendingTeamId ? input.defensiveStructure.assignments : []
  const basket = attackingBasketForTeam(rebound.shootingTeamId, input.homeTeamId, input.period, input.court)
  const activePlayers = [...shootingPlayers, ...defendingPlayers]

  for (const player of activePlayers) {
    const offense = player.teamId === rebound.shootingTeamId
    const assignment = assignments.find((item) => item.defenderPlayerId === player.playerId)
    const assignedAttacker = assignment ? findPlayer(input, assignment.attackerPlayerId) : undefined
    let kind: ReboundResponsibility['kind']
    let target: CourtPosition
    let boxOutTarget: CourtPosition | undefined
    let owner: ResponsibilityOwner
    if (offense) {
      owner = 'offensiveStructure'
      if (input.ball.kind === 'REBOUNDABLE' && input.t >= rebound.availableAtT && crasherIds.has(player.playerId)) kind = 'PURSUE_REBOUND'
      else if (crasherIds.has(player.playerId)) kind = 'CRASH_REBOUND'
      else kind = 'RETREAT'
      target = kind === 'RETREAT' ? reboundSafetyTarget(player, reboundTarget, basket, input) : contestSlot(reboundTarget, basket, [...crashers.map((item) => item.player.playerId)].indexOf(player.playerId), true, input)
    } else {
      owner = 'defensiveStructure'
      kind = pursuingDefenderIds.has(player.playerId) ? 'PURSUE_REBOUND' : player.playerId === leakerId ? 'RETREAT' : 'BOX_OUT'
      boxOutTarget = kind === 'RETREAT' ? undefined : assignedAttacker ? boxOutPosition(assignedAttacker.position, reboundTarget, basket, input) : reboundTarget
      target = kind === 'PURSUE_REBOUND' ? contestSlot(reboundTarget, basket, [...pursuingDefenderIds].indexOf(player.playerId), false, input)
        : kind === 'RETREAT' ? leakTarget(player, basket, input) : boxOutTarget!
    }
    const previous = prior?.responsibilities.find((item) => item.playerId === player.playerId)
    const responsibilityId = previous?.kind === kind ? previous.responsibilityId : `responsibility-${nextResponsibilitySequence++}`
    const decisionId = previous?.kind === kind ? previous.decisionId : `decision-${nextDecisionSequence++}`
    const responsibility: ReboundResponsibility = {
      playerId: player.playerId, teamId: player.teamId, kind, target: { ...target },
      ...(boxOutTarget === undefined ? {} : { boxOutTarget: { ...boxOutTarget } }), responsibilityId, decisionId,
    }
    responsibilities.push(responsibility)
    generalResponsibilities.push({
      id: responsibilityId, playerId: player.playerId, teamId: player.teamId, kind, owner,
      startedT: previous?.kind === kind ? (input.responsibilities.find((item) => item.id === responsibilityId)?.startedT ?? input.t) : input.t,
      reason: kind === 'BOX_OUT' ? 'Establish basket-side position on the assigned attacker and rebound area'
        : kind === 'CRASH_REBOUND' ? 'Pursue the live rebound from a selected offensive crash position'
          : kind === 'PURSUE_REBOUND' ? 'Pursue the collectible ball through live kinematics'
            : 'Keep transition safety spacing while teammates pursue the rebound',
      endCondition: { kind: 'possessionEnds' },
    })
    generalDecisions.push({
      id: decisionId, playerId: player.playerId, responsibilityId, kind, owner, startedT: input.t,
      reason: `Rebound assignment: ${kind}`,
    })
    intents.push({
      playerId: player.playerId, target: { ...target }, urgency: kind === 'BOX_OUT' ? 'run' : 'sprint', facing: { kind: 'BALL' },
      provenance: { responsibilityId, decisionId, owner },
    })
  }

  const roleIds = new Set(responsibilities.map((item) => item.responsibilityId))
  const nextState: MatchState = {
    ...input,
    offensiveStructure: null,
    reboundState: { phase: rebound.phase, shootingTeamId: rebound.shootingTeamId, startedT: prior?.startedT ?? input.t, availableAtT: rebound.availableAtT, target: { ...reboundTarget }, responsibilities },
    responsibilities: [...input.responsibilities.filter((item) => !activePlayers.some((player) => player.playerId === item.playerId)), ...generalResponsibilities],
    decisions: [...input.decisions.filter((item) => !activePlayers.some((player) => player.playerId === item.playerId)), ...generalDecisions],
    movementIntents: [...input.movementIntents.filter((item) => !activePlayers.some((player) => player.playerId === item.playerId)), ...intents],
    nextResponsibilitySequence,
    nextDecisionSequence,
  }
  if (!prior) return emitEvent(nextState, 'reboundResponsibilitiesAssigned', { teamId: rebound.shootingTeamId })
  return nextState
}

function reconcileTransition(input: MatchState): MatchState {
  const possession = activePossession(input)
  const existing = input.transition
  const trigger = transitionTrigger(input)
  if (!existing && possession?.phase === 'ADVANCE' && trigger && input.ball.kind === 'HELD' && input.ball.ownerTeamId === possession.teamId) {
    const state = createTransition(input, possession.teamId, trigger)
    let next = emitEvent({ ...input, transition: state }, 'transitionStarted', {
      teamId: possession.teamId, transitionTrigger: trigger, transitionAdvantage: state.advantage,
    })
    next = installTransitionRoles(next, state)
    return next
  }
  if (!existing || !possession || existing.teamId !== possession.teamId) return input
  const advantage = evaluateTransition(input, existing.teamId)
  const liveHandlerId = input.ball.kind === 'HELD' && input.ball.ownerTeamId === existing.teamId ? input.ball.ownerPlayerId : existing.ballHandlerPlayerId
  const handlerChanged = liveHandlerId !== existing.ballHandlerPlayerId
  const refreshedRoles = handOffBeatenStopper(input, handlerChanged ? createTransition(input, existing.teamId, existing.trigger).roles : existing.roles)
  const transition = {
    ...existing,
    ballHandlerPlayerId: liveHandlerId,
    advantage,
    roles: updateRoleTargets(input, refreshedRoles),
  }
  let next: MatchState = { ...input, transition }
  if (advantage !== existing.advantage) next = emitEvent(next, 'transitionAdvantageChanged', {
    teamId: existing.teamId, transitionTrigger: existing.trigger, transitionAdvantage: advantage,
  })
  next = installTransitionRoles(next, transition)
  const ballHandler = next.ball.kind === 'HELD' && next.ball.ownerTeamId === existing.teamId
    ? findPlayer(next, next.ball.ownerPlayerId) : undefined
  const actionActive = activeActions(next).some((action) => action.teamId === existing.teamId && action.status === 'ACTIVE' && action.kind !== 'CLOSEOUT')
  // The half-court phase begins when the ball is in the frontcourt; a defender on the new carrier does not make a half court out of the backcourt (BT4.2).
  const crossed = ballHandler !== undefined && isInFrontcourt(ballHandler.position, existing.teamId, next)
  if (possession.phase === 'ACTION' && !actionActive && (crossed || (tuning().transitionHoldsUntilFrontcourt === 0 && advantage === 'STOPPED'))) {
    return changePossessionPhase(next, 'SETUP')
  }
  return next
}

function handOffBeatenStopper(state: MatchState, roles: readonly TransitionRole[]): readonly TransitionRole[] {
  if (state.ball.kind !== 'HELD') return roles
  const stopper = roles.find((role) => role.kind === 'STOP_BALL')
  const stopperPlayer = stopper && findPlayer(state, stopper.playerId)
  if (!stopper || !stopperPlayer) return roles
  const basket = attackingBasketForTeam(state.ball.ownerTeamId, state.homeTeamId, state.period, state.court)
  const direction = basket.x >= state.court.lengthMeters / 2 ? 1 : -1
  if ((state.ball.position.x - stopperPlayer.position.x) * direction <= 2) return roles
  const successor = roles.filter((role) => role.kind === 'MATCH')
    .map((role) => ({ role, player: findPlayer(state, role.playerId) }))
    .filter((item): item is { role: TransitionRole; player: MatchPlayerState } => item.player !== undefined
      && (item.player.position.x - state.ball.position.x) * direction > 0.5)
    .sort((a, b) => distanceBetween(a.player.position, state.ball.position) - distanceBetween(b.player.position, state.ball.position)
      || comparePlayerId(a.player, b.player))[0]
  if (!successor) return roles
  return roles.map((role) => role.playerId === stopper.playerId
    ? { ...role, kind: 'MATCH', matchLaneY: successor.role.matchLaneY }
    : role.playerId === successor.player.playerId
      ? { ...role, kind: 'STOP_BALL', matchLaneY: undefined }
      : role)
}

function createTransition(state: MatchState, teamId: TeamId, trigger: TransitionTrigger): MatchTransitionState {
  const offense = state.players.filter((player) => player.active && player.teamId === teamId).sort(comparePlayerId)
  const defense = state.players.filter((player) => player.active && player.teamId !== teamId).sort(comparePlayerId)
  const handlerId = state.ball.kind === 'HELD' ? state.ball.ownerPlayerId : offense[0]!.playerId
  const handler = findPlayer(state, handlerId) ?? offense[0]!
  const rimRunner = offense.filter((player) => player.playerId !== handler.playerId)
    .sort((left, right) => rimRunnerFit(right) - rimRunnerFit(left) || comparePlayerId(left, right))[0]!
  const remaining = offense.filter((player) => player.playerId !== handler.playerId && player.playerId !== rimRunner.playerId)
  const laneLeft = [...remaining].sort((left, right) => left.position.y - right.position.y || comparePlayerId(left, right))[0]!
  const laneRight = [...remaining].sort((left, right) => right.position.y - left.position.y || comparePlayerId(left, right))[0]!
  const trail = remaining.find((player) => player.playerId !== laneLeft.playerId && player.playerId !== laneRight.playerId)!
  const basket = attackingBasketForTeam(teamId, state.homeTeamId, state.period, state.court)
  const rimDefender = defense.filter((player) => player.playerId !== state.defensiveStructure?.onBallDefenderPlayerId)
    .sort((left, right) => distanceBetween(left.position, basket) - distanceBetween(right.position, basket) || comparePlayerId(left, right))[0]!
  const stopper = findPlayer(state, state.defensiveStructure?.onBallDefenderPlayerId ?? '')
    ?? defense.filter((player) => player.playerId !== rimDefender.playerId).sort((left, right) => distanceBetween(left.position, handler.position) - distanceBetween(right.position, handler.position) || comparePlayerId(left, right))[0]!
  const matchDefenders = defense.filter((player) => player.playerId !== stopper.playerId && player.playerId !== rimDefender.playerId)
  const matchLanes = new Map(matchDefenders.slice().sort((left, right) => left.position.y - right.position.y || comparePlayerId(left, right))
    .map((player, index) => [player.playerId, state.court.widthMeters / 2 + (index - 1) * state.court.widthMeters * 0.22]))
  const offenseRoles: readonly (readonly [MatchPlayerState, TransitionRoleKind])[] = [
    [handler, 'BALL_ADVANCE'], [laneLeft, 'LANE_LEFT'], [laneRight, 'LANE_RIGHT'], [rimRunner, 'RIM_RUN'], [trail, 'TRAIL'],
  ]
  const defenseRoles: readonly (readonly [MatchPlayerState, TransitionRoleKind])[] = [
    [stopper, 'STOP_BALL'], [rimDefender, 'PROTECT_RIM'],
    ...matchDefenders.map((player) => [player, 'MATCH'] as const),
  ]
  const roles = [...offenseRoles, ...defenseRoles].map(([player, kind]) => ({
    playerId: player.playerId, teamId: player.teamId, kind, target: { ...player.position },
    ...(kind === 'MATCH' ? { matchLaneY: matchLanes.get(player.playerId) } : {}),
    responsibilityId: '', decisionId: '',
  }))
  return {
    teamId, ballHandlerPlayerId: handler.playerId, trigger, startedT: state.t, advantage: evaluateTransition(state, teamId),
    roles: roles.map((role) => ({ ...role, target: roleTarget(state, role) })),
  }
}

function installTransitionRoles(input: MatchState, transition: MatchTransitionState): MatchState {
  let nextResponsibilitySequence = input.nextResponsibilitySequence
  let nextDecisionSequence = input.nextDecisionSequence
  const prior = input.transition?.roles ?? []
  const roles = transition.roles.map((role) => {
    const old = prior.find((item) => item.playerId === role.playerId && item.kind === role.kind)
    const action = activeActions(input).find((item) => item.playerId === role.playerId && item.kind === 'DRIVE' && item.status === 'ACTIVE')
    return {
      ...role,
      responsibilityId: old?.responsibilityId || `responsibility-${nextResponsibilitySequence++}`,
      decisionId: action?.decisionId || old?.decisionId || `decision-${nextDecisionSequence++}`,
    }
  })
  const installedTransition = { ...transition, roles }
  const tempo = tacticalIntent(input, transition.teamId).offense.tempo
  const responsibilities = roles.map((role) => ({
    id: role.responsibilityId, playerId: role.playerId, teamId: role.teamId, kind: role.kind,
    owner: transitionOwner(role), startedT: input.responsibilities.find((item) => item.id === role.responsibilityId)?.startedT ?? input.t,
    reason: `Transition responsibility: ${role.kind}`, endCondition: { kind: 'phaseChanges' as const },
  }))
  const decisions = roles.map((role) => ({
    id: role.decisionId, playerId: role.playerId, responsibilityId: role.responsibilityId, kind: role.kind,
    owner: transitionOwner(role), startedT: activeActions(input).find((item) => item.playerId === role.playerId && item.kind === 'DRIVE' && item.status === 'ACTIVE')?.startedT ?? input.t,
    reason: `Transition role: ${role.kind}`,
  }))
  const intents: MovementIntent[] = roles.map((role) => ({
    playerId: role.playerId, target: { ...role.target },
    urgency: role.teamId !== transition.teamId ? 'sprint' : offenseUrgency(role.kind, transition.advantage, tempo),
    facing: { kind: role.kind === 'BALL_ADVANCE' || role.kind === 'RIM_RUN' ? 'BASKET' : 'BALL' },
    provenance: { responsibilityId: role.responsibilityId, decisionId: role.decisionId, owner: transitionOwner(role) },
  }))
  const rolePlayerIds = new Set(roles.map((role) => role.playerId))
  return {
    ...input,
    offensiveStructure: null,
    transition: installedTransition,
    responsibilities: [...input.responsibilities.filter((item) => !rolePlayerIds.has(item.playerId)), ...responsibilities],
    decisions: [...input.decisions.filter((item) => !rolePlayerIds.has(item.playerId)), ...decisions],
    movementIntents: [...input.movementIntents.filter((item) => !rolePlayerIds.has(item.playerId)), ...intents],
    nextResponsibilitySequence,
    nextDecisionSequence,
  }
}

function updateRoleTargets(state: MatchState, roles: readonly TransitionRole[]): readonly TransitionRole[] {
  return roles.map((role) => {
    const action = activeActions(state).find((item) => item.playerId === role.playerId && item.kind === 'DRIVE' && item.status === 'ACTIVE')
    return { ...role, target: role.kind === 'BALL_ADVANCE' && action?.target ? { ...action.target } : roleTarget(state, role) }
  })
}

/**
 * A team with a numbers advantage pushes (fast break: the handler runs, everyone else sprints). Without one it brings the ball up in
 * control: the handler at a jog, against a defense that is getting set, and the others run to their spots (BT4A: time is spent by
 * moving, not waiting).
 */
function offenseUrgency(kind: TransitionRoleKind, advantage: TransitionAdvantage, tempo = 0): 'jog' | 'run' | 'sprint' {
  // BT5.12: a fast team pushes every transition that is not stopped; a controlled one brings even a numbers advantage up under control.
  if (advantage === 'ADVANTAGE' && tempo < -0.55) return kind === 'BALL_ADVANCE' ? 'jog' : 'run'
  if (advantage === 'ADVANTAGE' || tuning().controlledAdvance <= 0 || (tempo > 0.35 && advantage === 'NEUTRAL')) return kind === 'BALL_ADVANCE' ? 'run' : 'sprint'
  return kind === 'BALL_ADVANCE' ? 'jog' : tempo < -0.55 ? 'jog' : 'run'
}

function roleTarget(state: MatchState, role: TransitionRole): CourtPosition {
  const transitionTeamId = state.transition?.teamId ?? activePossession(state)?.teamId ?? role.teamId
  const basket = attackingBasketForTeam(transitionTeamId, state.homeTeamId, state.period, state.court)
  const ballHandler = state.ball.kind === 'HELD' && state.ball.ownerTeamId === transitionTeamId
    ? findPlayer(state, state.ball.ownerPlayerId) : undefined
  const centerY = state.court.widthMeters / 2
  const direction = basket.x >= state.court.lengthMeters / 2 ? 1 : -1
  const defensiveTactics = defensiveShape(state, role.teamId)
  if (role.kind === 'BALL_ADVANCE') {
    const handler = ballHandler ?? findPlayer(state, role.playerId)
    if (!handler) return role.target
    const naturalAdvance = advanceTarget(state, basket)
    return { x: clamp(handler.position.x + direction * 4, 0.5, state.court.lengthMeters - 0.5), y: clamp(handler.position.y * 0.75 + naturalAdvance.y * 0.25, 0.5, state.court.widthMeters - 0.5) }
  }
  if (role.kind === 'LANE_LEFT' || role.kind === 'LANE_RIGHT') {
    const handler = ballHandler ?? findPlayer(state, role.playerId)
    return {
      x: clamp((handler?.position.x ?? state.court.lengthMeters / 2) + direction * 3.5, 0.5, state.court.lengthMeters - 0.5),
      y: clamp(centerY + (role.kind === 'LANE_LEFT' ? -1 : 1) * state.court.widthMeters * 0.22, 0.75, state.court.widthMeters - 0.75),
    }
  }
  if (role.kind === 'RIM_RUN') return { x: clamp(basket.x - direction * 3, 0.5, state.court.lengthMeters - 0.5), y: centerY }
  if (role.kind === 'TRAIL') {
    const handler = ballHandler ?? findPlayer(state, role.playerId)
    return { x: clamp((handler?.position.x ?? state.court.lengthMeters / 2) - direction * 3.5, 0.5, state.court.lengthMeters - 0.5), y: clamp(centerY + 0.9, 0.5, state.court.widthMeters - 0.5) }
  }
  const ball = state.ball.position
  const attacker = assignedAttackerForDefender(state, role.playerId)
  if (role.kind === 'STOP_BALL') {
    const handler = ballHandler
    return handler ? guardPosition(handler.position, ball, basket, 'ON_BALL', state.court, defensiveTactics) : guardPosition(role.target, ball, basket, 'ON_BALL', state.court, defensiveTactics)
  }
  if (role.kind === 'PROTECT_RIM') {
    const towardBall = unitVector({ x: ball.x - basket.x, y: ball.y - basket.y }, { x: basket.x >= state.court.lengthMeters / 2 ? -1 : 1, y: 0 })
    return clampPosition({ x: basket.x + towardBall.x * 2.2, y: basket.y + towardBall.y * 2.2 }, state.court)
  }
  if (role.kind === 'MATCH') {
    if (attacker && (attacker.position.x - ball.x) * direction > 1.5) {
      return guardPosition(attacker.position, ball, basket, 'GAP', state.court, defensiveTactics)
    }
    const distanceToBasket = Math.abs(basket.x - ball.x)
    const screenDepth = clamp(distanceToBasket * 0.55, 3.5, 8.5)
    return clampPosition({ x: basket.x - direction * screenDepth, y: role.matchLaneY ?? role.target.y }, state.court)
  }
  return role.target
}

function evaluateTransition(state: MatchState, teamId: TeamId): TransitionAdvantage {
  if (state.ball.kind !== 'HELD' || state.ball.ownerTeamId !== teamId) return 'NEUTRAL'
  const handler = findPlayer(state, state.ball.ownerPlayerId)
  if (!handler) return 'NEUTRAL'
  const basket = attackingBasketForTeam(teamId, state.homeTeamId, state.period, state.court)
  const direction = basket.x >= state.court.lengthMeters / 2 ? 1 : -1
  const attackersAhead = state.players.filter((player) => player.active && player.teamId === teamId && player.playerId !== handler.playerId
    && (player.position.x - state.ball.position.x) * direction > 1.5).length
  const defendersAhead = state.players.filter((player) => player.active && player.teamId !== teamId
    && (player.position.x - state.ball.position.x) * direction > 1.5).length
  const nearestDefender = Math.min(...state.players.filter((player) => player.active && player.teamId !== teamId)
    .map((player) => distanceBetween(player.position, handler.position)), Number.POSITIVE_INFINITY)
  if (attackersAhead >= defendersAhead + 1 && nearestDefender > 1.8) return 'ADVANTAGE'
  if (nearestDefender <= 1.4 || attackersAhead < defendersAhead && nearestDefender <= 2.4) return 'STOPPED'
  return 'NEUTRAL'
}

function transitionTrigger(state: MatchState): TransitionTrigger | null {
  const possession = activePossession(state)
  if (!possession) return null
  if (possession.startReason === 'openingJumpBall') return 'openingJumpBall'
  if (possession.startReason === 'madeBasketInbound') return 'madeBasketInbound'
  if (possession.startReason === 'defensiveRebound') return 'defensiveRebound'
  if (possession.startReason === 'steal') return 'turnover'
  const recovery = findLastEvent(state, (event) => event.type === 'looseBallRecovered')
  return possession.startReason === 'other' && recovery?.teamId === possession.teamId ? 'looseBallRecovery' : null
}

function transitionHasEnded(state: MatchState): boolean {
  const transition = state.transition
  const possession = activePossession(state)
  if (!transition || !possession || possession.teamId !== transition.teamId) return true
  if (possession.phase === 'SETUP' || possession.phase === 'SHOT' || state.ball.kind === 'DEAD' || state.ball.kind === 'INBOUND' || state.ball.kind === 'REBOUNDABLE') return true
  if (state.ball.kind === 'SHOT_IN_FLIGHT') return true
  if (possession.phase === 'ACTION' && transition.advantage === 'STOPPED'
    && state.ball.kind === 'HELD' && state.ball.ownerTeamId === transition.teamId) {
    const handler = findPlayer(state, state.ball.ownerPlayerId)
    if (handler && isInFrontcourt(handler.position, transition.teamId, state)) return true
  }
  return false
}

function removeTemporaryRoles(state: MatchState, ids: readonly string[]): MatchState {
  const roleIds = new Set(ids)
  return {
    ...state,
    responsibilities: state.responsibilities.filter((item) => !roleIds.has(item.id)),
    decisions: state.decisions.filter((item) => !roleIds.has(item.responsibilityId)),
    movementIntents: state.movementIntents.filter((item) => !roleIds.has(item.provenance.responsibilityId)),
  }
}

function transitionOwner(role: TransitionRole): ResponsibilityOwner {
  return role.kind === 'STOP_BALL' || role.kind === 'PROTECT_RIM' || role.kind === 'MATCH' ? 'defensiveStructure'
    : role.kind === 'BALL_ADVANCE' ? 'possession' : 'offensiveStructure'
}

/** Boxing out means standing between the attacker and the falling ball, in contact range. */
/**
 * BT3M: contenders do not all run to the same point. The ball comes down on a spot, but each contender takes his own
 * side of it: defenders inside (rim side, sealing the attackers out), attackers on the flanks and behind. Two per team
 * means four distinct positions around the landing zone, all within arm's reach of it.
 */
/** The first defender of a team seals the spot itself (he is nearest and inside); everyone else takes a wider seat. */
const CONTEST_RING_METERS = { defenseFirst: 0.3, defenseSecond: 0.8, offenseFirst: 0.7, offenseSecond: 1.0 } as const
function contestSlot(landing: CourtPosition, basket: CourtPosition, rank: number, offense: boolean, state: MatchState): CourtPosition {
  const away = unitVector({ x: landing.x - basket.x, y: landing.y - basket.y }, { x: 1, y: 0 })
  const side = rank % 2 === 0 ? 1 : -1
  const radius = offense ? (rank <= 0 ? CONTEST_RING_METERS.offenseFirst : CONTEST_RING_METERS.offenseSecond) : (rank <= 0 ? CONTEST_RING_METERS.defenseFirst : CONTEST_RING_METERS.defenseSecond)
  // Angle from the rim-to-ball axis: defenders sit on the rim side (about 145 degrees), attackers on the flanks (about 80).
  const angle = (offense ? 80 : 145) * Math.PI / 180 * side
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const direction = { x: away.x * cos - away.y * sin, y: away.x * sin + away.y * cos }
  return clampPosition({ x: landing.x + direction.x * radius, y: landing.y + direction.y * radius }, state.court)
}

function boxOutPosition(attacker: CourtPosition, rebound: CourtPosition, basket: CourtPosition, state: MatchState): CourtPosition {
  const towardRebound = unitVector({ x: rebound.x - attacker.x, y: rebound.y - attacker.y }, { x: basket.x >= state.court.lengthMeters / 2 ? -1 : 1, y: 0 })
  return clampPosition({ x: attacker.x + towardRebound.x * 0.95, y: attacker.y + towardRebound.y * 0.95 }, state.court)
}

/** Where a leaking defender runs: past half court on his side, toward the basket his team will attack. */
function leakTarget(player: MatchPlayerState, defendedBasket: CourtPosition, state: MatchState): CourtPosition {
  const away = defendedBasket.x >= state.court.lengthMeters / 2 ? -1 : 1
  return clampPosition({ x: state.court.lengthMeters / 2 + away * 3, y: player.position.y < state.court.widthMeters / 2 ? state.court.widthMeters * 0.3 : state.court.widthMeters * 0.7 }, state.court)
}

function reboundSafetyTarget(player: MatchPlayerState, rebound: CourtPosition, attackedBasket: CourtPosition, state: MatchState): CourtPosition {
  const direction = attackedBasket.x >= state.court.lengthMeters / 2 ? 1 : -1
  const offset = (player.position.y < state.court.widthMeters / 2 ? -1 : 1) * 1.2
  return clampPosition({ x: rebound.x - direction * 3.5, y: state.court.widthMeters / 2 + offset }, state.court)
}

/** True when `blocker` stands on the line between `player` and the ball, closer to the ball than `player` is. */
function isBoxedOutBy(player: MatchPlayerState, blocker: MatchPlayerState, rebound: CourtPosition): boolean {
  const toBall = distanceBetween(player.position, rebound)
  if (toBall < 1e-6 || distanceBetween(blocker.position, rebound) >= toBall - 0.1) return false
  const dx = rebound.x - player.position.x
  const dy = rebound.y - player.position.y
  const along = ((blocker.position.x - player.position.x) * dx + (blocker.position.y - player.position.y) * dy) / (toBall * toBall)
  if (along <= 0 || along >= 1) return false
  const lateral = Math.abs((blocker.position.x - player.position.x) * dy - (blocker.position.y - player.position.y) * dx) / toBall
  return lateral <= 0.85 && distanceBetween(blocker.position, player.position) <= 1.9
}

/** How much each point of rebounding impact (over 50) is worth in the contest for the ball (BT4Q: BT3 let position eclipse it). */
const REBOUND_ABILITY_PER_POINT = 0.028

export function reboundWeight(player: MatchPlayerState, rebound: CourtPosition, state: MatchState): number {
  const distance = distanceBetween(player.position, rebound)
  const heightAdvantage = (player.standingReachCm - 250) * 0.006
  const ability = (effectiveReboundingImpact(player) - 50) * REBOUND_ABILITY_PER_POINT
  // Being sealed costs what the sealer's strength and rebounding make of it: a big body that boxes out well takes his man out of the play.
  const sealer = state.players.find((candidate) => candidate.active && candidate.teamId !== player.teamId && isBoxedOutBy(player, candidate, rebound))
  const sealPenalty = sealer === undefined ? 0 : 0.5 + 0.7 * clamp(effectiveReboundingImpact(sealer) / 100, 0, 1) + (sealer.weightKg - 90) * 0.006
  return Math.exp(ability + heightAdvantage - sealPenalty - distance * 1.3)
}


function assignedAttackerForDefender(state: MatchState, defenderPlayerId: PlayerId): MatchPlayerState | undefined {
  const attackerId = state.defensiveStructure?.assignments.find((item) => item.defenderPlayerId === defenderPlayerId)?.attackerPlayerId
  return attackerId ? findPlayer(state, attackerId) : undefined
}

function isInFrontcourt(position: CourtPosition, teamId: TeamId, state: MatchState): boolean {
  const basket = attackingBasketForTeam(teamId, state.homeTeamId, state.period, state.court)
  const direction = basket.x >= state.court.lengthMeters / 2 ? 1 : -1
  return (position.x - state.court.lengthMeters / 2) * direction >= FRONTCOURT_ADVANTAGE_DISTANCE_METERS
}

function rimRunnerFit(player: MatchPlayerState): number {
  return player.offense.rimAttack * 0.65 + player.kinematics.maxSpeedMps * 5 + player.standingReachCm * 0.025
}

function findPlayer(state: MatchState, playerId: PlayerId | string): MatchPlayerState | undefined {
  return state.players.find((player) => player.playerId === playerId)
}

function unitVector(vector: CourtPosition, fallback: CourtPosition): CourtPosition {
  const length = Math.hypot(vector.x, vector.y)
  return length > 1e-9 ? { x: vector.x / length, y: vector.y / length } : fallback
}

function clampPosition(position: CourtPosition, state: MatchState['court']): CourtPosition {
  return { x: clamp(position.x, 0.25, state.lengthMeters - 0.25), y: clamp(position.y, 0.25, state.widthMeters - 0.25) }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

function comparePlayerId(left: MatchPlayerState, right: MatchPlayerState): number {
  return String(left.playerId).localeCompare(String(right.playerId))
}

function effectiveReboundingImpact(player: MatchPlayerState): number {
  return player.reboundingImpact - player.fatigue * 0.08
}
