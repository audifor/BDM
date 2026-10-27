import { expect, it } from 'vitest'
import { teamIdFromString } from '@/domain/ids'
import { rankClassificationMiniLeague } from './classificationMiniLeague'

const team = teamIdFromString
const row = (id: string, wins = 1, losses = 1, pointsFor = 100, pointDifference = 0) => ({ teamId: team(id), position: 0, played: wins + losses, wins, losses, pointsFor, pointsAgainst: pointsFor - pointDifference, pointDifference })
const game = (home: string, away: string, homeScore: number, awayScore: number) => ({ homeTeamId: team(home), awayTeamId: team(away), homeScore, awayScore })
it('ranks classification points rather than a borrowed wins-only policy', () => {
  expect(rankClassificationMiniLeague([row('A', 1, 0), row('B', 0, 3)], [], false).map(r => r.teamId)).toEqual(['B', 'A'])
})
it('head-to-head classification precedes overall scoring', () => {
  const ranked = rankClassificationMiniLeague([row('A', 1, 1, 500, 100), row('B')], [game('B', 'A', 80, 70)], true)
  expect(ranked.map(r => r.teamId)).toEqual(['B', 'A'])
})
it('restarts the criteria on the remaining tied subset after separating a team', () => {
  // Three-way mini-table differences: A=20, B=-10, C=-10. B beat C,
  // so B wins the reduced mini-table even though C scored more overall.
  const ranked = rankClassificationMiniLeague([row('A'), row('B', 1, 1, 90), row('C', 1, 1, 500)],
    [game('A', 'B', 110, 80), game('B', 'C', 90, 70), game('C', 'A', 100, 90)], true)
  expect(ranked.map(r => r.teamId)).toEqual(['A', 'B', 'C'])
})
it('uses mini-table difference and then mini-table scoring', () => {
  const ranked = rankClassificationMiniLeague([row('A'), row('B')], [game('A', 'B', 90, 80), game('B', 'A', 85, 80)], true)
  expect(ranked[0]!.teamId).toBe('A')
})
it('uses mini-table scoring before overall difference when three teams remain tied', () => {
  const ranked = rankClassificationMiniLeague([row('A', 1, 1, 500, 100), row('B'), row('C')],
    [game('A', 'B', 90, 80), game('B', 'C', 100, 90), game('C', 'A', 110, 100)], true)
  expect(ranked.map(r => r.teamId)).toEqual(['C', 'A', 'B'])
})
it('falls back to overall difference and scoring after the mini-table is exhausted', () => {
  const results = [game('A', 'B', 80, 70), game('B', 'A', 80, 70)]
  expect(rankClassificationMiniLeague([row('A'), row('B', 1, 1, 100, 10)], results, true)[0]!.teamId).toBe('B')
  expect(rankClassificationMiniLeague([row('A'), row('B', 1, 1, 101)], results, true)[0]!.teamId).toBe('B')
})
it('keeps provisional display stable but never invents a terminal draw outcome', () => {
  expect(rankClassificationMiniLeague([row('B'), row('A')], [], false).map(r => r.teamId)).toEqual(['A', 'B'])
  expect(() => rankClassificationMiniLeague([row('B'), row('A')], [], true)).toThrow('draw authority required')
})
