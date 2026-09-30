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
  it('N2: an action still running when the period horn sounds is closed, so the next period is not frozen', () => {
    // The moment is seed dependent (the horn has to catch an action mid-flight): scan reproducible seeds for it.
    let found = 0
    for (const seed of [2, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]) {
      const live = liveSession(seed, { periodSeconds: 40, periodCount: 4 })
      let before = live.matchState
      while (!live.matchState.events.some((event) => event.type === 'periodEnd' && event.period === 1)) {
        before = live.matchState
        live.advanceOneStep()
      }
      const horn = live.matchState.events.find((event) => event.type === 'periodEnd' && event.period === 1)!
      const runningAtHorn = before.actions.filter((action) => action.status === 'ACTIVE' && action.kind !== 'CLOSEOUT')
      if (runningAtHorn.length === 0) continue
      found += 1
      // Nothing started before the horn may stay ACTIVE, and no stale decision may survive it.
      expect(live.matchState.actions.filter((action) => action.status === 'ACTIVE')).toEqual([])
      expect(live.matchState.currentDecision).toBeNull()
      // Play resumes in the new period instead of stalling until the 24 s shot clock expires.
      while (live.matchState.t < horn.t + 200) live.advanceOneStep()
      const play = live.matchState.events.filter((event) => event.t > horn.t && (event.type === 'actionStarted' || event.type === 'shotReleased' || event.type === 'passReleased'))
      expect(play.length).toBeGreaterThan(0)
      expect(live.matchState.events.some((event) => event.type === 'shotClockViolation')).toBe(false)
      if (found >= 2) break
    }
    expect(found).toBeGreaterThan(0)
  }, 120000)

  it('N1: defenders contest the rebound from the shot release, so offensive rebounds are no longer ~98% of rebounds', () => {
    const live = liveSession(7)
    while (live.matchState.t < 7000 && !live.matchState.isComplete) live.advanceOneStep()
    const rebounds = live.matchState.events.filter((event) => event.type === 'reboundSecured')
    expect(rebounds.length).toBeGreaterThanOrEqual(15)
    const offensive = rebounds.filter((event) => event.reboundType === 'offensive').length
    // Before the fix 121 of 123 rebounds (98%) were offensive on seed 424242; a fair contest is far from that.
    // BT2 (rebounding v2) brought this down further: it is now a fair contest, well under half of the rebounds.
    expect(offensive / rebounds.length).toBeLessThan(0.45)
    expect(live.matchState.possessions.some((possession) => possession.endReason === 'defensiveRebound')).toBe(true)
  }, 60000)

  it('N3: an inbound pass takes real flight time (>= 2 ticks), never the 1-tick / 30 m/s teleport', () => {
    const live = liveSession(424242)
    while (live.matchState.t < 6000 && !live.matchState.isComplete) live.advanceOneStep()
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
