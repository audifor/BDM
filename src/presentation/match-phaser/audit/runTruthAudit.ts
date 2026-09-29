/**
 * Basketball Truth (BT1A/D/E/F/I) — headless audit driver.
 *
 * Runs a REAL, seeded MatchEngine session through the same bootstrap the browser demo uses
 * (createMatchDemo) and records, for every engine step: the canonical truth frame, the derived
 * possession phase, offensive/defensive geometry audits and engine event-consistency violations.
 * Deterministic: same seed => same audit, so a scenario can be replayed after every correction.
 */

import type { MatchEvent, MatchSessionState } from '@/engine/match'
import { createMatchDemo } from '../dev/matchDemoBootstrap'
import { buildTruthFrame, type TruthFrame } from './basketballTruth'
import { auditDefensiveGeometry, auditOffensiveSpacing, type DefensiveGeometryAudit, type OffensiveSpacingAudit } from './geometryAudit'
import { auditEngineStep, type EventViolation } from './eventConsistency'

export interface AuditStep {
  readonly index: number
  readonly frame: TruthFrame
  readonly clockDelta: number
  readonly maxPlayerDisplacementMeters: number
  readonly events: readonly MatchEvent[]
  readonly offense: OffensiveSpacingAudit
  readonly defense: DefensiveGeometryAudit
  readonly violations: readonly EventViolation[]
  /** Players whose canonical move this step went AWAY from the target the engine had just assigned them (> 1 m). */
  readonly wrongWayMoves: number
  /** Players that moved (> 0.5 m) this step, the denominator for wrongWayMoves. */
  readonly movingPlayers: number
  /** Players standing exactly on the court boundary at the end of the step. */
  readonly boundaryPlayers: number
  /** One entry per shot taken in this step, measured on the canonical positions at the moment of the shot. */
  readonly shots: readonly ShotAudit[]
}

export interface ShotAudit {
  readonly zone: string
  readonly made: boolean
  readonly shooterToBasketMeters: number
  /** Distance to the shooter's assigned defender (undefined if the shooter was just substituted). */
  readonly contestDistanceMeters: number | undefined
  /** Mean distance of the five defenders to their assigned man at the shot. */
  readonly meanDefenderToManMeters: number
  readonly defendersWithin2m: number
}

export interface AuditRun {
  readonly seed: number
  readonly steps: readonly AuditStep[]
  readonly finalState: MatchSessionState
}

