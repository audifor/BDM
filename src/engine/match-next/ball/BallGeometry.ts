import type { CourtGeometry, CourtPosition } from '@/domain/court'

/** Where a dead ball is put back in play when no rule names a spot: the sideline point closest to where the ball was. */
export function nearestSidelineSpot(position: CourtPosition, court: CourtGeometry): CourtPosition {
  return { x: Math.max(0.5, Math.min(court.lengthMeters - 0.5, position.x)), y: position.y < court.widthMeters / 2 ? 0.5 : court.widthMeters - 0.5 }
}

/** After a made basket the ball is inbounded from the baseline behind the basket that was scored on. */
export function baselineSpotBehind(basket: CourtPosition, court: CourtGeometry): CourtPosition {
  return { x: basket.x <= court.lengthMeters / 2 ? 0.5 : court.lengthMeters - 0.5, y: basket.y }
}

/** Distance from the basket centre to the free-throw line (the line is ~5.8 m from the baseline on every ruleset). */
export const FREE_THROW_LINE_DISTANCE_METERS = 4.2
