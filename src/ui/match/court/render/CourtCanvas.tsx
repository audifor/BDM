import { useEffect, useRef } from 'react'
import type { PlayerId } from '@/domain/ids'
import type { CourtConfiguration } from '../core/CourtConfiguration'
import { CourtRenderer } from './CourtRenderer'
import type { CourtProjection, CourtProjectionMode } from '../CourtProjection'
import { CourtDynamicRenderer } from '../CourtDynamicRenderer'
import type { CourtDynamicFrame } from '../CourtEntityTypes'

export function CourtCanvas({
  configuration,
  projectionMode = 'ORTHOGRAPHIC',
  className,
  'aria-label': ariaLabel = 'Basketball court',
  onProjectionChange,
  dynamicFrame = null,
  onPlayerHit,
  debug = false,
  debugCompositionBounds = false,
}: {
  readonly configuration: CourtConfiguration
  readonly projectionMode?: CourtProjectionMode
  readonly className?: string
  readonly 'aria-label'?: string
  readonly onProjectionChange?: (projection: CourtProjection) => void
  readonly dynamicFrame?: CourtDynamicFrame | null
  readonly onPlayerHit?: (playerId: PlayerId) => void
  readonly debug?: boolean
  readonly debugCompositionBounds?: boolean
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rendererRef = useRef<CourtRenderer | null>(null)
  const dynamicRef = useRef<CourtDynamicRenderer | null>(null)
  const frameRef = useRef<CourtDynamicFrame | null>(dynamicFrame)
  const cssSizeRef = useRef({ w: 1, h: 1, dpr: 1 })
  const projectionBufferRef = useRef<CourtProjection | null>(null)

  frameRef.current = dynamicFrame

  useEffect(() => {
    rendererRef.current = new CourtRenderer({
      projectionMode,
      perspectiveStrength: 0,
      debugCompositionBounds,
    })
    dynamicRef.current = new CourtDynamicRenderer({ debug })
    return () => {
      rendererRef.current = null
      dynamicRef.current = null
    }
  }, [projectionMode, debug, debugCompositionBounds])

  useEffect(() => {
    dynamicRef.current?.setDebug(debug)
  }, [debug])

  useEffect(() => {
    rendererRef.current?.setDebugCompositionBounds(debugCompositionBounds)
  }, [debugCompositionBounds])

  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    const renderer = rendererRef.current
    const dynamic = dynamicRef.current
    if (container === null || canvas === null || renderer === null || dynamic === null) return

    let raf = 0
    let running = true

    const ensureSize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const cssW = Math.max(1, container.clientWidth)
      const cssH = Math.max(1, container.clientHeight)
      const pixelW = Math.max(1, Math.floor(cssW * dpr))
      const pixelH = Math.max(1, Math.floor(cssH * dpr))
      const changed = canvas.width !== pixelW || canvas.height !== pixelH
      if (changed) {
        canvas.width = pixelW
        canvas.height = pixelH
        renderer.invalidate()
      }
      cssSizeRef.current = { w: cssW, h: cssH, dpr }
      return changed
    }

    const paintStaticAndNotify = () => {
      ensureSize()
      renderer.setProjectionMode(projectionMode)
      const bufferProjection = renderer.render(canvas, configuration)
      projectionBufferRef.current = bufferProjection
      const { w, h } = cssSizeRef.current
      onProjectionChange?.(renderer.createProjection(w, h, configuration))
    }

    const tick = (now: number) => {
      if (!running) return
      const frame = frameRef.current
      if (frame !== null) {
        ensureSize()
        renderer.setProjectionMode(projectionMode)
        const projection = renderer.render(canvas, configuration)
        projectionBufferRef.current = projection
        const ctx = canvas.getContext('2d')
        if (ctx !== null) dynamic.render(ctx, projection, frame, now)
      }
      raf = requestAnimationFrame(tick)
    }

    paintStaticAndNotify()
    if (dynamicFrame !== null) {
      raf = requestAnimationFrame(tick)
    }

    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            paintStaticAndNotify()
            const frame = frameRef.current
            if (frame !== null) {
              const projection = projectionBufferRef.current
              const ctx = canvas.getContext('2d')
              if (projection !== null && ctx !== null) {
                dynamic.render(ctx, projection, frame, performance.now())
              }
            }
          })
    observer?.observe(container)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      observer?.disconnect()
    }
  }, [configuration, projectionMode, onProjectionChange, dynamicFrame !== null])

  useEffect(() => {
    // frameRef already updated; next RAF tick consumes it
  }, [dynamicFrame])

  const handlePointer = (clientX: number, clientY: number) => {
    if (onPlayerHit === undefined || frameRef.current === null) return
    const canvas = canvasRef.current
    const dynamic = dynamicRef.current
    const projection = projectionBufferRef.current
    if (canvas === null || dynamic === null || projection === null) return
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / Math.max(1, rect.width)
    const scaleY = canvas.height / Math.max(1, rect.height)
    const x = (clientX - rect.left) * scaleX
    const y = (clientY - rect.top) * scaleY
    const hit = dynamic.hitTestPlayer(projection, frameRef.current, x, y, performance.now())
    if (hit !== null) onPlayerHit(hit)
  }

  return (
    <div className={className} ref={containerRef} style={{ position: 'absolute', inset: 0 }}>
      <canvas
        aria-hidden={ariaLabel === undefined}
        aria-label={ariaLabel}
        onClick={
          onPlayerHit === undefined
            ? undefined
            : (event) => {
                handlePointer(event.clientX, event.clientY)
              }
        }
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          cursor: onPlayerHit === undefined ? 'default' : 'pointer',
        }}
      />
    </div>
  )
}
