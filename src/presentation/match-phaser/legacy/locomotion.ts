/**
 * locomotion.ts — MP1B (natural player locomotion) + MP1H (visual spacing/separation).
 *
 * This module NEVER changes a player's canonical engine position. It only tracks a small amount
 * of presentation-only state per player (a smoothed rendered position/velocity and a temporary
 * separation offset) that the scene uses to draw a less robotic, less overlapping frame.
 *
 * CanonicalPosition (from MatchPresentationState, engine truth) + PresentationOffset (computed
 * here, small/temporary/reversible) = RenderedPosition (what the scene paints). The offset is
 * always recomputed from scratch each frame from the current canonical positions; it is never fed
 * back into MatchPresentationState or the engine, and it decays to zero whenever bodies are not
 * overlapping. This is a rendering nicety, not a second physics/AI system.
 */

import type { MatchPresentationState, PresentationPlayer } from '../visualTypes'
import { DEFAULT_PRESENTATION_CONFIG, type PresentationConfig } from '../presentationConfig'

export type MovementProfile = 'stop' | 'walk' | 'jog' | 'run' | 'sprint' | 'shuffle' | 'pivot' | 'turn' | 'backpedal'

export interface LocomotionSample {
  readonly playerId: string
  /** Smoothed rendered position in court-percent, distinct from the canonical target position. */
  readonly renderedXPercent: number
  readonly renderedYPercent: number
  /** Smoothed rendered orientation (radians), eased toward the canonical target orientation. */
  readonly renderedOrientationRadians: number | undefined
  readonly movementProfile: MovementProfile
  /** Visual-only separation offset currently applied on top of the smoothed target (MP1H). */
  readonly separationOffsetXPercent: number
  readonly separationOffsetYPercent: number
}

interface PlayerLocomotionState {
  x: number
  y: number
  vx: number
  vy: number
  orientation: number | undefined
  separationOffsetX: number
  separationOffsetY: number
  lastIsOffense: boolean
}

const POSITION_EASE_PER_SECOND = 8
const ORIENTATION_EASE_PER_SECOND = 10
const COURT_ASPECT_HINT = 2.4 // rough length/width ratio used only to keep separation visually circular-ish

/**
 * Tracks smoothed, separated render positions across frames for one match session. One instance
 * per active PhaserMatchScene; discarded on scene teardown. Purely a rendering convenience buffer.
 */
export class LocomotionSystem {
  private readonly players = new Map<string, PlayerLocomotionState>()
  private readonly config: PresentationConfig

  public constructor(config: PresentationConfig = DEFAULT_PRESENTATION_CONFIG) {
    this.config = config
  }

  public reset(): void {
    this.players.clear()
  }

  /**
   * Advances the locomotion buffer by deltaSeconds toward the given canonical presentation state,
   * and returns one LocomotionSample per player with a resolved separation offset applied.
   */
  public step(state: MatchPresentationState, deltaSeconds: number): readonly LocomotionSample[] {
    const dt = Math.max(0, Math.min(0.25, deltaSeconds))
    const seen = new Set<string>()

    for (const player of state.players) {
      const key = String(player.playerId)
      seen.add(key)
      let tracked = this.players.get(key)
      if (tracked === undefined) {
        tracked = {
          x: player.position.xPercent,
          y: player.position.yPercent,
          vx: 0,
          vy: 0,
          orientation: player.orientationRadians,
          separationOffsetX: 0,
          separationOffsetY: 0,
          lastIsOffense: player.isOffense,
        }
        this.players.set(key, tracked)
        continue
      }

      const easeAmount = 1 - Math.exp(-POSITION_EASE_PER_SECOND * this.config.accelerationScale * dt)
      const prevX = tracked.x
      const prevY = tracked.y
      tracked.x += (player.position.xPercent - tracked.x) * easeAmount
      tracked.y += (player.position.yPercent - tracked.y) * easeAmount
      tracked.vx = dt > 0 ? (tracked.x - prevX) / dt : 0
      tracked.vy = dt > 0 ? (tracked.y - prevY) / dt : 0

      if (player.orientationRadians !== undefined) {
        const orientEase = 1 - Math.exp(-ORIENTATION_EASE_PER_SECOND * dt)
        tracked.orientation =
          tracked.orientation === undefined ? player.orientationRadians : lerpAngleShortestPath(tracked.orientation, player.orientationRadians, orientEase)
      }
      tracked.lastIsOffense = player.isOffense
    }

    for (const key of [...this.players.keys()]) {
      if (!seen.has(key)) this.players.delete(key)
    }

    this.applySeparation(state, dt)

    return state.players.map((player) => {
      const tracked = this.players.get(String(player.playerId))!
      const renderedSpeed = Math.hypot(tracked.vx, tracked.vy)
      return {
        playerId: String(player.playerId),
        renderedXPercent: tracked.x + tracked.separationOffsetX,
        renderedYPercent: tracked.y + tracked.separationOffsetY,
        renderedOrientationRadians: tracked.orientation,
        movementProfile: movementProfileFor(player, renderedSpeed),
        separationOffsetXPercent: tracked.separationOffsetX,
        separationOffsetYPercent: tracked.separationOffsetY,
      }
    })
  }

