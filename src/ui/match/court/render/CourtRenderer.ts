import type { CourtConfiguration } from '../core/CourtConfiguration'
import { courtConfigurationCacheKey } from '../core/CourtConfiguration'
import { rulesetToRegulation } from '../rules/CourtRuleset'
import { buildStaticCacheKey } from '../CourtColorUtils'
import {
  createCourtProjection,
  clipToCourtPolygon,
  type CourtProjection,
  type CourtProjectionMode,
} from '../CourtProjection'
import { renderArenaPerimeter } from '../arena/ArenaPerimeterRenderer'
import { renderCourtLighting } from '../arena/CourtLightingRenderer'
import { renderCourtFloor } from '../floor/CourtFloorRenderer'
import { renderCourtPaint } from '../floor/CourtPaintRenderer'
import { renderCourtSurfaceBranding, renderCourtApronBranding } from '../branding/CourtBrandingRenderer'
import { renderCourtEventOverlay } from '../event/CourtEventOverlayRenderer'
import { renderBasketSystems } from '../basket/BasketSystemRenderer'

export type CourtRendererOptions = {
  readonly projectionMode?: CourtProjectionMode
  readonly perspectiveStrength?: number
  /**
   * CT-ARENA debug: when false, skip parquet/paint/court branding and leave
   * only arena perimeter (+ basket hardware in runoff).
   */
  readonly showCourt?: boolean
  /** Temporary composition overlay: court / runoff / viewport / basket pads. */
  readonly debugCompositionBounds?: boolean
}

type StaticCache = {
  readonly key: string
  readonly canvas: HTMLCanvasElement
}

/**
 * CT-CANON static pipeline. Receives a fully resolved CourtConfiguration —
 * does not resolve competition/club/arena itself.
 */
export class CourtRenderer {
  private staticCache: StaticCache | null = null
  private projectionMode: CourtProjectionMode
  private perspectiveStrength: number
  private showCourt: boolean
  private debugCompositionBounds: boolean

  public constructor(options: CourtRendererOptions = {}) {
    this.projectionMode = options.projectionMode ?? 'ORTHOGRAPHIC'
    this.perspectiveStrength = options.perspectiveStrength ?? 0
    this.showCourt = options.showCourt ?? true
    this.debugCompositionBounds = options.debugCompositionBounds ?? false
  }

  public setProjectionMode(mode: CourtProjectionMode): void {
    if (this.projectionMode === mode) return
    this.projectionMode = mode
    this.invalidate()
  }

  public setShowCourt(show: boolean): void {
    if (this.showCourt === show) return
    this.showCourt = show
    this.invalidate()
  }

  public setDebugCompositionBounds(enabled: boolean): void {
    if (this.debugCompositionBounds === enabled) return
    this.debugCompositionBounds = enabled
    this.invalidate()
  }

  public invalidate(): void {
    this.staticCache = null
  }

  public getStaticCacheKeyForTest(target: HTMLCanvasElement, config: CourtConfiguration): string {
    return this.buildCacheKey(target.width, target.height, config)
  }

  public createProjection(
    canvasWidth: number,
    canvasHeight: number,
    config: CourtConfiguration,
  ): CourtProjection {
    const regulation = rulesetToRegulation(config.ruleset)
    return createCourtProjection(canvasWidth, canvasHeight, regulation, {
      mode: this.projectionMode,
      perspectiveStrength: this.perspectiveStrength,
      courtWidthFill: config.arena.courtWidthFill,
      courtHeightFill: config.arena.courtHeightFill,
    })
  }

  public render(target: HTMLCanvasElement, config: CourtConfiguration): CourtProjection {
    const ctx = target.getContext('2d')
    const projection = this.createProjection(target.width, target.height, config)
    if (ctx === null) return projection

    const cacheKey = this.buildCacheKey(target.width, target.height, config)
    if (this.staticCache === null || this.staticCache.key !== cacheKey) {
      const staticCanvas = document.createElement('canvas')
      staticCanvas.width = target.width
      staticCanvas.height = target.height
      const staticCtx = staticCanvas.getContext('2d')
      if (staticCtx === null) return projection
      this.paintStatic(staticCtx, projection, config)
      this.staticCache = { key: cacheKey, canvas: staticCanvas }
    }

    ctx.clearRect(0, 0, target.width, target.height)
    ctx.drawImage(this.staticCache.canvas, 0, 0)
    return projection
  }

  private buildCacheKey(width: number, height: number, config: CourtConfiguration): string {
    return buildStaticCacheKey([
      'ct-arena-v3-edge',
      `${width}x${height}`,
      this.projectionMode,
      String(this.perspectiveStrength),
      this.showCourt ? 'court' : 'perimeter-only',
      this.debugCompositionBounds ? 'bounds' : 'nobounds',
      courtConfigurationCacheKey(config),
    ])
  }

  private paintStatic(
    ctx: CanvasRenderingContext2D,
    projection: CourtProjection,
    config: CourtConfiguration,
  ): void {
    renderArenaPerimeter(ctx, projection, config, {
      debugOutlineCourt: !this.showCourt,
      debugCompositionBounds: this.debugCompositionBounds,
    })

    if (this.showCourt) {
      ctx.save()
      clipToCourtPolygon(ctx, projection)
      renderCourtFloor(ctx, projection, config)
      renderCourtPaint(ctx, projection, config)
      renderCourtSurfaceBranding(ctx, projection, config)
      renderCourtEventOverlay(ctx, projection, config)
      ctx.restore()
      renderCourtApronBranding(ctx, projection, config)
    } else {
      // Empty playable hole — evaluate venue without court distraction
      ctx.save()
      clipToCourtPolygon(ctx, projection)
      ctx.fillStyle = 'rgba(4,6,10,0.92)'
      ctx.fillRect(0, 0, projection.viewport.canvasWidth, projection.viewport.canvasHeight)
      ctx.restore()
    }

    // Basket hardware lives in runoff — keep visible in both modes
    renderBasketSystems(ctx, projection, config)

    if (this.showCourt) {
      renderCourtLighting(ctx, projection, config)
    }
  }
}
