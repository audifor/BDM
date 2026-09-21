// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useContainerSize } from './useContainerSize'

class TestResizeObserver {
  static instances: TestResizeObserver[] = []

  constructor(private readonly callback: ResizeObserverCallback) {
    TestResizeObserver.instances.push(this)
  }

  observe = vi.fn((target: Element, _options?: ResizeObserverOptions) => {
    this.target = target
  })

  disconnect = vi.fn()
  unobserve = vi.fn()

  private target: Element | undefined

  resize(width: number, height: number) {
    if (this.target === undefined) throw new Error('ResizeObserver has no observed element')
    const entry = {
      borderBoxSize: [{ inlineSize: width, blockSize: height }],
      contentRect: { width, height },
      target: this.target,
    } as unknown as ResizeObserverEntry
    this.callback([entry], this as unknown as ResizeObserver)
  }
}

function ContainerProbe() {
  const { ref, width, height, aspectRatio } = useContainerSize<HTMLDivElement>()
  return (
    <div data-testid="container" ref={ref}>
      <output data-testid="size">{`${width}×${height} · ${aspectRatio}`}</output>
    </div>
  )
}

afterEach(() => {
  cleanup()
  TestResizeObserver.instances = []
  vi.unstubAllGlobals()
})

describe('useContainerSize', () => {
  it('tracks an element with ResizeObserver and disconnects on unmount', async () => {
    vi.stubGlobal('ResizeObserver', TestResizeObserver)
    const { unmount } = render(<ContainerProbe />)
    const observer = TestResizeObserver.instances[0]
    expect(observer).toBeDefined()
    expect(observer?.observe).toHaveBeenCalledWith(screen.getByTestId('container'), { box: 'border-box' })

    act(() => observer?.resize(401, 200))
    await waitFor(() => expect(screen.getByTestId('size').textContent).toBe('401×200 · 2.005'))

    act(() => observer?.resize(401, 200))
    expect(screen.getByTestId('size').textContent).toBe('401×200 · 2.005')

    unmount()
    expect(observer?.disconnect).toHaveBeenCalledOnce()
  })
})
