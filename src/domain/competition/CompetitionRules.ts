export type StandingsTiebreaker = 'wins' | 'pointDifference' | 'pointsFor' | 'teamId'

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
}

export const defaultLeagueCompetitionRules: CompetitionRules = Object.freeze({
  format: 'leagueRoundRobin',
  schedule: Object.freeze({ meetingsPerPair: 2, homeAwayBalance: 'equal' }),
  standings: Object.freeze({ tiebreakers: Object.freeze(['wins', 'pointDifference', 'pointsFor', 'teamId'] as const) }),
  completion: 'allScheduledGamesCompleted',
  champion: 'standingsLeader',
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
  return Object.freeze({ format: input.format, schedule: Object.freeze({ meetingsPerPair: input.schedule.meetingsPerPair, homeAwayBalance: input.schedule.homeAwayBalance }), standings: Object.freeze({ tiebreakers: Object.freeze(tiebreakers) }), completion: input.completion, champion: input.champion })
}
