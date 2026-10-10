import { describe, expect, it } from 'vitest'
import type { CompetitionLeaderRow } from '@/ui-ng/applications/competition/buildCompetitionWorkspaceModel'
import { HOME_LEADER_CATEGORIES, rankHomeLeaders } from '@/ui-ng/applications/home/homeLeaderCategories'

const sample = [
  { playerId:'p1', playerName:'One', teamName:'A', games:3, ppg:25, rpg:2, apg:3, vpg:10 },
  { playerId:'p2', playerName:'Two', teamName:'B', games:3, ppg:10, rpg:15, apg:1, vpg:12 },
  { playerId:'p3', playerName:'Three', teamName:'C', games:3, ppg:20, rpg:4, apg:12, vpg:5 },
  { playerId:'p4', playerName:'Four', teamName:'C', games:3, ppg:20, rpg:4, apg:12, vpg:28 },
] as unknown as readonly CompetitionLeaderRow[]

describe('HOME Courtside statistical leaders', () => {
  it('offers exactly the canonical four existing competition stats', () => {
    expect(HOME_LEADER_CATEGORIES.map((category) => category.id)).toEqual([
      'points', 'rebounds', 'assists', 'valuation',
    ])
  })
  it('ranks descending by the selected statistic and does not mutate competition rows', () => {
    const original = sample.map((row) => row.playerId)
    expect(rankHomeLeaders(sample, 'points').map((row) => row.playerId)).toEqual(['p1', 'p3', 'p4', 'p2'])
    expect(rankHomeLeaders(sample, 'rebounds').map((row) => row.playerId)).toEqual(['p2', 'p3', 'p4', 'p1'])
    expect(rankHomeLeaders(sample, 'assists').map((row) => row.playerId)).toEqual(['p3', 'p4', 'p1', 'p2'])
    expect(rankHomeLeaders(sample, 'valuation').map((row) => row.playerId)).toEqual(['p4', 'p2', 'p1', 'p3'])
    expect(sample.map((row) => row.playerId)).toEqual(original)
  })
  it('caps visible rows to avoid nested scrolling without losing the underlying ranking', () => {
    expect(rankHomeLeaders(sample, 'points', 2)).toHaveLength(2)
    expect(rankHomeLeaders([], 'points')).toEqual([])
  })
})
