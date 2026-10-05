import type { MatchNextEvent, MatchState } from '../state'
import { executionInvariant, fullExecutionDiagnostics } from './Diagnostics'

/**
 * ME-LOCK1.2 execution event log.
 *
 * Every event used to be appended by copying the whole history (`[...events, event]`): ~12,500 events a game, so ~1.5 GB of copies per
 * match. Inside an execution session (MatchNextLiveController) the history array is instead an append-only buffer owned by the session:
 *
 * - A state's events are always the first `nextEventSequence - 1` elements of its array (sequences start at 1 and grow by one per event).
 *   That prefix is never modified; appending only ever writes past the end of the array.
 * - Appending from a state whose prefix is the whole buffer pushes in place. Appending from an older state (one whose buffer was extended
 *   by a newer or discarded state) copies its prefix first, so no state ever sees an event that is not its own.
 * - Arrays the session does not own (tests or tools driving the kernel directly, anything sealed) keep the copy-on-append behaviour.
 *
 * Readers in the engine go through `eventCount` (never `events.length`). The session trims and seals the buffer before any state leaves it
 * (`publishEvents`), so frames, results and callers only ever see exact, immutable histories.
 */
const ownedBuffers = new WeakSet<readonly MatchNextEvent[]>()

/** Diagnostics: how often an append had to copy (an older state appended) and a step had to drop a discarded branch's events. */
export const eventLogDiagnostics = { forks: 0, trims: 0 }

/** Number of events of this state (its prefix of a possibly longer session buffer). */
export function eventCount(state: Pick<MatchState, 'events' | 'nextEventSequence'>): number {
  return ownedBuffers.has(state.events) ? state.nextEventSequence - 1 : state.events.length
}

/** Exactly the events of this state, as an array (the buffer itself unless a newer state extended it). */
export function eventsOf(state: Pick<MatchState, 'events' | 'nextEventSequence'>): readonly MatchNextEvent[] {
  const count = eventCount(state)
  return state.events.length === count ? state.events : state.events.slice(0, count)
}

/** The events array of `state` with `event` appended (in place when the session owns it and the state is its newest owner). */
export function appendEvent(state: Pick<MatchState, 'events' | 'nextEventSequence'>, event: MatchNextEvent): readonly MatchNextEvent[] {
  const events = state.events
  if (!ownedBuffers.has(events)) return [...events, event]
  const count = state.nextEventSequence - 1
  if (fullExecutionDiagnostics()) {
    // The prefix of this state is intact and the new event continues it.
    executionInvariant(events.length >= count && (count === 0 || events[count - 1]!.sequence === count) && event.sequence === count + 1, () => `event log prefix broken at sequence ${event.sequence}`)
  }
  if (events.length === count) {
    ;(events as MatchNextEvent[]).push(event)
    return events
  }
  eventLogDiagnostics.forks += 1
  const fork = events.slice(0, count)
  fork.push(event)
  ownedBuffers.add(fork)
  return fork
}

/** Session start / step start: give the session a buffer it owns (a copy of the state's own events when it does not own them yet). */
export function ownEvents<T extends Pick<MatchState, 'events' | 'nextEventSequence'>>(state: T): T {
  if (ownedBuffers.has(state.events)) return state
  const events = state.events.slice(0, eventCount(state))
  ownedBuffers.add(events)
  return { ...state, events }
}

/**
 * A state leaves the session (frame, result, accessor): its events become exactly its own and are never written again. The session
 * takes a new owned copy on its next step.
 */
export function publishEvents<T extends Pick<MatchState, 'events' | 'nextEventSequence'>>(state: T): T {
  if (!ownedBuffers.has(state.events)) return state
  const count = state.nextEventSequence - 1
  if (state.events.length === count) {
    ownedBuffers.delete(state.events)
    return state
  }
  return { ...state, events: state.events.slice(0, count) }
}

/** Step end: drops events past this state's own (written by a discarded branch), keeping the buffer owned. */
export function trimEvents<T extends Pick<MatchState, 'events' | 'nextEventSequence'>>(state: T): T {
  if (!ownedBuffers.has(state.events) || state.events.length === state.nextEventSequence - 1) return state
  eventLogDiagnostics.trims += 1
  const events = state.events.slice(0, state.nextEventSequence - 1)
  ownedBuffers.add(events)
  return { ...state, events }
}
