/**
 * Model parameters of the offensive decision model that are physical / tactical calibrations rather than rules.
 * They live in one place so the robustness audit (BT3A) can sweep them: a well-behaved model answers a modest change
 * with a modest change. `withTuning` is for audits and tests only; the engine itself never mutates the values.
 */
export interface MatchNextTuning {
  /** Ticks (0.1 s) a defender needs to react to a pass before closing out: the defensive-quality knob of the audit. */
  readonly closeoutReactionTicks: number
  /** Points a half-court possession is worth when the offense keeps working. */
  readonly continuationValuePoints: number
  /** Value of a ball screen before player quality (option value of keeping every read open). */
  readonly screenBaseValuePoints: number
  /** Softness of the choice between options: 0 = always the best, larger = closer options are chosen more often. */
  readonly decisionTemperaturePoints: number
}

export const DEFAULT_MATCH_NEXT_TUNING: MatchNextTuning = Object.freeze({
  closeoutReactionTicks: 2,
  continuationValuePoints: 0.98,
  screenBaseValuePoints: 1.25,
  decisionTemperaturePoints: 0.15,
})

let active: MatchNextTuning = DEFAULT_MATCH_NEXT_TUNING

export function tuning(): MatchNextTuning {
  return active
}

export function withTuning<T>(overrides: Partial<MatchNextTuning>, run: () => T): T {
  const previous = active
  active = Object.freeze({ ...previous, ...overrides })
  try {
    return run()
  } finally {
    active = previous
  }
}
