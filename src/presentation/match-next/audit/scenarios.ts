/**
 * Reproducible MatchEngine Next scenarios (seed + tick window), found from the canonical event stream only.
 * A scenario is real engine behaviour: nothing is scripted or injected. Re-running the same seed reproduces it.
 */

import type { MatchNextEvent } from '@/engine/match-next'
import { runNextAudit, type NextAuditRun } from './nextAudit'

export type NextScenarioKind =
  | 'halfCourtOffense' | 'transitionOffense' | 'transitionDefense' | 'screen' | 'pickAndRoll' | 'drive'
  | 'helpDefense' | 'passSequence' | 'madeShot' | 'missedShot' | 'rebound' | 'inbound' | 'cut' | 'offensiveRebound' | 'kickOut'

export interface PossessionWindow {
  readonly seed: number
  readonly possessionId: string
  readonly startT: number
  readonly endT: number
  readonly teamId: string | undefined
  readonly startReason: string | undefined
  readonly setupSeconds: number
  readonly passes: number
  readonly shots: number
  readonly made: boolean
  readonly missedThenRebound: boolean
  readonly reboundType: string | undefined
  readonly drive: boolean
  readonly screenSet: boolean
  readonly screenUsed: boolean
  readonly screenThenDrive: boolean
  readonly cut: boolean
  readonly kickOut: boolean
  readonly offensiveRebound: boolean
  readonly help: boolean
  readonly transition: string | undefined
  readonly transitionStopped: boolean
  readonly inbound: boolean
  readonly endReason: string | undefined
}

export interface NextScenario extends PossessionWindow {
  readonly kind: NextScenarioKind
  readonly description: string
  /** Tick window to play (a little before the possession starts and after it ends). */
  readonly fromTick: number
  readonly toTick: number
}

export function possessionWindows(seed: number, events: readonly MatchNextEvent[]): readonly PossessionWindow[] {
  const byPossession = new Map<string, MatchNextEvent[]>()
  for (const e of events) {
    if (e.possessionId === undefined) continue
    const list = byPossession.get(e.possessionId) ?? []
    list.push(e)
    byPossession.set(e.possessionId, list)
  }
  const windows: PossessionWindow[] = []
  for (const [possessionId, list] of byPossession) {
    const start = list.find((e) => e.type === 'possessionStart')
    const end = list.find((e) => e.type === 'possessionEnd')
    if (start === undefined || end === undefined) continue
    const setupStart = list.find((e) => e.type === 'possessionPhaseChanged' && e.phase === 'SETUP')
    const window = events.filter((e) => e.t >= start.t && e.t <= end.t)
    const trans = window.find((e) => e.type === 'transitionStarted')
    const reboundEv = window.find((e) => e.type === 'reboundSecured')
    windows.push({
      seed,
      possessionId,
      startT: start.t,
      endT: end.t,
      teamId: start.teamId === undefined ? undefined : String(start.teamId),
      startReason: start.startReason,
      setupSeconds: setupStart === undefined ? 0 : (end.t - setupStart.t) / 10,
      passes: list.filter((e) => e.type === 'passReceived').length,
      shots: list.filter((e) => e.type === 'shotReleased').length,
      made: list.some((e) => e.type === 'shotMade'),
      missedThenRebound: window.some((e) => e.type === 'shotMissed') && reboundEv !== undefined,
      reboundType: reboundEv?.reboundType,
      drive: window.some((e) => e.type === 'actionStarted' && e.actionKind === 'DRIVE'),
      screenSet: window.some((e) => e.type === 'screenSet'),
      screenUsed: window.some((e) => e.type === 'screenUsed'),
      screenThenDrive: window.some((e) => e.type === 'screenUsed' && window.some((d) => d.type === 'actionStarted' && d.actionKind === 'DRIVE' && d.t >= e.t && d.t <= e.t + 2)),
      cut: window.some((e) => e.type === 'offBallMove' && (e.ballReason === 'BASKET_CUT' || e.ballReason === 'BACKDOOR_CUT')),
      kickOut: window.some((e) => e.type === 'actionStarted' && e.actionKind === 'KICK_OUT'),
      offensiveRebound: window.some((e) => e.type === 'reboundSecured' && e.reboundType === 'offensive'),
      help: window.some((e) => e.type === 'defensiveResponsibilityChanged' && (e.responsibilityKind === 'HELP' || e.responsibilityKind === 'ROTATE' || e.responsibilityKind === 'X_OUT')),
      transition: trans?.transitionTrigger,
      transitionStopped: window.some((e) => e.type === 'transitionAdvantageChanged' && e.transitionAdvantage === 'STOPPED'),
      inbound: window.some((e) => e.type === 'inboundStarted'),
      endReason: end.endReason,
    })
  }
  return windows.sort((a, b) => a.startT - b.startT)
}

