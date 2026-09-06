/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import { createFloorProfile } from './floor/CourtFloorProfile'
import { parquetFingerprint } from './CourtTextureGenerator'

describe('CourtTextureGenerator CT-CANON', () => {
  it('is deterministic for identical inputs when canvas is available', () => {
    const floor = createFloorProfile('MAPLE_NATURAL', 'STAGGERED')
    const a = parquetFingerprint(64, 36, floor, 'club:test')
    const b = parquetFingerprint(64, 36, floor, 'club:test')
    expect(a).toBe(b)
  })

  it('changes fingerprint when cache key changes (when canvas available)', () => {
    const floor = createFloorProfile('MAPLE_NATURAL', 'STAGGERED')
    const a = parquetFingerprint(64, 36, floor, 'club:a')
    const b = parquetFingerprint(64, 36, floor, 'club:b')
    if (a === 'nocanvas') {
      expect(b).toBe('nocanvas')
      return
    }
    expect(a).not.toBe(b)
  })

  it('produces different fingerprints for different floor materials', () => {
    const a = parquetFingerprint(64, 36, createFloorProfile('MAPLE_GOLD', 'HERRINGBONE'), 'x')
    const b = parquetFingerprint(64, 36, createFloorProfile('OAK_LIGHT', 'LONGITUDINAL'), 'x')
    if (a === 'nocanvas') return
    expect(a).not.toBe(b)
  })
})
