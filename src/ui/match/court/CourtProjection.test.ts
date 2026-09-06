import { describe, expect, it } from 'vitest'
import { FIBA_REGULATION, NBA_REGULATION } from './CourtGeometry'
import {
  freeThrowArcPoints,
  pointInCourtBounds,
  pointInProjectedCourt,
  threePointPath,
} from './CourtMarkingsGeometry'
import { createCourtProjection, courtPercentToScreenPercent } from './CourtProjection'

describe('CourtProjection CT2.2', () => {
  it('maps centre deterministically in tactical perspective', () => {
    const p = createCourtProjection(1200, 700, FIBA_REGULATION, {
      mode: 'TACTICAL_PERSPECTIVE',
      perspectiveStrength: 0.08,
      courtWidthFill: 0.86,
    })
    const mid = p.project({ x: 14, y: 7.5 })
    expect(mid.x).toBeCloseTo(600, 0)
    expect(mid.y).toBeGreaterThan(200)
    expect(mid.y).toBeLessThan(500)
  })

  it('makes far edge narrower than near edge', () => {
    const p = createCourtProjection(1000, 600, FIBA_REGULATION, {
      mode: 'TACTICAL_PERSPECTIVE',
      perspectiveStrength: 0.1,
      courtWidthFill: 0.86,
    })
    expect(p.widthAtY(0)).toBeLessThan(p.widthAtY(FIBA_REGULATION.width))
  })

  it('round-trips project → unproject near centre', () => {
    const p = createCourtProjection(1120, 640, FIBA_REGULATION, {
      mode: 'TACTICAL_PERSPECTIVE',
      perspectiveStrength: 0.07,
    })
    const original = { x: 10, y: 6 }
    const screen = p.project(original)
    const back = p.unproject(screen)
    expect(back.x).toBeCloseTo(original.x, 4)
    expect(back.y).toBeCloseTo(original.y, 4)
  })

  it('orthographic fallback has equal near/far width', () => {
    const p = createCourtProjection(1000, 600, FIBA_REGULATION, {
      mode: 'ORTHOGRAPHIC',
    })
    expect(p.perspectiveStrength).toBe(0)
    expect(p.widthAtY(0)).toBeCloseTo(p.widthAtY(FIBA_REGULATION.width), 5)
  })

  it('preserves aspect via width fill without stretching', () => {
    const p = createCourtProjection(800, 800, FIBA_REGULATION, { courtWidthFill: 0.86 })
    const ratio = p.viewport.courtPixelWidth / p.viewport.courtPixelHeight
    expect(ratio).toBeCloseTo(28 / 15, 5)
  })

  it('projects all court corners inside viewport', () => {
    const p = createCourtProjection(1280, 720, FIBA_REGULATION, {
      mode: 'TACTICAL_PERSPECTIVE',
      courtWidthFill: 0.86,
    })
    for (const corner of p.courtCorners) {
      expect(corner.x).toBeGreaterThanOrEqual(0)
      expect(corner.x).toBeLessThanOrEqual(1280)
      expect(corner.y).toBeGreaterThanOrEqual(0)
      expect(corner.y).toBeLessThanOrEqual(720)
    }
  })

  it('centers composition horizontally', () => {
    const p = createCourtProjection(1600, 700, FIBA_REGULATION, { courtWidthFill: 0.86 })
    const left = Math.min(...p.courtCorners.map((c) => c.x))
    const right = Math.max(...p.courtCorners.map((c) => c.x))
    const mid = (left + right) / 2
    expect(mid).toBeCloseTo(800, 0)
  })

  it('orthographic court is a true rectangle with both baselines in frame', () => {
    const p = createCourtProjection(1168, 520, FIBA_REGULATION, {
      mode: 'ORTHOGRAPHIC',
      courtWidthFill: 0.92,
      courtHeightFill: 0.94,
    })
    const [fl, fr, nr, nl] = p.courtCorners
    // Perfect rectangle: equal widths, equal heights, axis-aligned
    expect(fl!.y).toBeCloseTo(fr!.y, 5)
    expect(nl!.y).toBeCloseTo(nr!.y, 5)
    expect(fl!.x).toBeCloseTo(nl!.x, 5)
    expect(fr!.x).toBeCloseTo(nr!.x, 5)
    expect(Math.abs(fr!.x - fl!.x)).toBeCloseTo(Math.abs(nr!.x - nl!.x), 5)
    // Both baselines fully inside the canvas (no crop)
    for (const c of p.courtCorners) {
      expect(c.x).toBeGreaterThanOrEqual(0)
      expect(c.x).toBeLessThanOrEqual(1168)
      expect(c.y).toBeGreaterThanOrEqual(0)
      expect(c.y).toBeLessThanOrEqual(520)
    }
    expect(p.perspectiveStrength).toBe(0)
  })

  it('prioritizes visual width occupancy on wide stages', () => {
    // Typical live-stage aspect: wide and moderately tall
    const p = createCourtProjection(1400, 620, FIBA_REGULATION, {
      mode: 'ORTHOGRAPHIC',
      courtWidthFill: 0.92,
      courtHeightFill: 0.995,
    })
    expect(p.metrics.courtWidthRatio).toBeGreaterThanOrEqual(0.7)
    expect(p.metrics.compositionWidthRatio).toBeGreaterThanOrEqual(0.75)
  })

  it('maps legacy percent tokens through projection', () => {
    const p = createCourtProjection(1000, 500, FIBA_REGULATION, {
      mode: 'TACTICAL_PERSPECTIVE',
      perspectiveStrength: 0.08,
      courtWidthFill: 0.86,
    })
    const screen = courtPercentToScreenPercent(50, 50, p)
    expect(screen.left).toBeCloseTo(50, 0)
    expect(screen.top).toBeGreaterThan(20)
    expect(screen.top).toBeLessThan(80)
  })
})

