export type StandingsTiebreaker = 'wins' | 'pointDifference' | 'pointsFor' | 'teamId'
export const DEFAULT_RETENTION_WINDOW_DAYS_BEFORE_EXPIRY = 365

/**
 * Generic basketball game-clock/format rules, owned by the competition itself.
 *
 * These fields MUST be resolved per-competition, never inferred from an ecosystem/brand label
 * (see Issue #9's "CRITICAL RULES CORRECTION"): e.g. NCAA men's basketball uses 2x20-minute
 * halves while NCAA women's basketball uses 4x10-minute quarters, so "NCAA-like" alone is not
 * enough to determine period structure. Two competitions inside the same broader ecosystem may
 * therefore declare entirely different GameFormatRules.
 */
/** Personal and team foul rules, owned by the competition (BT3F/G). Resolved per competition, never from a brand label. */
export interface FoulRules {
  /** A player who commits this many personal fouls is out of the game. */
  readonly personalFoulLimit: number
  /** From this many team fouls in a period every further non-shooting defensive foul sends the opponent to the line (2 shots). */
  readonly teamFoulPenaltyFrom: number
  /** Optional one-and-one stage (NCAA men): from this many team fouls, before the penalty, non-shooting fouls give a one-and-one. */
  readonly teamFoulOneAndOneFrom?: number | null
}

export interface GameFormatRules {
  /** Number of regulation periods (e.g. 2 for halves, 4 for quarters). */
  readonly periodCount: number
  /** Length of one regulation period, in minutes. */
  readonly periodMinutes: number
  /** Length of one overtime period, in minutes. */
  readonly overtimeMinutes: number
  readonly shotClockSeconds?: number
  readonly offensiveReboundShotClockSeconds?: number | null
  /** Stop the game clock after a made basket in the final period at or below this time. Null keeps it running. */
  readonly madeBasketClockStopUnderSecondsInFinalPeriod?: number | null
  readonly madeBasketClockStopUnderSecondsInOtherPeriods?: number | null
  /** Open a substitution window after a made basket in the final period at or below this time. Independent of clock stop. */
  readonly madeBasketSubstitutionUnderSecondsInFinalPeriod?: number | null
  readonly madeBasketSubstitutionUnderSecondsInOtherPeriods?: number | null
  readonly madeBasketSubstitutionEligibleTeam?: 'both' | 'nonScoring'
  readonly clockStopReasons?: readonly ('outOfBounds' | 'other' | 'shotClockViolation')[]
  /** Dead-ball causes that open a legal substitution window. Made-basket windows have their own threshold above. */
  readonly substitutionOpportunityReasons?: readonly ('outOfBounds' | 'other' | 'shotClockViolation')[]
  /** When a stopped clock resumes after an inbound. */
  readonly clockRestartOnInbound?: 'release' | 'receive'
  readonly foulRules?: FoulRules
}

export interface CompetitionRules {
  readonly format: 'leagueRoundRobin'
  readonly schedule: {
    readonly meetingsPerPair: number
    readonly homeAwayBalance: 'equal'
  }
  readonly standings: {
    readonly tiebreakers: readonly StandingsTiebreaker[]
  }
  readonly completion: 'allScheduledGamesCompleted'
  readonly champion: 'standingsLeader'
  readonly gameFormat: GameFormatRules
  /** Professional-contract retention eligibility; independent of planning horizons. */
  readonly retentionWindowDaysBeforeExpiry?: number
  readonly playerAgeEligibility?: { readonly minimumAge?: number; readonly maximumAge?: number; readonly referenceDate: 'competitionDate' }
}

/**
 * Named, illustrative GameFormatRules presets for common real-world competitions.
 *
 * These are plain data, never read by kind/brand/gender at runtime — engine and UI code must
 * always resolve the *actual* CompetitionRules.gameFormat of the specific competition in play,
 * never branch on "this looks like an NCAA/NBA/WNBA competition" (see Issue #9 correction).
 * They exist only so callers constructing a CompetitionRules do not have to restate the same
 * well-known figures inline.
 */
