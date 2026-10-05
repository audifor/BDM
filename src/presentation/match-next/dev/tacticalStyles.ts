/**
 * BT5 visual validation: named coach identities the dev viewer can give a team (?homeStyle=fast&awayStyle=controlled), so the same
 * matchup and seed can be watched with only the bench changed. Dev-only presentation input; the engine sees an ordinary tactical plan.
 */
import type { MatchNextTacticalPlan } from '@/engine/match-next'

type Coach = NonNullable<MatchNextTacticalPlan['coach']>

export const TACTICAL_STYLES: Readonly<Record<string, Coach>> = {
  /** Coach A: fast, attacking, ball-screen heavy, pressure and blitz. */
  fast: {
    offense: { tempo: 0.9, ballMovement: -0.35, ballScreen: 0.95, offBall: 0.2, interior: -0.2, isolation: 0.35, crash: 0.25 },
    defense: { pressure: 0.9, help: 0.65, coverage: 'blitz', dropDepth: 0.3 }, adaptability: 40, tacticalKnowledge: 60,
  },
  /** Coach B: controlled, ball and player movement, conservative defense with a deep drop. */
  controlled: {
    offense: { tempo: -0.85, ballMovement: 0.85, ballScreen: 0.2, offBall: 0.9, interior: 0.15, isolation: 0.05, crash: 0.6 },
    defense: { pressure: 0.15, help: 0.75, coverage: 'drop', dropDepth: 0.85 }, adaptability: 35, tacticalKnowledge: 60,
  },
  /** Coach C: balanced and adaptive, switching. */
  balanced: {
    offense: { tempo: 0, ballMovement: 0, ballScreen: 0.5, offBall: 0.4, interior: 0, isolation: 0.25, crash: 0.4 },
    defense: { pressure: 0.5, help: 0.5, coverage: 'switch', dropDepth: 0.5 }, adaptability: 90, tacticalKnowledge: 85,
  },
  /** Interior: post touches and the offensive glass. */
  inside: {
    offense: { tempo: -0.2, ballMovement: 0.1, ballScreen: 0.3, offBall: 0.4, interior: 0.95, isolation: 0.15, crash: 0.85 },
    defense: { pressure: 0.4, help: 0.8, coverage: 'drop', dropDepth: 0.7 }, adaptability: 40, tacticalKnowledge: 60,
  },
  // BT6 visual validation: the balanced coach with one defensive instruction changed (the offense is the same), so a viewer compares only it.
  /** High ball pressure (arm's length, reaching, denying). */
  press: { offense: { tempo: 0, ballMovement: 0, ballScreen: 0.5, offBall: 0.4, interior: 0, isolation: 0.25, crash: 0.4 }, defense: { pressure: 0.95, help: 0.5, coverage: 'switch', dropDepth: 0.5 }, adaptability: 10, tacticalKnowledge: 30 },
  /** Low ball pressure (sagging, containing, conceding the shot). */
  sag: { offense: { tempo: 0, ballMovement: 0, ballScreen: 0.5, offBall: 0.4, interior: 0, isolation: 0.25, crash: 0.4 }, defense: { pressure: 0.05, help: 0.5, coverage: 'switch', dropDepth: 0.5 }, adaptability: 10, tacticalKnowledge: 30 },
  dropD: { offense: { tempo: 0, ballMovement: 0, ballScreen: 0.5, offBall: 0.4, interior: 0, isolation: 0.25, crash: 0.4 }, defense: { pressure: 0.5, help: 0.5, coverage: 'drop', dropDepth: 0.7 }, adaptability: 10, tacticalKnowledge: 30 },
  switchD: { offense: { tempo: 0, ballMovement: 0, ballScreen: 0.5, offBall: 0.4, interior: 0, isolation: 0.25, crash: 0.4 }, defense: { pressure: 0.5, help: 0.5, coverage: 'switch', dropDepth: 0.5 }, adaptability: 10, tacticalKnowledge: 30 },
  blitzD: { offense: { tempo: 0, ballMovement: 0, ballScreen: 0.5, offBall: 0.4, interior: 0, isolation: 0.25, crash: 0.4 }, defense: { pressure: 0.5, help: 0.5, coverage: 'blitz', dropDepth: 0.5 }, adaptability: 10, tacticalKnowledge: 30 },
  /** Aggressive help (early, high, with stunts) and stay-home help. */
  helpHigh: { offense: { tempo: 0, ballMovement: 0, ballScreen: 0.5, offBall: 0.4, interior: 0, isolation: 0.25, crash: 0.4 }, defense: { pressure: 0.5, help: 0.95, coverage: 'switch', dropDepth: 0.5 }, adaptability: 10, tacticalKnowledge: 30 },
  helpLow: { offense: { tempo: 0, ballMovement: 0, ballScreen: 0.5, offBall: 0.4, interior: 0, isolation: 0.25, crash: 0.4 }, defense: { pressure: 0.5, help: 0.05, coverage: 'switch', dropDepth: 0.5 }, adaptability: 10, tacticalKnowledge: 30 },
}

export function withStyle(plan: MatchNextTacticalPlan, style: string | undefined): MatchNextTacticalPlan {
  const coach = style === undefined ? undefined : TACTICAL_STYLES[style]
  return coach === undefined ? plan : { ...plan, coach }
}
