import { emitEvent } from '../events'
import type { MatchState, PlayPhase, PlayState } from '../state'

/**
 * BT3L: the regulatory lifecycle of the game as one state machine:
 *   LIVE -> WHISTLE -> DEAD -> RESOLUTION -> INBOUND | FREE_THROW -> READY -> LIVE
 * Every stoppage (foul, free throws, made basket, out of bounds, violation, period end) goes through the same edges. The phase is
 * derived from the ball and the procedures (formation, free-throw sequence) and advances at most one legal edge per call, so an
 * illegal jump (for instance DEAD -> LIVE) can never be recorded.
 */
export const ALLOWED_PLAY_TRANSITIONS: Readonly<Record<PlayPhase, readonly PlayPhase[]>> = Object.freeze({
  LIVE: ['WHISTLE'],
  WHISTLE: ['DEAD'],
  DEAD: ['RESOLUTION', 'INBOUND', 'FREE_THROW'],
  RESOLUTION: ['INBOUND', 'FREE_THROW'],
  INBOUND: ['READY', 'WHISTLE'],
  FREE_THROW: ['READY', 'LIVE', 'WHISTLE'],
  READY: ['LIVE', 'WHISTLE'],
})

function causeOf(state: MatchState): PlayState['cause'] {
  const ball = state.ball
  if (state.freeThrows !== null) return 'FREE_THROWS'
  if (ball.kind === 'JUMP_BALL') return 'OPENING'
  if (ball.kind !== 'DEAD') return 'NONE'
  switch (ball.reason) {
    case 'madeBasket': return 'MADE_BASKET'
    case 'outOfBounds': return 'OUT_OF_BOUNDS'
    case 'foul': case 'freeThrow': return 'FOUL'
    case 'periodEnd': return 'PERIOD_END'
    case 'foundation': return 'OPENING'
    default: return 'VIOLATION'
  }
}

/** The phase the facts describe right now (before the one-edge-per-call rule). */
function targetPhase(before: PlayState, state: MatchState): PlayPhase {
  const ball = state.ball
  if (state.freeThrows !== null) return state.freeThrows.phase === 'FORMATION' ? 'RESOLUTION' : 'FREE_THROW'
  if (ball.kind === 'JUMP_BALL' || ball.kind === 'INBOUND') return 'INBOUND'
  if (ball.kind === 'PASS_IN_FLIGHT' && ball.isInbound) return 'READY'
  if (ball.kind === 'DEAD') {
    const procedure = state.responsibilities.some((item) => item.kind === 'PERIOD_RESTART')
    if (before.phase === 'LIVE' || before.phase === 'READY' || before.phase === 'FREE_THROW' || before.phase === 'INBOUND') return 'WHISTLE'
    if (procedure && (before.phase === 'DEAD' || before.phase === 'RESOLUTION')) return 'RESOLUTION'
    return before.phase === 'WHISTLE' ? 'DEAD' : before.phase
  }
  return 'LIVE'
}

/** Shortest legal path from `from` to `to`, first step only (the machine catches up one edge at a time). */
function nextStep(from: PlayPhase, to: PlayPhase): PlayPhase {
  if (from === to) return from
  const visited = new Map<PlayPhase, PlayPhase | null>([[from, null]])
  const queue: PlayPhase[] = [from]
  while (queue.length > 0) {
    const current = queue.shift()!
    for (const candidate of ALLOWED_PLAY_TRANSITIONS[current]) {
      if (visited.has(candidate)) continue
      visited.set(candidate, current)
      if (candidate === to) {
        let step: PlayPhase = candidate
        while (visited.get(step) !== from) step = visited.get(step)!
        return step
      }
      queue.push(candidate)
    }
  }
  return from
}

export function advancePlayState(before: MatchState, after: MatchState): MatchState {
  // Once the game is over there is no dead-ball lifecycle left to walk: `gameEnd` stays the last event.
  if (after.isComplete) return after
  const current = after.playState
  const target = targetPhase(current, after)
  const phase = nextStep(current.phase, target)
  const cause = causeOf(after)
  if (phase === current.phase) return cause === current.cause || phase === 'LIVE' ? after : { ...after, playState: { ...current, cause } }
  const next: MatchState = { ...after, playState: { phase, sinceT: after.t, cause: phase === 'LIVE' ? 'NONE' : cause } }
  void before
  return emitEvent(next, 'playStateChanged', { playPhase: phase, previousPlayPhase: current.phase })
}
