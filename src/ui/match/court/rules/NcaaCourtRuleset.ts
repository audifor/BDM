import type { CourtRuleset } from './CourtRuleset'

const FT = 0.3048

/** NCAA men's — 94' × 50', 12' lane, 22'1.75" three. */
export const NCAA_MEN_COURT_RULESET: CourtRuleset = {
  id: 'NCAA_M',
  length: 94 * FT,
  width: 50 * FT,
  hoopOffset: 5.25 * FT,
  backboardOffset: 4 * FT,
  keyDepth: 19 * FT,
  keyWidth: 12 * FT,
  circleRadius: 6 * FT,
  threePointRadius: (22 + 1.75 / 12) * FT,
  cornerThreeInset: 3.33 * FT,
  backboardWidth: 6 * FT,
  rimRadius: 0.75 * FT,
  restrictedAreaRadius: 4 * FT,
  runoffHintMin: 1.8,
  hasBenchHashMarks: true,
}

/** Alias for index consumers. */
export const NCAA_M_COURT_RULESET = NCAA_MEN_COURT_RULESET

/** NCAA women's three-point (~20'9"). */
export const NCAA_W_COURT_RULESET: CourtRuleset = {
  ...NCAA_MEN_COURT_RULESET,
  id: 'NCAA_W',
  threePointRadius: 20.75 * FT,
}

/** High-school approximate — closer arc, tighter runoff hint. */
export const HIGH_SCHOOL_COURT_RULESET: CourtRuleset = {
  ...NCAA_MEN_COURT_RULESET,
  id: 'HIGH_SCHOOL',
  threePointRadius: 19.75 * FT,
  runoffHintMin: 1.2,
  hasBenchHashMarks: false,
}