const COMMON_SUBSTITUTION_OPPORTUNITIES = Object.freeze(['outOfBounds', 'other', 'shotClockViolation'] as const)
const COMMON_CLOCK_STOP_REASONS = Object.freeze(['outOfBounds', 'other', 'shotClockViolation'] as const)
export const FIBA_FOUL_RULES: FoulRules = Object.freeze({ personalFoulLimit: 5, teamFoulPenaltyFrom: 5, teamFoulOneAndOneFrom: null })
export const NBA_FOUL_RULES: FoulRules = Object.freeze({ personalFoulLimit: 6, teamFoulPenaltyFrom: 5, teamFoulOneAndOneFrom: null })
export const WNBA_FOUL_RULES: FoulRules = Object.freeze({ personalFoulLimit: 6, teamFoulPenaltyFrom: 4, teamFoulOneAndOneFrom: null })
export const NCAA_MEN_FOUL_RULES: FoulRules = Object.freeze({ personalFoulLimit: 5, teamFoulPenaltyFrom: 10, teamFoulOneAndOneFrom: 7 })
export const NCAA_WOMEN_FOUL_RULES: FoulRules = Object.freeze({ personalFoulLimit: 5, teamFoulPenaltyFrom: 5, teamFoulOneAndOneFrom: null })
export const NCAA_MEN_GAME_FORMAT: GameFormatRules = Object.freeze({ periodCount: 2, periodMinutes: 20, overtimeMinutes: 5, shotClockSeconds: 30, offensiveReboundShotClockSeconds: 20, madeBasketClockStopUnderSecondsInFinalPeriod: 60, madeBasketSubstitutionUnderSecondsInFinalPeriod: 60, clockStopReasons: COMMON_CLOCK_STOP_REASONS, substitutionOpportunityReasons: COMMON_SUBSTITUTION_OPPORTUNITIES, clockRestartOnInbound: 'receive', foulRules: NCAA_MEN_FOUL_RULES })
export const NCAA_WOMEN_GAME_FORMAT: GameFormatRules = Object.freeze({ periodCount: 4, periodMinutes: 10, overtimeMinutes: 5, shotClockSeconds: 30, offensiveReboundShotClockSeconds: 20, madeBasketClockStopUnderSecondsInFinalPeriod: 60, madeBasketSubstitutionUnderSecondsInFinalPeriod: 60, clockStopReasons: COMMON_CLOCK_STOP_REASONS, substitutionOpportunityReasons: COMMON_SUBSTITUTION_OPPORTUNITIES, clockRestartOnInbound: 'receive', foulRules: NCAA_WOMEN_FOUL_RULES })
export const NBA_GAME_FORMAT: GameFormatRules = Object.freeze({ periodCount: 4, periodMinutes: 12, overtimeMinutes: 5, shotClockSeconds: 24, offensiveReboundShotClockSeconds: 14, madeBasketClockStopUnderSecondsInFinalPeriod: 120, madeBasketClockStopUnderSecondsInOtherPeriods: 60, madeBasketSubstitutionUnderSecondsInFinalPeriod: 120, madeBasketSubstitutionUnderSecondsInOtherPeriods: 60, clockStopReasons: COMMON_CLOCK_STOP_REASONS, substitutionOpportunityReasons: COMMON_SUBSTITUTION_OPPORTUNITIES, clockRestartOnInbound: 'receive', foulRules: NBA_FOUL_RULES })
export const WNBA_GAME_FORMAT: GameFormatRules = Object.freeze({ periodCount: 4, periodMinutes: 10, overtimeMinutes: 5, shotClockSeconds: 24, offensiveReboundShotClockSeconds: 14, madeBasketClockStopUnderSecondsInFinalPeriod: 60, madeBasketSubstitutionUnderSecondsInFinalPeriod: 60, clockStopReasons: COMMON_CLOCK_STOP_REASONS, substitutionOpportunityReasons: COMMON_SUBSTITUTION_OPPORTUNITIES, clockRestartOnInbound: 'receive', foulRules: WNBA_FOUL_RULES })
export const FIBA_GAME_FORMAT: GameFormatRules = Object.freeze({ periodCount: 4, periodMinutes: 10, overtimeMinutes: 5, shotClockSeconds: 24, offensiveReboundShotClockSeconds: 14, madeBasketClockStopUnderSecondsInFinalPeriod: 120, madeBasketClockStopUnderSecondsInOtherPeriods: null, madeBasketSubstitutionUnderSecondsInFinalPeriod: 120, madeBasketSubstitutionUnderSecondsInOtherPeriods: null, madeBasketSubstitutionEligibleTeam: 'nonScoring', clockStopReasons: COMMON_CLOCK_STOP_REASONS, substitutionOpportunityReasons: COMMON_SUBSTITUTION_OPPORTUNITIES, clockRestartOnInbound: 'receive', foulRules: FIBA_FOUL_RULES })

export const defaultLeagueCompetitionRules: CompetitionRules = Object.freeze({
  format: 'leagueRoundRobin',
  schedule: Object.freeze({ meetingsPerPair: 2, homeAwayBalance: 'equal' }),
  standings: Object.freeze({ tiebreakers: Object.freeze(['wins', 'pointDifference', 'pointsFor', 'teamId'] as const) }),
  completion: 'allScheduledGamesCompleted',
  champion: 'standingsLeader',
  gameFormat: FIBA_GAME_FORMAT,
  retentionWindowDaysBeforeExpiry: DEFAULT_RETENTION_WINDOW_DAYS_BEFORE_EXPIRY,
})

