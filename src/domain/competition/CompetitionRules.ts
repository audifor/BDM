export type StandingsTiebreaker = 'wins' | 'pointDifference' | 'pointsFor' | 'teamId'

/**
 * Generic basketball game-clock/format rules, owned by the competition itself.
 *
 * These fields MUST be resolved per-competition, never inferred from an ecosystem/brand label
 * (see Issue #9's "CRITICAL RULES CORRECTION"): e.g. NCAA men's basketball uses 2x20-minute
 * halves while NCAA women's basketball uses 4x10-minute quarters, so "NCAA-like" alone is not
 * enough to determine period structure. Two competitions inside the same broader ecosystem may
 * therefore declare entirely different GameFormatRules.
 */
export interface GameFormatRules {
  /** Number of regulation periods (e.g. 2 for halves, 4 for quarters). */
  readonly periodCount: number
  /** Length of one regulation period, in minutes. */
  readonly periodMinutes: number
  /** Length of one overtime period, in minutes. */
  readonly overtimeMinutes: number
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
export const NCAA_MEN_GAME_FORMAT: GameFormatRules = Object.freeze({ periodCount: 2, periodMinutes: 20, overtimeMinutes: 5 })
export const NCAA_WOMEN_GAME_FORMAT: GameFormatRules = Object.freeze({ periodCount: 4, periodMinutes: 10, overtimeMinutes: 5 })
export const NBA_GAME_FORMAT: GameFormatRules = Object.freeze({ periodCount: 4, periodMinutes: 12, overtimeMinutes: 5 })
export const WNBA_GAME_FORMAT: GameFormatRules = Object.freeze({ periodCount: 4, periodMinutes: 10, overtimeMinutes: 5 })
export const FIBA_GAME_FORMAT: GameFormatRules = Object.freeze({ periodCount: 4, periodMinutes: 10, overtimeMinutes: 5 })

export const defaultLeagueCompetitionRules: CompetitionRules = Object.freeze({
  format: 'leagueRoundRobin',
  schedule: Object.freeze({ meetingsPerPair: 2, homeAwayBalance: 'equal' }),
  standings: Object.freeze({ tiebreakers: Object.freeze(['wins', 'pointDifference', 'pointsFor', 'teamId'] as const) }),
  completion: 'allScheduledGamesCompleted',
  champion: 'standingsLeader',
  gameFormat: FIBA_GAME_FORMAT,
})

export function createCompetitionRules(input: CompetitionRules): CompetitionRules {
  if (input.format !== 'leagueRoundRobin') throw new RangeError('Competition format is unsupported')
  if (!Number.isInteger(input.schedule.meetingsPerPair) || input.schedule.meetingsPerPair <= 0) throw new RangeError('Competition meetings per pair must be a positive integer')
  if (input.schedule.homeAwayBalance !== 'equal') throw new RangeError('Competition home/away balance is unsupported')
  if (input.schedule.meetingsPerPair % 2 !== 0) throw new RangeError('Equal home/away balance requires an even number of meetings per pair')
  if (input.completion !== 'allScheduledGamesCompleted') throw new RangeError('Competition completion rule is unsupported')
  if (input.champion !== 'standingsLeader') throw new RangeError('Competition champion rule is unsupported')
  const tiebreakers = [...input.standings.tiebreakers]
  if (tiebreakers.length === 0 || new Set(tiebreakers).size !== tiebreakers.length || tiebreakers.some((value) => !['wins', 'pointDifference', 'pointsFor', 'teamId'].includes(value))) throw new RangeError('Competition standings tiebreakers are invalid')
  if (tiebreakers[tiebreakers.length - 1] !== 'teamId') throw new RangeError('Competition standings must end with deterministic teamId tiebreaker')
  const gameFormat = input.gameFormat ?? FIBA_GAME_FORMAT
  if (!Number.isInteger(gameFormat.periodCount) || gameFormat.periodCount <= 0) throw new RangeError('Competition game format period count must be a positive integer')
  if (!Number.isFinite(gameFormat.periodMinutes) || gameFormat.periodMinutes <= 0) throw new RangeError('Competition game format period minutes must be positive')
  if (!Number.isFinite(gameFormat.overtimeMinutes) || gameFormat.overtimeMinutes <= 0) throw new RangeError('Competition game format overtime minutes must be positive')
  return Object.freeze({ format: input.format, schedule: Object.freeze({ meetingsPerPair: input.schedule.meetingsPerPair, homeAwayBalance: input.schedule.homeAwayBalance }), standings: Object.freeze({ tiebreakers: Object.freeze(tiebreakers) }), completion: input.completion, champion: input.champion, gameFormat: Object.freeze({ periodCount: gameFormat.periodCount, periodMinutes: gameFormat.periodMinutes, overtimeMinutes: gameFormat.overtimeMinutes }) })
}
