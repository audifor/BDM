/**
 * BT1I — reproducible possession scenarios.
 *
 * A scenario is (seed, first engine step, last engine step). Because the engine is fully seeded,
 * replaying the same seed reproduces exactly the same possession after every correction, and the
 * browser demo can jump straight to it (`?seed=N`, then `__bdmBT.seekToSegment(firstStep)`).
 * Segment indices in the demo equal engine step indices in this audit.
 */

import { runTruthAudit, type AuditRun, type AuditStep } from './runTruthAudit'

export type ScenarioKind = 'halfCourt' | 'transition' | 'screen' | 'drive' | 'shot' | 'missRebound'

export interface PossessionWindow {
  readonly seed: number
  readonly firstStep: number
  readonly lastStep: number
  readonly steps: number
  readonly passes: number
  readonly hasScreen: boolean
  readonly hasDrive: boolean
  readonly hasHelp: boolean
  readonly transitionSteps: number
  readonly halfCourtSteps: number
  readonly ends: 'made' | 'missed' | 'turnover' | 'foul' | 'other'
  readonly hasMissRebound: boolean
  readonly clockSeconds: number
}

export interface Scenario extends PossessionWindow {
  readonly kind: ScenarioKind
  readonly description: string
}

export function possessionWindows(run: AuditRun): readonly PossessionWindow[] {
  const windows: PossessionWindow[] = []
  let start = 0
  let bucket: AuditStep[] = []
  const flush = (ends: PossessionWindow['ends']): void => {
    if (bucket.length === 0) return
    const passes = bucket.reduce((n, s) => n + s.events.filter((e) => e.type === 'passCompleted').length, 0)
    const active = bucket.filter((s) => s.clockDelta > 0)
    windows.push({
      seed: run.seed,
      firstStep: bucket[0]!.index,
      lastStep: bucket[bucket.length - 1]!.index,
      steps: bucket.length,
      passes,
      hasScreen: bucket.some((s) => s.frame.players.some((p) => p.screenIntent !== undefined)),
      hasDrive: bucket.some((s) => s.frame.players.some((p) => p.driveIntent)),
      hasHelp: bucket.some((s) => s.frame.players.some((p) => p.defensiveReaction === 'HELP')),
      // The last step of a window is the one that ends the possession (its after-state already carries the NEXT
      // possession's transition intent), so it is excluded: only steps played inside the possession count.
      transitionSteps: bucket.slice(0, -1).filter((s) => s.frame.phaseTags.includes('transitionOffense')).length,
      halfCourtSteps: active.filter((s) => s.offense.applicable).length,
      ends,
      hasMissRebound: bucket.some((s) => s.events.some((e) => e.type === 'shotMissed') && s.events.some((e) => e.type === 'rebound')),
      clockSeconds: active.reduce((n, s) => n + s.clockDelta, 0),
    })
    bucket = []
  }
  let lastOffense = run.steps[0]?.frame.offenseTeamId
  for (const step of run.steps) {
    void start
    bucket.push(step)
    const types = step.events.map((e) => e.type)
    const flipped = lastOffense !== undefined && step.frame.offenseTeamId !== lastOffense
    lastOffense = step.frame.offenseTeamId
    if (flipped) {
      const ends: PossessionWindow['ends'] = types.includes('shotMade') ? 'made' : types.includes('turnover') ? 'turnover' : types.includes('foul') ? 'foul' : types.includes('shotMissed') ? 'missed' : 'other'
      flush(ends)
      start = step.index + 1
    }
  }
  return windows
}

/** Picks, deterministically, one representative window per scenario kind (first seed/window that satisfies the criteria). */
export function findScenarios(seeds: readonly number[], stepsPerSeed = 260): readonly Scenario[] {
  const chosen = new Map<ScenarioKind, Scenario>()
  const criteria: { readonly kind: ScenarioKind; readonly description: string; readonly test: (w: PossessionWindow) => boolean }[] = [
    { kind: 'halfCourt', description: 'Half-court possession: at least 2 half-court steps, 2 passes, no transition, ends in a shot', test: (w) => w.halfCourtSteps >= 2 && w.passes >= 2 && w.transitionSteps === 0 && (w.ends === 'made' || w.ends === 'missed') },
    { kind: 'transition', description: 'Transition: possession that starts in transition and ends in a shot', test: (w) => w.transitionSteps >= 1 && w.passes >= 1 && (w.ends === 'made' || w.ends === 'missed') },
    { kind: 'screen', description: 'Pick & roll / screen: a screen intent is active during the possession', test: (w) => w.hasScreen && w.steps >= 3 && w.clockSeconds >= 10 },
    { kind: 'drive', description: 'Drive: a drive intent with a defensive help reaction', test: (w) => w.hasDrive && w.hasHelp },
    { kind: 'shot', description: 'Made shot: possession that ends in a made basket after a half-court set', test: (w) => w.ends === 'made' && w.halfCourtSteps >= 1 && w.passes >= 1 },
    { kind: 'missRebound', description: 'Miss + rebound: a missed shot followed by a rebound in the same step', test: (w) => w.hasMissRebound && w.steps >= 2 },
  ]
  for (const seed of seeds) {
    const windows = possessionWindows(runTruthAudit(seed, stepsPerSeed))
    for (const c of criteria) {
      if (chosen.has(c.kind)) continue
      const window = windows.find(c.test)
      if (window !== undefined) chosen.set(c.kind, { ...window, kind: c.kind, description: c.description })
    }
    if (chosen.size === criteria.length) break
  }
  return criteria.flatMap((c) => (chosen.has(c.kind) ? [chosen.get(c.kind)!] : []))
}
