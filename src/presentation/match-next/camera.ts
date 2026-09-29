/**
 * camera.ts — court camera in METRES with a uniform scale (BT1).
 *
 * The v1 camera worked in court-percent, so the horizontal and vertical scales differed and the
 * broadcast zoom cropped half of the court. This one is pure math over real court metres:
 *
 *  - fullCourt: the whole court always fits the viewport (the Basketball Truth default).
 *  - halfCourt: frames the half being attacked (switches only when the attacked basket changes).
 *  - followBall: a tighter look that trails the ball.
 *
 * It never reads MatchEngine and never affects gameplay: it only decides what part of the already
 * decided court to look at.
 */

export type CameraMode = 'fullCourt' | 'halfCourt' | 'followBall'

export interface CameraInput {
  readonly ballXMeters: number
  readonly ballYMeters: number
  /** Which basket the offense is attacking right now (x metres), used to pick the half. */
  readonly attackedBasketXMeters: number
  readonly courtLengthMeters: number
  readonly courtWidthMeters: number
  readonly viewportWidthPx: number
  readonly viewportHeightPx: number
  readonly pixelsPerMeter: number
}

export interface CameraState {
  readonly centerXMeters: number
  readonly centerYMeters: number
  /** Phaser zoom (screen px per world px). */
  readonly zoom: number
}

const MARGIN_METERS = 1.2
const SMOOTH_PER_SECOND = 4.5
const HALF_SWITCH_METERS = 2.5

export class MatchCamera {
  private state: CameraState | undefined
  private mode: CameraMode = 'fullCourt'
  private halfSide: 'left' | 'right' | undefined

  public setMode(mode: CameraMode): void {
    this.mode = mode
  }

  public getMode(): CameraMode {
    return this.mode
  }

  public get current(): CameraState | undefined {
    return this.state
  }

  /** Where the camera wants to be for this input, ignoring smoothing. Exported for tests. */
  public target(input: CameraInput): CameraState {
    const { courtLengthMeters: L, courtWidthMeters: W, viewportWidthPx: vw, viewportHeightPx: vh, pixelsPerMeter: ppm } = input
    const fit = (widthMeters: number, heightMeters: number): number => Math.min(vw / (widthMeters * ppm), vh / (heightMeters * ppm))
    if (this.mode === 'fullCourt') {
      return { centerXMeters: L / 2, centerYMeters: W / 2, zoom: fit(L + MARGIN_METERS * 2, W + MARGIN_METERS * 2) }
    }
    if (this.mode === 'halfCourt') {
      // Follow the ball across the half-court line with hysteresis (so the camera doesn't flip on every pass); the
      // attacked basket only decides the very first side.
      const attackedRight = input.attackedBasketXMeters > L / 2
      if (this.halfSide === undefined) this.halfSide = attackedRight ? 'right' : 'left'
      if (input.ballXMeters > L / 2 + HALF_SWITCH_METERS) this.halfSide = 'right'
      else if (input.ballXMeters < L / 2 - HALF_SWITCH_METERS) this.halfSide = 'left'
      const attacksRight = this.halfSide === 'right'
      const zoom = fit(L / 2 + 2.5, W + MARGIN_METERS * 2)
      // The zoom may be limited by the court width, so the visible length can exceed the half court: pin the
      // attacked baseline (plus a margin) to the viewport edge instead of assuming a fixed visible length.
      const visibleLength = vw / zoom / ppm
      // A viewport wide enough to show the whole court simply shows it (nothing to pin).
      const cx = visibleLength >= L + MARGIN_METERS * 2 ? L / 2 : attacksRight ? L + MARGIN_METERS - visibleLength / 2 : -MARGIN_METERS + visibleLength / 2
      return { centerXMeters: cx, centerYMeters: W / 2, zoom }
    }
    const zoom = fit(16, W + MARGIN_METERS * 2)
    const halfViewW = vw / zoom / ppm / 2
    const halfViewH = vh / zoom / ppm / 2
    return {
      centerXMeters: Math.min(Math.max(input.ballXMeters, halfViewW - 1), L - halfViewW + 1),
      centerYMeters: Math.min(Math.max(input.ballYMeters, halfViewH - 1), W - halfViewH + 1),
      zoom,
    }
  }

  public step(input: CameraInput, deltaSeconds: number): CameraState {
    const target = this.target(input)
    if (this.state === undefined) {
      this.state = target
      return target
    }
    const k = 1 - Math.exp(-SMOOTH_PER_SECOND * Math.max(0, deltaSeconds))
    this.state = {
      centerXMeters: this.state.centerXMeters + (target.centerXMeters - this.state.centerXMeters) * k,
      centerYMeters: this.state.centerYMeters + (target.centerYMeters - this.state.centerYMeters) * k,
      zoom: this.state.zoom + (target.zoom - this.state.zoom) * k,
    }
    return this.state
  }

  /** Forget smoothing state (e.g. after a viewport resize) so the next step snaps to the target. */
  public snap(): void {
    this.state = undefined
  }
}
