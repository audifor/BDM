import { afterEach, describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game/createNewGame'
import { createMatchEnginePort } from '@/app/matchNext/MatchEnginePortFactory'
import type { MatchNextEnginePort } from '@/app/matchNext/MatchNextEnginePort'
import type { MatchNextEvent } from '../state'
import type { MatchActionState } from '../actions/ActionState'
import { activeActions, appendAction, copyActions, replaceActionAt, teamOffensiveActions } from '../actions/ActionIndex'
import { appendEvent, eventCount, eventsOf, ownEvents, publishEvents, trimEvents } from './EventLog'
import { jsonEqual } from './jsonEqual'
import { setExecutionDiagnostics } from './Diagnostics'

/** Deterministic test randomness (no Math.random in src/). */
function lcg(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0x1_0000_0000
  }
}

afterEach(() => setExecutionDiagnostics('NONE'))

describe('ME-LOCK1.2 jsonEqual', () => {
  it('answers exactly what comparing JSON.stringify outputs answers', () => {
    const random = lcg(12)
    const leaf = (): unknown => {
      const pick = Math.floor(random() * 9)
      return [0, -0, 1.5, Number.NaN, Number.POSITIVE_INFINITY, null, undefined, 'a', true][pick]
    }
    const value = (depth: number): unknown => {
      const pick = random()
      if (depth <= 0 || pick < 0.4) return leaf()
      if (pick < 0.7) return Array.from({ length: Math.floor(random() * 3) }, () => value(depth - 1))
      const object: Record<string, unknown> = {}
      for (const key of ['b', 'a', 'c']) if (random() < 0.6) object[key] = value(depth - 1)
      return object
    }
    let equalPairs = 0
    for (let index = 0; index < 4000; index += 1) {
      const left = value(3)
      const right = random() < 0.5 ? value(3) : structuredClone(left)
      const expected = JSON.stringify(left) === JSON.stringify(right)
      if (expected) equalPairs += 1
      expect(jsonEqual(left, right)).toBe(expected)
    }
    expect(equalPairs).toBeGreaterThan(500)
    // Key order is part of the serialization.
    expect(jsonEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(false)
    expect(jsonEqual({ a: 1, b: undefined }, { a: 1 })).toBe(true)
    expect(jsonEqual([undefined], [null])).toBe(true)
    expect(jsonEqual(undefined, null)).toBe(false)
  })
})

describe('ME-LOCK1.2 session event log', () => {
  const event = (sequence: number): MatchNextEvent => ({ sequence, t: sequence, period: 1, gameClockTenths: 6000, type: 'offBallMove' })
  const append = <T extends { readonly events: readonly MatchNextEvent[]; readonly nextEventSequence: number }>(state: T): T =>
    ({ ...state, events: appendEvent(state, event(state.nextEventSequence)), nextEventSequence: state.nextEventSequence + 1 })

  it('appends in place for the newest state and never changes what an older state sees', () => {
    setExecutionDiagnostics('FULL')
    const start = ownEvents({ events: [event(1)], nextEventSequence: 2 })
    const a = append(start)
    const b = append(a)
    expect(b.events).toBe(start.events)
    expect(eventsOf(start).map((item) => item.sequence)).toEqual([1])
    expect(eventCount(a)).toBe(2)
    expect(eventsOf(b).map((item) => item.sequence)).toEqual([1, 2, 3])
  })

  it('forks when an older state appends, and trims what a discarded branch wrote', () => {
    setExecutionDiagnostics('FULL')
    const start = ownEvents({ events: [event(1)], nextEventSequence: 2 })
    const kept = append(start)
    const discarded = append(append(kept))
    expect(discarded.events.length).toBe(4)
    const branch = append(kept)
    expect(branch.events).not.toBe(kept.events)
    expect(eventsOf(branch).map((item) => item.sequence)).toEqual([1, 2, 3])
    expect(eventsOf(discarded).map((item) => item.sequence)).toEqual([1, 2, 3, 4])
    const trimmed = trimEvents(kept)
    expect(trimmed.events.map((item) => item.sequence)).toEqual([1, 2])
  })

  it('publishes exact, sealed histories and copies on append outside a session', () => {
    const unowned = { events: [event(1)], nextEventSequence: 2 }
    const next = append(unowned)
    expect(next.events).not.toBe(unowned.events)
    expect(unowned.events).toHaveLength(1)
    const session = append(ownEvents(unowned))
    const published = publishEvents(session)
    const after = append(published)
    expect(published.events).toHaveLength(2)
    expect(after.events).not.toBe(published.events)
    expect(published.events).toHaveLength(2)
  })
})

describe('ME-LOCK1.2 carried action history views', () => {
  it('match the whole-history scans under any sequence of appends and replacements', () => {
    setExecutionDiagnostics('FULL')
    const random = lcg(77)
    const kinds = ['PASS', 'KICK_OUT', 'DRIVE', 'SHOOT', 'SCREEN', 'CLOSEOUT'] as const
    const outcomes = ['CAUGHT', 'ADVANTAGE', 'FINISH', 'CONTAINED', 'CANCELLED'] as const
    let actions: readonly MatchActionState[] = []
    let t = 0
    let sequence = 1
    for (let step = 0; step < 3000; step += 1) {
      t += Math.floor(random() * 3)
      const roll = random()
      if (roll < 0.25 || actions.length === 0) {
        const created = random() < 0.15
        actions = appendAction(actions, {
          id: `a-${sequence++}`, kind: kinds[Math.floor(random() * kinds.length)]!, playerId: `p${Math.floor(random() * 10)}`, teamId: random() < 0.5 ? 'home' : 'away',
          startedT: t, status: created ? 'COMPLETED' : 'ACTIVE', ...(created ? { resolvedT: t, outcome: outcomes[Math.floor(random() * outcomes.length)] } : {}),
        } as unknown as MatchActionState)
      } else if (roll < 0.9) {
        const index = Math.floor(random() * actions.length)
        const old = actions[index]!
        const resolve = old.status === 'ACTIVE' && random() < 0.4
        const value = resolve
          ? { ...old, status: random() < 0.2 ? 'CANCELLED' : 'COMPLETED', outcome: outcomes[Math.floor(random() * outcomes.length)], resolvedT: t }
          : random() < 0.1 ? { ...old, resolvedT: Math.max(0, t - Math.floor(random() * 5)), status: 'COMPLETED', outcome: outcomes[Math.floor(random() * outcomes.length)] } : { ...old }
        actions = replaceActionAt(actions, index, value as MatchActionState)
      } else {
        actions = copyActions(actions)
      }
      // At FULL diagnostics every carried answer is checked against the scan of the same array (a mismatch throws).
      for (const teamId of ['home', 'away']) teamOffensiveActions({ actions }, teamId)
      activeActions({ actions })
    }
    // And the carried answers equal the scan of an unrelated copy of the history.
    const scanned = [...actions]
    for (const teamId of ['home', 'away']) expect(teamOffensiveActions({ actions }, teamId)).toEqual(teamOffensiveActions({ actions: scanned }, teamId))
  })
})

describe('ME-LOCK1.2 execution session', () => {
  const port = createMatchEnginePort('match-next') as MatchNextEnginePort
  const world = createNewGame()
  const game = Object.values(world.games).find((candidate) => candidate.status === 'scheduled')!
  const prepared = port.prepare(world, game, 424242)
  const setup = { ...prepared, clockRules: { ...prepared.clockRules, periodCount: 2, periodSeconds: 60, overtimeSeconds: 30 } }

  it('FAST and FULL produce the identical result, with full diagnostics', () => {
    setExecutionDiagnostics('FULL')
    const fast = port.simulate(setup, 'FAST')
    const full = port.simulate(setup, 'FULL')
    expect(full).toEqual(fast)
    expect(fast.finalState.events).toHaveLength(fast.finalState.nextEventSequence - 1)
  })

  it('never lets a state that left the session change afterwards', () => {
    const live = port.createLiveSession(setup)
    live.advanceTicks(300)
    const exposed = live.matchState
    const length = exposed.events.length
    const last = exposed.events.at(-1)
    live.advanceTicks(300)
    expect(exposed.events).toHaveLength(length)
    expect(exposed.events.at(-1)).toBe(last)
    expect(live.matchState.events.length).toBeGreaterThan(length)
    expect(live.matchState.events).toHaveLength(live.matchState.nextEventSequence - 1)
  })
})
