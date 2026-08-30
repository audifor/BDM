import type { TrainingIntensity } from './Training'

export type DailyLoadStatus = 'OK' | 'HIGH' | 'VERY_HIGH'

/**
 * Canonical per-unit workload weight for the daily calendar/Load Management classification.
 *
 * This is deliberately distinct from trainingLoad()'s fatigue values in Training.ts: fatigue is the
 * persisted careerFatigue authority and must not be inflated just to make the workload badge move.
 * This weight exists solely to feed classifyDailyLoad/dailyWorkloadScore.
 */
const WORKLOAD_WEIGHT_BY_INTENSITY: Record<TrainingIntensity, number> = { light: 10, normal: 40, high: 70 }

/**
 * Canonical daily workload score for one scheduled session, used by the calendar and Load
 * Management calculators (see dailyScheduledLoad in ScheduledTrainingEngine.ts) — the single
 * source of truth for workload classification, distinct from persisted careerFatigue.
 *
 * Scales with intensity and session duration, and is further scaled by the definition's
 * fatigueMultiplier so higher-intensity/longer/harder-on-the-body sessions escalate the daily
 * status faster, while recovery definitions (fatigueMultiplier <= 0) contribute near zero.
 */
export function dailyWorkloadScore(intensity: TrainingIntensity, durationMinutes: number, fatigueMultiplier: number): number {
  const effectiveMultiplier = Math.max(0.1, fatigueMultiplier)
  return WORKLOAD_WEIGHT_BY_INTENSITY[intensity] * (durationMinutes / 60) * effectiveMultiplier
}

/** Thresholds are on total daily workload score for a day/scope. Bounded, deterministic. */
const HIGH_THRESHOLD = 80
const VERY_HIGH_THRESHOLD = 120

export function classifyDailyLoad(totalLoad: number): DailyLoadStatus {
  if (totalLoad >= VERY_HIGH_THRESHOLD) return 'VERY_HIGH'
  if (totalLoad >= HIGH_THRESHOLD) return 'HIGH'
  return 'OK'
}
