import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { BDM_BREAKPOINTS, resolveBdmViewport, type BdmViewportMode } from './breakpoints'

type BdmResponsiveState = {
  readonly width: number
  readonly height: number
  readonly viewportMode: BdmViewportMode
  readonly isUltrawide: boolean
  readonly isMaster: boolean
  readonly isCompact: boolean
  readonly isDense: boolean
  readonly isUltraDense: boolean
  readonly isBelowMaster: boolean
  readonly isBelowCompact: boolean
}

const ResponsiveContext = createContext<BdmResponsiveState | null>(null)

function readViewportSize() {
  return {
    width: Math.round(window.innerWidth),
    height: Math.round(window.innerHeight),
  }
}

function normalizeSize(width: number, height: number) {
  return {
    width: Number.isFinite(width) ? Math.max(0, Math.round(width)) : 0,
    height: Number.isFinite(height) ? Math.max(0, Math.round(height)) : 0,
  }
}

function isResponsiveDebugEnabled() {
  return import.meta.env.DEV && new URLSearchParams(window.location.search).get('responsiveDebug') === '1'
}

export function ResponsiveProvider({ children }: { readonly children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState(readViewportSize)
  const [showDebug] = useState(isResponsiveDebugEnabled)

  useEffect(() => {
    const root = rootRef.current
    if (root === null) return

    const updateSize = (width: number, height: number) => {
      const next = normalizeSize(width, height)
      setSize((current) => current.width === next.width && current.height === next.height ? current : next)
    }

    if (typeof ResizeObserver === 'undefined') {
      const onResize = () => {
        const next = readViewportSize()
        updateSize(next.width, next.height)
      }
      window.addEventListener('resize', onResize)
      onResize()
      return () => window.removeEventListener('resize', onResize)
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry !== undefined) updateSize(entry.contentRect.width, entry.contentRect.height)
    })
    observer.observe(root)
    return () => observer.disconnect()
  }, [])

  const viewportMode = resolveBdmViewport(size.width)
  const responsive = useMemo<BdmResponsiveState>(() => ({
    ...size,
    viewportMode,
    isUltrawide: viewportMode === 'ultrawide',
    isMaster: viewportMode === 'master',
    isCompact: viewportMode === 'compact',
    isDense: viewportMode === 'dense',
    isUltraDense: viewportMode === 'ultraDense',
    isBelowMaster: size.width < BDM_BREAKPOINTS.master,
    isBelowCompact: size.width < BDM_BREAKPOINTS.compact,
  }), [size, viewportMode])

  return (
    <ResponsiveContext.Provider value={responsive}>
      <div
        className="bdm-responsive-root"
        data-bdm-responsive-debug={showDebug ? 'true' : undefined}
        data-bdm-viewport-mode={viewportMode}
        ref={rootRef}
      >
        {children}
        {showDebug ? (
          <output aria-hidden="true" className="bdm-responsive-debug">
            {size.width}×{size.height} · {viewportMode.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}
          </output>
        ) : null}
      </div>
    </ResponsiveContext.Provider>
  )
}

export function useBdmResponsive(): BdmResponsiveState {
  const responsive = useContext(ResponsiveContext)
  if (responsive === null) throw new Error('useBdmResponsive must be used within ResponsiveProvider')
  return responsive
}
