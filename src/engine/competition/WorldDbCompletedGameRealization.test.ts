import { describe, expect, it } from 'vitest'

import type { Game } from '@/domain/game'
import type { WorldDbCompetitionBundleV1 } from '@/domain/worldDb/CompetitionBundle'

import { applyCompletedGameToWorldDbCompetitionInstancesV1, type WorldDbCompetitionExecutionV1 } from './WorldDbCompletedGameRealization'
import { instantiateWorldDbCompetitionV1 } from './WorldDbCompetitionInstance'
import { createWorldDbCompetitionRulesV1 } from './WorldDbCompetitionRules'
import { createWorldDbCompetitionRuntimeV1 } from './WorldDbCompetitionRuntime'
import { createWorldDbGameInstanceFixtureBindingIndexV1 } from './WorldDbGameInstanceFixtureBinding'

function completedGame(id: string, homeTeamId: string, awayTeamId: string, homeScore = 90, awayScore = 80): Game {
  return {
    id: id as Game['id'],
    seasonId: 'season:2026-27' as Game['seasonId'],
    competitionId: 'competition:physical' as Game['competitionId'],
    date: '2026-10-10' as Game['date'],
    homeTeamId: homeTeamId as Game['homeTeamId'],
    awayTeamId: awayTeamId as Game['awayTeamId'],
    stakes: 'regular',
    status: 'completed',
    result: { homeScore, awayScore },
  }
}

function simpleBundle(seasonId: string): WorldDbCompetitionBundleV1 {
  return {
    schemaVersion: 1,
    source: { databaseId: 'phase1.db', schemaId: 'DDL-PHASE1-A' },
    competitionSeason: {
      competitionSeasonId: seasonId,
      competitionId: `competition:${seasonId}`,
      seasonId: 'season:2026-27',
      editionNumber: null,
    },
    entries: [],
    structureNodes: [
      { competitionStructureNodeId: `${seasonId}:league`, nodeType: 'STAGE', name: 'League', sequenceNo: null },
    ],
    structurePositions: [],
    structureEdges: [],
    structureEntryAssignments: [],
    fixtures: [],
    fixtureSides: [],
    rulePayloads: {
      pairing: [
        { id: `${seasonId}:pairing`, scopeStructureNodeId: `${seasonId}:league`, type: 'ROUND_ROBIN_PAIRING', payload: { meetings_per_pair: 1 } },
      ],
    },
  }
}

function cupBundle(seasonId: string): WorldDbCompetitionBundleV1 {
  return {
    schemaVersion: 1,
    source: { databaseId: 'phase1.db', schemaId: 'DDL-PHASE1-A' },
    competitionSeason: {
      competitionSeasonId: seasonId,
      competitionId: `competition:${seasonId}`,
      seasonId: 'season:2026-27',
      editionNumber: null,
    },
    entries: [],
    structureNodes: [
      { competitionStructureNodeId: `${seasonId}:sf`, nodeType: 'ROUND', name: 'Semifinals', sequenceNo: 1 },
      { competitionStructureNodeId: `${seasonId}:final`, nodeType: 'ROUND', name: 'Final', sequenceNo: 2 },
    ],
    structurePositions: [],
    structureEdges: [],
    structureEntryAssignments: [],
    fixtures: [],
    fixtureSides: [],
    rulePayloads: {
      pairing: [
        { id: `${seasonId}:pair:sf`, scopeStructureNodeId: `${seasonId}:sf`, type: 'FIXED_BRACKET_PAIRING', payload: null },
      ],
      contestFormats: [
        { id: `${seasonId}:contest:sf`, scopeStructureNodeId: `${seasonId}:sf`, type: 'SINGLE_GAME' },
        { id: `${seasonId}:contest:final`, scopeStructureNodeId: `${seasonId}:final`, type: 'SINGLE_GAME' },
      ],
      progressionRules: [
        { id: `${seasonId}:progress:sf`, scopeStructureNodeId: `${seasonId}:sf`, type: 'GAME_WINNER', payload: null },
      ],
      progressionDestinations: [
        {
          id: `${seasonId}:destination:final`,
          ruleId: `${seasonId}:progress:sf`,
          sequenceNo: 1,
          type: 'STRUCTURE_NODE',
          payload: { competition_structure_node_id: `${seasonId}:final` },
        },
      ],
    },
  }
}

function execution(bundle: WorldDbCompetitionBundleV1, participants: readonly string[]): WorldDbCompetitionExecutionV1 {
  const runtime = createWorldDbCompetitionRuntimeV1(bundle)
  const rules = createWorldDbCompetitionRulesV1(bundle)
  return {
    runtime,
    rules,
    instance: instantiateWorldDbCompetitionV1(runtime, rules, { participantTeamIds: participants }),
  }
}

