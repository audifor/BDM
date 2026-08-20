import { describe, expect, it } from 'vitest'

import { createNewGame } from './createNewGame'

describe('simultaneous basketball world', () => {
  it('creates deterministic men and women FIBA, closed-league and NCAA ecosystems with independent windows', () => {
    const first = createNewGame(), second = createNewGame()
    expect(second).toEqual(first)
    for (const category of ['men', 'women'] as const) {
      const ecosystems = Object.values(first.ecosystems).filter((ecosystem) => ecosystem.category === category)
      expect(ecosystems.map((ecosystem) => ecosystem.kind).sort()).toEqual(['fibaLike', 'nbaLike', 'ncaaLike'])
      for (const ecosystem of ecosystems) {
        const competitions = Object.values(first.competitions).filter((competition) => competition.ecosystemId === ecosystem.id)
        expect(competitions.length).toBeGreaterThan(0)
        expect(competitions.every((competition) => competition.gender === (category === 'men' ? 'male' : 'female'))).toBe(true)
      }
    }
    const windows = Object.values(first.seasons).map((season) => `${season.startDate}:${season.endDate}`)
    expect(new Set(windows).size).toBeGreaterThan(3)
    const menClosed = Object.values(first.seasons).find((season) => first.ecosystems[first.competitions[season.competitionId]!.ecosystemId]!.kind === 'nbaLike' && first.ecosystems[first.competitions[season.competitionId]!.ecosystemId]!.category === 'men')!
    const womenClosed = Object.values(first.seasons).find((season) => first.ecosystems[first.competitions[season.competitionId]!.ecosystemId]!.kind === 'nbaLike' && first.ecosystems[first.competitions[season.competitionId]!.ecosystemId]!.category === 'women')!
    expect(first.salaryRulesBySeasonId[menClosed.id]!.capAmount).not.toBe(first.salaryRulesBySeasonId[womenClosed.id]!.capAmount)
    for (const category of ['men', 'women'] as const) {
      const ncaa = Object.values(first.ecosystems).find((ecosystem) => ecosystem.kind === 'ncaaLike' && ecosystem.category === category)!
      const season = Object.values(first.seasons).find((item) => first.competitions[item.competitionId]!.ecosystemId === ncaa.id)!
      const memberships = first.conferenceMemberships.filter((membership) => membership.seasonId === season.id)
      expect(memberships).toHaveLength(12)
      expect(memberships.every((membership) => first.conferencesById[membership.conferenceId]!.ecosystemId === ncaa.id)).toBe(true)
    }
  })
})
