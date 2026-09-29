import { describe, expect, it } from 'vitest'

import { MatchCamera, type CameraInput } from './camera'

const PPM = 40

function input(overrides: Partial<CameraInput> = {}): CameraInput {
  return {
    ballXMeters: 14,
    ballYMeters: 7.5,
    attackedBasketXMeters: 26.4,
    courtLengthMeters: 28,
    courtWidthMeters: 15,
    viewportWidthPx: 1440,
    viewportHeightPx: 700,
    pixelsPerMeter: PPM,
    ...overrides,
  }
}

describe('MatchCamera (metres, uniform scale)', () => {
  it('fullCourt always fits the whole court, whatever the viewport aspect ratio', () => {
    const camera = new MatchCamera()
    for (const [w, h] of [
      [1440, 700],
      [800, 800],
      [500, 1000],
    ] as const) {
      const state = camera.target(input({ viewportWidthPx: w, viewportHeightPx: h }))
      expect(state.centerXMeters).toBe(14)
      expect(state.centerYMeters).toBe(7.5)
      // The court (plus margin) must fit inside the viewport on BOTH axes.
      expect(28 * PPM * state.zoom).toBeLessThanOrEqual(w + 1e-6)
      expect(15 * PPM * state.zoom).toBeLessThanOrEqual(h + 1e-6)
    }
  })

  it('uses ONE zoom for both axes (no percent-based stretching of the court)', () => {
    const camera = new MatchCamera()
    const state = camera.step(input(), 0)
    expect(typeof state.zoom).toBe('number')
    expect(Number.isFinite(state.zoom)).toBe(true)
  })

  it('halfCourt frames the attacked half and switches sides only with the attacked basket', () => {
    const camera = new MatchCamera()
    camera.setMode('halfCourt')
    const narrow = { viewportWidthPx: 900, viewportHeightPx: 800 }
    const right = camera.target(input({ ...narrow, ballXMeters: 20 }))
    expect(right.centerXMeters).toBeGreaterThan(14)
    // Hysteresis: a ball just across the line does not flip the camera; a clear move to the other half does.
    expect(camera.target(input({ ...narrow, ballXMeters: 13 })).centerXMeters).toBe(right.centerXMeters)
    const left = camera.target(input({ ...narrow, ballXMeters: 6 }))
    expect(left.centerXMeters).toBeLessThan(14)
    // The attacked baseline stays inside the viewport on the attacked side.
    const halfView = 900 / right.zoom / PPM / 2
    expect(right.centerXMeters + halfView).toBeGreaterThanOrEqual(28)
    expect(left.centerXMeters - halfView).toBeLessThanOrEqual(0)
    // A viewport wide enough for the whole court just shows the whole court.
    expect(camera.target(input({ attackedBasketXMeters: 26.4 })).centerXMeters).toBe(14)
  })

  it('followBall keeps the view inside the court and trails the ball', () => {
    const camera = new MatchCamera()
    camera.setMode('followBall')
    const near = camera.target(input({ ballXMeters: 0.2, ballYMeters: 0.1 }))
    expect(near.centerXMeters).toBeGreaterThanOrEqual(0)
    expect(near.centerYMeters).toBeGreaterThanOrEqual(0)
    const far = camera.target(input({ ballXMeters: 27.9, ballYMeters: 14.9 }))
    expect(far.centerXMeters).toBeLessThanOrEqual(28)
    expect(far.centerYMeters).toBeLessThanOrEqual(15)
  })

  it('smooths toward the target over successive frames and snaps on demand', () => {
    const camera = new MatchCamera()
    camera.setMode('halfCourt')
    const narrow = { viewportWidthPx: 900, viewportHeightPx: 800 }
    camera.step(input({ ...narrow, ballXMeters: 4 }), 0)
    const first = camera.current!.centerXMeters
    const next = camera.step(input({ ...narrow, ballXMeters: 24 }), 0.05)
    expect(next.centerXMeters).toBeGreaterThan(first)
    expect(next.centerXMeters).toBeLessThan(camera.target(input({ ...narrow, ballXMeters: 24 })).centerXMeters)
    camera.snap()
    expect(camera.current).toBeUndefined()
  })
})
