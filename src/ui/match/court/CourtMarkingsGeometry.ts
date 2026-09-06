import type { CourtPointM, CourtRegulation } from './CourtGeometry'

/**
 * Court-space regulatory paths. Sample first, project later — never rebuild
 * circles/arcs from screen-space centre/radius after perspective.
 */

export function sampleCirclePoints(
  center: CourtPointM,
  radiusM: number,
  segments = 64,
): CourtPointM[] {
  const points: CourtPointM[] = []
  for (let i = 0; i < segments; i += 1) {
    const a = (i / segments) * Math.PI * 2
    points.push({
      x: center.x + Math.cos(a) * radiusM,
      y: center.y + Math.sin(a) * radiusM,
    })
  }
  return points
}

/** Free-throw semicircle on the midcourt side of the key. */
export function freeThrowArcPoints(
  regulation: CourtRegulation,
  side: 'left' | 'right',
  segments = 36,
): CourtPointM[] {
  const cx = side === 'left' ? regulation.keyDepth : regulation.length - regulation.keyDepth
  const cy = regulation.width / 2
  const r = regulation.circleRadius
  // Left key: arc toward +x (midcourt). Right key: arc toward -x.
  const start = side === 'left' ? -Math.PI / 2 : Math.PI / 2
  const end = side === 'left' ? Math.PI / 2 : (Math.PI * 3) / 2
  const points: CourtPointM[] = []
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments
    const a = start + (end - start) * t
    points.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r })
  }
  return points
}

export type ThreePointPath = {
  readonly topLine: readonly CourtPointM[]
  readonly bottomLine: readonly CourtPointM[]
  readonly arc: readonly CourtPointM[]
  /** Full polyline: baseline→corner→arc→corner→baseline (open). */
  readonly polyline: readonly CourtPointM[]
}

/**
 * FIBA/NBA three-point line in court metres.
 * Arc is sampled in court space; winding always opens toward midcourt.
 *
 * Right-side bug (CT2.1): interpolating atan2(top)→atan2(bot) took the short
 * path through angle 0 (outside the baseline). We instead sweep explicitly
 * through the midcourt bearing (0 for left, π for right).
 */
export function threePointPath(
  regulation: CourtRegulation,
  side: 'left' | 'right',
  arcSegments = 56,
): ThreePointPath {
  const hoopX = side === 'left' ? regulation.hoopOffset : regulation.length - regulation.hoopOffset
  const hoopY = regulation.width / 2
  const cornerTopY = regulation.cornerThreeInset
  const cornerBotY = regulation.width - regulation.cornerThreeInset
  const lateral = Math.sqrt(
    Math.max(0, regulation.threePointRadius ** 2 - (hoopY - cornerTopY) ** 2),
  )
  const cornerX = side === 'left' ? hoopX + lateral : hoopX - lateral
  const baselineX = side === 'left' ? 0 : regulation.length

  // Half-angle from hoop to corner points (symmetric about the long axis)
  const alpha = Math.atan2(hoopY - cornerTopY, lateral)
  // Always sample top → bottom through midcourt (bearing 0 left / π right)
  const start = side === 'left' ? -alpha : Math.PI + alpha
  const end = side === 'left' ? alpha : Math.PI - alpha

  const arc: CourtPointM[] = []
  for (let i = 0; i <= arcSegments; i += 1) {
    const a = start + ((end - start) * i) / arcSegments
    arc.push({
      x: hoopX + Math.cos(a) * regulation.threePointRadius,
      y: hoopY + Math.sin(a) * regulation.threePointRadius,
    })
  }

  const topLine: CourtPointM[] = [
    { x: baselineX, y: cornerTopY },
    { x: cornerX, y: cornerTopY },
  ]
  const bottomLine: CourtPointM[] = [
    { x: baselineX, y: cornerBotY },
    { x: cornerX, y: cornerBotY },
  ]

  return {
    topLine,
    bottomLine,
    arc,
    polyline: [...topLine, ...arc.slice(1), ...bottomLine.slice().reverse()],
  }
}

export function pointInCourtBounds(point: CourtPointM, regulation: CourtRegulation, epsilon = 0.02): boolean {
  return (
    point.x >= -epsilon &&
    point.x <= regulation.length + epsilon &&
    point.y >= -epsilon &&
    point.y <= regulation.width + epsilon
  )
}

/** Ray-cast in screen space against projected court polygon (convex trapezoid). */
export function pointInProjectedCourt(
  screenX: number,
  screenY: number,
  corners: readonly { readonly x: number; readonly y: number }[],
): boolean {
  if (corners.length < 3) return false
  let inside = false
  for (let i = 0, j = corners.length - 1; i < corners.length; j = i, i += 1) {
    const xi = corners[i]!.x
    const yi = corners[i]!.y
    const xj = corners[j]!.x
    const yj = corners[j]!.y
    const intersect =
      yi > screenY !== yj > screenY && screenX < ((xj - xi) * (screenY - yi)) / (yj - yi + Number.EPSILON) + xi
    if (intersect) inside = !inside
  }
  return inside
}
