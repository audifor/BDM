import type { CourtProjection, ScreenPoint } from '../CourtProjection'
import { projectMetres } from '../CourtProjection'
import type { ArenaCourtProfile, ArenaCourtArchetype } from './ArenaCourtProfile'

export type ArenaZoneRect = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export type ArenaPerimeterLayout = {
  readonly archetype: ArenaCourtArchetype
  readonly courtCorners: readonly ScreenPoint[]
  /** Immediate runoff outer ring (thin band — not a venue slab). */
  readonly runoffOuter: readonly ScreenPoint[]
  /** Contact band just outside parquet edge. */
  readonly contactOuter: readonly ScreenPoint[]

  readonly nearSideline: ArenaZoneRect
  readonly farSideline: ArenaZoneRect
  readonly leftBaseline: ArenaZoneRect
  readonly rightBaseline: ArenaZoneRect

  readonly homeBenchZone: ArenaZoneRect
  readonly awayBenchZone: ArenaZoneRect
  readonly scorerTableZone: ArenaZoneRect
  readonly substitutionZone: ArenaZoneRect

  readonly basketSupportZoneLeft: ArenaZoneRect
  readonly basketSupportZoneRight: ArenaZoneRect
  readonly mediaZoneLeft: ArenaZoneRect
  readonly mediaZoneRight: ArenaZoneRect

  readonly courtsideZone: ArenaZoneRect
  readonly seatingEdgeFar: ArenaZoneRect
  readonly seatingEdgeNear: ArenaZoneRect
  readonly tunnelHints: readonly ArenaZoneRect[]

  readonly runoffDepthPx: {
    readonly near: number
    readonly far: number
    readonly baseline: number
  }
}

type LayoutParams = {
  readonly runoffNearM: number
  readonly runoffFarM: number
  readonly runoffBaselineM: number
  readonly benchDepthM: number
  readonly scorerWidthM: number
  readonly scorerDepthM: number
  readonly courtsideDepthM: number
  readonly seatingFarDepthM: number
  readonly mediaPadM: number
  readonly asymScorerShiftM: number
  readonly basketPadW_M: number
  readonly basketPadH_M: number
}

function paramsFor(archetype: ArenaCourtArchetype): LayoutParams {
  switch (archetype) {
    case 'NBA_PREMIUM':
      // Immediate physical runoff only (~40–90px at 1920) — not a framing slab
      return {
        runoffNearM: 0.95,
        runoffFarM: 0.7,
        runoffBaselineM: 1.05,
        benchDepthM: 1.35,
        scorerWidthM: 9.5,
        scorerDepthM: 1.0,
        courtsideDepthM: 1.8,
        seatingFarDepthM: 2.6,
        mediaPadM: 1.2,
        asymScorerShiftM: -1.2,
        basketPadW_M: 1.15,
        basketPadH_M: 3.4,
      }
    case 'EURO_PREMIUM':
      return {
        runoffNearM: 0.7,
        runoffFarM: 0.55,
        runoffBaselineM: 0.85,
        benchDepthM: 1.15,
        scorerWidthM: 8.2,
        scorerDepthM: 0.85,
        courtsideDepthM: 0.9,
        seatingFarDepthM: 1.8,
        mediaPadM: 0.9,
        asymScorerShiftM: 0.8,
        basketPadW_M: 1.05,
        basketPadH_M: 3.1,
      }
    case 'NCAA_MAJOR':
      return {
        runoffNearM: 0.65,
        runoffFarM: 0.5,
        runoffBaselineM: 0.8,
        benchDepthM: 1.25,
        scorerWidthM: 8.8,
        scorerDepthM: 0.9,
        courtsideDepthM: 0.5,
        seatingFarDepthM: 3.0,
        mediaPadM: 0.65,
        asymScorerShiftM: -0.6,
        basketPadW_M: 1.0,
        basketPadH_M: 3.0,
      }
    case 'NCAA_SMALL_GYM':
    case 'YOUTH_GYM':
      return {
        runoffNearM: 0.35,
        runoffFarM: 0.28,
        runoffBaselineM: 0.4,
        benchDepthM: 0.75,
        scorerWidthM: 4.2,
        scorerDepthM: 0.6,
        courtsideDepthM: 0.25,
        seatingFarDepthM: 1.8,
        mediaPadM: 0,
        asymScorerShiftM: 0.4,
        basketPadW_M: 0.55,
        basketPadH_M: 2.4,
      }
    case 'EURO_STANDARD':
    case 'SMALL_PRO':
    default:
      return {
        runoffNearM: 0.55,
        runoffFarM: 0.45,
        runoffBaselineM: 0.7,
        benchDepthM: 0.95,
        scorerWidthM: 6.5,
        scorerDepthM: 0.75,
        courtsideDepthM: 0.55,
        seatingFarDepthM: 1.5,
        mediaPadM: 0.45,
        asymScorerShiftM: 0,
        basketPadW_M: 0.9,
        basketPadH_M: 2.8,
      }
  }
}

