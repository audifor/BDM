/**
 * camera.ts — MP1I Camera & Match Presentation.
 *
 * Pure math: given the current ball/action focal point (already fully resolved by the bridge) and
 * the previous camera state, computes the next camera center + zoom. Never reads MatchEngine
 * directly, never affects gameplay; only decides what part of the already-decided court to look at.
 */

import type { MatchPresentationState } from './visualTypes'
import { DEFAULT_PRESENTATION_CONFIG, type PresentationConfig } from './presentationConfig'

export type CameraMode = 'followBall' | 'broadcast' | 'fullCourtDebug'

export interface CameraState {
  readonly centerXPercent: number
  readonly centerYPercent: number
  readonly zoom: number
}

const FULL_COURT: CameraState = { centerXPercent: 50, centerYPercent: 50, zoom: 1 }

export class MatchCamera {
  private state: CameraState = FULL_COURT
  private mode: CameraMode = 'broadcast'
  private readonly config: PresentationConfig

  public constructor(config: PresentationConfig = DEFAULT_PRESENTATION_CONFIG) {
    this.config = config
  }

  public setMode(mode: CameraMode): void {
    this.mode = mode
  }

  public getMode(): CameraMode {
    return this.mode
  }

  public get current(): CameraState {
    return this.state
  }

  /** Advances the camera by one frame toward the target implied by `presentation`, given deltaSeconds. */
  public step(presentation: MatchPresentationState, deltaSeconds: number): CameraState {
    if (this.mode === 'fullCourtDebug') {
      this.state = FULL_COURT
      return this.state
    }

    const target = this.computeTarget(presentation)
    const smoothing = 1 - Math.exp(-(1 / Math.max(0.001, this.config.cameraSmoothing)) * deltaSeconds * 0.06)
    this.state = {
      centerXPercent: this.state.centerXPercent + (target.centerXPercent - this.state.centerXPercent) * smoothing,
      centerYPercent: this.state.centerYPercent + (target.centerYPercent - this.state.centerYPercent) * smoothing,
      zoom: this.state.zoom + (target.zoom - this.state.zoom) * smoothing,
    }
    return this.state
  }

  private computeTarget(presentation: MatchPresentationState): CameraState {
    if (this.mode === 'followBall') {
      return {
        centerXPercent: clampCenter(presentation.ball.position.xPercent),
        centerYPercent: clampCenter(presentation.ball.position.yPercent, true),
        zoom: this.config.cameraZoomMax,
      }
    }

    // 'broadcast': center of mass between ball and ball handler-adjacent action, softly zoomed to
    // keep the live play readable without whiplashing the camera on every possession change.
    const ballHandler = presentation.players.find((p) => p.hasBall)
    const focusX = ballHandler !== undefined ? (presentation.ball.position.xPercent + ballHandler.position.xPercent) / 2 : presentation.ball.position.xPercent
    const focusY = ballHandler !== undefined ? (presentation.ball.position.yPercent + ballHandler.position.yPercent) / 2 : presentation.ball.position.yPercent
    const zoom = (this.config.cameraZoomMin + this.config.cameraZoomMax) / 2
    return {
      centerXPercent: clampCenter(focusX),
      centerYPercent: clampCenter(focusY, true),
      zoom,
    }
  }
}

function clampCenter(value: number, isY = false): number {
  const margin = isY ? 15 : 20
  return Math.min(100 - margin, Math.max(margin, value))
}
