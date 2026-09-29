/**
 * Basketball Truth (Next) — headless spatial / event audit over MatchEngine Next canonical ticks.
 * Judges geometry in metres from the engine's own frames (via the read-only bridge); never inspects intent names.
 */

import type { PlayerId } from '@/domain/ids'
import type { MatchNextEvent } from '@/engine/match-next'
import { createNextDemoSession } from '../dev/nextDemoBootstrap'
import type { NextPlayer, NextTickFrame, Pt } from '../types'

const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y)

export function distanceToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const l2 = dx * dx + dy * dy
  if (l2 === 0) return dist(p, a)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2))
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy })
}

export interface ShotRecord {
  readonly t: number
  readonly seed: number
  readonly shooter: PlayerId
  readonly points: 2 | 3 | undefined
  readonly distanceToRim: number
  readonly nearestDefender: number
  readonly assignedDefender: number | undefined
  readonly made: boolean
  readonly phase: string | undefined
  readonly secondsIntoPossession: number
  readonly shotProbability: number | undefined
}

export interface ReboundRecord {
  readonly t: number
  readonly offensive: boolean
  readonly rebounderDistanceToRim: number
  readonly rebounderDistanceToLanding: number
  readonly nearestOtherDistanceToRim: number
}

export interface PossessionRecord {
  readonly id: number
  readonly startT: number
  readonly endT: number
  readonly teamHome: boolean
  readonly startReason: string
  readonly passes: number
  readonly shots: number
  readonly ended: string
  readonly transition: boolean
}

export interface NextAuditRun {
  readonly seed: number
  readonly ticks: number
  readonly complete: boolean
  readonly finalScore: { readonly home: number; readonly away: number }
  readonly frames: readonly NextTickFrame[]
  readonly shots: readonly ShotRecord[]
  readonly rebounds: readonly ReboundRecord[]
  readonly possessions: readonly PossessionRecord[]
  readonly eventCounts: Readonly<Record<string, number>>
  readonly events: readonly MatchNextEvent[]
}

export function runNextAudit(seed: number, opts: { maxTicks?: number; periodSeconds?: number; periodCount?: number; keepFrames?: boolean; onFrame?: (frame: NextTickFrame, previous: NextTickFrame) => void } = {}): NextAuditRun {
  const session = createNextDemoSession(seed, { ...(opts.periodSeconds === undefined ? {} : { periodSeconds: opts.periodSeconds }), ...(opts.periodCount === undefined ? {} : { periodCount: opts.periodCount }) })
  const frames: NextTickFrame[] = [session.first()]
  const shots: ShotRecord[] = []
  const rebounds: ReboundRecord[] = []
  const eventCounts: Record<string, number> = {}
  const allEvents: MatchNextEvent[] = []
  const possessions: PossessionRecord[] = []
  let open: { id: number; startT: number; teamHome: boolean; startReason: string; passes: number; shots: number; transition: boolean } | undefined
  let possessionStartT = 0
  let prev = frames[0]!
  const maxTicks = opts.maxTicks ?? 60000
  for (let i = 0; i < maxTicks; i += 1) {
    const f = session.step()
    if (f === undefined) break
    if (opts.keepFrames) frames.push(f)
    opts.onFrame?.(f, prev)
    for (const e of f.events) {
      eventCounts[e.type] = (eventCounts[e.type] ?? 0) + 1
      allEvents.push(e)
      if (e.type === 'possessionStart') {
        possessionStartT = f.t
        open = { id: possessions.length + 1, startT: f.t, teamHome: e.teamId === session.setup.homeTeamId, startReason: e.startReason ?? '?', passes: 0, shots: 0, transition: false }
      }
      if (e.type === 'transitionStarted' && open) open = { ...open, transition: true }
      if (e.type === 'passReleased' && open) open = { ...open, passes: open.passes + 1 }
      if (e.type === 'shotReleased' && e.shooterPlayerId !== undefined) {
        if (open) open = { ...open, shots: open.shots + 1 }
        const shooter = prev.players.find((p) => p.playerId === e.shooterPlayerId) ?? f.players.find((p) => p.playerId === e.shooterPlayerId)
        const basket = f.ball.flight?.target
        if (shooter && basket) {
          const defenders = f.players.filter((p) => p.side !== shooter.side)
          const nearest = Math.min(...defenders.map((d) => dist(d.position, shooter.position)))
          const assignedId = f.players.find((p) => p.guarding === shooter.playerId)?.playerId
          const assigned = assignedId === undefined ? undefined : f.players.find((p) => p.playerId === assignedId)
          shots.push({
            t: f.t, seed, shooter: shooter.playerId, points: f.ball.shotValue, distanceToRim: dist(shooter.position, basket), nearestDefender: nearest,
            assignedDefender: assigned === undefined ? undefined : dist(assigned.position, shooter.position), made: false, phase: f.possessionPhase,
            secondsIntoPossession: (f.t - possessionStartT) / 10, shotProbability: f.ball.shotProbability,
          })
        }
      }
      if (e.type === 'shotMade' || e.type === 'shotMissed') {
        for (let k = shots.length - 1; k >= 0; k -= 1) {
          if (shots[k]!.made === false && shots[k]!.shooter === e.shooterPlayerId) {
            if (e.type === 'shotMade') shots[k] = { ...shots[k]!, made: true }
            break
          }
        }
      }
      if (e.type === 'reboundSecured' && e.playerId !== undefined) {
        const p = f.players.find((q) => q.playerId === e.playerId)
        const landing = prev.ball.flight?.kind === 'rebound' ? prev.ball.flight.target : prev.ball.position
        const rims = [f.court.baskets.left, f.court.baskets.right]
        const rim = rims.reduce((best, r) => (dist(r, landing) < dist(best, landing) ? r : best))
        if (p) {
          const others = f.players.filter((q) => q.playerId !== p.playerId).map((q) => dist(q.position, rim))
          rebounds.push({ t: f.t, offensive: e.reboundType === 'offensive', rebounderDistanceToRim: dist(p.position, rim), rebounderDistanceToLanding: dist(p.position, landing), nearestOtherDistanceToRim: Math.min(...others) })
        }
      }
      if (e.type === 'possessionEnd' && open) {
        possessions.push({ ...open, endT: f.t, ended: e.endReason ?? '?' })
        open = undefined
      }
    }
    prev = f
  }
  return { seed, ticks: prev.t, complete: prev.isComplete, finalScore: prev.score, frames, shots, rebounds, possessions, eventCounts, events: allEvents }
}