  /**
   * MP1H: a lightweight, purely-visual separation pass. Pushes rendered (already-smoothed)
   * positions apart slightly when two players' smoothed centers get implausibly close, then decays
   * that offset back to zero once they are no longer overlapping. Never touches canonical positions.
   */
  private applySeparation(state: MatchPresentationState, dt: number): void {
    const minSeparationPercent = 3.2
    const entries = state.players.map((player) => ({ player, tracked: this.players.get(String(player.playerId))! }))

    for (const { tracked } of entries) {
      const decay = Math.max(0, 1 - this.config.spacingDecayPerSecond * dt)
      tracked.separationOffsetX *= decay
      tracked.separationOffsetY *= decay
    }

    for (let i = 0; i < entries.length; i += 1) {
      for (let j = i + 1; j < entries.length; j += 1) {
        const a = entries[i]!
        const b = entries[j]!
        const ax = a.tracked.x + a.tracked.separationOffsetX
        const ay = (a.tracked.y + a.tracked.separationOffsetY) * COURT_ASPECT_HINT
        const bx = b.tracked.x + b.tracked.separationOffsetX
        const by = (b.tracked.y + b.tracked.separationOffsetY) * COURT_ASPECT_HINT
        const dx = bx - ax
        const dy = by - ay
        const distance = Math.hypot(dx, dy)
        if (distance >= minSeparationPercent) continue

        // Exactly-coincident centers have no defined push direction; use a stable deterministic
        // fallback (index parity) so two perfectly overlapping players still separate visually.
        const usingFallbackDirection = distance < 1e-6
        const overlap = minSeparationPercent - distance
        const nx = usingFallbackDirection ? 1 : dx / distance
        const ny = usingFallbackDirection ? 0 : dy / distance / COURT_ASPECT_HINT
        const push = Math.min(overlap * 0.5, this.config.spacingOffsetMaxPercent)
        a.tracked.separationOffsetX -= nx * push
        a.tracked.separationOffsetY -= ny * push
        b.tracked.separationOffsetX += nx * push
        b.tracked.separationOffsetY += ny * push
      }
    }
  }
}

function lerpAngleShortestPath(from: number, to: number, t: number): number {
  const twoPi = Math.PI * 2
  let delta = (to - from) % twoPi
  if (delta > Math.PI) delta -= twoPi
  if (delta < -Math.PI) delta += twoPi
  return from + delta * t
}

/**
 * Maps engine-truth speed + role into one of the MP1B movement profiles. Purely a label used by
 * the scene to pick an animation/pose; it never changes speed or position, only how they're drawn.
 */
function movementProfileFor(player: PresentationPlayer, renderedSpeedPercentPerSecond: number): MovementProfile {
  const speedMps = player.speedMetersPerSecond
  if (speedMps < 0.15 && renderedSpeedPercentPerSecond < 0.6) {
    return player.actionIntent === 'screenSet' || player.actionIntent === 'shotPrep' ? 'pivot' : 'stop'
  }
  if (!player.isOffense && (player.defensiveIntent === 'onBall' || player.defensiveIntent === 'help')) return 'shuffle'
  if (player.actionIntent === 'drive') return 'sprint'
  if (speedMps < 1.8) return 'walk'
  if (speedMps < 3.6) return 'jog'
  if (speedMps < 5.2) return 'run'
  return 'sprint'
}
