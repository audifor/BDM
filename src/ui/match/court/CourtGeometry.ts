/** FIBA / regulation court geometry in metres. Canvas mapping is letterboxed. */

export type CourtRegulationKind = 'fibaLike' | 'nbaLike' | 'ncaaLike'

export type CourtPointM = {
  readonly x: number
  readonly y: number
}

export type CourtViewport = {
  readonly canvasWidth: number
  readonly canvasHeight: number
  readonly originX: number
  readonly originY: number
  readonly scale: number
  readonly courtPixelWidth: number
  readonly courtPixelHeight: number
}

export type CourtRegulation = {
  readonly kind: CourtRegulationKind
  readonly length: number
  readonly width: number
  readonly hoopOffset: number
  readonly keyDepth: number
  readonly keyWidth: number
  readonly circleRadius: number
  readonly threePointRadius: number
  readonly cornerThreeInset: number
  readonly backboardWidth: number
  readonly rimRadius: number
}

export const FIBA_REGULATION: CourtRegulation = {
  kind: 'fibaLike',
  length: 28,
  width: 15,
  hoopOffset: 1.575,
  keyDepth: 5.8,
  keyWidth: 4.9,
  circleRadius: 1.8,
  threePointRadius: 6.75,
  cornerThreeInset: 0.9,
  backboardWidth: 1.8,
  rimRadius: 0.225,
}

export const NBA_REGULATION: CourtRegulation = {
  kind: 'nbaLike',
  length: 28.65,
  width: 15.24,
  hoopOffset: 1.575,
  keyDepth: 5.79,
  keyWidth: 4.88,
  circleRadius: 1.83,
  threePointRadius: 7.24,
  cornerThreeInset: 0.91,
  backboardWidth: 1.83,
  rimRadius: 0.23,
}

export const NCAA_REGULATION: CourtRegulation = {
  ...NBA_REGULATION,
  kind: 'ncaaLike',
  threePointRadius: 6.75,
  keyWidth: 3.66,
}

export function regulationFor(kind: CourtRegulationKind): CourtRegulation {
  if (kind === 'nbaLike') return NBA_REGULATION
  if (kind === 'ncaaLike') return NCAA_REGULATION
  return FIBA_REGULATION
}

export function courtAspectRatio(regulation: CourtRegulation): number {
  return regulation.length / regulation.width
}

/** Fit 28×15 (or variant) inside the canvas with letterboxing; never stretch. */
export function createViewport(
  canvasWidth: number,
  canvasHeight: number,
  regulation: CourtRegulation = FIBA_REGULATION,
  paddingPx = 10,
): CourtViewport {
  const availW = Math.max(1, canvasWidth - paddingPx * 2)
  const availH = Math.max(1, canvasHeight - paddingPx * 2)
  const aspect = courtAspectRatio(regulation)
  let courtPixelWidth = availW
  let courtPixelHeight = courtPixelWidth / aspect
  if (courtPixelHeight > availH) {
    courtPixelHeight = availH
    courtPixelWidth = courtPixelHeight * aspect
  }
  const scale = courtPixelWidth / regulation.length
  return {
    canvasWidth,
    canvasHeight,
    originX: (canvasWidth - courtPixelWidth) / 2,
    originY: (canvasHeight - courtPixelHeight) / 2,
    scale,
    courtPixelWidth,
    courtPixelHeight,
  }
}

export function toCanvas(point: CourtPointM, viewport: CourtViewport): { readonly x: number; readonly y: number } {
  return {
    x: viewport.originX + point.x * viewport.scale,
    y: viewport.originY + point.y * viewport.scale,
  }
}

export function toCourt(canvasX: number, canvasY: number, viewport: CourtViewport): CourtPointM {
  return {
    x: (canvasX - viewport.originX) / viewport.scale,
    y: (canvasY - viewport.originY) / viewport.scale,
  }
}

export function metresToPixels(metres: number, viewport: CourtViewport): number {
  return metres * viewport.scale
}
