import type { PlayerAggregateStats } from '@/engine/stats/PlayerHistory'

/**
 * True shooting percentage: points per shooting possession attempt.
 *
 * Single definition shared by every page that shows it, so the season snapshot and the performance
 * page can never disagree about the same number.
 */
export function trueShootingPercentage(stats: PlayerAggregateStats): number | undefined {
  const attempts = stats.fieldGoalsAttempted + 0.44 * stats.freeThrowsAttempted
  return attempts === 0 ? undefined : stats.points / (2 * attempts)
}

/**
 * Effective field goal percentage: field goal percentage weighted so a made three counts 1.5 times.
 * Zero attempts is unknown, never zero.
 */
export function effectiveFieldGoalPercentage(stats: PlayerAggregateStats): number | undefined {
  const attempts = stats.fieldGoalsAttempted
  if (attempts === 0) return undefined
  const weighted = stats.fieldGoalsMade + 0.5 * stats.threePointMade
  return (weighted / attempts) * 100
}
