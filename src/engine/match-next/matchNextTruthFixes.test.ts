/**
 * Focal regression tests for the three MatchEngine Next defects found by the Basketball Truth (Next) audit.
 * Each one replays a reproducible seed through the real application path (createNewGame -> MatchEnginePort ->
 * MatchNextLiveController), exactly like Live and Instant do.
 */

import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game/createNewGame'
import { createMatchEnginePort } from '@/app/matchNext/MatchEnginePortFactory'

function liveSession(seed: number, clock?: { periodSeconds: number; periodCount: number }) {
  const world = createNewGame()
  const game = Object.values(world.games).find((candidate) => candidate.status === 'scheduled')!
  const port = createMatchEnginePort('match-next')
  const prepared = port.prepare(world, game, seed)
  return port.createLiveSession(clock === undefined ? prepared : { ...prepared, clockRules: { ...prepared.clockRules, ...clock } })
}

describe('Match Next truth fixes (BT1-Next)', () => {
  it('N2: an action still running when the period horn sounds is closed, so the next period is not frozen (seed 2, 40 s periods: CATCH_AND_SHOOT started t411, horn t420)', () => {
    const live = liveSession(2, { periodSeconds: 40, periodCount: 4 })
    while (!live.matchState.events.some((event) => event.type === 'periodEnd' && event.period === 1)) live.advanceOneStep()
    const horn = live.matchState.events.find((event) => event.type === 'periodEnd' && event.period === 1)!
    expect(horn.t).toBe(420)
    expect(live.matchState.actions.some((action) => action.kind === 'CATCH_AND_SHOOT' && action.startedT === 411)).toBe(true)
    // Nothing started before the horn may stay ACTIVE, and no stale decision may survive it.
    expect(live.matchState.actions.filter((action) => action.status === 'ACTIVE')).toEqual([])
    expect(live.matchState.currentDecision).toBeNull()
    // Play resumes in the new period instead of stalling until the 24 s shot clock expires.
    while (live.matchState.t < horn.t + 200) live.advanceOneStep()
    const play = live.matchState.events.filter((event) => event.t > horn.t && (event.type === 'actionStarted' || event.type === 'shotReleased' || event.type === 'passReleased'))
    expect(play.length).toBeGreaterThan(0)
    expect(live.matchState.events.some((event) => event.type === 'shotClockViolation')).toBe(false)
  }, 30000)

  it('N1: defenders contest the rebound from the shot release, so offensive rebounds are no longer ~98% of rebounds', () => {
    const live = liveSession(7)
    while (live.matchState.t < 7000 && !live.matchState.isComplete) live.advanceOneStep()
    const rebounds = live.matchState.events.filter((event) => event.type === 'reboundSecured')
    expect(rebounds.length).toBeGreaterThan(30)
    const offensive = rebounds.filter((event) => event.reboundType === 'offensive').length
    // Before the fix 121 of 123 rebounds (98%) were offensive on seed 424242; a fair contest is far from that.
    expect(offensive / rebounds.length).toBeLessThan(0.75)
    expect(live.matchState.possessions.some((possession) => possession.endReason === 'defensiveRebound')).toBe(true)
  }, 60000)

  it('N3: an inbound pass takes real flight time (>= 2 ticks), never the 1-tick / 30 m/s teleport', () => {
    const live = liveSession(424242)
    while (live.matchState.t < 3000 && !live.matchState.isComplete) live.advanceOneStep()
    const events = live.matchState.events
    const released = events.filter((event) => event.type === 'inboundReleased')
    expect(released.length).toBeGreaterThan(5)
    for (const release of released) {
      const received = events.find((event) => event.type === 'passReceived' && event.t >= release.t)
      expect(received).toBeDefined()
      expect(received!.t - release.t).toBeGreaterThanOrEqual(2)
    }
  }, 30000)
})
