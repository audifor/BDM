/**
 * PresentationDirector — BT1 pull-based playback of MatchEngine segments.
 *
 * Replaces the old "blend two snapshots over 650 ms while the engine keeps stepping every 333 ms"
 * model. Segments are queued in the exact order the engine produced them and played ONE AT A TIME:
 * a segment finishes (movement, then its events, then its settle) before the next one starts, so
 * events can no longer be skipped, overwritten, or shown out of order, and the ball can no longer
 * be interpolated across a whole step when the engine resolves the event at the END of the step.
 *
 * The director is purely presentational: it never calls MatchEngine. The caller keeps the queue
 * topped up (see PhaserMatchRenderer.tick) by requesting engine steps only when the queue is low.
 */

import type { PlayerId } from '@/domain/ids'
import type { TruthFrame } from './audit/basketballTruth'
import {
  buildSegmentPlan,
  displayClockAt,
  displayScoreAt,
  isMovementPhase,
  motionSpeedFactor,
  playerPositionAt,
  resolveBallAt,
  toPercentPoint,
  type BeatKind,
  type Pt,
  type SegmentPlan,
} from './segmentPlan'
import type { MatchPresentationEvent, MatchPresentationState, PresentationPlayer, PresentationPoint, PresentationSegment } from './visualTypes'

export interface FiredBeat {
  readonly segmentIndex: number
  readonly kind: BeatKind
  readonly label: string
  readonly event: MatchPresentationEvent | undefined
  /** Simulation tick (engine nextSequence) of the segment this beat belongs to. */
  readonly simulationTick: number
}

export type FramePhase = 'idle' | 'lead' | 'move' | 'event'

export interface PresentationFrame {
  /** The frame to paint: interpolated positions, choreographed ball, display clock/score. */
  readonly state: MatchPresentationState
  readonly firedBeats: readonly FiredBeat[]
  readonly segmentIndex: number | undefined
  readonly phase: FramePhase
  readonly segmentTimeMs: number
  readonly segmentDurationMs: number
  readonly ballLegLabel: string
  /** Engine truth the current segment is heading to (its END state), in court percent. */
  readonly canonical: {
    readonly players: ReadonlyMap<PlayerId, PresentationPoint>
    readonly ball: PresentationPoint
  }
  /** Engine truth at the START of the current segment. */
  readonly origin: ReadonlyMap<PlayerId, PresentationPoint>
  readonly truth: TruthFrame | undefined
  readonly queuedSegments: number
  /** Current visual height of the ball in metres (0 on the floor, ~3 at the rim). */
  readonly ballHeightMeters: number
}

const TURN_RATE_RADIANS_PER_SECOND = 9

function shortestAngleDelta(from: number, to: number): number {
  const twoPi = Math.PI * 2
  let delta = (to - from) % twoPi
  if (delta > Math.PI) delta -= twoPi
  if (delta < -Math.PI) delta += twoPi
  return delta
}

export class PresentationDirector {
  private readonly queue: PresentationSegment[] = []
  private plan: SegmentPlan | undefined
  private tMs = 0
  private speed = 1
  private lastEnd: MatchPresentationState
  private restingBall: Pt
  private restingHeight = 0
  private lastCanonicalBall: PresentationPoint
  private lastTruth: TruthFrame | undefined
  private lastSegmentIndex: number | undefined
  private readonly facing = new Map<PlayerId, number>()
  private lastFiredUpToMs = -1
  private frameDtSeconds = 0

  public constructor(initial: MatchPresentationState) {
    this.lastEnd = initial
    this.restingBall = {
      x: (initial.ball.position.xPercent / 100) * initial.court.lengthMeters,
      y: (initial.ball.position.yPercent / 100) * initial.court.widthMeters,
    }
    this.lastCanonicalBall = initial.ball.position
  }

  public enqueue(segment: PresentationSegment): void {
    this.queue.push(segment)
  }

  public get pending(): number {
    return this.queue.length + (this.plan === undefined ? 0 : 1)
  }

  public setSpeed(multiplier: number): void {
    this.speed = Math.max(0, multiplier)
  }

  public getSpeed(): number {
    return this.speed
  }

