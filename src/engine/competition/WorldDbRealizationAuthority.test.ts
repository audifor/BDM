import { describe, expect, it } from 'vitest'
import type { WorldDbMatchRealizationBundleV1 } from '@/domain/worldDb/MatchRealizationBundle'
import type { WorldDbGameFixtureBindingV1 } from './WorldDbGameFixtureBinding'
import {
  projectWorldDbPlanningRealizationsV1,
  selectWorldDbAuthoritativeOutcomeBindingsV1,
} from './WorldDbRealizationAuthority'

function bundle(statuses: readonly string[]): WorldDbMatchRealizationBundleV1 {
  return {
    schemaVersion: 1,
    competitionSeasonId: 'season:1',
    matches: statuses.map((_, index) => ({
      matchId: `match:${index + 1}`,
      competitionSeasonId: 'season:1',
      scheduledAt: `2030-01-${String(index + 1).padStart(2, '0')}T20:00:00Z`,
      playedAt: null,
      facilityId: null,
      status: 'SCHEDULED',
      homeTeamId: 'team:a',
      awayTeamId: 'team:b',
    })),
    realizations: statuses.map((status, index) => ({
      gameFixtureRealizationId: `realization:${index + 1}`,
      matchId: `match:${index + 1}`,
      competitionFixtureId: 'fixture:1',
      realizationType: index === 0 ? 'ORIGINAL' : 'FULL_REPLAY',
      status,
    })),
  }
}

const bindings: readonly WorldDbGameFixtureBindingV1[] = Object.freeze([
  Object.freeze({ gameId: 'worlddb:db:match:match:1', competitionFixtureId: 'fixture:1' }),
  Object.freeze({ gameId: 'worlddb:db:match:match:2', competitionFixtureId: 'fixture:1' }),
])

describe('World DB B12 realization authority', () => {
  it('replaces superseded originals with the authoritative replay for planning and outcomes', () => {
    const projected = projectWorldDbPlanningRealizationsV1(bundle(['SUPERSEDED', 'AUTHORITATIVE']))

    expect(projected.matches.map((match) => match.matchId)).toEqual(['match:2'])
    expect(projected.realizations.map((row) => row.matchId)).toEqual(['match:2'])
    expect(selectWorldDbAuthoritativeOutcomeBindingsV1(
      'db',
      ['fixture:1'],
      projected,
      bindings,
    )).toEqual([
      { gameId: 'worlddb:db:match:match:2', competitionFixtureId: 'fixture:1' },
    ])
  })

  it('keeps provisional physical identity but blocks it from result authority', () => {
    const projected = projectWorldDbPlanningRealizationsV1(bundle(['PROVISIONAL']))

    expect(projected.matches.map((match) => match.matchId)).toEqual(['match:1'])
    expect(selectWorldDbAuthoritativeOutcomeBindingsV1(
      'db',
      ['fixture:1'],
      projected,
      bindings.slice(0, 1),
    )).toEqual([])
  })

  it('drops voided physical realizations so B04 can plan a replacement', () => {
    const projected = projectWorldDbPlanningRealizationsV1(bundle(['VOIDED']))

    expect(projected.matches).toEqual([])
    expect(projected.realizations).toEqual([])
  })

  it('keeps ordinary runtime-created bindings when B12 has no realization for the fixture', () => {
    expect(selectWorldDbAuthoritativeOutcomeBindingsV1(
      'db',
      ['fixture:1'],
      { ...bundle([]), matches: [], realizations: [] },
      [{ gameId: 'runtime:1', competitionFixtureId: 'fixture:1' }],
    )).toEqual([{ gameId: 'runtime:1', competitionFixtureId: 'fixture:1' }])
  })

  it('fails closed on an unknown B12 realization status', () => {
    expect(() => projectWorldDbPlanningRealizationsV1(bundle(['MYSTERY'])))
      .toThrow('Unsupported World DB fixture realization status MYSTERY')
  })
})
