import {
  type CourtPointM,
  type CourtRegulation,
  type CourtViewport,
  courtAspectRatio,
} from './CourtGeometry'
import { sampleCirclePoints } from './CourtMarkingsGeometry'

export type CourtProjectionMode = 'ORTHOGRAPHIC' | 'TACTICAL_PERSPECTIVE'

export type ScreenPoint = {
  readonly x: number
  readonly y: number
}

export type CourtProjectionOptions = {
  readonly mode?: CourtProjectionMode
  /** 0 = ortho, ~0.08 = subtle tactical taper (far edge narrower). */
  readonly perspectiveStrength?: number
  // Target fraction of canvas WIDTH occupied by the court surface itself (≈0.88–0.94).
  readonly courtWidthFill?: number
  /** Soft max fraction of canvas HEIGHT the court may use. */
  readonly courtHeightFill?: number
  /**
   * @deprecated Prefer courtWidthFill. Kept as alias for callers still passing courtFill.
   * Interpreted as courtWidthFill when courtWidthFill is omitted.
   */
  readonly courtFill?: number
}

export type CourtProjection = {
  readonly mode: CourtProjectionMode
  readonly regulation: CourtRegulation
  readonly viewport: CourtViewport
  readonly perspectiveStrength: number
  readonly project: (point: CourtPointM) => ScreenPoint
  readonly unproject: (screen: ScreenPoint) => CourtPointM
  /** Width of the court trapezoid at court-y (metres). */
  readonly widthAtY: (courtY: number) => number
  readonly courtCorners: readonly ScreenPoint[]
  /** Visual occupancy metrics for acceptance / tests. */
  readonly metrics: {
    readonly courtWidthRatio: number
    readonly compositionWidthRatio: number
  }
  readonly apronBounds: {
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
  }
}

/**
 * Maps regulation court metres → screen pixels.
 * Geometry stays orthographic; perspective is a camera transform only.
 */
export function createCourtProjection(
  canvasWidth: number,
  canvasHeight: number,
  regulation: CourtRegulation,
  options: CourtProjectionOptions = {},
): CourtProjection {
  const mode = options.mode ?? 'ORTHOGRAPHIC'
  const strength = mode === 'ORTHOGRAPHIC' ? 0 : Math.min(0.12, Math.max(0, options.perspectiveStrength ?? 0.07))
  const widthFill = Math.min(0.96, Math.max(0.55, options.courtWidthFill ?? options.courtFill ?? 0.92))
  const heightFill = Math.min(0.98, Math.max(0.55, options.courtHeightFill ?? 0.94))
  const aspect = courtAspectRatio(regulation)

  // Start from target width occupancy.
  let courtPixelWidth = canvasWidth * widthFill
  let courtPixelHeight = courtPixelWidth / aspect

  if (mode === 'ORTHOGRAPHIC') {
    // Full rectangular court must fit in viewport — both baselines visible, no crop.
    const maxH = canvasHeight * heightFill
    if (courtPixelHeight > maxH) {
      courtPixelHeight = maxH
      courtPixelWidth = courtPixelHeight * aspect
    }
    const maxW = canvasWidth * widthFill
    if (courtPixelWidth > maxW) {
      courtPixelWidth = maxW
      courtPixelHeight = courtPixelWidth / aspect
    }
  } else {
    // Perspective camera may crop vertically to keep width dominance.
    const minSidePad = Math.max(4, canvasWidth * 0.006)
    if (courtPixelWidth > canvasWidth - minSidePad * 2) {
      courtPixelWidth = canvasWidth - minSidePad * 2
      courtPixelHeight = courtPixelWidth / aspect
    }
  }

  // Keep a few pixels clear so baseline strokes are not clipped by the canvas edge.
  const edgePadX = mode === 'ORTHOGRAPHIC' ? Math.max(8, canvasWidth * 0.01) : Math.max(4, canvasWidth * 0.006)
  const edgePadY = mode === 'ORTHOGRAPHIC' ? Math.max(8, canvasHeight * 0.012) : 0
  if (courtPixelWidth > canvasWidth - edgePadX * 2) {
    courtPixelWidth = canvasWidth - edgePadX * 2
    courtPixelHeight = courtPixelWidth / aspect
  }
  if (mode === 'ORTHOGRAPHIC' && courtPixelHeight > canvasHeight - edgePadY * 2) {
    courtPixelHeight = canvasHeight - edgePadY * 2
    courtPixelWidth = courtPixelHeight * aspect
  }

  const originX = (canvasWidth - courtPixelWidth) / 2
  const originY = (canvasHeight - courtPixelHeight) / 2

  const scale = courtPixelWidth / regulation.length

  const viewport: CourtViewport = {
    canvasWidth,
    canvasHeight,
    originX,
    originY,
    scale,
    courtPixelWidth,
    courtPixelHeight,
  }

  const widthAtY = (courtY: number): number => {
    const v = clamp01(courtY / regulation.width)
    const far = courtPixelWidth * (1 - strength)
    return far + (courtPixelWidth - far) * v
  }

  const project = (point: CourtPointM): ScreenPoint => {
    const u = point.x / regulation.length
    const v = clamp01(point.y / regulation.width)
    const band = widthAtY(point.y)
    const centerX = originX + courtPixelWidth / 2
    return {
      x: centerX + (u - 0.5) * band,
      y: originY + v * courtPixelHeight,
    }
  }

  const unproject = (screen: ScreenPoint): CourtPointM => {
    const v = clamp01((screen.y - originY) / courtPixelHeight)
    const courtY = v * regulation.width
    const band = widthAtY(courtY)
    const centerX = originX + courtPixelWidth / 2
    const u = band <= 0 ? 0.5 : (screen.x - centerX) / band + 0.5
    return {
      x: clamp01(u) * regulation.length,
      y: courtY,
    }
  }

  const courtCorners = [
    project({ x: 0, y: 0 }),
    project({ x: regulation.length, y: 0 }),
    project({ x: regulation.length, y: regulation.width }),
    project({ x: 0, y: regulation.width }),
  ] as const

  const left = Math.min(...courtCorners.map((p) => p.x))
  const right = Math.max(...courtCorners.map((p) => p.x))
  const top = Math.min(...courtCorners.map((p) => p.y))
  const bottom = Math.max(...courtCorners.map((p) => p.y))
  // Composition = court + immediate apron band (~3–5% each side of canvas when room exists)
  const apronPadX = Math.min((canvasWidth - (right - left)) * 0.55, courtPixelWidth * 0.07)
  const apronPadY = Math.min(Math.max(originY * 0.95, courtPixelHeight * 0.08), courtPixelHeight * 0.14)

  return {
    mode,
    regulation,
    viewport,
    perspectiveStrength: strength,
    project,
    unproject,
    widthAtY,
    courtCorners,
    metrics: {
      courtWidthRatio: (right - left) / canvasWidth,
      compositionWidthRatio: Math.min(1, (right - left + apronPadX * 2) / canvasWidth),
    },
    apronBounds: {
      x: left - apronPadX,
      y: top - apronPadY,
      width: right - left + apronPadX * 2,
      height: bottom - top + apronPadY * 1.55,
    },
  }
}

