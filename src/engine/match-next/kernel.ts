import type { PlayerId, TeamId } from '@/domain/ids'
import { emitEvent } from './events'
import { advanceBallAtTick, interceptPass, putBallDead, recoverLooseBall, releaseInbound, releasePass, releaseShot, secureRebound, startInbound, startOpeningJumpBall, syncHeldBallToOwner, violateShotClock, type InboundStartReason, type ReleasePassCommand, type ReleaseShotCommand } from './ball/BallTransitions'
import { reconcileLooseBallPursuit, securePhysicalLooseBall } from './ball/LooseBallPursuit'
import type { BallPassKind } from './ball/BallState'
import { changePossessionPhase, endPossession } from './possession'
import { activePossession as getActivePossession, createInitialMatchState, type MatchState } from './state'
import { validateMatchSetup, type MatchSetup } from './setup'
import { integrateMatchPlayers } from './movement/PlayerKinematics'
import { isInOffensiveFrontcourt, reconcileOffensiveStructure } from './structure/OffensiveStructure'
import { attackingBasketForTeam } from './structure/FiveOutStructure'
import { reconcileManDefense } from './defense/ManDefense'
import { reconcileActions } from './actions/ActionCore'
import { clearExpiredReboundTransition, finishStoppedTransition, reconcileReboundTransition, securePhysicalRebound } from './transition/ReboundTransition'
import { advanceMatchSessionFatigue } from './playerDynamicState'
import { applyCoachSubstitutions, type CoachSubstitutionProposal } from './coaching/RotationDecision'
import { reconcileFreeThrows } from './rules/FreeThrows'
import { advancePlayState } from './rules/PlayState'
import { reconcileOnBallPressure, reconcileSteppedOut } from './defense/StealModel'
import { resetTeamFoulsForPeriod } from './rules/Fouls'

export type MatchNextCommand =
  | { readonly type: 'startOpeningJumpBall'; readonly homeLineup: readonly PlayerId[]; readonly awayLineup: readonly PlayerId[] }
  | { readonly type: 'startInbound'; readonly teamId: TeamId; readonly inbounderPlayerId: PlayerId; readonly reason: InboundStartReason }
  | { readonly type: 'releaseInbound'; readonly receiverPlayerId: PlayerId; readonly passKind: BallPassKind; readonly travelTicks: number }
  | { readonly type: 'releasePass'; readonly command: ReleasePassCommand }
  | { readonly type: 'interceptPass'; readonly playerId: PlayerId }
  | { readonly type: 'releaseShot'; readonly command: ReleaseShotCommand }
  | { readonly type: 'secureRebound'; readonly playerId: PlayerId }
  | { readonly type: 'recoverLooseBall'; readonly playerId: PlayerId }
  | { readonly type: 'putBallDead'; readonly reason: 'outOfBounds' | 'other'; readonly restartTeamId?: TeamId }
  | { readonly type: 'coachSubstitutions'; readonly proposals: readonly CoachSubstitutionProposal[] }

export function createMatchState(setup: MatchSetup): MatchState {
  validateMatchSetup(setup)
  return createInitialMatchState(setup)
}

export function applyCommand(state: MatchState, command: MatchNextCommand): MatchState {
  let next: MatchState
  switch (command.type) {
    case 'startOpeningJumpBall': next = startOpeningJumpBall(state, command.homeLineup, command.awayLineup); break
    case 'startInbound': next = startInbound(state, command.teamId, command.inbounderPlayerId, command.reason); break
    case 'releaseInbound': next = releaseInbound(state, command.receiverPlayerId, command.passKind, command.travelTicks); break
    case 'releasePass': next = releasePass(state, command.command); break
    case 'interceptPass': next = interceptPass(state, command.playerId); break
    case 'releaseShot': next = releaseShot(state, command.command); break
    case 'secureRebound': next = secureRebound(state, command.playerId); break
    case 'recoverLooseBall': next = recoverLooseBall(state, command.playerId); break
    case 'putBallDead': next = putBallDead(state, command.reason, command.restartTeamId); break
    case 'coachSubstitutions': next = applyCoachSubstitutions(state, command.proposals); break
  }
  return advancePlayState(state, reconcileStructures(next))
}

