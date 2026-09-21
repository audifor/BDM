// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { isStructuralCompact, useStructuralCompact } from './useStructuralCompact'

class TestResizeObserver {
  static instances: TestResizeObserver[] = []

  constructor(private readonly callback: ResizeObserverCallback) {
    TestResizeObserver.instances.push(this)
  }

  private target: Element | undefined
  observe = vi.fn((target: Element, _options?: ResizeObserverOptions) => { this.target = target })
  disconnect = vi.fn()
  unobserve = vi.fn()

  resize(width: number, height: number) {
    if (this.target === undefined) throw new Error('ResizeObserver has no observed element')
    this.callback(
      [{ borderBoxSize: [{ inlineSize: width, blockSize: height }], contentRect: { width, height }, target: this.target } as unknown as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    )
  }
}

function StructuralCompactProbe() {
  const { ref, width, isStructuralCompact } = useStructuralCompact<HTMLDivElement>(600)
  return <div data-compact={isStructuralCompact} data-testid="probe" ref={ref}>{width}</div>
}

afterEach(() => {
  cleanup()
  TestResizeObserver.instances = []
  vi.unstubAllGlobals()
})

describe('structural compression floor', () => {
  it.each([[599, true], [600, false], [601, false], [0, false], [Number.NaN, false]] as const)(
    'classifies a %s px container as structural compact = %s',
    (width, expected) => expect(isStructuralCompact(width, 600)).toBe(expected),
  )

  it('derives the state from the observed container size and cleans up', async () => {
    vi.stubGlobal('ResizeObserver', TestResizeObserver)
    const { unmount } = render(<StructuralCompactProbe />)
    const observer = TestResizeObserver.instances[0]

    act(() => observer?.resize(599, 480))
    await waitFor(() => expect(screen.getByTestId('probe').getAttribute('data-compact')).toBe('true'))

    act(() => observer?.resize(600, 480))
    await waitFor(() => expect(screen.getByTestId('probe').getAttribute('data-compact')).toBe('false'))

    unmount()
    expect(observer?.disconnect).toHaveBeenCalledOnce()
  })
})
