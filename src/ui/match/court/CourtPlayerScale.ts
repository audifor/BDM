import type { CourtProjection } from './CourtProjection'
import type { CourtPoint2 } from './CourtEntityTypes'

/** Dev-only size presets — production uses MEDIUM. */
export type CourtPlayerScalePreset = 'SMALL' | 'MEDIUM' | 'LARGE'

const PRESET_FACTOR: Record<CourtPlayerScalePreset, number> = {
  SMALL: 0.88,
  MEDIUM: 1,
  LARGE: 1.12,
}

/** Unscaled token diameter in CSS px at MEDIUM on a 1080p-tall stage (+20% vs prior). */
export const PLAYER_BASE_DIAMETER_PX = 38.4
/** @deprecated alias — tokens use diameter, not human height. */
export const PLAYER_BASE_HEIGHT_PX = PLAYER_BASE_DIAMETER_PX

const DEPTH_FAR = 0.96
const DEPTH_NEAR = 1.06
const VIEWPORT_REF_H = 1080
const SCALE_MIN = 0.88
const SCALE_MAX = 1.22

let activePreset: CourtPlayerScalePreset = 'MEDIUM'

export function setCourtPlayerScalePreset(preset: CourtPlayerScalePreset): void {
  activePreset = preset
}

export function getCourtPlayerScalePreset(): CourtPlayerScalePreset {
  return activePreset
}

export function clampPlayerVisualScale(value: number): number {
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, value))
}

export function depthScaleFactor(courtY: number, regulationWidth: number): number {
  const v = Math.min(1, Math.max(0, courtY / Math.max(1e-6, regulationWidth)))
  return DEPTH_FAR + (DEPTH_NEAR - DEPTH_FAR) * v
}

export function viewportScaleFactor(canvasHeight: number): number {
  return Math.min(1.1, Math.max(0.82, canvasHeight / VIEWPORT_REF_H))
}

/**
 * Centralized token scale (camera + subtle depth + preset).
 * Diameter ≈ 34–42px at 1080p MEDIUM.
 */
export function getPlayerVisualScale(
  courtPos: CourtPoint2,
  projection: CourtProjection,
  preset: CourtPlayerScalePreset = activePreset,
): number {
  const depth = depthScaleFactor(courtPos.y, projection.regulation.width)
  const viewport = viewportScaleFactor(projection.viewport.canvasHeight)
  return clampPlayerVisualScale(PRESET_FACTOR[preset] * viewport * depth)
}

export function playerVisualDiameterPx(
  courtPos: CourtPoint2,
  projection: CourtProjection,
  preset: CourtPlayerScalePreset = activePreset,
): number {
  return PLAYER_BASE_DIAMETER_PX * getPlayerVisualScale(courtPos, projection, preset)
}

/** @deprecated Prefer playerVisualDiameterPx */
export function playerVisualHeightPx(
  courtPos: CourtPoint2,
  projection: CourtProjection,
  preset: CourtPlayerScalePreset = activePreset,
): number {
  return playerVisualDiameterPx(courtPos, projection, preset)
}
