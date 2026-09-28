import { distanceBetween, isBeyondThreePointLine, type CourtPosition } from '@/domain/court'
import { draw } from '../rng'
import { emitEvent } from '../events'
import { releasePass, releaseShot, type ReleasePassCommand } from '../ball/BallTransitions'
import { changePossessionPhase } from '../possession'
import { activePossession, type MatchState } from '../state'
import type { MovementIntent } from '../movement/MovementIntent'
import { attackingBasketForTeam } from '../structure/FiveOutStructure'
import { bestReceiver, driveTarget, estimateShotContest, passQuality, selectDecision, shotMakeProbability, shotValueAt } from './DecisionCore'
import type { MatchActionKind, MatchActionOutcome, MatchActionState, MatchDecision } from './ActionState'

const DRIVE_MIN_TICKS = 8
const DRIVE_MIN_PROGRESS_METERS = 2.4
const DRIVE_TARGET_RADIUS_METERS = 1.05
const DRIVE_TIMEOUT_TICKS = 36
const CLOSEOUT_ARRIVAL_METERS = 1.2

/** Advances action lifecycles and autonomous decisions from MatchState only. */
export function reconcileActions(input: MatchState): MatchState {
  if (!input.autonomousActions) return input
  let state = resolveBallActions(input)
  state = startCloseoutAfterCatch(state)
  state = updateCloseouts(state)
  state = updateDrives(state)
  state = releaseReadyShots(state)
  if (!hasActiveOffensiveAction(state)) {
    const decision = selectDecision(state)
    if (decision) state = executeDecision(recordDecision(state, decision), decision)
  }
  return applyDriveIntents(state)
}

function resolveBallActions(state: MatchState): MatchState {
  let next = state
  for (const action of state.actions) {
    if (action.status !== 'ACTIVE') continue
    if (action.kind === 'PASS' || action.kind === 'KICK_OUT') {
      if (next.ball.kind === 'HELD' && next.ball.ownerPlayerId === action.targetPlayerId) {
        next = resolveAction(next, action.id, 'CAUGHT')
      } else if (next.ball.kind === 'LOOSE' || (next.ball.kind === 'HELD' && next.ball.ownerTeamId !== action.teamId)) {
        next = resolveAction(next, action.id, 'BAD_PASS')
      }
    } else if (action.kind === 'SHOOT' || action.kind === 'CATCH_AND_SHOOT') {
      const resolvedShot = next.events.some((event) => event.t >= action.startedT
        && (event.type === 'shotMade' || event.type === 'shotMissed')
        && event.shooterPlayerId === action.playerId)
      if (resolvedShot) {
        const made = next.events.some((event) => event.t >= action.startedT && event.type === 'shotMade' && event.shooterPlayerId === action.playerId)
        next = resolveAction(next, action.id, made ? 'MAKE' : 'MISS')
      }
    }
  }
  return next
}

function startCloseoutAfterCatch(state: MatchState): MatchState {
  if (state.ball.kind !== 'HELD') return state
  const ownerPlayerId = state.ball.ownerPlayerId
  const passAction = [...state.actions].reverse().find((action) => (action.kind === 'PASS' || action.kind === 'KICK_OUT')
    && action.status === 'COMPLETED' && action.outcome === 'CAUGHT' && action.targetPlayerId === ownerPlayerId)
  if (!passAction || state.actions.some((action) => action.kind === 'CLOSEOUT' && action.sourceActionId === passAction.id)) return state
  const defenderId = state.defensiveStructure?.onBallDefenderPlayerId
  const defender = defenderId ? state.players.find((player) => player.playerId === defenderId) : undefined
  if (!defender) return state
  const intent = state.movementIntents.find((item) => item.playerId === defender.playerId)
  const action: MatchActionState = {
    id: `match-action-${state.nextActionSequence}`,
    kind: 'CLOSEOUT',
    playerId: defender.playerId,
    teamId: defender.teamId,
    startedT: state.t,
    status: 'ACTIVE',
    phase: 'CLOSING_OUT',
    sourceActionId: passAction.id,
    targetPlayerId: ownerPlayerId,
    startPosition: { ...defender.position },
    ...(intent ? { target: { ...intent.target } } : {}),
    closestDefenderDistanceMeters: distanceBetween(defender.position, state.ball.position),
  }
  let next = { ...state, actions: [...state.actions, action], nextActionSequence: state.nextActionSequence + 1 }
  return emitEvent(next, 'actionStarted', { teamId: action.teamId, playerId: action.playerId, actionId: action.id, actionKind: action.kind })
}