  public get currentPlan(): SegmentPlan | undefined {
    return this.plan
  }

  /** Advances wall-clock playback by `dtMs` (before the speed multiplier) and returns the frame to paint. */
  public advance(dtMs: number): PresentationFrame {
    const fired: FiredBeat[] = []
    let remaining = Math.max(0, dtMs) * this.speed
    this.frameDtSeconds = remaining / 1000
    let guard = 0
    for (;;) {
      if (this.plan === undefined) {
        const next = this.queue.shift()
        if (next === undefined) break
        this.beginSegment(next)
      }
      const plan = this.plan!
      const t0 = this.tMs
      const t1 = t0 + remaining
      if (t1 < plan.durationMs) {
        this.collectBeats(plan, t0, t1, fired)
        this.tMs = t1
        remaining = 0
        break
      }
      // Finish this segment and carry the remainder into the next one.
      this.collectBeats(plan, t0, plan.durationMs + 1, fired)
      remaining = t1 - plan.durationMs
      this.endSegment(plan)
      guard += 1
      if (guard > 64) break
    }
    return this.frame(fired)
  }

  /** The frame for the current time without advancing (for pause / first paint). */
  public currentFrame(): PresentationFrame {
    return this.frame([])
  }

  private beginSegment(segment: PresentationSegment): void {
    this.plan = buildSegmentPlan(segment, { previousRestingBall: this.restingBall })
    this.tMs = 0
    this.lastFiredUpToMs = -1
    this.lastSegmentIndex = segment.index
  }

  private endSegment(plan: SegmentPlan): void {
    this.lastEnd = plan.segment.to
    this.restingBall = plan.restingBall
    this.restingHeight = 0
    this.lastCanonicalBall = plan.segment.to.ball.position
    this.lastTruth = plan.segment.truth
    this.plan = undefined
    this.tMs = 0
  }

  private collectBeats(plan: SegmentPlan, fromMs: number, toMs: number, out: FiredBeat[]): void {
    for (const beat of plan.beats) {
      if (beat.atMs >= fromMs && beat.atMs < toMs) {
        out.push({ segmentIndex: plan.segment.index, kind: beat.kind, label: beat.label, event: beat.event, simulationTick: plan.segment.to.simulationTick })
      }
    }
  }

  private frame(fired: readonly FiredBeat[]): PresentationFrame {
    const plan = this.plan
    if (plan === undefined) return this.idleFrame(fired)
    const t = this.tMs
    const seg = plan.segment
    const { lengthMeters: length, widthMeters: width } = seg.to.court
    const ball = resolveBallAt(plan, t)
    const movement = isMovementPhase(plan, t)
    const players: PresentationPlayer[] = seg.to.players.map((player) => {
      const motion = plan.motions.get(player.playerId)!
      const p = playerPositionAt(motion, t)
      const local = t - motion.delayMs
      const moving = motion.goMs > 0 && local > 0 && local < motion.goMs
      const meanSpeed = motion.goMs > 0 ? motion.distance / (motion.goMs / 1000) : 0
      const speed = moving ? meanSpeed * motionSpeedFactor(local, motion.goMs) : 0
      const targetFacing = this.idealFacing(player, p, motion.to, motion.from, moving, ball.position, plan)
      const orientation = this.turnToward(player.playerId, targetFacing)
      return {
        ...player,
        position: toPercentPoint(p, length, width),
        speedMetersPerSecond: speed,
        orientationRadians: orientation,
        hasBall: ball.owner === player.playerId,
      }
    })
    const score = displayScoreAt(plan, t)
    const clock = displayClockAt(plan, t)
    const owner = ball.owner
    const state: MatchPresentationState = {
      ...seg.to,
      players,
      ball: {
        ...seg.to.ball,
        position: toPercentPoint(ball.position, length, width),
        state: ball.state,
        ownerPlayerId: owner,
        ownerTeamId: owner === undefined ? undefined : players.find((p) => p.playerId === owner)?.teamId,
        visualHeight: Math.min(1, ball.heightMeters / 3.05),
        isPassFlight: ball.leg.kind === 'pass' || ball.leg.kind === 'handoff' || ball.leg.kind === 'steal' || ball.leg.kind === 'pickup' || ball.leg.kind === 'badPass',
        isShotFlight: ball.leg.kind === 'shot' || ball.leg.kind === 'freeThrow',
      },
      clock: { ...seg.to.clock, clockSecondsRemaining: clock },
      score,
      // The HUD possession flips only when the resolving event (basket / turnover / rebound) has
      // actually happened on screen, never before the shot or pass has arrived.
      possession: t < this.possessionResolvedAt(plan) ? seg.from.possession : seg.to.possession,
    }
    const phase: FramePhase = t < plan.leadMs && plan.leadMs >= plan.moveMs ? 'lead' : movement ? 'move' : 'event'
    return {
      state,
      firedBeats: fired,
      segmentIndex: seg.index,
      phase,
      segmentTimeMs: t,
      segmentDurationMs: plan.durationMs,
      ballLegLabel: ball.leg.label,
      canonical: {
        players: new Map(seg.to.players.map((p) => [p.playerId, p.position])),
        ball: seg.to.ball.position,
      },
      origin: new Map(seg.from.players.map((p) => [p.playerId, p.position])),
      truth: seg.truth,
      queuedSegments: this.queue.length,
      ballHeightMeters: ball.heightMeters,
    }
  }