export function runTruthAudit(seed: number, maxSteps: number): AuditRun {
  const demo = createMatchDemo(seed)
  const steps: AuditStep[] = []
  let previous = demo.session.state
  let possessionStartClock = previous.clockSecondsRemaining
  let possessionStartPeriod = previous.period
  let possessionTeam = previous.attackingTeamId
  let previousFrame: TruthFrame = buildTruthFrame(previous, {})
  for (let index = 0; index < maxSteps && !demo.session.state.isComplete; index += 1) {
    const state = demo.step().state
    const newEvents = state.events.slice(previous.events.length)
    if (state.attackingTeamId !== possessionTeam || state.period !== possessionStartPeriod) {
      possessionTeam = state.attackingTeamId
      possessionStartClock = previous.clockSecondsRemaining
      possessionStartPeriod = state.period
    }
    const elapsed = state.period === possessionStartPeriod ? possessionStartClock - state.clockSecondsRemaining : 0
    const frame = buildTruthFrame(state, { previous, newEvents, possessionElapsedSeconds: elapsed })
    const moved = state.spatial.players.map((p, i) => Math.hypot(p.position.x - previous.spatial.players[i]!.position.x, p.position.y - previous.spatial.players[i]!.position.y))
    let wrongWay = 0
    let moving = 0
    let boundary = 0
    for (const row of frame.players) {
      const before = previousFrame.players.find((p) => p.playerId === row.playerId)
      if (before === undefined) continue
      const dx = row.canonical.x - before.canonical.x
      const dy = row.canonical.y - before.canonical.y
      if (Math.hypot(dx, dy) > 0.5) {
        moving += 1
        const target = before.movementTarget
        if (previous.spatial.ball.kind === 'playerControlled' && target !== undefined && Math.hypot(dx, dy) > 1 && dx * (target.x - before.canonical.x) + dy * (target.y - before.canonical.y) < 0) wrongWay += 1
      }
      if (row.canonical.x <= 0.001 || row.canonical.x >= 27.999 || row.canonical.y <= 0.001 || row.canonical.y >= 14.999) boundary += 1
    }
    const shots: ShotAudit[] = []
    for (const event of newEvents) {
      if (event.type !== 'shotMade' && event.type !== 'shotMissed') continue
      const shooterBefore = previousFrame.players.find((p) => p.playerId === event.playerId)
      const shooter = frame.players.find((p) => p.playerId === event.playerId)
      if (shooterBefore === undefined || shooter === undefined) continue
      const defender = frame.players.find((p) => p.playerId === shooterBefore.guardedBy)
      const basket = previousFrame.attackingBasket
      const perDefender = previousFrame.players
        .filter((p) => p.isOffense)
        .map((offensePlayer) => {
          const man = frame.players.find((p) => p.playerId === offensePlayer.playerId)
          const guard = frame.players.find((p) => p.playerId === offensePlayer.guardedBy)
          return man === undefined || guard === undefined ? undefined : Math.hypot(man.canonical.x - guard.canonical.x, man.canonical.y - guard.canonical.y)
        })
        .filter((d): d is number => d !== undefined)
      shots.push({
        zone: event.shotZone,
        made: event.type === 'shotMade',
        shooterToBasketMeters: Math.hypot(shooter.canonical.x - basket.x, shooter.canonical.y - basket.y),
        contestDistanceMeters: defender === undefined ? undefined : Math.hypot(shooter.canonical.x - defender.canonical.x, shooter.canonical.y - defender.canonical.y),
        meanDefenderToManMeters: perDefender.length === 0 ? 0 : perDefender.reduce((a, b) => a + b, 0) / perDefender.length,
        defendersWithin2m: perDefender.filter((d) => d <= 2).length,
      })
    }
    previousFrame = frame
    steps.push({
      index,
      frame,
      clockDelta: previous.period === state.period ? previous.clockSecondsRemaining - state.clockSecondsRemaining : 0,
      maxPlayerDisplacementMeters: Math.max(...moved),
      events: newEvents,
      offense: auditOffensiveSpacing(frame),
      defense: auditDefensiveGeometry(frame),
      violations: auditEngineStep(previous, state, newEvents),
      wrongWayMoves: wrongWay,
      movingPlayers: moving,
      boundaryPlayers: boundary,
      shots,
    })
    previous = state
  }
  return { seed, steps, finalState: demo.session.state }
}

export interface AuditSummary {
  readonly seed: number
  readonly steps: number
  readonly stepsWithClock: number
  readonly meanClockDeltaWhenPositive: number
  readonly maxDisplacementMeters: number
  readonly halfCourtFrames: number
  readonly offenseFlagRates: Readonly<Record<string, number>>
  readonly defenseFlagRates: Readonly<Record<string, number>>
  readonly violationCounts: Readonly<Record<string, number>>
  readonly meanOnBallDefenderDistance: number
  readonly meanPassingLanes: number
  readonly meanPaintOccupants: number
  readonly meanMinPairDistance: number
  readonly phaseCounts: Readonly<Record<string, number>>
  readonly wrongWayMoveRate: number
  readonly wrongWayMoves: number
  readonly movingPlayerSteps: number
  readonly boundaryPlayerRate: number
  readonly shots: number
  readonly meanShotContestDistance: number
  readonly openShotShare: number
  readonly shotsOver9mShare: number
  readonly meanDefenderToManAtShot: number
  readonly rebounds: number
  readonly medianReboundDistanceToRim: number
  readonly reboundsBeyond6mShare: number
  readonly steals: number
  readonly medianStealDistance: number
}

