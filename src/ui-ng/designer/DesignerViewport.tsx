import { useEffect, useRef, useState, type ReactNode } from 'react'

import {
  computeDesignerScale,
  DESIGNER_CANONICAL_HEIGHT,
  DESIGNER_CANONICAL_WIDTH,
  formatDesignerScale,
  installDesignerViewportBridge,
  readDesignerAvailableSize,
} from './designerMode'

import './designer-viewport.css'

export function DesignerViewport({ children }: { readonly children: ReactNode }) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(() => {
    const { width, height } = readDesignerAvailableSize(null)
    return computeDesignerScale(width, height)
  })

  useEffect(() => {
    document.documentElement.classList.add('designer-mode')
    const removeBridge = installDesignerViewportBridge()
    return () => {
      document.documentElement.classList.remove('designer-mode')
      removeBridge()
    }
  }, [])

  useEffect(() => {
    const viewport = viewportRef.current
    if (viewport === null) {
      return undefined
    }

    const updateScale = () => {
      const { width, height } = readDesignerAvailableSize(viewport)
      setScale(computeDesignerScale(width, height))
    }

    const onWindowResize = () => updateScale()
    const onVisualViewportResize = () => updateScale()

    updateScale()
    const observer = new ResizeObserver(() => {
      updateScale()
    })
    observer.observe(viewport)
    window.addEventListener('resize', onWindowResize)
    window.visualViewport?.addEventListener('resize', onVisualViewportResize)
    window.visualViewport?.addEventListener('scroll', onVisualViewportResize)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', onWindowResize)
      window.visualViewport?.removeEventListener('resize', onVisualViewportResize)
      window.visualViewport?.removeEventListener('scroll', onVisualViewportResize)
    }
  }, [])

  const scaledWidth = DESIGNER_CANONICAL_WIDTH * scale
  const scaledHeight = DESIGNER_CANONICAL_HEIGHT * scale
  const scaleLabel = formatDesignerScale(scale)

  return (
    <div
      ref={viewportRef}
      className="designer-viewport"
      data-designer-scale={scaleLabel}
    >
      <div
        className="designer-stage-shell"
        style={{ width: scaledWidth, height: scaledHeight }}
      >
        <div
          className="designer-stage"
          style={{
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