export function projectMetres(
  metres: number,
  projection: CourtProjection,
  atCourtY = projection.regulation.width / 2,
): number {
  const band = projection.widthAtY(atCourtY)
  return (metres / projection.regulation.length) * band
}

/**
 * Map legacy orthographic court percentages (0–100) through CourtProjection
 * into CSS percentages of the canvas/container.
 */
export function courtPercentToScreenPercent(
  xPercent: number,
  yPercent: number,
  projection: CourtProjection,
): { readonly left: number; readonly top: number } {
  const court: CourtPointM = {
    x: (xPercent / 100) * projection.regulation.length,
    y: (yPercent / 100) * projection.regulation.width,
  }
  const screen = projection.project(court)
  return {
    left: (screen.x / projection.viewport.canvasWidth) * 100,
    top: (screen.y / projection.viewport.canvasHeight) * 100,
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

export function clipToCourtPolygon(ctx: CanvasRenderingContext2D, projection: CourtProjection): void {
  const c = projection.courtCorners
  ctx.beginPath()
  ctx.moveTo(c[0]!.x, c[0]!.y)
  for (let i = 1; i < c.length; i += 1) ctx.lineTo(c[i]!.x, c[i]!.y)
  ctx.closePath()
  ctx.clip()
}

/** Draw a closed polygon through projected court points. */
export function strokeCourtPath(
  ctx: CanvasRenderingContext2D,
  projection: CourtProjection,
  points: readonly CourtPointM[],
  close = false,
): void {
  if (points.length === 0) return
  const first = projection.project(points[0]!)
  ctx.beginPath()
  ctx.moveTo(first.x, first.y)
  for (let i = 1; i < points.length; i += 1) {
    const p = projection.project(points[i]!)
    ctx.lineTo(p.x, p.y)
  }
  if (close) ctx.closePath()
  ctx.stroke()
}

export function fillCourtPath(
  ctx: CanvasRenderingContext2D,
  projection: CourtProjection,
  points: readonly CourtPointM[],
): void {
  if (points.length === 0) return
  const first = projection.project(points[0]!)
  ctx.beginPath()
  ctx.moveTo(first.x, first.y)
  for (let i = 1; i < points.length; i += 1) {
    const p = projection.project(points[i]!)
    ctx.lineTo(p.x, p.y)
  }
  ctx.closePath()
  ctx.fill()
}

/** Approximate a court-space circle as court-metre sample points (project later). */
export function projectedCirclePoints(
  _projection: { readonly regulation: CourtRegulation } | CourtProjection,
  center: CourtPointM,
  radiusM: number,
  segments = 48,
): CourtPointM[] {
  return sampleCirclePoints(center, radiusM, segments)
}