  private possessionResolvedAt(plan: SegmentPlan): number {
    let last = 0
    for (const beat of plan.beats) {
      if (beat.kind === 'shotMade' || beat.kind === 'turnover' || beat.kind === 'rebound' || beat.kind === 'freeThrow') last = Math.max(last, beat.atMs)
    }
    return last
  }

  private idleFrame(fired: readonly FiredBeat[]): PresentationFrame {
    const end = this.lastEnd
    const { lengthMeters: length, widthMeters: width } = end.court
    const players = end.players.map((player) => {
      const target = this.idealFacing(player, { x: (player.position.xPercent / 100) * length, y: (player.position.yPercent / 100) * width }, undefined, undefined, false, this.restingBall, undefined)
      return { ...player, speedMetersPerSecond: 0, orientationRadians: this.turnToward(player.playerId, target), hasBall: false }
    })
    const state: MatchPresentationState = {
      ...end,
      players,
      ball: {
        ...end.ball,
        position: toPercentPoint(this.restingBall, length, width),
        visualHeight: 0,
        isPassFlight: false,
        isShotFlight: false,
      },
    }
    return {
      state,
      firedBeats: fired,
      segmentIndex: this.lastSegmentIndex,
      phase: 'idle',
      segmentTimeMs: 0,
      segmentDurationMs: 0,
      ballLegLabel: 'IDLE',
      canonical: { players: new Map(end.players.map((p) => [p.playerId, p.position])), ball: this.lastCanonicalBall },
      origin: new Map(end.players.map((p) => [p.playerId, p.position])),
      truth: this.lastTruth,
      queuedSegments: this.queue.length,
      ballHeightMeters: this.restingHeight,
    }
  }

  /** Where a player "should" look: along travel when moving, otherwise at the ball (defenders/off-ball) or the rim (holder). */
  private idealFacing(player: PresentationPlayer, position: Pt, to: Pt | undefined, from: Pt | undefined, moving: boolean, ball: Pt, plan: SegmentPlan | undefined): number {
    if (moving && to !== undefined && from !== undefined) {
      const dx = to.x - from.x
      const dy = to.y - from.y
      if (Math.hypot(dx, dy) > 1e-6) return Math.atan2(dy, dx)
    }
    if (plan !== undefined && player.hasBall) return Math.atan2(plan.rim.y - position.y, plan.rim.x - position.x)
    return Math.atan2(ball.y - position.y, ball.x - position.x)
  }

  private turnToward(playerId: PlayerId, target: number): number {
    const previous = this.facing.get(playerId)
    if (previous === undefined) {
      this.facing.set(playerId, target)
      return target
    }
    // Rate-limited turn, driven by the playback time consumed since the last advance().
    const maxStep = TURN_RATE_RADIANS_PER_SECOND * this.frameDtSeconds
    const delta = shortestAngleDelta(previous, target)
    const next = previous + Math.max(-maxStep, Math.min(maxStep, delta))
    this.facing.set(playerId, next)
    return next
  }
}
