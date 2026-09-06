import { describe, expect, it } from 'vitest'
import {
  FIBA_REGULATION,
  courtAspectRatio,
  createViewport,
  toCanvas,
  toCourt,
} from './CourtGeometry'

describe('CourtGeometry', () => {
  it('keeps FIBA aspect ratio 28:15', () => {
    expect(courtAspectRatio(FIBA_REGULATION)).toBeCloseTo(28 / 15, 8)
  })

  it('letterboxes without stretching', () => {
    const viewport = createViewport(800, 800, FIBA_REGULATION, 0)
    expect(viewport.courtPixelWidth / viewport.courtPixelHeight).toBeCloseTo(28 / 15, 5)
    expect(viewport.courtPixelWidth).toBeLessThanOrEqual(800)
    expect(viewport.courtPixelHeight).toBeLessThanOrEqual(800)
  })

  it('round-trips court ↔ canvas coordinates at centre', () => {
    const viewport = createViewport(1120, 600, FIBA_REGULATION, 0)
    const court = { x: 14, y: 7.5 }
    const canvas = toCanvas(court, viewport)
    const back = toCourt(canvas.x, canvas.y, viewport)
    expect(back.x).toBeCloseTo(14, 5)
    expect(back.y).toBeCloseTo(7.5, 5)
  })
})
