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
import { PhaserMatchScene } from './PhaserMatchScene'
import type { MatchPresentationEvent, MatchPresentationState } from './visualTypes'

export interface PhaserMatchRendererOptions {
  readonly parent: HTMLElement
  readonly width: number
  readonly height: number
  /** Wall-clock duration (ms) over which one engine step is visually interpolated. */
  readonly stepDurationMs?: number
}

export class PhaserMatchRenderer {
  private readonly game: Phaser.Game
  private readonly scene: PhaserMatchScene
  private readonly stepDurationMs: number
  private playback: PresentationPlayback | undefined
  private pendingEvents: MatchPresentationEvent[] = []
  private lastFrameTimeMs: number | undefined

  public constructor(options: PhaserMatchRendererOptions) {
    this.stepDurationMs = options.stepDurationMs ?? 650
    this.scene = new PhaserMatchScene()
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

  private tick(): void {
    if (this.playback === undefined) return
    const now = performance.now()
    const deltaMs = this.lastFrameTimeMs === undefined ? 0 : now - this.lastFrameTimeMs
    this.lastFrameTimeMs = now
    this.playback.advance(deltaMs)
    this.scene.renderFrame({ state: this.playback.currentFrame(), recentEvents: this.pendingEvents })
  }
}