export function createCompetitionRules(input: CompetitionRules): CompetitionRules {
  if (input.format !== 'leagueRoundRobin') throw new RangeError('Competition format is unsupported')
  if (!Number.isInteger(input.schedule.meetingsPerPair) || input.schedule.meetingsPerPair <= 0) throw new RangeError('Competition meetings per pair must be a positive integer')
  if (input.schedule.homeAwayBalance !== 'equal') throw new RangeError('Competition home/away balance is unsupported')
  if (input.schedule.meetingsPerPair % 2 !== 0) throw new RangeError('Equal home/away balance requires an even number of meetings per pair')
  if (input.completion !== 'allScheduledGamesCompleted') throw new RangeError('Competition completion rule is unsupported')
  if (input.champion !== 'standingsLeader') throw new RangeError('Competition champion rule is unsupported')
  const retentionWindowDaysBeforeExpiry = input.retentionWindowDaysBeforeExpiry ?? DEFAULT_RETENTION_WINDOW_DAYS_BEFORE_EXPIRY
  if (!Number.isSafeInteger(retentionWindowDaysBeforeExpiry) || retentionWindowDaysBeforeExpiry < 1) throw new RangeError('Competition retention window must be a positive whole number of days')
  const tiebreakers = [...input.standings.tiebreakers]
  if (tiebreakers.length === 0 || new Set(tiebreakers).size !== tiebreakers.length || tiebreakers.some((value) => !['wins', 'pointDifference', 'pointsFor', 'teamId'].includes(value))) throw new RangeError('Competition standings tiebreakers are invalid')
  if (tiebreakers[tiebreakers.length - 1] !== 'teamId') throw new RangeError('Competition standings must end with deterministic teamId tiebreaker')
  const gameFormat = input.gameFormat ?? FIBA_GAME_FORMAT
  if (!Number.isInteger(gameFormat.periodCount) || gameFormat.periodCount <= 0) throw new RangeError('Competition game format period count must be a positive integer')
  if (!Number.isFinite(gameFormat.periodMinutes) || gameFormat.periodMinutes <= 0) throw new RangeError('Competition game format period minutes must be positive')
  if (!Number.isFinite(gameFormat.overtimeMinutes) || gameFormat.overtimeMinutes <= 0) throw new RangeError('Competition game format overtime minutes must be positive')
  const madeBasketClockStop = gameFormat.madeBasketClockStopUnderSecondsInFinalPeriod ?? null
  if (madeBasketClockStop !== null && (!Number.isSafeInteger(madeBasketClockStop) || madeBasketClockStop < 0)) throw new RangeError('Competition made-basket clock-stop threshold must be null or a non-negative integer')
  const madeBasketSubstitution = gameFormat.madeBasketSubstitutionUnderSecondsInFinalPeriod === undefined ? madeBasketClockStop : gameFormat.madeBasketSubstitutionUnderSecondsInFinalPeriod
  if (madeBasketSubstitution !== null && (!Number.isSafeInteger(madeBasketSubstitution) || madeBasketSubstitution < 0)) throw new RangeError('Competition made-basket substitution threshold must be null or a non-negative integer')
  const madeBasketClockStopOtherPeriods = gameFormat.madeBasketClockStopUnderSecondsInOtherPeriods ?? null
  if (madeBasketClockStopOtherPeriods !== null && (!Number.isSafeInteger(madeBasketClockStopOtherPeriods) || madeBasketClockStopOtherPeriods < 0)) throw new RangeError('Competition other-period made-basket clock-stop threshold must be null or a non-negative integer')
  const madeBasketSubstitutionOtherPeriods = gameFormat.madeBasketSubstitutionUnderSecondsInOtherPeriods === undefined ? madeBasketClockStopOtherPeriods : gameFormat.madeBasketSubstitutionUnderSecondsInOtherPeriods
  if (madeBasketSubstitutionOtherPeriods !== null && (!Number.isSafeInteger(madeBasketSubstitutionOtherPeriods) || madeBasketSubstitutionOtherPeriods < 0)) throw new RangeError('Competition other-period made-basket substitution threshold must be null or a non-negative integer')
  const madeBasketSubstitutionEligibleTeam = gameFormat.madeBasketSubstitutionEligibleTeam ?? 'both'
  if (madeBasketSubstitutionEligibleTeam !== 'both' && madeBasketSubstitutionEligibleTeam !== 'nonScoring') throw new RangeError('Competition made-basket substitution team rule is invalid')
  const substitutionOpportunityReasons = [...(gameFormat.substitutionOpportunityReasons ?? COMMON_SUBSTITUTION_OPPORTUNITIES)]
  if (new Set(substitutionOpportunityReasons).size !== substitutionOpportunityReasons.length || substitutionOpportunityReasons.some((reason) => !['outOfBounds', 'other', 'shotClockViolation'].includes(reason))) throw new RangeError('Competition substitution opportunity reasons are invalid')
  const clockStopReasons = [...(gameFormat.clockStopReasons ?? COMMON_CLOCK_STOP_REASONS)]
  if (new Set(clockStopReasons).size !== clockStopReasons.length || clockStopReasons.some((reason) => !['outOfBounds', 'other', 'shotClockViolation'].includes(reason))) throw new RangeError('Competition clock stop reasons are invalid')
  const clockRestartOnInbound = gameFormat.clockRestartOnInbound ?? 'receive'
  if (clockRestartOnInbound !== 'release' && clockRestartOnInbound !== 'receive') throw new RangeError('Competition inbound clock restart rule is invalid')
  const foulRules = gameFormat.foulRules ?? FIBA_FOUL_RULES
  if (!Number.isSafeInteger(foulRules.personalFoulLimit) || foulRules.personalFoulLimit <= 0) throw new RangeError('Competition personal foul limit must be a positive integer')
  if (!Number.isSafeInteger(foulRules.teamFoulPenaltyFrom) || foulRules.teamFoulPenaltyFrom <= 0) throw new RangeError('Competition team foul penalty threshold must be a positive integer')
  const oneAndOneFrom = foulRules.teamFoulOneAndOneFrom ?? null
  if (oneAndOneFrom !== null && (!Number.isSafeInteger(oneAndOneFrom) || oneAndOneFrom <= 0 || oneAndOneFrom >= foulRules.teamFoulPenaltyFrom)) throw new RangeError('Competition one-and-one threshold must be null or below the penalty threshold')
  const shotClockSeconds = gameFormat.shotClockSeconds ?? 24
  if (!Number.isSafeInteger(shotClockSeconds) || shotClockSeconds <= 0) throw new RangeError('Competition shot clock must be a positive integer')
  const offensiveReboundShotClockSeconds = gameFormat.offensiveReboundShotClockSeconds ?? null
  if (offensiveReboundShotClockSeconds !== null && (!Number.isSafeInteger(offensiveReboundShotClockSeconds) || offensiveReboundShotClockSeconds <= 0)) throw new RangeError('Competition offensive-rebound shot-clock reset must be null or a positive integer')
  const age = input.playerAgeEligibility
  if (age && (age.referenceDate !== 'competitionDate' || age.minimumAge !== undefined && (!Number.isInteger(age.minimumAge) || age.minimumAge < 0) || age.maximumAge !== undefined && (!Number.isInteger(age.maximumAge) || age.maximumAge < 0) || age.minimumAge !== undefined && age.maximumAge !== undefined && age.minimumAge > age.maximumAge)) throw new RangeError('Competition player age eligibility is invalid')
  return Object.freeze({ format: input.format, schedule: Object.freeze({ meetingsPerPair: input.schedule.meetingsPerPair, homeAwayBalance: input.schedule.homeAwayBalance }), standings: Object.freeze({ tiebreakers: Object.freeze(tiebreakers) }), completion: input.completion, champion: input.champion, retentionWindowDaysBeforeExpiry, ...(age ? { playerAgeEligibility: Object.freeze({ ...age }) } : {}), gameFormat: Object.freeze({ periodCount: gameFormat.periodCount, periodMinutes: gameFormat.periodMinutes, overtimeMinutes: gameFormat.overtimeMinutes, shotClockSeconds, offensiveReboundShotClockSeconds, madeBasketClockStopUnderSecondsInFinalPeriod: madeBasketClockStop, madeBasketClockStopUnderSecondsInOtherPeriods: madeBasketClockStopOtherPeriods, madeBasketSubstitutionUnderSecondsInFinalPeriod: madeBasketSubstitution, madeBasketSubstitutionUnderSecondsInOtherPeriods: madeBasketSubstitutionOtherPeriods, madeBasketSubstitutionEligibleTeam, clockStopReasons: Object.freeze(clockStopReasons), substitutionOpportunityReasons: Object.freeze(substitutionOpportunityReasons), clockRestartOnInbound, foulRules: Object.freeze({ personalFoulLimit: foulRules.personalFoulLimit, teamFoulPenaltyFrom: foulRules.teamFoulPenaltyFrom, teamFoulOneAndOneFrom: oneAndOneFrom }) }) })
}