function expandCorners(
  corners: readonly ScreenPoint[],
  padNear: number,
  padFar: number,
  padSide: number,
): ScreenPoint[] {
  const cx = (corners[0]!.x + corners[1]!.x + corners[2]!.x + corners[3]!.x) / 4
  const cy = (corners[0]!.y + corners[1]!.y + corners[2]!.y + corners[3]!.y) / 4
  // corners: 0 far-left, 1 far-right, 2 near-right, 3 near-left
  const pads = [
    { x: padSide, y: padFar },
    { x: padSide, y: padFar },
    { x: padSide, y: padNear },
    { x: padSide, y: padNear },
  ]
  return corners.map((p, i) => {
    const dx = p.x - cx
    const dy = p.y - cy
    const len = Math.hypot(dx, dy) || 1
    const nx = dx / len
    const ny = dy / len
    const pad = pads[i]!
    const sx = p.x < cx ? -pad.x : pad.x
    const sy = p.y < cy ? -pad.y : pad.y
    return {
      x: p.x + sx + nx * pad.x * 0.12,
      y: p.y + sy + ny * pad.y * 0.08,
    }
  })
}

function rect(x: number, y: number, width: number, height: number): ArenaZoneRect {
  return { x, y, width, height }
}

function archetypeDeepBench(archetype: ArenaCourtArchetype): boolean {
  return archetype === 'NBA_PREMIUM' || archetype === 'NCAA_MAJOR'
}

/**
 * Physical perimeter zones derived from the projected court trapezoid.
 * Furniture may extend past the viewport — LiveCourtStage is a camera crop.
 */
