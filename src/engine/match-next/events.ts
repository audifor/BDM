import type { MatchNextEvent, MatchNextEventType, MatchState } from './state'
import { addMatchEventFatigue } from './playerDynamicState'
import { appendEvent, eventCount } from './execution/EventLog'

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
  return addMatchEventFatigue({ ...state, events: appendEvent(state, event), nextEventSequence: state.nextEventSequence + 1 }, event)
}

/*
 * ME-LOCK1: history queries. Every event is appended with the current tick and the tick never goes back, so the events of the
 * ticks >= fromT are the tail of the history: scanning back from the end and stopping at the first older event answers the same
 * question as scanning the whole match (12,000+ events), whose cost grew with every tick played.
 */

/** `events.some((e) => e.t >= fromT && test(e))`. */
export function someEventSince(state: Pick<MatchState, 'events' | 'nextEventSequence'>, fromT: number, test: (event: MatchNextEvent) => boolean): boolean {
  for (let index = eventCount(state) - 1; index >= 0 && state.events[index]!.t >= fromT; index -= 1) if (test(state.events[index]!)) return true
  return false
}

/** `events.filter((e) => e.t >= fromT && test(e)).length`. */
export function countEventsSince(state: Pick<MatchState, 'events' | 'nextEventSequence'>, fromT: number, test: (event: MatchNextEvent) => boolean): number {
  let count = 0
  for (let index = eventCount(state) - 1; index >= 0 && state.events[index]!.t >= fromT; index -= 1) if (test(state.events[index]!)) count += 1
  return count
}

/** `[...events].reverse().find(test)`, without copying the history. */
export function findLastEvent(state: Pick<MatchState, 'events' | 'nextEventSequence'>, test: (event: MatchNextEvent) => boolean): MatchNextEvent | undefined {
  for (let index = eventCount(state) - 1; index >= 0; index -= 1) if (test(state.events[index]!)) return state.events[index]
  return undefined
}