const CRITERIA: readonly { readonly kind: NextScenarioKind; readonly description: string; readonly test: (w: PossessionWindow) => boolean }[] = [
  { kind: 'halfCourtOffense', description: 'Half-court offense: >= 8 s of SETUP/ACTION, >= 2 completed passes, no transition, ends in a shot', test: (w) => w.setupSeconds >= 8 && w.passes >= 2 && w.transition === undefined && w.shots >= 1 },
  { kind: 'transitionOffense', description: 'Transition offense after a defensive rebound/turnover/steal, ending in a shot', test: (w) => w.transition !== undefined && w.transition !== 'madeBasketInbound' && w.transition !== 'openingJumpBall' && w.shots >= 1 },
  { kind: 'transitionDefense', description: 'Transition defense: the transition ends STOPPED (defense recovers) before the shot', test: (w) => w.transition !== undefined && w.transitionStopped && w.shots >= 1 },
  { kind: 'screen', description: 'Ball screen: a screener sets a real screen (approach, set) for the ball handler', test: (w) => w.screenSet && w.shots >= 1 },
  { kind: 'pickAndRoll', description: 'Pick and roll: the handler uses the screen (drive off it) and the possession ends in a shot', test: (w) => w.screenThenDrive && w.shots >= 1 },
  { kind: 'cut', description: 'Off-ball cut: a basket or backdoor cut with a reason (denial / sag) during the possession', test: (w) => w.cut && w.shots >= 1 },
  { kind: 'kickOut', description: 'Drive and kick-out: the drive collapses the defense and the ball is kicked out', test: (w) => w.kickOut && w.shots >= 1 },
  { kind: 'offensiveRebound', description: 'Offensive rebound and reset: the rebounder secures, gathers and the possession continues', test: (w) => w.offensiveRebound && w.shots >= 2 },
  { kind: 'drive', description: 'Drive: a DRIVE action starts during the possession', test: (w) => w.drive },
  { kind: 'helpDefense', description: 'Help defense: HELP / ROTATE / X_OUT responsibility triggered', test: (w) => w.help },
  { kind: 'passSequence', description: 'Pass sequence: >= 4 completed passes in one possession', test: (w) => w.passes >= 4 },
  { kind: 'madeShot', description: 'Made shot after a half-court set', test: (w) => w.made && w.setupSeconds >= 4 },
  { kind: 'missedShot', description: 'Missed shot followed by a rebound', test: (w) => w.missedThenRebound },
  { kind: 'rebound', description: 'Defensive rebound that ends the possession', test: (w) => w.missedThenRebound && w.reboundType === 'defensive' },
  { kind: 'inbound', description: 'Made-basket inbound possession', test: (w) => w.startReason === 'madeBasketInbound' && w.shots >= 1 },
]

/** Kinds the engine cannot produce today. Screens / P&R exist since BT2, so nothing is unavailable any more. */
export const UNAVAILABLE_SCENARIOS: readonly NextScenarioKind[] = []

export function findNextScenarios(seeds: readonly number[], run: (seed: number) => NextAuditRun = (seed) => runNextAudit(seed, { maxTicks: 9000 })): readonly NextScenario[] {
  const chosen = new Map<NextScenarioKind, NextScenario>()
  const used = new Set<string>()
  for (const seed of seeds) {
    const windows = possessionWindows(seed, run(seed).events)
    for (const c of CRITERIA) {
      if (chosen.has(c.kind)) continue
      // Distinct, readable possessions: no window is reused, and chains of > 4 shots (repeated offensive rebounds) are skipped.
      const w = windows.find((x) => !used.has(`${seed}:${x.possessionId}`) && x.shots <= 4 && x.startReason !== 'openingJumpBall' && c.test(x))
      if (w !== undefined) used.add(`${seed}:${w.possessionId}`)
      if (w !== undefined) chosen.set(c.kind, { ...w, kind: c.kind, description: c.description, fromTick: Math.max(0, w.startT - 20), toTick: w.endT + 30 })
    }
    if (chosen.size === CRITERIA.length) break
  }
  return CRITERIA.flatMap((c) => (chosen.has(c.kind) ? [chosen.get(c.kind)!] : []))
}
