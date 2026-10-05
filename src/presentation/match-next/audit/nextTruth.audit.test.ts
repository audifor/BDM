/**
 * Basketball Truth (Next) audit as regression tests. These are not "the game is good" tests: each threshold is a
 * fact the audit measured as broken on MatchEngine Next and that was corrected at its root cause, or a structural
 * guarantee the presentation contract depends on (10 Hz canonical truth, event order, human speeds).
 */

import { describe, expect, it } from 'vitest'

import { findNextScenarios, possessionWindows, UNAVAILABLE_SCENARIOS } from './scenarios'
import { runNextAudit, summarizeNextRun } from './nextAudit'

const SEEDS = [424242, 7] as const
const TICKS = 8000

const cache = new Map<number, ReturnType<typeof summarizeNextRun>>()
const summary = (seed: number): ReturnType<typeof summarizeNextRun> => {
  let s = cache.get(seed)
  if (s === undefined) {
    s = summarizeNextRun(seed, { maxTicks: TICKS })
    cache.set(seed, s)
  }
  return s
}

describe('canonical truth quality (MatchEngine Next, first 13 min of play, two seeds)', { timeout: 180000 }, () => {
  it('is continuous at 10 Hz: no player exceeds human speed, no tick-to-tick teleport of a body', () => {
    for (const seed of SEEDS) expect(summary(seed).maxPlayerSpeedMps).toBeLessThan(9)
  })

  it('does not stall: no shot-clock violations from a frozen possession (period horn during an action, seed 424242)', () => {
    expect(summary(424242).shotClockViolations).toBe(0)
  })

  it('has a real rebound contest: offensive rebounds are far below the 98% measured before the fix', () => {
    for (const seed of SEEDS) {
      const s = summary(seed)
      expect(s.rebounds).toBeGreaterThan(15)
      expect(s.offensiveReboundShare).toBeLessThan(0.75)
      expect(s.meanReboundDistanceToRim).toBeLessThan(4)
    }
  })

  it('keeps a structured half-court defense (documented strengths, so they are not regressed)', () => {
    // Judged once the possession is 6 s old: the first seconds are both teams running to their spots (see summarizeNextRun).
    for (const seed of SEEDS) {
      const s = summarizeNextRun(seed, { maxTicks: TICKS, minSecondsIntoPossession: 6 })
      expect(s.defense.meanOnBallDefenderDistance).toBeLessThan(4)
      expect(s.defense.paintUnprotectedShare).toBeLessThan(0.4)
      expect(s.defense.meanGoalSideDefenders).toBeGreaterThan(3)
    }
  })

  it('is deterministic: same seed, same audit', () => {
    const a = summarizeNextRun(424242, { maxTicks: 1500 })
    const b = summarizeNextRun(424242, { maxTicks: 1500 })
    expect(a).toEqual(b)
  })
})

describe('event truth', { timeout: 120000 }, () => {
  it('never shows a rebound of a made shot in the same possession, and orders events by sequence and tick', () => {
    const run = runNextAudit(7, { maxTicks: TICKS })
    let last = 0
    for (const e of run.events) {
      expect(e.sequence).toBeGreaterThan(last)
      last = e.sequence
    }
    // A missed free throw (the AND-ONE after a made basket, BT3) has a rebound of its own: it is the FT's rebound, not the shot's.
    const afterFreeThrowMiss = (rebound: (typeof run.events)[number], made: (typeof run.events)[number]): boolean =>
      run.events.some((e) => e.type === 'freeThrowMissed' && e.sequence > made.sequence && e.sequence < rebound.sequence)
    for (const w of possessionWindows(7, run.events)) {
      const rebound = run.events.find((e) => e.type === 'reboundSecured' && e.possessionId === w.possessionId)
      const made = run.events.find((e) => e.type === 'shotMade' && e.possessionId === w.possessionId)
      const ftRebound = rebound !== undefined && made !== undefined && afterFreeThrowMiss(rebound, made)
      expect(w.made && w.missedThenRebound && w.shots === 1 && !ftRebound).toBe(false)
    }
    const made = run.events.filter((e) => e.type === 'shotMade')
    for (const m of made) {
      const rebound = run.events.find((e) => e.type === 'reboundSecured' && e.possessionId === m.possessionId && e.sequence > m.sequence)
      if (rebound !== undefined) expect(afterFreeThrowMiss(rebound, m)).toBe(true)
    }
  })
})

describe('scenarios', { timeout: 600000 }, () => {
  it('are found from the real event stream, are reproducible, and cover everything the engine can produce', () => {
    const a = findNextScenarios([424242, 7], (seed) => runNextAudit(seed, { maxTicks: 4000 }))
    const b = findNextScenarios([424242, 7], (seed) => runNextAudit(seed, { maxTicks: 4000 }))
    expect(a).toEqual(b)
    const kinds = new Set(a.map((s) => s.kind))
    for (const k of ['transitionOffense', 'drive', 'madeShot', 'missedShot', 'rebound', 'inbound']) expect(kinds.has(k as never)).toBe(true)
    // Screens / P&R exist since BT2: they are found from the real event stream like everything else, never faked.
    expect(UNAVAILABLE_SCENARIOS).toEqual([])
    const longer = new Set(findNextScenarios([424242, 7, 1]).map((scenario) => scenario.kind))
    for (const k of ['screen', 'cut']) expect(longer.has(k as never)).toBe(true)
  })
})
