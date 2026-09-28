import type { MatchNextEvent, MatchNextEventType, MatchState } from './state'

type EventDetails = Partial<Omit<MatchNextEvent, 'sequence' | 't' | 'period' | 'gameClockTenths' | 'type'>>

export function emitEvent(state: MatchState, type: MatchNextEventType, details: EventDetails = {}): MatchState {
  const event: MatchNextEvent = {
    sequence: state.nextEventSequence,
    t: state.t,
    period: state.period,
    gameClockTenths: state.gameClockTenths,
    type,
    ...details,
  }
  return { ...state, events: [...state.events, event], nextEventSequence: state.nextEventSequence + 1 }
}
