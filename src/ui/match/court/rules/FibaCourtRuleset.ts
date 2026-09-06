import type { CourtRuleset } from './CourtRuleset'

/** Official FIBA court — 28 × 15 m. */
export const FIBA_COURT_RULESET: CourtRuleset = {
  id: 'FIBA',
  length: 28,
  width: 15,
  hoopOffset: 1.575,
  backboardOffset: 1.2,
  keyDepth: 5.8,
  keyWidth: 4.9,
  circleRadius: 1.8,
  threePointRadius: 6.75,
  cornerThreeInset: 0.9,
  backboardWidth: 1.8,
  rimRadius: 0.225,
  restrictedAreaRadius: 1.25,
  runoffHintMin: 2.0,
  hasBenchHashMarks: false,
}
