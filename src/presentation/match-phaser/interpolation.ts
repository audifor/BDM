/**
 * Visual interpolation between two MatchPresentationState snapshots.
 *
 * SIMULATION STATE vs PRESENTATION STATE:
 *   - Simulation state is produced exclusively by MatchEngine's `stepMatchSession`, one discrete
 *     possession-action at a time. It is authoritative and is never touched by this file.
 *   - Presentation state is what the renderer paints on screen every animation frame. Between two
 *     consecutive simulation ticks, this module fabricates intermediate frames (blended positions,
 *     orientation, ball flight height) purely for smoothness. These intermediate frames do not
 *     exist as MatchEngine ticks and are discarded; they are never fed back into the engine and
 *     never influence a future `stepMatchSession` call.
 *
 * This file performs no gameplay computation: it does not decide whether a shot goes in, whether a
 * pass completes, who owns a rebound, or any score/clock/possession change. It only blends numbers
 * that are already fully determined by the two snapshots it is given.
 */

import type { MatchPresentationState, PresentationPlayer, PresentationPoint } from './visualTypes'

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function lerpPoint(from: PresentationPoint, to: PresentationPoint, t: number): PresentationPoint {
  return {
    xPercent: from.xPercent + (to.xPercent - from.xPercent) * t,
    yPercent: from.yPercent + (to.yPercent - from.yPercent) * t,
  }
}

/** Shortest-path angle interpolation so players don't visually "unwind" the long way around. */
function lerpAngle(from: number, to: number, t: number): number {
  const twoPi = Math.PI * 2
  let delta = (to - from) % twoPi
  if (delta > Math.PI) delta -= twoPi
  if (delta < -Math.PI) delta += twoPi
  return from + delta * t
}

function interpolatePlayer(from: PresentationPlayer, to: PresentationPlayer, t: number): PresentationPlayer {
  const position = lerpPoint(from.position, to.position, t)
  const orientationRadians =
    from.orientationRadians === undefined && to.orientationRadians === undefined
      ? undefined
      : to.orientationRadians ?? from.orientationRadians ?? lerpAngle(from.orientationRadians ?? 0, to.orientationRadians ?? 0, t)
  return {
    ...to,
    position,
    orientationRadians,
    speedMetersPerSecond: from.speedMetersPerSecond + (to.speedMetersPerSecond - from.speedMetersPerSecond) * t,
  }
}

/**
 * A visual-only arc height (0..1) for the ball while it travels between two snapshots. Purely
 * cosmetic: it never affects whether a pass completes or a shot is made, both of which are already
 * fixed facts carried on `to` (the later, authoritative snapshot).
 */
function ballVisualHeight(isInFlight: boolean, t: number): number {
  if (!isInFlight) return 0
  return Math.sin(Math.PI * clamp01(t))
}

/**
 * Produces one intermediate MatchPresentationState between `from` and `to`, at progress `t` in
 * [0, 1]. Both inputs must already be fully-resolved snapshots produced by
 * `toMatchPresentationState`; this function never calls back into MatchEngine.
 */
export function interpolatePresentationState(
  from: MatchPresentationState,
  to: MatchPresentationState,
  progress: number,
): MatchPresentationState {
  const t = clamp01(progress)
  if (t === 0) return from
  if (t === 1) return to

  const fromById = new Map(from.players.map((player) => [player.playerId, player]))
  const players = to.players.map((player) => {
    const previous = fromById.get(player.playerId)
    return previous === undefined ? player : interpolatePlayer(previous, player, t)
  })

  const ballOwnerChanged = from.ball.ownerPlayerId !== to.ball.ownerPlayerId
  const ballInFlight = ballOwnerChanged && from.ball.ownerPlayerId !== undefined && to.ball.ownerPlayerId !== undefined
  const ballPosition = lerpPoint(from.ball.position, to.ball.position, t)

  return {
    ...to,
    players,
    ball: {
      ...to.ball,
      position: ballPosition,
      state: ballInFlight ? 'inFlight' : to.ball.state,
      ownerPlayerId: ballInFlight ? undefined : to.ball.ownerPlayerId,
      visualHeight: ballVisualHeight(ballInFlight, t),
    },
    // Clock/score/possession/period/isComplete are authoritative facts: never blended, always the
    // later snapshot's values, so the HUD never shows a number MatchEngine did not itself produce.
    clock: to.clock,
    score: to.score,
    possession: to.possession,
    isComplete: to.isComplete,
  }
}

/**
 * Drives a fixed sequence of MatchEngine snapshots forward in wall-clock time, exposing the
 * interpolated frame for "now". The renderer calls `advance(deltaMs)` each animation frame and
 * `currentFrame()` to get what to paint; it never mutates or advances the underlying snapshots.
 */
export class PresentationPlayback {
  private previous: MatchPresentationState
  private current: MatchPresentationState
  private elapsedMs = 0

  public constructor(
    initial: MatchPresentationState,
    private readonly stepDurationMs: number,
  ) {
    this.previous = initial
    this.current = initial
  }

  /** Called by the demo driver whenever a new engine snapshot is available (i.e. after a step). */
  public pushSnapshot(next: MatchPresentationState): void {
    this.previous = this.currentFrame()
    this.current = next
    this.elapsedMs = 0
  }

  public advance(deltaMs: number): void {
    this.elapsedMs = Math.min(this.stepDurationMs, this.elapsedMs + Math.max(0, deltaMs))
  }

  public currentFrame(): MatchPresentationState {
    const t = this.stepDurationMs <= 0 ? 1 : this.elapsedMs / this.stepDurationMs
    return interpolatePresentationState(this.previous, this.current, t)
  }

  public get progress(): number {
    return this.stepDurationMs <= 0 ? 1 : clamp01(this.elapsedMs / this.stepDurationMs)
  }
}