export function tick(state: MatchState): MatchState {
  const next = tickCore(state)
  return next === state ? next : advancePlayState(state, next)
}

function tickCore(state: MatchState): MatchState {
  if (state.isComplete) return state
  const t = state.t + 1
  const gameClockTenths = state.clock.gameRunning ? Math.max(0, state.gameClockTenths - 1) : state.gameClockTenths
  const shotClockTenths = state.clock.shotRunning && state.shotClockTenths !== null ? Math.max(0, state.shotClockTenths - 1) : state.shotClockTenths
  let next: MatchState = advanceMatchSessionFatigue({ ...state, t, gameClockTenths, shotClockTenths }, state.clock.gameRunning)
  if (state.clock.gameRunning) next = addActualCourtTime(next)
  next = advanceBallAtTick(next)

  if (state.clock.gameRunning && gameClockTenths === 0) return finishPeriod(next)

  next = advancePlayerMovement(next)
  next = securePhysicalRebound(next)
  next = securePhysicalLooseBall(next)
  next = reconcileStructures(next)
  next = reconcileFreeThrows(next)
  next = reconcileOnBallPressure(next)
  next = reconcileSteppedOut(next)

  const shotClockExpired = state.clock.shotRunning && state.shotClockTenths !== null && state.shotClockTenths > 0 && shotClockTenths === 0
  const expiredAtPriorTick = state.clock.shotRunning && state.shotClockTenths === 0
  const shotWasReleased = state.ball.kind === 'SHOT_IN_FLIGHT'
  const reboundSecured = next.events.some((event) => event.t === next.t && event.type === 'reboundSecured')
  const shotIsLiveOrResolved = next.ball.kind === 'SHOT_IN_FLIGHT' || next.ball.kind === 'REBOUNDABLE' || next.ball.kind === 'DEAD' || reboundSecured
  if ((shotClockExpired || expiredAtPriorTick) && !shotWasReleased && !shotIsLiveOrResolved) return reconcileStructures(violateShotClock(next))
  if ((shotClockExpired || expiredAtPriorTick) && (shotWasReleased || next.ball.kind === 'REBOUNDABLE')) {
    next = { ...next, clock: { ...next.clock, shotRunning: false } }
  }
  return next
}

function addActualCourtTime(state: MatchState): MatchState {
  const total = { ...(state.courtTimeTenthsByPlayerId ?? {}) }
  const period = { ...(state.periodCourtTimeTenthsByPlayerId ?? {}) }
  for (const player of state.players) if (player.active) {
    total[player.playerId] = (total[player.playerId] ?? 0) + 1
    period[player.playerId] = (period[player.playerId] ?? 0) + 1
  }
  return { ...state, courtTimeTenthsByPlayerId: total, periodCourtTimeTenthsByPlayerId: period }
}

