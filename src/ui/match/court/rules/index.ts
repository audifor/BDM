import type { CourtRuleset, CourtRulesetId } from './CourtRuleset'
import { FIBA_COURT_RULESET } from './FibaCourtRuleset'
import { NBA_COURT_RULESET, WNBA_COURT_RULESET } from './NbaCourtRuleset'
import {
  HIGH_SCHOOL_COURT_RULESET,
  NCAA_MEN_COURT_RULESET,
  NCAA_W_COURT_RULESET,
} from './NcaaCourtRuleset'

export type { CourtRuleset, CourtRulesetId } from './CourtRuleset'
export { regulationKindToRulesetId, rulesetToRegulation } from './CourtRuleset'
export { FIBA_COURT_RULESET } from './FibaCourtRuleset'
export { NBA_COURT_RULESET, WNBA_COURT_RULESET } from './NbaCourtRuleset'
export {
  HIGH_SCHOOL_COURT_RULESET,
  NCAA_MEN_COURT_RULESET,
  NCAA_W_COURT_RULESET,
  NCAA_M_COURT_RULESET,
} from './NcaaCourtRuleset'

const RULESETS: Readonly<Record<CourtRulesetId, CourtRuleset>> = {
  FIBA: FIBA_COURT_RULESET,
  NBA: NBA_COURT_RULESET,
  WNBA: WNBA_COURT_RULESET,
  NCAA_M: NCAA_MEN_COURT_RULESET,
  NCAA_W: NCAA_W_COURT_RULESET,
  HIGH_SCHOOL: HIGH_SCHOOL_COURT_RULESET,
}

export function getCourtRuleset(id: CourtRulesetId): CourtRuleset {
  return RULESETS[id]
}
