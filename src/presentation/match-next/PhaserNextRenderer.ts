/**
 * PhaserNextRenderer — owns the Phaser.Game and the NextPresentationDirector.
 * Pull model: Phaser asks for a frame each animation frame; the director advances by the real elapsed time
 * (times the speed control) and pulls canonical ticks from `tickSource` only as playback consumes them.
 */

import Phaser from 'phaser'
import type { MatchNextEvent } from '@/engine/match-next'
import type { CameraMode } from './camera'
import { NextPresentationDirector, type NextRenderFrame } from './NextPresentationDirector'
import { PhaserNextScene, type NextRenderedTruth, type NextSceneDebug, type NextSceneIdentification } from './PhaserNextScene'
import type { NextTickFrame } from './types'

export interface PhaserNextRendererOptions {
  readonly parent: HTMLElement
  readonly width: number
  readonly height: number
  readonly first: NextTickFrame
  readonly tickSource: () => NextTickFrame | undefined
}

export class PhaserNextRenderer {
  private readonly game: Phaser.Game
  private readonly scene: PhaserNextScene
  private readonly director: NextPresentationDirector
  private paused = false
  private eventListener: ((events: readonly MatchNextEvent[], frame: NextRenderFrame) => void) | undefined

  public constructor(options: PhaserNextRendererOptions) {
    this.director = new NextPresentationDirector(options.first, options.tickSource)
    this.scene = new PhaserNextScene()
    this.scene.setFrameProvider((dt) => this.nextFrame(dt))
    this.game = new Phaser.Game({ type: Phaser.AUTO, parent: options.parent, width: options.width, height: options.height, backgroundColor: '#0b0f14', scene: this.scene, banner: false, fps: { target: 60 } })
  }

  public onFrame(listener: (frame: NextRenderFrame, rendered: NextRenderedTruth) => void): void {
    this.scene.onFrame(listener)
  }

  public onEvents(listener: (events: readonly MatchNextEvent[], frame: NextRenderFrame) => void): void {
    this.eventListener = listener
  }

  public resize(width: number, height: number): void {
    this.game.scale.resize(width, height)
    this.scene.snapCamera()
  }

  public destroy(): void {
    this.game.destroy(true)
  }

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

  public get debugOptions(): NextSceneDebug {
    return this.scene.debug
  }

  public get identificationOptions(): NextSceneIdentification {
    return this.scene.identification
  }

  public getRenderedTruth(): NextRenderedTruth | undefined {
    return this.scene.getRenderedTruth()
  }

  public getLastFrame(): NextRenderFrame | undefined {
    return this.scene.getLastFrame()
  }

  /** Dev/capture hook: advance playback by exact wall-clock ms regardless of pause. */
  public advanceForTest(deltaMs: number): NextRenderFrame {
    const frame = this.director.advance(deltaMs)
    if (frame.firedEvents.length > 0) this.eventListener?.(frame.firedEvents, frame)
    return frame
  }

  private nextFrame(deltaMs: number): NextRenderFrame {
    if (this.paused) return this.director.currentFrame()
    const frame = this.director.advance(Math.min(deltaMs, 100))
    if (frame.firedEvents.length > 0) this.eventListener?.(frame.firedEvents, frame)
    return frame
  }
}
