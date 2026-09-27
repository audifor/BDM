import { distanceBetween, type CourtPosition } from '@/domain/court'
import type { PlayerId, TeamId } from '@/domain/ids'
import { draw } from '../rng'
import { emitEvent } from '../events'
import { secureRebound } from '../ball/BallTransitions'
import { REBOUND_ACQUISITION_RADIUS_METERS } from '../ball/BallState'
import { changePossessionPhase } from '../possession'
import { activePossession, type MatchPlayerState, type MatchState, type MatchTransitionState, type ReboundResponsibility, type TransitionAdvantage, type TransitionRole, type TransitionRoleKind, type TransitionTrigger } from '../state'
import type { ResponsibilityOwner } from '../responsibility/Responsibility'
import type { MovementIntent } from '../movement/MovementIntent'
import { advanceTarget } from '../structure/OffensiveStructure'
import { attackingBasketForTeam } from '../structure/FiveOutStructure'
import { guardPosition } from '../defense/ManDefense'

const REBOUND_PURSUERS_PER_TEAM = 2
const FRONTCOURT_ADVANTAGE_DISTANCE_METERS = 0.5

/** Clears temporary roles before their normal structural authorities run again. */
export function clearExpiredReboundTransition(state: MatchState): MatchState {
  let next = state
  if (next.reboundState && next.ball.kind !== 'REBOUNDABLE') {
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
  if (input.ball.kind === 'REBOUNDABLE') return reconcileRebound(input)
  return reconcileTransition(input)
}

/** Selects only players already inside the physical acquisition radius. */
export function securePhysicalRebound(state: MatchState): MatchState {
  if (state.ball.kind !== 'REBOUNDABLE' || state.t < state.ball.availableAtT) return state
  const rebound = state.ball
  const eligible = state.players.filter((player) => player.active
    && distanceBetween(player.position, rebound.position) <= REBOUND_ACQUISITION_RADIUS_METERS)
  if (eligible.length === 0) return state
  const drawResult = draw(state.rng, 'outcome')
  let next = { ...state, rng: drawResult.state }
  const weighted = eligible.map((player) => ({
    player,
    weight: reboundWeight(player, rebound.position, attackingBasketForTeam(rebound.shootingTeamId, state.homeTeamId, state.period, state.court), state),
  }))
  const total = weighted.reduce((sum, item) => sum + item.weight, 0)
  let roll = drawResult.value * total
  let winner = weighted.at(-1)!.player
  for (const item of weighted) {
    roll -= item.weight
    if (roll <= 0) { winner = item.player; break }
  }
  next = secureRebound(next, winner.playerId)
  return next
}

/** A stopped transition becomes ordinary half-court SETUP after players finish this movement tick. */
export function finishStoppedTransition(state: MatchState): MatchState {
  const possession = activePossession(state)
  if (!state.transition || !possession || possession.phase !== 'ADVANCE' || state.transition.advantage !== 'STOPPED') return state
  if (state.transition.trigger === 'defensiveRebound' && state.t - state.transition.startedT < 4) return state
  return changePossessionPhase(state, 'SETUP')
}

function reconcileRebound(input: MatchState): MatchState {
  if (input.ball.kind !== 'REBOUNDABLE') return input
  const ball = input.ball
  const prior = input.reboundState
  const shootingPlayers = input.players.filter((player) => player.active && player.teamId === ball.shootingTeamId)
  const defendingTeamId = ball.shootingTeamId === input.homeTeamId ? input.awayTeamId : input.homeTeamId
  const defendingPlayers = input.players.filter((player) => player.active && player.teamId === defendingTeamId)
  const reboundTarget = ball.landingTarget
  const crashers = shootingPlayers
    .map((player) => ({ player, score: distanceBetween(player.position, ball.position) - player.reboundingImpact * 0.008 - player.standingReachCm * 0.001 }))
    .sort((left, right) => left.score - right.score || comparePlayerId(left.player, right.player))
    .slice(0, REBOUND_PURSUERS_PER_TEAM)
  const crasherIds = new Set(crashers.map(({ player }) => player.playerId))
  const pursuingDefenderIds = input.t >= ball.availableAtT
    ? new Set(defendingPlayers.map((player) => player.playerId)
      .map((playerId) => ({ playerId, distance: distanceBetween(findPlayer(input, playerId)!.position, ball.position) }))
      .sort((left, right) => left.distance - right.distance || String(left.playerId).localeCompare(String(right.playerId)))
      .slice(0, REBOUND_PURSUERS_PER_TEAM).map((item) => item.playerId))
    : new Set<PlayerId>()

  let nextResponsibilitySequence = input.nextResponsibilitySequence
  let nextDecisionSequence = input.nextDecisionSequence
  const responsibilities: ReboundResponsibility[] = []
  const generalResponsibilities = [] as MatchState['responsibilities'][number][]
  const generalDecisions = [] as MatchState['decisions'][number][]
  const intents: MovementIntent[] = []
  const assignments = input.defensiveStructure?.teamId === defendingTeamId ? input.defensiveStructure.assignments : []
  const basket = attackingBasketForTeam(ball.shootingTeamId, input.homeTeamId, input.period, input.court)
  const activePlayers = [...shootingPlayers, ...defendingPlayers]

  for (const player of activePlayers) {
    const offense = player.teamId === ball.shootingTeamId
    const assignment = assignments.find((item) => item.defenderPlayerId === player.playerId)
    const assignedAttacker = assignment ? findPlayer(input, assignment.attackerPlayerId) : undefined
    let kind: ReboundResponsibility['kind']
    let target: CourtPosition
    let boxOutTarget: CourtPosition | undefined
    let owner: ResponsibilityOwner
    if (offense) {
      owner = 'offensiveStructure'
      if (input.t >= ball.availableAtT && crasherIds.has(player.playerId)) kind = 'PURSUE_REBOUND'
      else if (crasherIds.has(player.playerId)) kind = 'CRASH_REBOUND'
      else kind = 'RETREAT'
      target = kind === 'RETREAT' ? reboundSafetyTarget(player, reboundTarget, basket, input) : reboundTarget
    } else {
      owner = 'defensiveStructure'
      kind = pursuingDefenderIds.has(player.playerId) ? 'PURSUE_REBOUND' : 'BOX_OUT'
      boxOutTarget = assignedAttacker ? boxOutPosition(assignedAttacker.position, reboundTarget, basket, input) : reboundTarget
      target = kind === 'PURSUE_REBOUND' ? reboundTarget : boxOutTarget
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
    reboundState: { shootingTeamId: ball.shootingTeamId, startedT: prior?.startedT ?? input.t, availableAtT: ball.availableAtT, target: { ...reboundTarget }, responsibilities },
    responsibilities: [...input.responsibilities.filter((item) => !activePlayers.some((player) => player.playerId === item.playerId)), ...generalResponsibilities],
    decisions: [...input.decisions.filter((item) => !activePlayers.some((player) => player.playerId === item.playerId)), ...generalDecisions],
    movementIntents: [...input.movementIntents.filter((item) => !activePlayers.some((player) => player.playerId === item.playerId)), ...intents],
    nextResponsibilitySequence,
    nextDecisionSequence,
  }
  if (!prior) return emitEvent(nextState, 'reboundResponsibilitiesAssigned', { teamId: ball.shootingTeamId })
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
  const refreshedRoles = handlerChanged ? createTransition(input, existing.teamId, existing.trigger).roles : existing.roles
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
  const actionActive = next.actions.some((action) => action.teamId === existing.teamId && action.status === 'ACTIVE' && action.kind !== 'CLOSEOUT')
  if (possession.phase === 'ACTION' && !actionActive && (advantage === 'STOPPED' || ballHandler && isInFrontcourt(ballHandler.position, existing.teamId, next))) {
    return changePossessionPhase(next, 'SETUP')
  }
  return next
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
  const offenseRoles: readonly (readonly [MatchPlayerState, TransitionRoleKind])[] = [
    [handler, 'BALL_ADVANCE'], [laneLeft, 'LANE_LEFT'], [laneRight, 'LANE_RIGHT'], [rimRunner, 'RIM_RUN'], [trail, 'TRAIL'],
  ]
  const defenseRoles: readonly (readonly [MatchPlayerState, TransitionRoleKind])[] = [
    [stopper, 'STOP_BALL'], [rimDefender, 'PROTECT_RIM'],
    ...defense.filter((player) => player.playerId !== stopper.playerId && player.playerId !== rimDefender.playerId).map((player) => [player, 'MATCH'] as const),
  ]
  const roles = [...offenseRoles, ...defenseRoles].map(([player, kind]) => ({
    playerId: player.playerId, teamId: player.teamId, kind, target: { ...player.position },
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
    const action = input.actions.find((item) => item.playerId === role.playerId && item.kind === 'DRIVE' && item.status === 'ACTIVE')
    return {
      ...role,
      responsibilityId: old?.responsibilityId ?? `responsibility-${nextResponsibilitySequence++}`,
      decisionId: action?.decisionId ?? old?.decisionId ?? `decision-${nextDecisionSequence++}`,
    }
  })
  const installedTransition = { ...transition, roles }
  const responsibilities = roles.map((role) => ({
    id: role.responsibilityId, playerId: role.playerId, teamId: role.teamId, kind: role.kind,
    owner: transitionOwner(role), startedT: input.responsibilities.find((item) => item.id === role.responsibilityId)?.startedT ?? input.t,
    reason: `Transition responsibility: ${role.kind}`, endCondition: { kind: 'phaseChanges' as const },
  }))
  const decisions = roles.map((role) => ({
    id: role.decisionId, playerId: role.playerId, responsibilityId: role.responsibilityId, kind: role.kind,
    owner: transitionOwner(role), startedT: input.actions.find((item) => item.playerId === role.playerId && item.kind === 'DRIVE' && item.status === 'ACTIVE')?.startedT ?? input.t,
    reason: `Transition role: ${role.kind}`,
  }))
  const intents: MovementIntent[] = roles.map((role) => ({
    playerId: role.playerId, target: { ...role.target }, urgency: role.kind === 'BALL_ADVANCE' ? 'run' : 'sprint', facing: { kind: role.kind === 'BALL_ADVANCE' || role.kind === 'RIM_RUN' ? 'BASKET' : 'BALL' },
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
    const action = state.actions.find((item) => item.playerId === role.playerId && item.kind === 'DRIVE' && item.status === 'ACTIVE')
    return { ...role, target: role.kind === 'BALL_ADVANCE' && action?.target ? { ...action.target } : roleTarget(state, role) }
  })
}

function roleTarget(state: MatchState, role: TransitionRole): CourtPosition {
  const transitionTeamId = state.transition?.teamId ?? activePossession(state)?.teamId ?? role.teamId
  const basket = attackingBasketForTeam(transitionTeamId, state.homeTeamId, state.period, state.court)
  const ballHandler = state.ball.kind === 'HELD' && state.ball.ownerTeamId === transitionTeamId
    ? findPlayer(state, state.ball.ownerPlayerId) : undefined
  const centerY = state.court.widthMeters / 2
  const direction = basket.x >= state.court.lengthMeters / 2 ? 1 : -1
  const defensiveTactics = role.teamId === state.homeTeamId ? state.tacticalPlans.home.defense : state.tacticalPlans.away.defense
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
  return attacker ? guardPosition(attacker.position, ball, basket, 'GAP', state.court, defensiveTactics) : guardPosition(role.target, ball, basket, 'GAP', state.court, defensiveTactics)
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
  if (possession.startReason === 'defensiveRebound') return 'defensiveRebound'
  if (possession.startReason === 'steal') return 'turnover'
  const recovery = [...state.events].reverse().find((event) => event.type === 'looseBallRecovered')
  return possession.startReason === 'other' && recovery?.teamId === possession.teamId ? 'looseBallRecovery' : null
}

function transitionHasEnded(state: MatchState): boolean {
  const transition = state.transition
  const possession = activePossession(state)
  if (!transition || !possession || possession.teamId !== transition.teamId) return true
  if (possession.phase === 'SETUP' || possession.phase === 'SHOT' || state.ball.kind === 'DEAD' || state.ball.kind === 'INBOUND' || state.ball.kind === 'REBOUNDABLE') return true
  if (state.ball.kind === 'SHOT_IN_FLIGHT') return true
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

function boxOutPosition(attacker: CourtPosition, rebound: CourtPosition, basket: CourtPosition, state: MatchState): CourtPosition {
  const towardBasket = unitVector({ x: basket.x - attacker.x, y: basket.y - attacker.y }, { x: basket.x >= state.court.lengthMeters / 2 ? -1 : 1, y: 0 })
  const towardRebound = unitVector({ x: rebound.x - attacker.x, y: rebound.y - attacker.y }, { x: 0, y: 0 })
  return clampPosition({ x: attacker.x + towardBasket.x * 0.6 + towardRebound.x * 0.28, y: attacker.y + towardBasket.y * 0.6 + towardRebound.y * 0.28 }, state.court)
}

function reboundSafetyTarget(player: MatchPlayerState, rebound: CourtPosition, attackedBasket: CourtPosition, state: MatchState): CourtPosition {
  const direction = attackedBasket.x >= state.court.lengthMeters / 2 ? 1 : -1
  const offset = (player.position.y < state.court.widthMeters / 2 ? -1 : 1) * 1.2
  return clampPosition({ x: rebound.x - direction * 3.5, y: state.court.widthMeters / 2 + offset }, state.court)
}

function reboundWeight(player: MatchPlayerState, rebound: CourtPosition, basket: CourtPosition, state: MatchState): number {
  const distance = distanceBetween(player.position, rebound)
  const heightAdvantage = (player.standingReachCm - 250) * 0.006
  const ability = (player.reboundingImpact - 50) * 0.012
  const otherEligible = state.players.filter((candidate) => candidate.teamId !== player.teamId && candidate.active
    && distanceBetween(candidate.position, rebound) <= 1)
  const position = otherEligible.length > 0 && distanceBetween(player.position, basket) < Math.min(...otherEligible.map((candidate) => distanceBetween(candidate.position, basket))) ? 0.16 : 0
  return Math.exp(ability + heightAdvantage + position - distance * 1.6)
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