function updateCloseouts(state: MatchState): MatchState {
  let next = state
  for (const action of state.actions) {
    if (action.kind !== 'CLOSEOUT' || action.status !== 'ACTIVE' || !action.targetPlayerId) continue
    const defender = next.players.find((player) => player.playerId === action.playerId)
    const shooter = next.players.find((player) => player.playerId === action.targetPlayerId)
    if (!defender || !shooter) continue
    const distance = distanceBetween(defender.position, shooter.position)
    const structuralIntent = next.movementIntents.find((intent) => intent.playerId === defender.playerId)
    const contest = contestAtDistance(distance, defender.defense.pointOfAttack)
    next = updateAction(next, action.id, {
      closestDefenderDistanceMeters: distance,
      contestScore: contest,
      ...(structuralIntent ? { target: { ...structuralIntent.target } } : {}),
    })
    if (distance <= CLOSEOUT_ARRIVAL_METERS || next.ball.kind === 'SHOT_IN_FLIGHT' || next.ball.kind === 'REBOUNDABLE' || next.ball.kind === 'DEAD') {
      next = resolveAction(next, action.id, contest >= 0.35 ? 'CONTESTED' : 'ARRIVED')
    }
  }
  return next
}

function updateDrives(state: MatchState): MatchState {
  let next = state
  for (const action of state.actions) {
    if (action.kind !== 'DRIVE' || action.status !== 'ACTIVE') continue
    if (next.ball.kind !== 'HELD' || next.ball.ownerPlayerId !== action.playerId) {
      next = resolveAction(next, action.id, 'CANCELLED')
      continue
    }
    const driver = next.players.find((player) => player.playerId === action.playerId)
    if (!driver || !action.startPosition || !action.target) continue
    const progress = distanceBetween(driver.position, action.startPosition)
    const targetDistance = distanceBetween(driver.position, action.target)
    const elapsed = next.t - action.startedT
    next = updateAction(next, action.id, { progressMeters: progress })
    const helpDecision = next.defensiveStructure?.helpDecision
    const helperId = helpDecision?.status === 'TRIGGERED' && helpDecision.sourceActionId === action.id
      ? helpDecision.helperPlayerId : undefined
    if (elapsed >= DRIVE_MIN_TICKS && progress >= DRIVE_MIN_PROGRESS_METERS && helperId) {
      next = updateAction(next, action.id, { helpDefenderPlayerId: helperId })
      next = resolveAction(next, action.id, 'ADVANTAGE')
      next = setPossessionPhase(next, 'SETUP')
    } else if (elapsed >= DRIVE_MIN_TICKS && targetDistance <= DRIVE_TARGET_RADIUS_METERS) {
      const onBallId = next.defensiveStructure?.onBallDefenderPlayerId
      const onBall = next.players.find((player) => player.playerId === onBallId)
      const outcome: MatchActionOutcome = onBall && distanceBetween(onBall.position, driver.position) <= 1.4
        && Math.max(onBall.defense.interior, onBall.defense.pointOfAttack) > (driver.offense.rimAttack + driver.offense.creation) / 2
        ? 'CONTAINED' : 'FINISH'
      next = resolveAction(next, action.id, outcome)
      next = setPossessionPhase(next, 'SETUP')
    } else if (elapsed >= DRIVE_TIMEOUT_TICKS) {
      next = resolveAction(next, action.id, 'CONTAINED')
      next = setPossessionPhase(next, 'SETUP')
    }
  }
  return next
}