describe('completed Game realization into World DB competition instances', () => {
  it('allows one physical Game to realize fixtures in two competition seasons', () => {
    const first = execution(simpleBundle('edition:league'), ['team:a', 'team:b'])
    const second = execution(simpleBundle('edition:cup-group'), ['team:a', 'team:b'])
    const game = completedGame('game:shared', 'team:a', 'team:b')
    const bindings = createWorldDbGameInstanceFixtureBindingIndexV1([
      { gameId: game.id, competitionSeasonId: 'edition:league', instanceFixtureId: first.instance.fixtures[0]!.instanceFixtureId },
      { gameId: game.id, competitionSeasonId: 'edition:cup-group', instanceFixtureId: second.instance.fixtures[0]!.instanceFixtureId },
    ])

    const result = applyCompletedGameToWorldDbCompetitionInstancesV1(game, {
      'edition:league': first,
      'edition:cup-group': second,
    }, bindings)

    expect(Object.values(result.executionByCompetitionSeasonId['edition:league']!.instance.fixtureOutcomesById)).toEqual([
      { instanceFixtureId: first.instance.fixtures[0]!.instanceFixtureId, winnerTeamId: 'team:a', loserTeamId: 'team:b' },
    ])
    expect(Object.values(result.executionByCompetitionSeasonId['edition:cup-group']!.instance.fixtureOutcomesById)).toEqual([
      { instanceFixtureId: second.instance.fixtures[0]!.instanceFixtureId, winnerTeamId: 'team:a', loserTeamId: 'team:b' },
    ])
  })

  it('creates the next fixture after all source fixtures have realized completed Games', () => {
    const initial = execution(cupBundle('edition:cup'), ['team:a', 'team:b', 'team:c', 'team:d'])
    const [firstFixture, secondFixture] = initial.instance.fixtures
    const firstGame = completedGame('game:sf1', firstFixture!.homeTeamId, firstFixture!.awayTeamId, 80, 70)
    const secondGame = completedGame('game:sf2', secondFixture!.homeTeamId, secondFixture!.awayTeamId, 75, 90)
    const bindings = createWorldDbGameInstanceFixtureBindingIndexV1([
      { gameId: firstGame.id, competitionSeasonId: 'edition:cup', instanceFixtureId: firstFixture!.instanceFixtureId },
      { gameId: secondGame.id, competitionSeasonId: 'edition:cup', instanceFixtureId: secondFixture!.instanceFixtureId },
    ])

    const afterFirst = applyCompletedGameToWorldDbCompetitionInstancesV1(firstGame, { 'edition:cup': initial }, bindings)
    expect(afterFirst.newInstanceFixtureIdsByCompetitionSeasonId).toEqual({})

    const afterSecond = applyCompletedGameToWorldDbCompetitionInstancesV1(
      secondGame,
      afterFirst.executionByCompetitionSeasonId,
      bindings,
    )
    const finalFixtureId = 'instance-fixture:edition:cup:edition:cup:final:1'
    expect(afterSecond.newInstanceFixtureIdsByCompetitionSeasonId['edition:cup']).toEqual([finalFixtureId])
    expect(afterSecond.executionByCompetitionSeasonId['edition:cup']!.instance.fixtures.at(-1)).toMatchObject({
      instanceFixtureId: finalFixtureId,
      homeTeamId: firstFixture!.homeTeamId,
      awayTeamId: secondFixture!.awayTeamId,
    })
  })

  it('rejects a binding when the physical Game teams do not match the instance fixture', () => {
    const value = execution(simpleBundle('edition:league'), ['team:a', 'team:b'])
    const game = completedGame('game:mismatch', 'team:a', 'team:c')
    const bindings = createWorldDbGameInstanceFixtureBindingIndexV1([
      { gameId: game.id, competitionSeasonId: 'edition:league', instanceFixtureId: value.instance.fixtures[0]!.instanceFixtureId },
    ])

    expect(() => applyCompletedGameToWorldDbCompetitionInstancesV1(game, { 'edition:league': value }, bindings)).toThrow(
      'do not match instance fixture',
    )
  })

  it('is idempotent when the same completed Game is realized again', () => {
    const value = execution(simpleBundle('edition:league'), ['team:a', 'team:b'])
    const game = completedGame('game:repeat', 'team:a', 'team:b')
    const bindings = createWorldDbGameInstanceFixtureBindingIndexV1([
      { gameId: game.id, competitionSeasonId: 'edition:league', instanceFixtureId: value.instance.fixtures[0]!.instanceFixtureId },
    ])

    const once = applyCompletedGameToWorldDbCompetitionInstancesV1(game, { 'edition:league': value }, bindings)
    const twice = applyCompletedGameToWorldDbCompetitionInstancesV1(game, once.executionByCompetitionSeasonId, bindings)
    expect(twice.executionByCompetitionSeasonId['edition:league']!.instance.fixtureOutcomesById).toEqual(
      once.executionByCompetitionSeasonId['edition:league']!.instance.fixtureOutcomesById,
    )
    expect(twice.newInstanceFixtureIdsByCompetitionSeasonId).toEqual({})
  })

  it('refuses tied completed Games instead of inventing a winner', () => {
    const value = execution(simpleBundle('edition:league'), ['team:a', 'team:b'])
    const game = completedGame('game:tie', 'team:a', 'team:b', 88, 88)
    const bindings = createWorldDbGameInstanceFixtureBindingIndexV1([
      { gameId: game.id, competitionSeasonId: 'edition:league', instanceFixtureId: value.instance.fixtures[0]!.instanceFixtureId },
    ])
    expect(() => applyCompletedGameToWorldDbCompetitionInstancesV1(game, { 'edition:league': value }, bindings)).toThrow(
      'cannot resolve tied Game',
    )
  })
})
