/**
 * Aggregate box-score statistics over full seeded games, used only to show that a targeted engine
 * correction did not move unrelated gameplay (points, shooting, turnovers, pace) beyond noise.
 */

import { createMatchDemo } from '../dev/matchDemoBootstrap'

export interface GameStatsSummary {
  readonly games: number
  readonly meanTotalPoints: number
  readonly meanFieldGoalAttempts: number
  readonly fieldGoalPct: number
  readonly threePointAttemptShare: number
  readonly meanTurnovers: number
  readonly meanReboundsPerMiss: number
  readonly meanEngineSteps: number
  readonly meanFouls: number
}

export function runGameStats(seeds: readonly number[]): GameStatsSummary {
  let points = 0
  let attempts = 0
  let made = 0
  let threes = 0
  let turnovers = 0
  let rebounds = 0
  let misses = 0
  let steps = 0
  let fouls = 0
  for (const seed of seeds) {
    const demo = createMatchDemo(seed)
    let guard = 0
    while (!demo.session.state.isComplete && guard < 4000) {
      demo.step()
      guard += 1
    }
    steps += guard
    const state = demo.session.state
    points += state.homeScore + state.awayScore
    for (const event of state.events) {
      if (event.type === 'shotMade') {
        attempts += 1
        made += 1
        if (event.points === 3) threes += 1
      } else if (event.type === 'shotMissed') {
        attempts += 1
        misses += 1
        if (event.shotZone === 'threePoint') threes += 1
      } else if (event.type === 'turnover') turnovers += 1
      else if (event.type === 'rebound') rebounds += 1
      else if (event.type === 'foul') fouls += 1
    }
  }
  const n = seeds.length
  const r = (v: number): number => Number(v.toFixed(2))
  return {
    games: n,
    meanTotalPoints: r(points / n),
    meanFieldGoalAttempts: r(attempts / n),
    fieldGoalPct: r(made / Math.max(1, attempts)),
    threePointAttemptShare: r(threes / Math.max(1, attempts)),
    meanTurnovers: r(turnovers / n),
    meanReboundsPerMiss: r(rebounds / Math.max(1, misses)),
    meanEngineSteps: r(steps / n),
    meanFouls: r(fouls / n),
  }
}
