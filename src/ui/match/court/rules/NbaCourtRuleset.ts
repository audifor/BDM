import type { CourtRuleset } from './CourtRuleset'

const FT = 0.3048

/** NBA 94' × 50' converted to metres. */
export const NBA_COURT_RULESET: CourtRuleset = {
  id: 'NBA',
  length: 94 * FT,
  width: 50 * FT,
  hoopOffset: 5.25 * FT,
  backboardOffset: 4 * FT,
  keyDepth: 19 * FT,
  keyWidth: 16 * FT,
  circleRadius: 6 * FT,
  threePointRadius: 23.75 * FT,
  cornerThreeInset: 3 * FT,
  backboardWidth: 6 * FT,
  rimRadius: 0.75 * FT,
  restrictedAreaRadius: 4 * FT,
  runoffHintMin: 2.4,
  hasBenchHashMarks: true,
}

/** WNBA — NBA footprint with women's three-point distance. */
export const WNBA_COURT_RULESET: CourtRuleset = {
  ...NBA_COURT_RULESET,
  id: 'WNBA',
  threePointRadius: 22.15 * FT,
}