function releaseReadyShots(state: MatchState): MatchState {
  let next = state
  for (const action of state.actions) {
    if ((action.kind !== 'SHOOT' && action.kind !== 'CATCH_AND_SHOOT') || action.status !== 'ACTIVE' || action.phase !== 'GATHER') continue
    if (!action.releaseAtT || next.t < action.releaseAtT || next.ball.kind !== 'HELD' || next.ball.ownerPlayerId !== action.playerId) continue
    const shooter = next.players.find((player) => player.playerId === action.playerId)
    if (!shooter) continue
    const possession = activePossession(next)
    if (!possession) continue
    const basket = attackingBasketForTeam(possession.teamId, next.homeTeamId, next.period, next.court)
    const points = shotValueAt(shooter.position, basket, next)
    const distance = distanceBetween(shooter.position, basket)
    const contest = estimateShotContest(next, shooter.playerId)
    const probability = shotMakeProbability(shooter.offense.shooting, distance, points, contest.score)
    const drawResult = draw(next.rng, 'outcome')
    next = { ...next, rng: drawResult.state }
    const arrivalT = next.t + 6
    const plannedOutcome = drawResult.value < probability
      ? { kind: 'MAKE' as const, points }
      : { kind: 'MISS' as const, reboundTarget: reboundLandingTarget(shooter.position, basket), reboundAvailableT: arrivalT + 12 }
    next = releaseShot(next, {
      targetBasket: basket,
      travelTicks: 6,
      plannedOutcome,
      actionId: action.id,
      shotValue: points,
      shotProbability: probability,
      contestScore: contest.score,
      contestDefenderPlayerId: contest.defenderPlayerId ?? undefined,
    })
    next = updateAction(next, action.id, {
      phase: 'SHOT_IN_FLIGHT',
      targetBasket: { ...basket },
      shotValue: points,
      shotProbability: probability,
      contestScore: contest.score,
      contestDefenderPlayerId: contest.defenderPlayerId ?? undefined,
    })
    next = finishCloseoutsForShooter(next, shooter.playerId, contest.score)
  }
  return next
}

function reboundLandingTarget(shooter: CourtPosition, basket: CourtPosition): CourtPosition {
  const dx = shooter.x - basket.x
  const dy = shooter.y - basket.y
  const shotDistance = Math.hypot(dx, dy)
  if (shotDistance <= 1e-9) return { ...basket }
  const reboundDistance = Math.min(3, shotDistance * 0.45)
  return {
    x: basket.x + dx / shotDistance * reboundDistance,
    y: basket.y + dy / shotDistance * reboundDistance,
  }
}

function finishCloseoutsForShooter(state: MatchState, shooterPlayerId: string, contestScore: number): MatchState {
  let next = state
  for (const action of state.actions) {
    if (action.kind === 'CLOSEOUT' && action.status === 'ACTIVE' && action.targetPlayerId === shooterPlayerId) {
      next = resolveAction(next, action.id, contestScore >= 0.35 ? 'CONTESTED' : 'ARRIVED')
    }
  }
  return next
}

function executeDecision(state: MatchState, decision: MatchDecision): MatchState {
  const actor = state.players.find((player) => player.playerId === decision.playerId)
  const possession = activePossession(state)
  if (!actor || !possession || state.ball.kind !== 'HELD' || state.ball.ownerPlayerId !== actor.playerId) return state
  const basket = attackingBasketForTeam(possession.teamId, state.homeTeamId, state.period, state.court)
  if (decision.kind === 'DRIVE') {
    const target = driveTarget(state, actor)
    const action = createAction(state, decision, 'DRIVE', {
      phase: 'DRIVING', startPosition: { ...actor.position }, target, targetBasket: { ...basket },
    })
    return setPossessionPhase(startAction(state, action), 'ACTION')
  }
  if (decision.kind === 'SHOOT' || decision.kind === 'CATCH_AND_SHOOT') {
    const action = createAction(state, decision, decision.kind, {
      phase: 'GATHER', releaseAtT: state.t + (decision.kind === 'CATCH_AND_SHOOT' ? 4 : 2), targetBasket: { ...basket },
    })
    return setPossessionPhase(startAction(state, action), 'ACTION')
  }
  const receiver = decision.targetPlayerId
    ? state.players.find((player) => player.playerId === decision.targetPlayerId)
    : bestReceiver(state, actor, decision.kind === 'KICK_OUT')
  if (!receiver || receiver.teamId !== actor.teamId) return state
  const quality = passQuality(state, actor, receiver)
  const distance = distanceBetween(actor.position, receiver.position)
  const travelTicks = Math.max(2, Math.min(8, Math.ceil(distance / 10 * 10)))
  const predictionSeconds = travelTicks * 0.1
  const target: CourtPosition = {
    x: clamp(receiver.position.x + receiver.velocity.x * predictionSeconds, 0.25, state.court.lengthMeters - 0.25),
    y: clamp(receiver.position.y + receiver.velocity.y * predictionSeconds, 0.25, state.court.widthMeters - 0.25),
  }
  const action = createAction(state, decision, decision.kind, {
    phase: 'PASS_IN_FLIGHT', targetPlayerId: receiver.playerId, target, passQuality: quality,
  })
  let next = setPossessionPhase(startAction(state, action), 'ACTION')
  const command: ReleasePassCommand = {
    receiverPlayerId: receiver.playerId,
    target,
    passKind: 'chest',
    travelTicks,
    catchRadiusMeters: 0.55 + quality * 0.45,
    actionId: action.id,
    passQuality: quality,
  }
  next = releasePass(next, command)
  return next
}

