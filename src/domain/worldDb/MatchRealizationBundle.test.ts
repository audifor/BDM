import { describe, expect, it } from 'vitest'

import { assertWorldDbMatchRealizationBundleV1 } from './MatchRealizationBundle'

const validBundle = {
  schemaVersion: 1,
  competitionSeasonId: 'edition:NBA:cup:2026-27',
  matches: [{
    matchId: 'match:shared:1',
    competitionSeasonId: 'edition:NBA:regular:2026-27',
    scheduledAt: '2026-11-20T19:30:00-05:00',
    playedAt: null,
    facilityId: 'facility:arena:1',
    status: 'SCHEDULED',
    homeTeamId: 'team:home',
    awayTeamId: 'team:away',
  }],
  realizations: [
    {
      gameFixtureRealizationId: 'realization:regular',
      matchId: 'match:shared:1',
      competitionFixtureId: 'fixture:nba:regular:1',
      realizationType: 'ORIGINAL',
      status: 'AUTHORITATIVE',
    },
    {
      gameFixtureRealizationId: 'realization:cup',
      matchId: 'match:shared:1',
      competitionFixtureId: 'fixture:nba:cup:1',
      realizationType: 'ORIGINAL',
      status: 'AUTHORITATIVE',
    },
  ],
} as const

describe('World DB B12 match realization bundle', () => {
  it('accepts one physical match realizing multiple competition fixtures', () => {
    expect(() => assertWorldDbMatchRealizationBundleV1(validBundle)).not.toThrow()
  })

  it('allows the physical match to belong to a different primary competition season', () => {
    const copy = structuredClone(validBundle)
    expect(copy.matches[0].competitionSeasonId).not.toBe(copy.competitionSeasonId)
    expect(() => assertWorldDbMatchRealizationBundleV1(copy)).not.toThrow()
  })

  it('rejects duplicate matches and orphan realizations', () => {
    expect(() => assertWorldDbMatchRealizationBundleV1({
      ...validBundle,
      matches: [validBundle.matches[0], validBundle.matches[0]],
    })).toThrow('Duplicate World DB match')

    expect(() => assertWorldDbMatchRealizationBundleV1({
      ...validBundle,
      realizations: [{ ...validBundle.realizations[0], matchId: 'match:missing' }],
    })).toThrow('references missing match')
  })
})
