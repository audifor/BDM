/**
 * Basketball Truth BT1 — audit as regression tests.
 *
 * These are NOT "the game is fun" tests. Each threshold below is a geometric or timing fact that the
 * BT1 audit measured as broken (see docs/match-basketball-truth/BT1_REPORT.md) and that was corrected
 * at its root cause. They keep the corrections from silently regressing.
 *
 * Set BT1_WRITE_AUDIT=1 to also write the raw audit numbers to docs/match-basketball-truth/audit/.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { createMatchDemo } from '../dev/matchDemoBootstrap'
import { buildTruthFrame } from './basketballTruth'
import { runDirectorPipeline, runLegacyPipeline } from './presentationAudit'
import { runTruthAudit, summarizeAudit, type AuditSummary } from './runTruthAudit'
import { findScenarios } from './scenarios'

const SEEDS = [424242, 7, 1, 99, 2024, 31337] as const
const STEPS = 260

const cache = new Map<number, AuditSummary>()
function summary(seed: number): AuditSummary {
  let s = cache.get(seed)
  if (s === undefined) {
    s = summarizeAudit(runTruthAudit(seed, STEPS))
    cache.set(seed, s)
  }
  return s
}

function writeAudit(name: string, data: unknown): void {
  if (process.env.BT1_WRITE_AUDIT !== '1') return
  const dir = 'docs/match-basketball-truth/audit'
  mkdirSync(dir, { recursive: true })
  // BT1_AUDIT_TAG lets the same audit be recorded against the pre-BT1 engine (tag "v1") for the before/after tables.
  const tag = process.env.BT1_AUDIT_TAG
  writeFileSync(`${dir}/${name}${tag === undefined ? '' : `-${tag}`}.json`, JSON.stringify(data, null, 2))
}

describe('BT1A — canonical truth frame', () => {
  it('exposes every audited field per player, for the ball and for the match', () => {
    const demo = createMatchDemo(424242)
    const before = demo.session.state
    const after = demo.step().state
    const frame = buildTruthFrame(after, { previous: before, newEvents: after.events.slice(before.events.length), presentationFrame: 7, presentationEvent: 'PASS RELEASE' })
    expect(frame.players).toHaveLength(10)
    for (const row of frame.players) {
      expect(row.playerId).toBeDefined()
      expect(row.teamId).toBeDefined()
      expect(Number.isFinite(row.canonical.x) && Number.isFinite(row.canonical.y)).toBe(true)
      expect(row.rendered).toBeUndefined() // rendered truth is supplied by the renderer, never invented here
      expect(Number.isFinite(row.velocity.x)).toBe(true)
      expect(Number.isFinite(row.facingRadians)).toBe(true)
      expect(row.currentAction.length).toBeGreaterThan(0)
      expect(row.possessionRole.length).toBeGreaterThan(0)
      expect(row.isOffense ? row.guardedBy : row.guarding).toBeDefined()
      expect(row.movementTarget).toBeDefined()
    }
    expect(frame.matchEngineEvents).toBeDefined()
    expect(frame.presentationFrame).toBe(7)
    expect(frame.presentationEvent).toBe('PASS RELEASE')
    expect(frame.simulationTick).toBe(after.nextSequence)
    expect(frame.ball.canonical).toBeDefined()
  })

  it('computes canonical vs rendered difference when the renderer supplies what it painted', () => {
    const demo = createMatchDemo(7)
    const state = demo.step().state
    const rendered = new Map(state.spatial.players.map((p) => [p.playerId, { x: p.position.x + 3, y: p.position.y + 4 }]))
    const frame = buildTruthFrame(state, { rendered: { players: rendered, ball: { x: 1, y: 1 }, ballVisualHeight: 0.5 } })
    for (const row of frame.players) expect(row.canonicalRenderedDiffMeters).toBeCloseTo(5, 9)
    expect(frame.ball.rendered).toEqual({ x: 1, y: 1 })
  })
})

describe('BT1C — possession phases are derived, deterministic and never authoritative', () => {
  it('labels shots, rebounds, inbounds and transitions from engine facts', () => {
    const seen = new Set<string>()
    for (const seed of SEEDS) for (const step of runTruthAudit(seed, 120).steps) for (const tag of step.frame.phaseTags) seen.add(tag)
    for (const expected of ['shot', 'rebound', 'inbound', 'transitionOffense', 'halfCourt', 'actionSetup', 'actionExecution']) expect(seen.has(expected)).toBe(true)
  })
})

describe('BT1F — engine event stream consistency', () => {
  it('has no P0 event/geometry violations over six seeds (no made-then-rebound, no teleporting carried ball, no clock/score regressions)', () => {
    const counts: Record<string, number> = {}
    for (const seed of SEEDS) {
      for (const [code, n] of Object.entries(summary(seed).violationCounts)) counts[code] = (counts[code] ?? 0) + n
    }
    writeAudit('event-violations', counts)
    for (const code of Object.keys(counts)) expect(['LOOSE_BALL_TELEPORT']).toContain(code)
  })
})

describe('BT1H/BT1J — engine spatial truth after the corrections', () => {
  it('never moves a player away from the target the engine just assigned him (integrator over long steps)', () => {
    for (const seed of SEEDS) expect(summary(seed).wrongWayMoveRate).toBeLessThan(0.02)
  })

  it('does not park players on the court boundary (v1: 7-8% of player positions)', () => {
    for (const seed of SEEDS) expect(summary(seed).boundaryPlayerRate).toBeLessThan(0.01)
  })

  it('keeps the defender of the ball handler close (v1: 8.6-9.9 m on average)', () => {
    for (const seed of SEEDS) expect(summary(seed).meanOnBallDefenderDistance).toBeLessThan(7)
  })

  it('credits rebounds near the rim and strips to defenders on the ball (v1: median rebound 7.7 m; strips up to 20 m)', () => {
    let rebounds = 0
    for (const seed of SEEDS) {
      const s = summary(seed)
      rebounds += s.rebounds
      expect(s.medianReboundDistanceToRim).toBeLessThan(6.5)
      expect(s.reboundsBeyond6mShare).toBeLessThan(0.4)
      expect(s.medianStealDistance).toBeLessThan(10) // few steals per seed: per-seed medians are noisy (v1 strips reached 20 m)
    }
    expect(rebounds).toBeGreaterThan(100)
  })

  it('is reproducible: the same seeds give the same audit and the same scenarios', () => {
    expect(summarizeAudit(runTruthAudit(424242, 80))).toEqual(summarizeAudit(runTruthAudit(424242, 80)))
    const a = findScenarios([424242, 7, 11, 1], 200)
    const b = findScenarios([424242, 7, 11, 1], 200)
    expect(a).toEqual(b)
    writeAudit('summaries', Object.fromEntries(SEEDS.map((seed) => [seed, summary(seed)])))
    const scenarios = findScenarios([424242, 7, 1, 99, 2024, 31337, 11, 12, 13, 14, 15, 16], STEPS)
    expect(scenarios.map((s) => s.kind)).toEqual(['halfCourt', 'transition', 'screen', 'drive', 'shot', 'missRebound'])
    writeAudit('scenarios', scenarios)
  })
})

describe('BT1G/BT1H — presentation pipeline (real engine, 60 fps, headless)', () => {
  it('the v1 pipeline is measurably broken (documented baseline), the BT1 director is not', () => {
    const legacy = runLegacyPipeline(424242, 60)
    const director = runDirectorPipeline(424242, 60)
    writeAudit('presentation-legacy-vs-director', { legacy, director })

    // v1: bodies at sprint-x3 speeds, ball detached from its holder, events dropped, ball never reaching the rim.
    expect(legacy.maxPlayerSpeedMps).toBeGreaterThan(20)
    expect(legacy.heldBallDisconnectedFrames / Math.max(1, legacy.heldBallFrames)).toBeGreaterThan(0.3)
    expect(legacy.eventsDisplayed).toBeLessThan(legacy.eventsEmitted)
    expect(legacy.shotsWhereBallReachedRim / Math.max(1, legacy.shotEvents)).toBeLessThan(0.2)
    expect(legacy.madeThenReboundShownWithin1500ms).toBeGreaterThan(0)

    // BT1: human speeds, the ball is always with its holder, every event shown once in order,
    // shots really arrive at the rim, and the score changes with the ball at the rim.
    expect(director.maxPlayerSpeedMps).toBeLessThan(9.5)
    expect(director.framesWithPlayerAbove9Mps).toBe(0)
    expect(director.heldBallDisconnectedFrames).toBe(0)
    expect(director.eventsDisplayed).toBe(director.eventsEmitted)
    expect(director.eventsDisplayedOutOfOrder).toBe(0)
    expect(director.madeThenReboundShownWithin1500ms).toBe(0)
    expect(director.shotsWhereBallReachedRim / Math.max(1, director.shotEvents)).toBeGreaterThan(0.85)
    for (const d of director.madeShotScoreChangeBallToRimMeters) expect(d).toBeLessThan(0.7)
    expect(director.maxBallSpeedMps).toBeLessThan(45)
  })
})
