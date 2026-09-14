import { describe, expect, it } from 'vitest'

import { createWorldDbGameFixtureBindingIndexV1 } from './WorldDbGameFixtureBinding'

describe('World DB game fixture binding', () => {
  it('supports one physical game realizing multiple competition fixtures', () => {
    const index = createWorldDbGameFixtureBindingIndexV1([
      { gameId: 'game:nba:1', competitionFixtureId: 'fixture:nba-regular:1' },
      { gameId: 'game:nba:1', competitionFixtureId: 'fixture:nba-cup:1' },
    ])

    expect(index.fixtureIdsByGameId['game:nba:1']).toEqual([
      'fixture:nba-regular:1',
      'fixture:nba-cup:1',
    ])
  })

  it('supports multiple physical realizations of one competition fixture', () => {
    const index = createWorldDbGameFixtureBindingIndexV1([
      { gameId: 'game:original', competitionFixtureId: 'fixture:cup:qf1' },
      { gameId: 'game:replay', competitionFixtureId: 'fixture:cup:qf1' },
    ])

    expect(index.gameIdsByFixtureId['fixture:cup:qf1']).toEqual(['game:original', 'game:replay'])
  })

  it('rejects duplicate realization pairs', () => {
    expect(() => createWorldDbGameFixtureBindingIndexV1([
      { gameId: 'game:1', competitionFixtureId: 'fixture:1' },
      { gameId: 'game:1', competitionFixtureId: 'fixture:1' },
    ])).toThrow('Duplicate game fixture binding: game:1 -> fixture:1')
  })
})
