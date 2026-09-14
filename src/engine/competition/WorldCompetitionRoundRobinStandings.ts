import type { WorldCompetitionRoundRobinPlanV1 } from './WorldCompetitionRoundRobin'

export type WorldCompetitionStandingsTiebreakerV1 = 'wins' | 'pointDifference' | 'pointsFor' | 'entryId'

export interface WorldCompetitionRoundRobinResultV1 {
  readonly fixtureId: string
  readonly homeScore: number
  readonly awayScore: number
}

export interface WorldCompetitionRoundRobinStandingV1 {
  readonly competitionSeasonEntryId: string
  readonly played: number
  readonly wins: number
  readonly losses: number
  readonly pointsFor: number
  readonly pointsAgainst: number
  readonly pointDifference: number
}

export interface WorldCompetitionRankedStandingV1 extends WorldCompetitionRoundRobinStandingV1 {
  readonly rank: number
}

/**
 * Computes objective table metrics only. Ranking policy must come from explicit caller/B04 rules;
 * this layer deliberately does not guess competition tiebreak semantics.
 */
export function computeWorldCompetitionRoundRobinStandingsV1(
  plan: WorldCompetitionRoundRobinPlanV1,
  results: readonly WorldCompetitionRoundRobinResultV1[],
): readonly WorldCompetitionRoundRobinStandingV1[] {
  const fixturesById = new Map(plan.fixtures.map((fixture) => [fixture.fixtureId, fixture] as const))
  const resultIds = new Set<string>()
  const entryIds = new Set<string>()
  for (const fixture of plan.fixtures) {
    entryIds.add(fixture.homeEntryId)
    entryIds.add(fixture.awayEntryId)
  }

  const mutable = new Map<string, { played: number; wins: number; losses: number; pointsFor: number; pointsAgainst: number }>()
  for (const entryId of entryIds) mutable.set(entryId, { played: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 })

  for (const result of results) {
    if (!resultIds.add(result.fixtureId)) throw new Error(`Duplicate round-robin result: ${result.fixtureId}`)
    const fixture = fixturesById.get(result.fixtureId)
    if (fixture === undefined) throw new Error(`Round-robin result references unknown fixture: ${result.fixtureId}`)
    validateScore(result.homeScore, `${result.fixtureId} homeScore`)
    validateScore(result.awayScore, `${result.fixtureId} awayScore`)
    if (result.homeScore === result.awayScore) throw new Error(`Completed basketball fixture cannot be tied: ${result.fixtureId}`)

    const home = mutable.get(fixture.homeEntryId)!
    const away = mutable.get(fixture.awayEntryId)!
    home.played += 1
    away.played += 1
    home.pointsFor += result.homeScore
    home.pointsAgainst += result.awayScore
    away.pointsFor += result.awayScore
    away.pointsAgainst += result.homeScore
    if (result.homeScore > result.awayScore) {
      home.wins += 1
      away.losses += 1
    } else {
      away.wins += 1
      home.losses += 1
    }
  }

  return Object.freeze([...mutable.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([competitionSeasonEntryId, row]) => Object.freeze({
      competitionSeasonEntryId,
      played: row.played,
      wins: row.wins,
      losses: row.losses,
      pointsFor: row.pointsFor,
      pointsAgainst: row.pointsAgainst,
      pointDifference: row.pointsFor - row.pointsAgainst,
    })))
}

/** Ranks a computed table only from caller-supplied, explicit tiebreak semantics. */
export function rankWorldCompetitionRoundRobinStandingsV1(
  standings: readonly WorldCompetitionRoundRobinStandingV1[],
  tiebreakers: readonly WorldCompetitionStandingsTiebreakerV1[],
): readonly WorldCompetitionRankedStandingV1[] {
  validateTiebreakers(tiebreakers)
  const entryIds = standings.map((row) => row.competitionSeasonEntryId)
  if (new Set(entryIds).size !== entryIds.length) throw new Error('Duplicate competition entry in standings')

  const ordered = [...standings].sort((left, right) => {
    for (const tiebreaker of tiebreakers) {
      const comparison = compareStanding(left, right, tiebreaker)
      if (comparison !== 0) return comparison
    }
    return 0
  })
  return Object.freeze(ordered.map((row, index) => Object.freeze({ ...row, rank: index + 1 })))
}

export function selectWorldCompetitionRankRangeV1(
  standings: readonly WorldCompetitionRankedStandingV1[],
  rankFrom: number,
  rankTo: number,
): readonly string[] {
  if (!Number.isInteger(rankFrom) || !Number.isInteger(rankTo) || rankFrom <= 0 || rankTo < rankFrom) {
    throw new RangeError(`Invalid rank range ${rankFrom}-${rankTo}`)
  }
  const byRank = new Map(standings.map((row) => [row.rank, row] as const))
  const selected: string[] = []
  for (let rank = rankFrom; rank <= rankTo; rank += 1) {
    const row = byRank.get(rank)
    if (row === undefined) throw new Error(`Standings do not contain required rank ${rank}`)
    selected.push(row.competitionSeasonEntryId)
  }
  return Object.freeze(selected)
}

function validateScore(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) throw new RangeError(`${label} must be a non-negative integer`)
}

function validateTiebreakers(tiebreakers: readonly WorldCompetitionStandingsTiebreakerV1[]): void {
  if (tiebreakers.length === 0) throw new Error('Standings tiebreakers must be explicit')
  if (new Set(tiebreakers).size !== tiebreakers.length) throw new Error('Duplicate standings tiebreaker')
  if (tiebreakers[tiebreakers.length - 1] !== 'entryId') {
    throw new Error('Standings tiebreakers must end with deterministic entryId')
  }
}

function compareStanding(
  left: WorldCompetitionRoundRobinStandingV1,
  right: WorldCompetitionRoundRobinStandingV1,
  tiebreaker: WorldCompetitionStandingsTiebreakerV1,
): number {
  switch (tiebreaker) {
    case 'wins': return right.wins - left.wins
    case 'pointDifference': return right.pointDifference - left.pointDifference
    case 'pointsFor': return right.pointsFor - left.pointsFor
    case 'entryId': return left.competitionSeasonEntryId.localeCompare(right.competitionSeasonEntryId)
  }
}
