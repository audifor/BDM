import type { MatchSetup } from './setup'
import { validateMatchSetup } from './setup'
import { createInitialMatchState, type FoundationEvent, type MatchState } from './state'

export function createMatchState(setup: MatchSetup): MatchState { validateMatchSetup(setup); return createInitialMatchState(setup) }

export function tick(state: MatchState): MatchState {
  if (state.isComplete) return state
  if (state.gameClockTenths <= 0) throw new Error('Cannot tick a MatchState at a period boundary')
  const t = state.t + 1
  const gameClockTenths = state.gameClockTenths - 1
  if (gameClockTenths > 0) return { ...state, t, gameClockTenths }
  const ended = event(state.nextEventSequence, t, state.period, 0, 'periodEnd')
  const sequence = state.nextEventSequence + 1
  if (state.period >= state.clockRules.periodCount) {
    const end = event(sequence, t, state.period, 0, 'foundationEnd')
    return { ...state, t, gameClockTenths: 0, events: [...state.events, ended, end], nextEventSequence: sequence + 1, isComplete: true }
  }
  const period = state.period + 1
  const startingTenths = state.clockRules.periodSeconds * 10
  const started = event(sequence, t, period, startingTenths, 'periodStart')
  return { ...state, t, period, gameClockTenths: startingTenths, events: [...state.events, ended, started], nextEventSequence: sequence + 1 }
}

export function runUntil(state: MatchState, predicate: (state: MatchState) => boolean): MatchState {
  let current = state
  while (!predicate(current) && !current.isComplete) current = tick(current)
  return current
}

function event(sequence: number, t: number, period: number, gameClockTenths: number, type: FoundationEvent['type']): FoundationEvent {
  return { sequence, t, period, gameClockTenths, type }
}
