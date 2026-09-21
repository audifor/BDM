import { describe, expect, it } from 'vitest'

import { resolveBdmHeightMode, resolveBdmPlayerHeightMode, resolveBdmViewport } from './breakpoints'

describe('resolveBdmViewport', () => {
  it.each([
    [2560, 'ultrawide'],
    [2200, 'ultrawide'],
    [2199, 'master'],
    [1920, 'master'],
    [1800, 'master'],
    [1799, 'compact'],
    [1600, 'compact'],
    [1440, 'compact'],
    [1439, 'dense'],
    [1366, 'dense'],
    [1280, 'dense'],
    [1279, 'ultraDense'],
  ] as const)('resolves %i px to %s', (width, mode) => {
    expect(resolveBdmViewport(width)).toBe(mode)
  })
})

describe('resolveBdmHeightMode', () => {
  it.each([
    [1080, 'tall'],
    [1000, 'tall'],
    [999, 'standard'],
    [900, 'standard'],
    [850, 'standard'],
    [849, 'short'],
    [768, 'short'],
    [720, 'short'],
    [719, 'veryShort'],
    [0, 'veryShort'],
    [Number.NaN, 'veryShort'],
  ] as const)('resolves %i px to %s', (height, mode) => {
    expect(resolveBdmHeightMode(height)).toBe(mode)
  })
})

describe('resolveBdmPlayerHeightMode', () => {
  it.each([
    [976, 'normal'],
    [820, 'normal'],
    [819, 'compact'],
    [676, 'compact'],
    [660, 'compact'],
    [659, 'dense'],
    [634, 'dense'],
  ] as const)('resolves %i px to %s', (height, mode) => {
    expect(resolveBdmPlayerHeightMode(height)).toBe(mode)
  })
})
