/**
 * PhaserMatchRenderer — owns the Phaser.Game instance and feeds it interpolated presentation
 * frames. This is the only file that constructs `new Phaser.Game(...)`.
 *
 * The renderer receives MatchPresentationState snapshots (already fully resolved by
 * MatchPresentationBridge from real MatchEngine state) and MatchPresentationEvents, and does
 * nothing but interpolate + draw them via PresentationPlayback and PhaserMatchScene. It never
 * imports `@/engine/match` and never calls back into the engine.
 */

import Phaser from 'phaser'
import { PresentationPlayback } from './interpolation'
import { PhaserMatchScene, type SceneDebugOptions, type SceneIdentificationOptions } from './PhaserMatchScene'
import type { CameraMode } from './camera'
import type { MatchPresentationEvent, MatchPresentationState } from './visualTypes'
import { DEFAULT_PRESENTATION_CONFIG, type PresentationConfig } from './presentationConfig'

export interface PhaserMatchRendererOptions {
  readonly parent: HTMLElement
  readonly width: number
  readonly height: number
  /** Wall-clock duration (ms) over which one engine step is visually interpolated. */
  readonly stepDurationMs?: number
  readonly presentationConfig?: PresentationConfig
}

/**
 * MP1M Game Speed Controls. This ONLY scales how fast the wall-clock interpolation buffer is
 * consumed by the renderer (`playbackSpeed` multiplies deltaMs before it reaches
 * PresentationPlayback.advance). It never changes how often or how the demo driver calls
 * `stepMatchSession` — simulation speed and presentation playback speed stay fully independent, so
 * there is no risk of the renderer "catching up" by skipping or re-deriving engine snapshots.
 */
export class PhaserMatchRenderer {
  private readonly game: Phaser.Game
  private readonly scene: PhaserMatchScene
  private readonly stepDurationMs: number
  private playback: PresentationPlayback | undefined
  private pendingEvents: MatchPresentationEvent[] = []
  private lastFrameTimeMs: number | undefined
  private playbackSpeed = 1
  private paused = false

  public constructor(options: PhaserMatchRendererOptions) {
    this.stepDurationMs = options.stepDurationMs ?? 650
    this.scene = new PhaserMatchScene({ marginPx: 48, presentation: options.presentationConfig ?? DEFAULT_PRESENTATION_CONFIG })
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: options.parent,
      width: options.width,
      height: options.height,
      backgroundColor: '#0b0f14',
      scene: this.scene,
      banner: false,
    })
    this.game.events.on(Phaser.Core.Events.STEP, () => this.tick())
  }

  /** Seeds the renderer's very first frame; call once before any pushSnapshot. */
  public initialize(state: MatchPresentationState): void {
    this.playback = new PresentationPlayback(state, this.stepDurationMs)
  }

  /** Called by the demo driver each time MatchEngine produces a new step. Never called by Phaser itself. */
  public pushSnapshot(state: MatchPresentationState, events: readonly MatchPresentationEvent[]): void {
    if (this.playback === undefined) {
      this.initialize(state)
    } else {
      this.playback.pushSnapshot(state)
    }
    this.pendingEvents = [...this.pendingEvents, ...events].slice(-20)
  }

  public resize(width: number, height: number): void {
    this.game.scale.resize(width, height)
  }

  public destroy(): void {
    this.game.destroy(true)
  }

  /** MP1M: presentation-only playback speed. Does not affect how often the engine itself steps. */
  public setPlaybackSpeed(speed: number): void {
    this.playbackSpeed = Math.max(0, speed)
  }

  public getPlaybackSpeed(): number {
    return this.playbackSpeed
  }

  public setPaused(paused: boolean): void {
    this.paused = paused
  }

  public isPaused(): boolean {
    return this.paused
  }

  public setCameraMode(mode: CameraMode): void {
    this.scene.setCameraMode(mode)
  }

  public getCameraMode(): CameraMode {
    return this.scene.getCameraMode()
  }

  public get debugOptions(): SceneDebugOptions {
    return this.scene.debug
  }

  public get identificationOptions(): SceneIdentificationOptions {
    return this.scene.identification
  }

  private tick(): void {
    if (this.playback === undefined) return
    const now = performance.now()
    const rawDeltaMs = this.lastFrameTimeMs === undefined ? 0 : now - this.lastFrameTimeMs
    this.lastFrameTimeMs = now
    if (this.paused) return
    const scaledDeltaMs = rawDeltaMs * this.playbackSpeed
    this.playback.advance(scaledDeltaMs)
    this.scene.renderFrame({ state: this.playback.currentFrame(), recentEvents: this.pendingEvents })
  }
}