function recordDecision(state: MatchState, decision: MatchDecision): MatchState {
  let next = { ...state, currentDecision: decision, nextMatchDecisionSequence: state.nextMatchDecisionSequence + 1 }
  return emitEvent(next, 'decisionSelected', { teamId: decision.teamId, playerId: decision.playerId, decisionId: decision.id, decisionKind: decision.kind })
}

function createAction(
  state: MatchState,
  decision: MatchDecision,
  kind: MatchActionKind,
  details: Partial<Omit<MatchActionState, 'id' | 'kind' | 'playerId' | 'teamId' | 'startedT' | 'status' | 'decisionId'>>,
): MatchActionState {
  return {
    id: `match-action-${state.nextActionSequence}`,
    kind,
    playerId: decision.playerId,
    teamId: decision.teamId,
    startedT: state.t,
    status: 'ACTIVE',
    decisionId: decision.id,
    ...details,
  }
}

function startAction(state: MatchState, action: MatchActionState): MatchState {
  const next = { ...state, actions: [...state.actions, action], nextActionSequence: state.nextActionSequence + 1 }
  return emitEvent(next, 'actionStarted', { teamId: action.teamId, playerId: action.playerId, actionId: action.id, actionKind: action.kind })
}

function resolveAction(state: MatchState, actionId: string, outcome: MatchActionOutcome): MatchState {
  const action = state.actions.find((candidate) => candidate.id === actionId)
  if (!action || action.status !== 'ACTIVE') return state
  const actions = state.actions.map((candidate) => candidate.id === actionId
    ? { ...candidate, status: outcome === 'CANCELLED' ? 'CANCELLED' as const : 'COMPLETED' as const, outcome, resolvedT: state.t }
    : candidate)
  const currentDecision = action.kind !== 'CLOSEOUT' && state.currentDecision?.id === action.decisionId ? null : state.currentDecision
  const next = { ...state, actions, currentDecision }
  return emitEvent(next, 'actionResolved', { teamId: action.teamId, playerId: action.playerId, actionId, actionKind: action.kind, actionOutcome: outcome, shotProbability: action.shotProbability, contestScore: action.contestScore })
}

function updateAction(state: MatchState, actionId: string, patch: Partial<MatchActionState>): MatchState {
  return {
    ...state,
    actions: state.actions.map((action) => action.id === actionId && action.status === 'ACTIVE' ? { ...action, ...patch } : action),
  }
}

function setPossessionPhase(state: MatchState, phase: 'SETUP' | 'ACTION'): MatchState {
  const possession = activePossession(state)
  if (!possession || possession.phase === phase) return state
  const possessions = state.possessions.map((item) => item.id === possession.id ? { ...item, phase } : item)
  return emitEvent({ ...state, possessions }, 'possessionPhaseChanged', { possessionId: possession.id, teamId: possession.teamId, phase })
}

function hasActiveOffensiveAction(state: MatchState): boolean {
  const teamId = activePossession(state)?.teamId
  return teamId !== undefined && state.actions.some((action) => action.status === 'ACTIVE' && action.teamId === teamId && action.kind !== 'CLOSEOUT')
}

function applyDriveIntents(state: MatchState): MatchState {
  const activeDrive = state.actions.find((action) => action.kind === 'DRIVE' && action.status === 'ACTIVE')
  if (!activeDrive || !activeDrive.target || !activeDrive.decisionId) return state
  const responsibility = state.responsibilities.find((item) => item.playerId === activeDrive.playerId && item.owner !== 'defensiveStructure')
  if (!responsibility) return state
  const intent: MovementIntent = {
    playerId: activeDrive.playerId,
    target: { ...activeDrive.target },
    urgency: 'sprint',
    facing: { kind: 'BASKET' },
    provenance: { responsibilityId: responsibility.id, decisionId: activeDrive.decisionId, owner: 'action' },
  }
  return { ...state, movementIntents: [...state.movementIntents.filter((item) => item.playerId !== activeDrive.playerId), intent] }
}

function contestAtDistance(distanceMeters: number, pointOfAttack: number): number {
  return clamp((3.4 - distanceMeters) / 2.8, 0, 1) * (0.6 + clamp(pointOfAttack, 0, 100) / 250)
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}
