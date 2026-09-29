/**
 * PhaserMatchRenderer — owns the Phaser.Game instance and the PresentationDirector (BT1).
 *
 * Pull model: Phaser asks for a frame once per animation frame; the renderer advances the
 * director by the real elapsed time (scaled by the playback-speed control) and tops the segment
 * queue up from `segmentSource` only when it is running low. Engine stepping is therefore paced BY
 * playback, never by a timer running ahead of it, so nothing is skipped, overwritten or shown out
 * of order. The renderer never imports `@/engine/match`.
 */

import Phaser from 'phaser'
import { PresentationDirector, type FiredBeat, type PresentationFrame } from './PresentationDirector'
import { PhaserMatchScene, type RenderedTruth, type SceneDebugOptions, type SceneIdentificationOptions } from './PhaserMatchScene'
import type { CameraMode } from './camera'
import type { MatchPresentationState, PresentationSegment } from './visualTypes'

export interface PhaserMatchRendererOptions {
  readonly parent: HTMLElement
  readonly width: number
  readonly height: number
  readonly initialState: MatchPresentationState
  /** Returns the next engine step as a segment, or undefined when the match is over. */
  readonly segmentSource: () => PresentationSegment | undefined
  /** Keep at least this many segments queued ahead of the one playing. */
  readonly lookahead?: number
}

export type RendererFrameListener = (frame: PresentationFrame, rendered: RenderedTruth) => void
export type RendererBeatListener = (beats: readonly FiredBeat[]) => void

export class PhaserMatchRenderer {
  private readonly game: Phaser.Game
  private readonly scene: PhaserMatchScene
  private readonly director: PresentationDirector
  private readonly segmentSource: () => PresentationSegment | undefined
  private readonly lookahead: number
  private paused = false
  private sourceExhausted = false
  private beatListener: RendererBeatListener | undefined
  private listener: RendererFrameListener | undefined

  public constructor(options: PhaserMatchRendererOptions) {
    this.director = new PresentationDirector(options.initialState)
    this.segmentSource = options.segmentSource
    this.lookahead = options.lookahead ?? 2
    this.scene = new PhaserMatchScene()
    this.scene.setFrameProvider((deltaMs) => this.nextFrame(deltaMs))
    this.scene.onFrame((frame, rendered) => this.listener?.(frame, rendered))
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: options.parent,
      width: options.width,
      height: options.height,
      backgroundColor: '#0b0f14',
      scene: this.scene,
      banner: false,
      fps: { target: 60 },
    })
  }

  public onFrame(listener: RendererFrameListener): void {
    this.listener = listener
  }

  public onBeats(listener: RendererBeatListener): void {
    this.beatListener = listener
  }

  public resize(width: number, height: number): void {
    this.game.scale.resize(width, height)
    this.scene.snapCamera()
  }

  public destroy(): void {
    this.game.destroy(true)
  }

  /** Playback speed multiplier for the timeline only; the engine is never stepped faster than playback consumes it. */
  public setPlaybackSpeed(speed: number): void {
    this.director.setSpeed(speed)
  }

  public getPlaybackSpeed(): number {
    return this.director.getSpeed()
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

  public getRenderedTruth(): RenderedTruth | undefined {
    return this.scene.getRenderedTruth()
  }

  public getLastFrame(): PresentationFrame | undefined {
    return this.scene.getLastFrame()
  }

  public get queued(): number {
    return this.director.pending
  }

  /** Test/dev hook: advance playback by an exact wall-clock amount without waiting for Phaser (used by headless capture). */
  public advanceForTest(deltaMs: number): PresentationFrame {
    this.fillQueue()
    const frame = this.director.advance(deltaMs)
    if (frame.firedBeats.length > 0) this.beatListener?.(frame.firedBeats)
    return frame
  }

  private nextFrame(deltaMs: number): PresentationFrame {
    this.fillQueue()
    if (this.paused) return this.director.currentFrame()
    const frame = this.director.advance(Math.min(deltaMs, 100))
    if (frame.firedBeats.length > 0) this.beatListener?.(frame.firedBeats)
    return frame
  }

  private fillQueue(): void {
    let guard = 0
    while (!this.sourceExhausted && this.director.pending < this.lookahead + 1 && guard < 8) {
      guard += 1
      const segment = this.segmentSource()
      if (segment === undefined) {
        this.sourceExhausted = true
        break
      }
      this.director.enqueue(segment)
    }
  }
}