function advancePlayerMovement(input: MatchState): MatchState {
  let state = reconcileStructures(input)
  let possession = getActivePossession(state)
  if (possession?.phase === 'ADVANCE' && state.ball.kind === 'HELD' && state.ball.ownerTeamId === possession.teamId) {
    const basket = attackingBasketForTeam(possession.teamId, state.homeTeamId, state.period, state.court)
    const owner = state.players.find((player) => state.ball.kind === 'HELD' && player.playerId === state.ball.ownerPlayerId)
    if (owner && isInOffensiveFrontcourt(owner.position, basket, state.court.lengthMeters)) {
      state = changePossessionPhase(state, 'SETUP')
      state = reconcileStructures(state)
    }
  }

  if (!state.offensiveStructure && !state.defensiveStructure && state.movementIntents.length === 0) return state
  const updated = integrateMatchPlayers(state)
  state = syncHeldBallToOwner({ ...state, players: updated })
  state = reconcileStructures(state)
  const stopped = finishStoppedTransition(state)
  if (stopped !== state) state = reconcileStructures(stopped)

  possession = getActivePossession(state)
  if (possession?.phase === 'ADVANCE' && state.ball.kind === 'HELD' && state.ball.ownerTeamId === possession.teamId) {
    const basket = attackingBasketForTeam(possession.teamId, state.homeTeamId, state.period, state.court)
    const ownerPlayerId = state.ball.ownerPlayerId
    const owner = state.players.find((player) => player.playerId === ownerPlayerId)
    if (owner && isInOffensiveFrontcourt(owner.position, basket, state.court.lengthMeters)) {
      state = changePossessionPhase(state, 'SETUP')
      state = reconcileStructures(state)
    }
  }
  return state
}

export function runUntil(state: MatchState, predicate: (state: MatchState) => boolean): MatchState {
  let current = state
  while (!predicate(current) && !current.isComplete) {
    const next = tick(current)
    if (next.ball === current.ball && next.clock.gameRunning === current.clock.gameRunning && next.clock.shotRunning === current.clock.shotRunning && next.gameClockTenths === current.gameClockTenths && next.shotClockTenths === current.shotClockTenths && next.period === current.period) return current
    current = next
  }
  return current
}

function finishPeriod(state: MatchState): MatchState {
  const ballPosition = state.ball.position
  let next: MatchState = {
    ...state,
    gameClockTenths: 0,
    shotClockTenths: null,
    clock: { gameRunning: false, shotRunning: false },
    ball: { kind: 'DEAD', reason: 'periodEnd', position: ballPosition, heightMeters: 0.08 },
  }
  next = endPossession(next, 'periodEnd')
  // The horn ends whatever action was still running (e.g. a shot in flight). Left ACTIVE it survives into the next
  // period and blocks every new decision until the shot clock expires, forever (BT1-Next: seed 424242, shot released
  // at t6160, horn at t6164, then 24 s of nothing and shot-clock violations for the rest of the game).
  next = {
    ...next,
    actions: next.actions.map((action) => action.status === 'ACTIVE' ? { ...action, status: 'CANCELLED' as const, outcome: 'CANCELLED' as const, resolvedT: next.t } : action),
    currentDecision: null,
  }
  next = reconcileStructures(next)
  next = emitEvent(next, 'ballDead', { ballReason: 'periodEnd' })
  next = emitEvent(next, 'periodEnd')
  if (state.period >= state.clockRules.periodCount && state.score.home !== state.score.away) {
    next = { ...next, isComplete: true }
    return emitEvent(next, 'gameEnd')
  }
  const period = state.period + 1
  const periodSeconds = period > state.clockRules.periodCount ? state.clockRules.overtimeSeconds : state.clockRules.periodSeconds
  next = resetTeamFoulsForPeriod({ ...next, period }, period)
  next = { ...next, period, gameClockTenths: periodSeconds * 10, periodCourtTimeTenthsByPlayerId: Object.fromEntries(state.players.map((player) => [player.playerId, 0])), ball: { kind: 'DEAD', reason: 'periodEnd', position: ballPosition, heightMeters: 0.08 } }
  return emitEvent(next, 'periodStart')
}

function reconcileStructures(state: MatchState): MatchState {
  let next = reconcileLooseBallPursuit(clearExpiredReboundTransition(state))
  next = reconcileReboundTransition(reconcileManDefense(reconcileOffensiveStructure(next)))
  next = reconcileActions(next)
  next = reconcileReboundTransition(next)
  const cleared = clearExpiredReboundTransition(next)
  if (next.transition !== null && cleared.transition === null) return reconcileLooseBallPursuit(reconcileManDefense(reconcileOffensiveStructure(cleared)))
  return reconcileLooseBallPursuit(cleared)
}
