import { describe, expect, it, vi } from 'vitest'

import { suppressEntityActionContextMenu } from './useEntityActions'

describe('EntityActionTarget input boundary', () => {
  it('suppresses and stops the native contextmenu event locally', () => {
    const preventDefault = vi.fn(); const stopPropagation = vi.fn()
    suppressEntityActionContextMenu({ preventDefault, stopPropagation })
    expect(preventDefault).toHaveBeenCalledOnce(); expect(stopPropagation).toHaveBeenCalledOnce()
  })
})
