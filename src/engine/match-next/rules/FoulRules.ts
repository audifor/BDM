import type { MatchNextClockRules } from '../setup'

export interface ResolvedFoulRules {
  readonly personalFoulLimit: number
  readonly teamFoulPenaltyFrom: number
  readonly teamFoulOneAndOneFrom: number | null
}

/**
 * Used only when the setup carries no competition-resolved foul rules (hand-built test setups): the FIBA numbers.
 * Real games get their rules from Competition.rules.gameFormat.foulRules through prepareMatchSetup.
 */
export const FALLBACK_FOUL_RULES: ResolvedFoulRules = Object.freeze({ personalFoulLimit: 5, teamFoulPenaltyFrom: 5, teamFoulOneAndOneFrom: null })

export function resolveFoulRules(rules: MatchNextClockRules): ResolvedFoulRules {
  const declared = rules.foulRules
  if (declared === undefined) return FALLBACK_FOUL_RULES
  return { personalFoulLimit: declared.personalFoulLimit, teamFoulPenaltyFrom: declared.teamFoulPenaltyFrom, teamFoulOneAndOneFrom: declared.teamFoulOneAndOneFrom ?? null }
}

/** Bonus state of the FOULING team after `teamFoulsInPeriod` team fouls: the opponent shoots for non-shooting fouls. */
export function bonusStateFor(foulRules: ResolvedFoulRules, teamFoulsInPeriod: number): 'NONE' | 'ONE_AND_ONE' | 'PENALTY' {
  if (teamFoulsInPeriod >= foulRules.teamFoulPenaltyFrom) return 'PENALTY'
  if (foulRules.teamFoulOneAndOneFrom !== null && teamFoulsInPeriod >= foulRules.teamFoulOneAndOneFrom) return 'ONE_AND_ONE'
  return 'NONE'
}
