import type { PlayerId, TeamId } from '@/domain/ids'
import { emitEvent } from './events'
import { advanceBallAtTick, interceptPass, putBallDead, recoverLooseBall, releaseInbound, releasePass, releaseShot, secureRebound, startInbound, violateShotClock, type InboundStartReason, type ReleasePassCommand, type ReleaseShotCommand } from './ball/BallTransitions'
import type { BallPassKind } from './ball/BallState'
import { endPossession } from './possession'
import { createInitialMatchState, type MatchState } from './state'
import { validateMatchSetup, type MatchSetup } from './setup'

export type MatchNextCommand =
  | { readonly type: 'startInbound'; readonly teamId: TeamId; readonly inbounderPlayerId: PlayerId; readonly reason: InboundStartReason }
  | { readonly type: 'releaseInbound'; readonly receiverPlayerId: PlayerId; readonly passKind: BallPassKind; readonly travelTicks: number }
  | { readonly type: 'releasePass'; readonly command: ReleasePassCommand }
  | { readonly type: 'interceptPass'; readonly playerId: PlayerId }
  | { readonly type: 'releaseShot'; readonly command: ReleaseShotCommand }
  | { readonly type: 'secureRebound'; readonly playerId: PlayerId }
  | { readonly type: 'recoverLooseBall'; readonly playerId: PlayerId }
  | { readonly type: 'putBallDead'; readonly reason: 'outOfBounds' | 'other'; readonly restartTeamId?: TeamId }

export function createMatchState(setup: MatchSetup): MatchState {
  validateMatchSetup(setup)
  return createInitialMatchState(setup)
}

export function applyCommand(state: MatchState, command: MatchNextCommand): MatchState {
  switch (command.type) {
    case 'startInbound': return startInbound(state, command.teamId, command.inbounderPlayerId, command.reason)
    case 'releaseInbound': return releaseInbound(state, command.receiverPlayerId, command.passKind, command.travelTicks)
    case 'releasePass': return releasePass(state, command.command)
    case 'interceptPass': return interceptPass(state, command.playerId)
    case 'releaseShot': return releaseShot(state, command.command)
    case 'secureRebound': return secureRebound(state, command.playerId)
    case 'recoverLooseBall': return recoverLooseBall(state, command.playerId)
    case 'putBallDead': return putBallDead(state, command.reason, command.restartTeamId)
  }
}

export function tick(state: MatchState): MatchState {
  if (state.isComplete) return state
  const t = state.t + 1
  const gameClockTenths = state.clock.gameRunning ? Math.max(0, state.gameClockTenths - 1) : state.gameClockTenths
  const shotClockTenths = state.clock.shotRunning && state.shotClockTenths !== null ? Math.max(0, state.shotClockTenths - 1) : state.shotClockTenths
  let next: MatchState = { ...state, t, gameClockTenths, shotClockTenths }
  next = advanceBallAtTick(next)

  if (state.clock.gameRunning && gameClockTenths === 0) return finishPeriod(next)

  const shotClockExpired = state.clock.shotRunning && state.shotClockTenths !== null && state.shotClockTenths > 0 && shotClockTenths === 0
  const expiredAtPriorTick = state.clock.shotRunning && state.shotClockTenths === 0
  const shotWasReleased = state.ball.kind === 'SHOT_IN_FLIGHT'
  const shotIsLiveOrResolved = next.ball.kind === 'SHOT_IN_FLIGHT' || next.ball.kind === 'REBOUNDABLE' || next.ball.kind === 'DEAD'
  if ((shotClockExpired || expiredAtPriorTick) && !shotWasReleased && !shotIsLiveOrResolved) return violateShotClock(next)
  if ((shotClockExpired || expiredAtPriorTick) && (shotWasReleased || next.ball.kind === 'REBOUNDABLE')) {
    next = { ...next, clock: { ...next.clock, shotRunning: false } }
  }
  return next
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
  next = emitEvent(next, 'ballDead', { ballReason: 'periodEnd' })
  next = emitEvent(next, 'periodEnd')
  if (state.period >= state.clockRules.periodCount) {
    next = { ...next, isComplete: true }
    return emitEvent(next, 'gameEnd')
  }
  const period = state.period + 1
  next = { ...next, period, gameClockTenths: state.clockRules.periodSeconds * 10, ball: { kind: 'DEAD', reason: 'periodEnd', position: ballPosition, heightMeters: 0.08 } }
  return emitEvent(next, 'periodStart')
}
