/** PLAYER 2.4-D5B conservative initial crossover execution bounds.
 * No other move receives an inferred effect from this single-family gate.
 */
export const CROSSOVER_RULES_D5B = Object.freeze({
  minimumDefenderGapMeters: 0.6,
  maximumDefenderGapMeters: 2.2,
  maximumFootworkTicks: 6,
  defenderSpeedFactor: 0.83,
  defenderAccelerationFactor: 0.83,
})