export interface OffenseFrameMetrics {
  readonly minPairDistance: number
  readonly meanPairDistance: number
  readonly cornersOccupied: number
  readonly paintOccupants: number
  readonly strongSide: number
  readonly weakSide: number
  readonly openPassingLanes: number
  readonly driveLaneBlocked: boolean
  readonly meanDistanceToSlot: number
  readonly handlerToRim: number
}

export interface DefenseFrameMetrics {
  readonly onBallDefenderDistance: number | undefined
  readonly goalSide: number
  readonly defendersInPaint: number
  readonly weakSideHelpers: number
  readonly meanDistanceToMan: number
  readonly maxDistanceToMan: number
}

const LANE_HALF = 2.45
const LANE_LEN = 5.8

export function isInPaint(p: Pt, rim: Pt, court: NextTickFrame['court']): boolean {
  const depth = rim.x > court.lengthMeters / 2 ? court.lengthMeters - p.x : p.x
  return depth <= LANE_LEN && Math.abs(p.y - court.widthMeters / 2) <= LANE_HALF
}

export function isCorner(p: Pt, rim: Pt, court: NextTickFrame['court']): boolean {
  const depth = rim.x > court.lengthMeters / 2 ? court.lengthMeters - p.x : p.x
  return depth <= 5.8 && Math.min(p.y, court.widthMeters - p.y) <= 2.3
}

/** Half-court frames: possession phase SETUP/ACTION with the ball held in the offensive frontcourt. */
export function isHalfCourtSet(f: NextTickFrame): boolean {
  return (f.possessionPhase === 'SETUP' || f.possessionPhase === 'ACTION') && f.ball.kind === 'HELD' && f.attackingBasket !== undefined
}

export function offenseMetrics(f: NextTickFrame): OffenseFrameMetrics | undefined {
  if (!isHalfCourtSet(f) || f.attackingBasket === undefined) return undefined
  const rim = f.attackingBasket
  const off = f.players.filter((p) => p.isOffense)
  const def = f.players.filter((p) => !p.isOffense)
  const handler = off.find((p) => p.hasBall)
  if (handler === undefined) return undefined
  let min = Infinity
  let sum = 0
  let n = 0
  for (let i = 0; i < off.length; i += 1) for (let j = i + 1; j < off.length; j += 1) {
    const d = dist(off[i]!.position, off[j]!.position)
    min = Math.min(min, d)
    sum += d
    n += 1
  }
  const side = Math.sign(handler.position.y - f.court.widthMeters / 2)
  let strong = 0
  let weak = 0
  let lanes = 0
  for (const p of off) {
    if (p === handler) continue
    if (Math.sign(p.position.y - f.court.widthMeters / 2) === side) strong += 1
    else weak += 1
    if (!def.some((d) => distanceToSegment(d.position, handler.position, p.position) < 1)) lanes += 1
  }
  const slotOf = new Map(f.offenseSlots.map((s) => [s.slot, s.position]))
  const slotDist = off.filter((p) => p.slot !== undefined && slotOf.has(p.slot)).map((p) => dist(p.position, slotOf.get(p.slot!)!))
  return {
    minPairDistance: min,
    meanPairDistance: sum / Math.max(1, n),
    cornersOccupied: off.filter((p) => isCorner(p.position, rim, f.court)).length,
    paintOccupants: off.filter((p) => isInPaint(p.position, rim, f.court)).length,
    strongSide: strong,
    weakSide: weak,
    openPassingLanes: lanes,
    driveLaneBlocked: def.some((d) => distanceToSegment(d.position, handler.position, rim) < 1.3 && dist(d.position, rim) < dist(handler.position, rim)),
    meanDistanceToSlot: slotDist.length === 0 ? 0 : slotDist.reduce((a, b) => a + b, 0) / slotDist.length,
    handlerToRim: dist(handler.position, rim),
  }
}

