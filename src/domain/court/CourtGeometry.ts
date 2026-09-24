import type { SportsCategory } from '@/domain/primitives'
import type { SportsEcosystemKind } from '@/domain/ecosystem'

export type CourtRulesetId = 'FIBA' | 'NBA' | 'WNBA' | 'NCAA_M' | 'NCAA_W' | 'HIGH_SCHOOL'

export interface CourtPosition {
  readonly x: number
  readonly y: number
}

export interface CourtGeometry {
  readonly rulesetId: CourtRulesetId
  readonly lengthMeters: number
  readonly widthMeters: number
  readonly baskets: {
    readonly left: CourtPosition
    readonly right: CourtPosition
  }
}

interface CourtDimensions {
  readonly lengthMeters: number
  readonly widthMeters: number
  readonly basketOffsetMeters: number
}

const FEET_TO_METERS = 0.3048

/** Shared regulatory footprints used by MatchEngine and MatchViewer court rules. */
export const COURT_DIMENSIONS: Readonly<Record<CourtRulesetId, CourtDimensions>> = {
  FIBA: { lengthMeters: 28, widthMeters: 15, basketOffsetMeters: 1.575 },
  NBA: { lengthMeters: 94 * FEET_TO_METERS, widthMeters: 50 * FEET_TO_METERS, basketOffsetMeters: 5.25 * FEET_TO_METERS },
  WNBA: { lengthMeters: 94 * FEET_TO_METERS, widthMeters: 50 * FEET_TO_METERS, basketOffsetMeters: 5.25 * FEET_TO_METERS },
  NCAA_M: { lengthMeters: 94 * FEET_TO_METERS, widthMeters: 50 * FEET_TO_METERS, basketOffsetMeters: 5.25 * FEET_TO_METERS },
  NCAA_W: { lengthMeters: 94 * FEET_TO_METERS, widthMeters: 50 * FEET_TO_METERS, basketOffsetMeters: 5.25 * FEET_TO_METERS },
  HIGH_SCHOOL: { lengthMeters: 94 * FEET_TO_METERS, widthMeters: 50 * FEET_TO_METERS, basketOffsetMeters: 5.25 * FEET_TO_METERS },
}

export function createCourtGeometry(rulesetId: CourtRulesetId): CourtGeometry {
  const dimensions = COURT_DIMENSIONS[rulesetId]
  const middleY = dimensions.widthMeters / 2
  return {
    rulesetId,
    lengthMeters: dimensions.lengthMeters,
    widthMeters: dimensions.widthMeters,
    baskets: {
      left: { x: dimensions.basketOffsetMeters, y: middleY },
      right: { x: dimensions.lengthMeters - dimensions.basketOffsetMeters, y: middleY },
    },
  }
}

export function courtRulesetForEcosystem(kind: SportsEcosystemKind, category: SportsCategory): CourtRulesetId {
  if (kind === 'nbaLike') return category === 'women' ? 'WNBA' : 'NBA'
  if (kind === 'ncaaLike') return category === 'women' ? 'NCAA_W' : 'NCAA_M'
  return 'FIBA'
}

export function isInsideCourt(position: CourtPosition, geometry: CourtGeometry): boolean {
  return Number.isFinite(position.x)
    && Number.isFinite(position.y)
    && position.x >= 0
    && position.x <= geometry.lengthMeters
    && position.y >= 0
    && position.y <= geometry.widthMeters
}

export function distanceBetween(left: CourtPosition, right: CourtPosition): number {
  return Math.hypot(left.x - right.x, left.y - right.y)
}