describe('three-point / regulatory path bounds', () => {
  it('keeps FIBA three-point samples inside court bounds (both sides)', () => {
    for (const side of ['left', 'right'] as const) {
      const path = threePointPath(FIBA_REGULATION, side, 72)
      for (const pt of [...path.topLine, ...path.bottomLine, ...path.arc]) {
        expect(pointInCourtBounds(pt, FIBA_REGULATION)).toBe(true)
      }
      // Arc opens toward midcourt — right apex x < hoop, left apex x > hoop
      const midArc = path.arc[Math.floor(path.arc.length / 2)]!
      if (side === 'left') {
        expect(midArc.x).toBeGreaterThan(FIBA_REGULATION.hoopOffset)
        expect(midArc.x).toBeLessThan(FIBA_REGULATION.length / 2)
      } else {
        expect(midArc.x).toBeLessThan(FIBA_REGULATION.length - FIBA_REGULATION.hoopOffset)
        expect(midArc.x).toBeGreaterThan(FIBA_REGULATION.length / 2)
      }
    }
  })

  it('left/right three-point paths are symmetric in court space', () => {
    const left = threePointPath(FIBA_REGULATION, 'left', 64)
    const right = threePointPath(FIBA_REGULATION, 'right', 64)
    expect(left.arc.length).toBe(right.arc.length)
    for (let i = 0; i < left.arc.length; i += 1) {
      const l = left.arc[i]!
      const r = right.arc[i]!
      expect(l.x + r.x).toBeCloseTo(FIBA_REGULATION.length, 5)
      expect(l.y).toBeCloseTo(r.y, 5)
    }
  })

  it('projected three-point samples stay inside court polygon', () => {
    const p = createCourtProjection(1600, 900, FIBA_REGULATION, {
      mode: 'TACTICAL_PERSPECTIVE',
      perspectiveStrength: 0.07,
      courtWidthFill: 0.86,
    })
    for (const side of ['left', 'right'] as const) {
      const path = threePointPath(FIBA_REGULATION, side, 80)
      for (const pt of path.arc) {
        const s = p.project(pt)
        expect(pointInProjectedCourt(s.x, s.y, p.courtCorners)).toBe(true)
      }
    }
  })

  it('left/right basket projections are symmetric', () => {
    const p = createCourtProjection(1280, 720, FIBA_REGULATION, {
      mode: 'TACTICAL_PERSPECTIVE',
      perspectiveStrength: 0.07,
    })
    const left = p.project({ x: FIBA_REGULATION.hoopOffset, y: FIBA_REGULATION.width / 2 })
    const right = p.project({
      x: FIBA_REGULATION.length - FIBA_REGULATION.hoopOffset,
      y: FIBA_REGULATION.width / 2,
    })
    expect(left.x + right.x).toBeCloseTo(1280, 0)
    expect(left.y).toBeCloseTo(right.y, 5)
  })

  it('free-throw arcs stay on midcourt side of the key', () => {
    const left = freeThrowArcPoints(FIBA_REGULATION, 'left', 40)
    const right = freeThrowArcPoints(FIBA_REGULATION, 'right', 40)
    expect(left.every((pt) => pt.x >= FIBA_REGULATION.keyDepth - 0.02)).toBe(true)
    expect(right.every((pt) => pt.x <= FIBA_REGULATION.length - FIBA_REGULATION.keyDepth + 0.02)).toBe(
      true,
    )
    for (const pt of [...left, ...right]) {
      expect(pointInCourtBounds(pt, FIBA_REGULATION)).toBe(true)
    }
  })

  it('NBA three-point samples also stay in bounds', () => {
    for (const side of ['left', 'right'] as const) {
      const path = threePointPath(NBA_REGULATION, side, 64)
      for (const pt of path.arc) {
        expect(pointInCourtBounds(pt, NBA_REGULATION)).toBe(true)
      }
    }
  })
})