export function defenseMetrics(f: NextTickFrame): DefenseFrameMetrics | undefined {
  if (!isHalfCourtSet(f) || f.attackingBasket === undefined) return undefined
  const rim = f.attackingBasket
  const off = f.players.filter((p) => p.isOffense)
  const def = f.players.filter((p) => !p.isOffense)
  const handler = off.find((p) => p.hasBall)
  if (handler === undefined) return undefined
  const onBall = def.find((d) => d.guarding === handler.playerId)
  const side = Math.sign(handler.position.y - f.court.widthMeters / 2)
  let goal = 0
  let paint = 0
  let weakHelp = 0
  const toMan: number[] = []
  for (const d of def) {
    const man = off.find((o) => o.playerId === d.guarding)
    if (man !== undefined) {
      toMan.push(dist(d.position, man.position))
      if (dist(d.position, rim) <= dist(man.position, rim) + 0.25) goal += 1
    }
    if (isInPaint(d.position, rim, f.court)) paint += 1
    if (Math.sign(d.position.y - f.court.widthMeters / 2) !== side && dist(d.position, rim) < 5.5) weakHelp += 1
  }
  return {
    onBallDefenderDistance: onBall === undefined ? undefined : dist(onBall.position, handler.position),
    goalSide: goal,
    defendersInPaint: paint,
    weakSideHelpers: weakHelp,
    meanDistanceToMan: toMan.reduce((a, b) => a + b, 0) / Math.max(1, toMan.length),
    maxDistanceToMan: Math.max(0, ...toMan),
  }
}

export type { NextPlayer }

export interface NextAuditSummary {
  readonly seed: number
  readonly complete: boolean
  readonly ticks: number
  readonly finalScore: { readonly home: number; readonly away: number }
  readonly possessions: number
  readonly meanPossessionSeconds: number
  readonly shots: number
  readonly shotsPerPossession: number
  readonly fieldGoalPct: number
  readonly threePointShare: number
  readonly meanShotDistance: number
  readonly shotsOver9mShare: number
  readonly meanNearestDefenderAtShot: number
  readonly openShotShare: number
  readonly rebounds: number
  readonly offensiveReboundShare: number
  readonly meanReboundDistanceToRim: number
  readonly possessionEnds: Readonly<Record<string, number>>
  readonly shotClockViolations: number
  readonly turnovers: number
  readonly passInterceptions: number
  readonly looseBalls: number
  readonly maxPlayerSpeedMps: number
  readonly ballJumpsOver1_5mPerTickCount: number
  readonly maxBallJumpMeters: number
  readonly halfCourtFrames: number
  readonly stableHalfCourtFrames: number
  readonly offense: { readonly cornersEmptyShare: number; readonly meanCornersOccupied: number; readonly meanDistanceToSlot: number; readonly withinOneMeterOfSlotShare: number; readonly meanMinPairDistance: number; readonly meanPaintOccupants: number; readonly meanOpenPassingLanes: number; readonly meanHandlerToRim: number }
  readonly defense: { readonly meanOnBallDefenderDistance: number; readonly noBallPressureShare: number; readonly defenderFarFromManShare: number; readonly meanGoalSideDefenders: number; readonly paintUnprotectedShare: number; readonly noWeakSideHelpShare: number }
}

