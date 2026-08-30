export type DailyLoadStatus = 'OK' | 'HIGH' | 'VERY_HIGH'

/** Thresholds are on total scheduled load-minutes-equivalent for a day/scope. Bounded, deterministic. */
const HIGH_THRESHOLD = 90
const VERY_HIGH_THRESHOLD = 150

export function classifyDailyLoad(totalLoad: number): DailyLoadStatus {
  if (totalLoad >= VERY_HIGH_THRESHOLD) return 'VERY_HIGH'
  if (totalLoad >= HIGH_THRESHOLD) return 'HIGH'
  return 'OK'
}
