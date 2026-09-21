import { useCallback, useEffect, useState, type RefCallback } from 'react'

export interface ContainerSize {
  readonly width: number
  readonly height: number
  readonly aspectRatio: number
}

const EMPTY_SIZE: ContainerSize = { width: 0, height: 0, aspectRatio: 0 }

function normalizeSize(width: number, height: number): ContainerSize {
  const normalizedWidth = Number.isFinite(width) ? Math.max(0, Math.round(width)) : 0
  const normalizedHeight = Number.isFinite(height) ? Math.max(0, Math.round(height)) : 0
  return {
    width: normalizedWidth,
    height: normalizedHeight,
    aspectRatio: normalizedHeight === 0 ? 0 : Number((normalizedWidth / normalizedHeight).toFixed(3)),
  }
}

export function useContainerSize<T extends HTMLElement = HTMLElement>(): {
  readonly ref: RefCallback<T>
  readonly width: number
  readonly height: number
  readonly aspectRatio: number
} {
  const [element, setElement] = useState<T | null>(null)
  const [size, setSize] = useState<ContainerSize>(EMPTY_SIZE)

  const updateSize = useCallback((width: number, height: number) => {
    const next = normalizeSize(width, height)
    setSize((current) =>
      current.width === next.width && current.height === next.height && current.aspectRatio === next.aspectRatio
        ? current
        : next,
    )
  }, [])

  const ref = useCallback<RefCallback<T>>((node) => {
    setElement(node)
    if (node !== null) {
      const rect = node.getBoundingClientRect()
      updateSize(rect.width, rect.height)
    }
  }, [updateSize])

  useEffect(() => {
    if (element === null || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target !== element) continue
        const borderBox = entry.borderBoxSize?.[0]
        if (borderBox !== undefined) updateSize(borderBox.inlineSize, borderBox.blockSize)
        else {
          const rect = element.getBoundingClientRect()
          updateSize(rect.width, rect.height)
        }
      }
    })
    observer.observe(element, { box: 'border-box' })
    return () => observer.disconnect()
  }, [element, updateSize])

  return { ref, ...size }
}