export function summarizeNextRun(seed: number, opts: { maxTicks?: number } = {}): NextAuditSummary {
  let maxSpeed = 0
  let maxBall = 0
  let ballJumps = 0
  let half = 0
  let setupRun = 0
  const stableOff: { readonly o: OffenseFrameMetrics; readonly f: NextTickFrame }[] = []
  const stableDef: DefenseFrameMetrics[] = []
  const run = runNextAudit(seed, {
    ...(opts.maxTicks === undefined ? {} : { maxTicks: opts.maxTicks }),
    onFrame: (f, p) => {
      for (const q of f.players) {
        const r = p.players.find((x) => x.playerId === q.playerId)
        if (r !== undefined) maxSpeed = Math.max(maxSpeed, dist(q.position, r.position) * 10)
      }
      const j = dist(f.ball.position, p.ball.position)
      maxBall = Math.max(maxBall, j)
      if (j > 1.5) ballJumps += 1
      if (isHalfCourtSet(f)) half += 1
      setupRun = isHalfCourtSet(f) ? setupRun + 1 : 0
      if (setupRun > 8) {
        const o = offenseMetrics(f)
        const d = defenseMetrics(f)
        if (o !== undefined) stableOff.push({ o, f })
        if (d !== undefined) stableDef.push(d)
      }
    },
  })
  const mean = (values: readonly number[]): number => (values.length === 0 ? 0 : Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)))
  const share = <T>(values: readonly T[], test: (v: T) => boolean): number => Number((values.filter(test).length / Math.max(1, values.length)).toFixed(3))
  const ends: Record<string, number> = {}
  for (const p of run.possessions) ends[p.ended] = (ends[p.ended] ?? 0) + 1
  let within = 0
  let total = 0
  for (const { f } of stableOff) {
    const slot = new Map(f.offenseSlots.map((s) => [s.slot, s.position]))
    for (const p of f.players) {
      if (!p.isOffense || p.slot === undefined || !slot.has(p.slot)) continue
      total += 1
      if (dist(p.position, slot.get(p.slot)!) < 1) within += 1
    }
  }
  return {
    seed,
    complete: run.complete,
    ticks: run.ticks,
    finalScore: run.finalScore,
    possessions: run.possessions.length,
    meanPossessionSeconds: mean(run.possessions.map((p) => (p.endT - p.startT) / 10)),
    shots: run.shots.length,
    shotsPerPossession: mean([run.shots.length / Math.max(1, run.possessions.length)]),
    fieldGoalPct: share(run.shots, (s) => s.made),
    threePointShare: share(run.shots, (s) => s.points === 3),
    meanShotDistance: mean(run.shots.map((s) => s.distanceToRim)),
    shotsOver9mShare: share(run.shots, (s) => s.distanceToRim > 9),
    meanNearestDefenderAtShot: mean(run.shots.map((s) => s.nearestDefender)),
    openShotShare: share(run.shots, (s) => s.nearestDefender > 4),
    rebounds: run.rebounds.length,
    offensiveReboundShare: share(run.rebounds, (r) => r.offensive),
    meanReboundDistanceToRim: mean(run.rebounds.map((r) => r.rebounderDistanceToRim)),
    possessionEnds: ends,
    shotClockViolations: run.eventCounts.shotClockViolation ?? 0,
    turnovers: ends.turnover ?? 0,
    passInterceptions: run.eventCounts.passIntercepted ?? 0,
    looseBalls: run.eventCounts.looseBallCreated ?? 0,
    maxPlayerSpeedMps: Number(maxSpeed.toFixed(1)),
    ballJumpsOver1_5mPerTickCount: ballJumps,
    maxBallJumpMeters: Number(maxBall.toFixed(1)),
    halfCourtFrames: half,
    stableHalfCourtFrames: stableOff.length,
    offense: {
      cornersEmptyShare: share(stableOff, (s) => s.o.cornersOccupied === 0),
      meanCornersOccupied: mean(stableOff.map((s) => s.o.cornersOccupied)),
      meanDistanceToSlot: mean(stableOff.map((s) => s.o.meanDistanceToSlot)),
      withinOneMeterOfSlotShare: Number((within / Math.max(1, total)).toFixed(3)),
      meanMinPairDistance: mean(stableOff.map((s) => s.o.minPairDistance)),
      meanPaintOccupants: mean(stableOff.map((s) => s.o.paintOccupants)),
      meanOpenPassingLanes: mean(stableOff.map((s) => s.o.openPassingLanes)),
      meanHandlerToRim: mean(stableOff.map((s) => s.o.handlerToRim)),
    },
    defense: {
      meanOnBallDefenderDistance: mean(stableDef.map((d) => d.onBallDefenderDistance ?? 0)),
      noBallPressureShare: share(stableDef, (d) => (d.onBallDefenderDistance ?? 99) > 3.5),
      defenderFarFromManShare: share(stableDef, (d) => d.maxDistanceToMan > 6),
      meanGoalSideDefenders: mean(stableDef.map((d) => d.goalSide)),
      paintUnprotectedShare: share(stableDef, (d) => d.defendersInPaint === 0),
      noWeakSideHelpShare: share(stableDef, (d) => d.weakSideHelpers === 0),
    },
  }
}
