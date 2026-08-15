import { describe, expect, it, vi } from 'vitest'

import { suppressNativeContextMenu } from './DesktopShell'

describe('DesktopShell native context menu boundary', () => {
  it('suppresses contextmenu independently of the element that originally opened an overlay', () => {
    const preventDefault = vi.fn()
    suppressNativeContextMenu({ preventDefault })
    expect(preventDefault).toHaveBeenCalledOnce()
  })
})
