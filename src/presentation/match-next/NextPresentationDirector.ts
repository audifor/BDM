/**
 * NextPresentationDirector — plays MatchEngine Next's 10 Hz canonical ticks at display rate.
 *
 * Unlike the legacy engine (one step = 3-24 s), Next already produces continuous, kinematically limited state
 * every 0.1 s (positions, velocities, ball flight with height). So the director does NO choreography: it only
 *   1. pulls the next canonical tick when playback needs it (engine paced by playback, never ahead of it),
 *   2. linearly interpolates between the two most recent ticks (60 fps render of a 10 Hz truth),
 *   3. fires each tick's engine events exactly once, in order, when playback reaches that tick.
 *
 * Rendered state therefore lags canonical truth by at most one tick (0.1 s). Nothing is invented: no path, no
 * arc, no ball choreography, no timing change. Speed multiplier scales playback only.
 */

import type { MatchNextEvent } from '@/engine/match-next'
import type { NextBall, NextPlayer, NextTickFrame, Pt } from './types'

export interface NextRenderFrame {
  /** Interpolated, paint-ready state (positions blended, discrete facts from the nearer tick). */
  readonly rendered: {
    readonly players: readonly NextPlayer[]
    readonly ball: NextBall
    readonly t: number
    readonly period: number
    readonly gameClockSeconds: number
    readonly shotClockSeconds: number | undefined
    readonly score: { readonly home: number; readonly away: number }
    readonly possessionTeamId: NextTickFrame['possessionTeamId']
    readonly possessionPhase: string | undefined
    readonly attackingBasket: Pt | undefined
  }
  /** The most recent canonical tick pulled from the engine (the truth the rendering is heading to). */
  readonly canonical: NextTickFrame
  /** The tick the rendering is moving away from. */
  readonly previous: NextTickFrame
  readonly alpha: number
  readonly firedEvents: readonly MatchNextEvent[]
  readonly playbackTicks: number
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
const lerpPt = (a: Pt, b: Pt, t: number): Pt => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) })

function lerpFacing(a: Pt, b: Pt, t: number): Pt {
  const x = lerp(a.x, b.x, t)
  const y = lerp(a.y, b.y, t)
  const len = Math.hypot(x, y)
  return len < 1e-6 ? b : { x: x / len, y: y / len }
}

export class NextPresentationDirector {
  private previous: NextTickFrame
  private next: NextTickFrame
  private alpha = 0
  private speed = 1
  private playbackTicks = 0
  private exhausted = false

  public constructor(
    first: NextTickFrame,
    private readonly source: () => NextTickFrame | undefined,
    private readonly tickMs = 100,
  ) {
    this.previous = first
    this.next = first
  }

  public setSpeed(multiplier: number): void {
    this.speed = Math.max(0, multiplier)
  }

  public getSpeed(): number {
    return this.speed
  }

  public get finished(): boolean {
    return this.exhausted && this.alpha >= 1
  }

  public advance(dtMs: number): NextRenderFrame {
    const fired: MatchNextEvent[] = []
    let remaining = (Math.max(0, dtMs) * this.speed) / this.tickMs
    if (this.next === this.previous && !this.exhausted) this.pull()
    let guard = 0
    while (remaining > 0 && guard < 64) {
      guard += 1
      if (this.exhausted && this.alpha >= 1) break
      const room = 1 - this.alpha
      if (remaining < room) {
        this.alpha += remaining
        remaining = 0
        break
      }
      remaining -= room
      this.alpha = 1
      // Playback reaches the canonical tick: its events are now "on screen".
      for (const event of this.next.events) fired.push(event)
      this.playbackTicks += 1
      this.previous = this.next
      this.alpha = 0
      this.pull()
      if (this.exhausted && this.next === this.previous) {
        this.alpha = 1
        break
      }
    }
    return this.frame(fired)
  }

  public currentFrame(): NextRenderFrame {
    return this.frame([])
  }

  private pull(): void {
    const frame = this.source()
    if (frame === undefined) {
      this.exhausted = true
      this.next = this.previous
      return
    }
    this.next = frame
  }

  private frame(fired: readonly MatchNextEvent[]): NextRenderFrame {
    const a = this.alpha
    const from = this.previous
    const to = this.next
    const nearer = a < 0.5 ? from : to
    const fromById = new Map(from.players.map((p) => [p.playerId, p]))
    const players: NextPlayer[] = to.players.map((p) => {
      const q = fromById.get(p.playerId)
      if (q === undefined) return p
      const source = a < 0.5 ? q : p
      return {
        ...p,
        hasBall: source.hasBall,
        position: lerpPt(q.position, p.position, a),
        velocity: lerpPt(q.velocity, p.velocity, a),
        speedMps: lerp(q.speedMps, p.speedMps, a),
        facing: lerpFacing(q.facing, p.facing, a),
      }
    })
    const ball: NextBall = {
      ...nearer.ball,
      position: lerpPt(from.ball.position, to.ball.position, a),
      heightMeters: lerp(from.ball.heightMeters, to.ball.heightMeters, a),
    }
    return {
      rendered: {
        players,
        ball,
        t: lerp(from.t, to.t, a),
        period: nearer.period,
        gameClockSeconds: nearer.gameClockSeconds,
        shotClockSeconds: nearer.shotClockSeconds,
        score: nearer.score,
        possessionTeamId: nearer.possessionTeamId,
        possessionPhase: nearer.possessionPhase,
        attackingBasket: nearer.attackingBasket,
      },
      canonical: to,
      previous: from,
      alpha: a,
      firedEvents: fired,
      playbackTicks: this.playbackTicks,
    }
  }
}