export function buildArenaPerimeterLayout(
  projection: CourtProjection,
  arena: ArenaCourtProfile,
): ArenaPerimeterLayout {
  const corners = projection.courtCorners
  const midY = projection.regulation.width / 2
  const px = (metres: number) => Math.max(3, projectMetres(metres, projection, midY))
  const p = paramsFor(arena.archetype)
  const scale = arena.runoffScale

  const near = px(p.runoffNearM * scale)
  const far = px(p.runoffFarM * scale)
  const baseline = px(p.runoffBaselineM * scale)

  const runoffOuter = expandCorners(corners, near, far, baseline)
  const contactOuter = expandCorners(
    corners,
    Math.max(2, near * 0.22),
    Math.max(2, far * 0.2),
    Math.max(2, baseline * 0.2),
  )

  const left = Math.min(...corners.map((c) => c.x))
  const right = Math.max(...corners.map((c) => c.x))
  const top = Math.min(...corners.map((c) => c.y))
  const bottom = Math.max(...corners.map((c) => c.y))
  const courtW = right - left
  const courtH = bottom - top

  const benchDepth = px(p.benchDepthM)
  const benchLen = Math.max(px(6.5), courtW * (archetypeDeepBench(arena.archetype) ? 0.28 : 0.22))
  // Furniture sits in / just beyond immediate runoff — may crop at stage edge
  const nearY = bottom + Math.max(2, near * 0.08)

  const scorerW = px(p.scorerWidthM * 1.05)
  const scorerH = Math.min(Math.max(near * 0.85, px(p.scorerDepthM)), px(1.35))
  const scorerShift = px(p.asymScorerShiftM)
  const scorerTableZone = rect(
    (left + right) / 2 - scorerW / 2 + scorerShift,
    nearY + near * 0.15,
    scorerW,
    scorerH,
  )

  const homeBenchZone = rect(
    scorerTableZone.x - benchLen - px(0.25),
    nearY + near * 0.1,
    benchLen,
    Math.max(benchDepth * 0.85, near * 0.9),
  )
  const awayBenchZone = rect(
    scorerTableZone.x + scorerTableZone.width + px(0.25),
    nearY + near * 0.12,
    benchLen * 0.92,
    Math.max(benchDepth * 0.75, near * 0.8),
  )

  const substitutionZone = rect(
    scorerTableZone.x - px(0.35),
    nearY + near * 0.04,
    px(0.85),
    scorerH + near * 0.2,
  )

  // Compact stanchion pads — do not dictate stage width
  const basketW = px(p.basketPadW_M)
  const basketH = px(p.basketPadH_M)
  const basketSupportZoneLeft = rect(left - basketW * 0.92, top + (courtH - basketH) / 2, basketW, basketH)
  const basketSupportZoneRight = rect(right + basketW * 0.08, top + (courtH - basketH) / 2, basketW, basketH)

  const mediaPad = px(p.mediaPadM)
  const mediaZoneLeft = rect(
    left + courtW * 0.06,
    bottom + near * 0.05,
    mediaPad * 2.0,
    Math.max(5, Math.max(near * 0.7, mediaPad * 0.55)),
  )
  const mediaZoneRight = rect(
    right - courtW * 0.06 - mediaPad * 2.0,
    bottom + near * 0.05,
    mediaPad * 2.0,
    Math.max(5, Math.max(near * 0.7, mediaPad * 0.55)),
  )

  const courtsideDepth = px(p.courtsideDepthM)
  const courtsideZone = rect(
    left - baseline * 0.05,
    Math.min(projection.viewport.canvasHeight - 4, scorerTableZone.y + scorerTableZone.height + 2),
    courtW + baseline * 0.1,
    courtsideDepth,
  )

  const seatingFarDepth = px(p.seatingFarDepthM)
  const seatingEdgeFar = rect(left - baseline * 0.15, top - seatingFarDepth, courtW + baseline * 0.3, seatingFarDepth)
  const seatingEdgeNear = rect(
    left - baseline * 0.1,
    bottom + near * 0.15 + courtsideDepth * 0.25,
    courtW + baseline * 0.2,
    Math.max(courtsideDepth, seatingFarDepth * 0.4),
  )

  const tunnelHints =
    arena.tunnelHints
      ? [
          rect(left - baseline * 0.85, top + courtH * 0.4, Math.max(12, baseline * 0.55), courtH * 0.2),
          rect(right + baseline * 0.25, top + courtH * 0.44, Math.max(10, baseline * 0.5), courtH * 0.16),
        ]
      : []

  return {
    archetype: arena.archetype,
    courtCorners: corners,
    runoffOuter,
    contactOuter,
    nearSideline: rect(left, bottom, courtW, near),
    farSideline: rect(left, top - far, courtW, far),
    leftBaseline: rect(left - baseline, top, baseline, courtH),
    rightBaseline: rect(right, top, baseline, courtH),
    homeBenchZone,
    awayBenchZone,
    scorerTableZone,
    substitutionZone,
    basketSupportZoneLeft,
    basketSupportZoneRight,
    mediaZoneLeft,
    mediaZoneRight,
    courtsideZone,
    seatingEdgeFar,
    seatingEdgeNear,
    tunnelHints,
    runoffDepthPx: { near, far, baseline },
  }
}
