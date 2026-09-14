import { describe, expect, it } from 'vitest'
import type { WorldCompetitionRoundRobinPlanV1 } from './WorldCompetitionRoundRobin'
import {
  computeWorldCompetitionRoundRobinStandingsV1,
  rankWorldCompetitionRoundRobinStandingsV1,
  selectWorldCompetitionRankRangeV1,
} from './WorldCompetitionRoundRobinStandings'

const plan: WorldCompetitionRoundRobinPlanV1 = Object.freeze({
  competitionSeasonId: 'season:test',
  variantKey: 'MAIN',
  nodeKey: 'REGULAR',
  roundsPerMeeting: 3,
  meetingsPerPair: 1,
  fixtures: Object.freeze([
    Object.freeze({ fixtureId: 'f1', competitionSeasonId: 'season:test', variantKey: 'MAIN', nodeKey: 'REGULAR', roundNo: 1, meetingNo: 1, homeEntryId: 'A', awayEntryId: 'B' }),
    Object.freeze({ fixtureId: 'f2', competitionSeasonId: 'season:test', variantKey: 'MAIN', nodeKey: 'REGULAR', roundNo: 1, meetingNo: 1, homeEntryId: 'C', awayEntryId: 'D' }),
    Object.freeze({ fixtureId: 'f3', competitionSeasonId: 'season:test', variantKey: 'MAIN', nodeKey: 'REGULAR', roundNo: 2, meetingNo: 1, homeEntryId: 'A', awayEntryId: 'C' }),
    Object.freeze({ fixtureId: 'f4', competitionSeasonId: 'season:test', variantKey: 'MAIN', nodeKey: 'REGULAR', roundNo: 2, meetingNo: 1, homeEntryId: 'B', awayEntryId: 'D' }),
  ]),
})

describe('WorldCompetitionRoundRobinStandings', () => {
  it('computes objective metrics without inventing rank semantics', () => {
    const standings = computeWorldCompetitionRoundRobinStandingsV1(plan, [
      { fixtureId: 'f1', homeScore: 80, awayScore: 70 },
      { fixtureId: 'f2', homeScore: 90, awayScore: 85 },
      { fixtureId: 'f3', homeScore: 75, awayScore: 78 },
      { fixtureId: 'f4', homeScore: 88, awayScore: 82 },
    ])

    expect(standings).toEqual([
      { competitionSeasonEntryId: 'A', played: 2, wins: 1, losses: 1, pointsFor: 155, pointsAgainst: 148, pointDifference: 7 },
      { competitionSeasonEntryId: 'B', played: 2, wins: 1, losses: 1, pointsFor: 158, pointsAgainst: 162, pointDifference: -4 },
      { competitionSeasonEntryId: 'C', played: 2, wins: 2, losses: 0, pointsFor: 168, pointsAgainst: 160, pointDifference: 8 },
      { competitionSeasonEntryId: 'D', played: 2, wins: 0, losses: 2, pointsFor: 167, pointsAgainst: 178, pointDifference: -11 },
    ])
  })

  it('ranks only with explicit tiebreakers and supports RANK_RANGE selection', () => {
    const standings = computeWorldCompetitionRoundRobinStandingsV1(plan, [
      { fixtureId: 'f1', homeScore: 80, awayScore: 70 },
      { fixtureId: 'f2', homeScore: 90, awayScore: 85 },
      { fixtureId: 'f3', homeScore: 75, awayScore: 78 },
      { fixtureId: 'f4', homeScore: 88, awayScore: 82 },
    ])
    const ranked = rankWorldCompetitionRoundRobinStandingsV1(standings, ['wins', 'pointDifference', 'pointsFor', 'entryId'])

    expect(ranked.map((row) => [row.rank, row.competitionSeasonEntryId])).toEqual([
      [1, 'C'],
      [2, 'A'],
      [3, 'B'],
      [4, 'D'],
    ])
    expect(selectWorldCompetitionRankRangeV1(ranked, 1, 2)).toEqual(['C', 'A'])
  })

  it('rejects implicit ranking and invalid completed results', () => {
    const standings = computeWorldCompetitionRoundRobinStandingsV1(plan, [])
    expect(() => rankWorldCompetitionRoundRobinStandingsV1(standings, [])).toThrow('must be explicit')
    expect(() => rankWorldCompetitionRoundRobinStandingsV1(standings, ['wins'])).toThrow('entryId')
    expect(() => computeWorldCompetitionRoundRobinStandingsV1(plan, [{ fixtureId: 'f1', homeScore: 80, awayScore: 80 }])).toThrow('cannot be tied')
    expect(() => computeWorldCompetitionRoundRobinStandingsV1(plan, [{ fixtureId: 'missing', homeScore: 80, awayScore: 70 }])).toThrow('unknown fixture')
  })
})
