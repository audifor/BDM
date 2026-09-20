// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ResponsiveProvider, useBdmResponsive } from './ResponsiveProvider'

class TestResizeObserver {
  static current: TestResizeObserver | undefined

  constructor(private readonly callback: ResizeObserverCallback) {
    TestResizeObserver.current = this
  }

  observe(target: Element) {
    this.target = target
  }

  disconnect() {}

  unobserve() {}

  private target: Element | undefined

  resize(width: number, height: number) {
    if (this.target === undefined) throw new Error('ResizeObserver has no observed element')
    const entry = { contentRect: { width, height }, target: this.target } as ResizeObserverEntry
    this.callback([entry], this as unknown as ResizeObserver)
  }
}

function ResponsiveProbe() {
  const { width, height, viewportMode, isDense } = useBdmResponsive()
  return <output data-testid="responsive-state">{`${width}×${height} · ${viewportMode} · ${isDense}`}</output>
}

afterEach(() => {
  cleanup()
  TestResizeObserver.current = undefined
  vi.unstubAllGlobals()
})

describe('ResponsiveProvider', () => {
  it('publishes the observed viewport size and resolved mode', async () => {
    vi.stubGlobal('ResizeObserver', TestResizeObserver)
    render(
      <ResponsiveProvider>
        <ResponsiveProbe />
      </ResponsiveProvider>,
    )

    TestResizeObserver.current?.resize(1366, 768)

    await waitFor(() => expect(screen.getByTestId('responsive-state').textContent).toBe('1366×768 · dense · true'))
    expect(document.querySelector('.bdm-responsive-root')?.getAttribute('data-bdm-viewport-mode')).toBe('dense')
  })
})
