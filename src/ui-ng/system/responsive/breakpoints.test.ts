import { describe, expect, it } from 'vitest'

import { resolveBdmViewport } from './breakpoints'

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
