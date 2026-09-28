/**
 * presentationConfig — MP1L Speed & Time Model.
 *
 * Single authority for how fast things LOOK on screen. Every constant here is a pure rendering
 * knob: none of them feed back into MatchEngine, none of them change simulation ticks, outcomes,
 * or the game clock. Tuning these values can only make the same underlying engine facts look
 * faster/slower/higher/lower on screen.
 *
 * simulationTick (MatchEngine) -> engine step -> MatchPresentationState snapshot -> stepDurationMs
 * (wall-clock window the renderer spends interpolating between two snapshots) -> Phaser animation
 * frame. `stepDurationMs` lives on PhaserMatchRenderer; the constants below drive secondary visual
 * behaviors layered on top of that base interpolation (ball flight pacing, camera smoothing, etc).
 */

export interface PresentationConfig {
  /** Multiplier applied to a player's rendered speed relative to raw engine speedMetersPerSecond. */
  readonly playerMovementScale: number
  /** Multiplier applied to how quickly rendered velocity approaches its target (locomotion easing). */
  readonly accelerationScale: number
  /** Wall-clock ms a pass takes to visually fly from passer to receiver, independent of engine step length. */
  readonly ballPassSpeedMs: number
  /** Wall-clock ms a shot takes to visually arc from release to rim. */
  readonly shotFlightDurationMs: number
  /** Wall-clock ms a catch "settle" animation plays after a pass/shot lands. */
  readonly catchDurationMs: number
  /** Wall-clock ms a gather (pre-shot/pre-finish) animation plays before release. */
  readonly gatherDurationMs: number
  /** Wall-clock ms a loose ball visually bounces/settles before being marked secured. */
  readonly reboundDurationMs: number
  /** 0..1 camera smoothing factor per frame (higher = camera reacts faster to the ball). */
  readonly cameraSmoothing: number
  /** Minimum and maximum camera zoom (Phaser zoom units). */
  readonly cameraZoomMin: number
  readonly cameraZoomMax: number
  /** Small px-equivalent (in court-percent units) offset applied for visual player separation (MP1H). */
  readonly spacingOffsetMaxPercent: number
  /** How quickly a spacing offset decays back toward zero once bodies are no longer overlapping. */
  readonly spacingDecayPerSecond: number
}

export const DEFAULT_PRESENTATION_CONFIG: PresentationConfig = {
  playerMovementScale: 1,
  accelerationScale: 1,
  ballPassSpeedMs: 420,
  shotFlightDurationMs: 700,
  catchDurationMs: 140,
  gatherDurationMs: 220,
  reboundDurationMs: 900,
  cameraSmoothing: 0.08,
  cameraZoomMin: 0.85,
  cameraZoomMax: 1.35,
  spacingOffsetMaxPercent: 1.6,
  spacingDecayPerSecond: 4,
}

/** Playback speed multipliers exposed to MP1M game-speed controls. Presentation-only. */
export const PRESENTATION_PLAYBACK_SPEEDS = [0.5, 1, 2, 4] as const
export type PresentationPlaybackSpeed = (typeof PRESENTATION_PLAYBACK_SPEEDS)[number]