export function summarizeAudit(run: AuditRun): AuditSummary {
  const half = run.steps.filter((s) => s.offense.applicable)
  const rate = (getter: (s: AuditStep) => readonly string[]): Record<string, number> => {
    const counts: Record<string, number> = {}
    for (const s of half) for (const f of getter(s)) counts[f] = (counts[f] ?? 0) + 1
    return Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, Number((v / Math.max(1, half.length)).toFixed(3))]))
  }
  const violationCounts: Record<string, number> = {}
  for (const s of run.steps) for (const v of s.violations) violationCounts[v.code] = (violationCounts[v.code] ?? 0) + 1
  const phaseCounts: Record<string, number> = {}
  for (const s of run.steps) phaseCounts[s.frame.phase] = (phaseCounts[s.frame.phase] ?? 0) + 1
  const positive = run.steps.filter((s) => s.clockDelta > 0)
  const mean = (values: readonly number[]): number => (values.length === 0 ? 0 : Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)))
  return {
    seed: run.seed,
    steps: run.steps.length,
    stepsWithClock: positive.length,
    meanClockDeltaWhenPositive: mean(positive.map((s) => s.clockDelta)),
    maxDisplacementMeters: Number(Math.max(0, ...run.steps.map((s) => s.maxPlayerDisplacementMeters)).toFixed(1)),
    halfCourtFrames: half.length,
    offenseFlagRates: rate((s) => s.offense.flags),
    defenseFlagRates: rate((s) => s.defense.flags),
    violationCounts,
    meanOnBallDefenderDistance: mean(half.flatMap((s) => (s.defense.onBallDefenderDistance === undefined ? [] : [s.defense.onBallDefenderDistance]))),
    meanPassingLanes: mean(half.map((s) => s.offense.openPassingLanes)),
    meanPaintOccupants: mean(half.map((s) => s.offense.paintOccupants)),
    meanMinPairDistance: mean(half.map((s) => s.offense.minPairDistance)),
    phaseCounts,
    wrongWayMoveRate: Number((run.steps.reduce((a, b) => a + b.wrongWayMoves, 0) / Math.max(1, run.steps.reduce((a, b) => a + b.movingPlayers, 0))).toFixed(3)),
    wrongWayMoves: run.steps.reduce((a, b) => a + b.wrongWayMoves, 0),
    movingPlayerSteps: run.steps.reduce((a, b) => a + b.movingPlayers, 0),
    ...shotSummary(run),
    ...reboundAndStealSummary(run),
    boundaryPlayerRate: Number((run.steps.reduce((a, b) => a + b.boundaryPlayers, 0) / Math.max(1, run.steps.length * 10)).toFixed(3)),
  }
}

function reboundAndStealSummary(run: AuditRun): Pick<AuditSummary, 'rebounds' | 'medianReboundDistanceToRim' | 'reboundsBeyond6mShare' | 'steals' | 'medianStealDistance'> {
  const reboundDistances: number[] = []
  const stealDistances: number[] = []
  let previousFrame: TruthFrame | undefined
  for (const step of run.steps) {
    for (const event of step.events) {
      const rimOfShot = previousFrame?.attackingBasket ?? step.frame.attackingBasket
      if (event.type === 'rebound') {
        const p = step.frame.players.find((q) => q.playerId === event.playerId)
        if (p !== undefined) reboundDistances.push(Math.hypot(p.canonical.x - rimOfShot.x, p.canonical.y - rimOfShot.y))
      }
      // Strips only: an interception of a failed pass legitimately happens far from the passer.
      if (event.type === 'turnover' && event.stealPlayerId !== undefined && event.passTargetPlayerId === undefined) {
        const h = step.frame.players.find((q) => q.playerId === event.playerId)
        const st = step.frame.players.find((q) => q.playerId === event.stealPlayerId)
        if (h !== undefined && st !== undefined) stealDistances.push(Math.hypot(h.canonical.x - st.canonical.x, h.canonical.y - st.canonical.y))
      }
    }
    previousFrame = step.frame
  }
  const median = (values: readonly number[]): number => {
    if (values.length === 0) return 0
    const sorted = [...values].sort((a, b) => a - b)
    return Number(sorted[Math.floor(sorted.length / 2)]!.toFixed(2))
  }
  return {
    rebounds: reboundDistances.length,
    medianReboundDistanceToRim: median(reboundDistances),
    reboundsBeyond6mShare: Number((reboundDistances.filter((d) => d > 6).length / Math.max(1, reboundDistances.length)).toFixed(2)),
    steals: stealDistances.length,
    medianStealDistance: median(stealDistances),
  }
}

function shotSummary(run: AuditRun): Pick<AuditSummary, 'shots' | 'meanShotContestDistance' | 'openShotShare' | 'shotsOver9mShare' | 'meanDefenderToManAtShot'> {
  const shots = run.steps.flatMap((s) => s.shots)
  const contested = shots.flatMap((s) => (s.contestDistanceMeters === undefined ? [] : [s.contestDistanceMeters]))
  const r = (v: number): number => Number(v.toFixed(2))
  return {
    shots: shots.length,
    meanShotContestDistance: r(contested.reduce((a, b) => a + b, 0) / Math.max(1, contested.length)),
    openShotShare: r(contested.filter((d) => d > 4).length / Math.max(1, contested.length)),
    shotsOver9mShare: r(shots.filter((s) => s.shooterToBasketMeters > 9).length / Math.max(1, shots.length)),
    meanDefenderToManAtShot: r(shots.reduce((a, b) => a + b.meanDefenderToManMeters, 0) / Math.max(1, shots.length)),
  }
}
