import { describe, expect, it } from 'vitest'

import type { WorldDbCompetitionBundleV1 } from '@/domain/worldDb/CompetitionBundle'
import { createWorldDbCompetitionRuntimeV1 } from './WorldDbCompetitionRuntime'
import { createWorldDbCompetitionRulesV1 } from './WorldDbCompetitionRules'
import { resolveWorldDbFixtureProgressionV1 } from './WorldDbProgressionResolver'

function buildBundle(rulePayloads?: WorldDbCompetitionBundleV1['rulePayloads']): WorldDbCompetitionBundleV1 {
  return {
    schemaVersion: 1,
    source: { databaseId: 'phase1.db', schemaId: 'DDL-PHASE1-A' },
    competitionSeason: {
      competitionSeasonId: 'edition:test:2026-27',
      competitionId: 'competition:test',
      seasonId: 'season:2026-27',
      editionNumber: null,
    },
    entries: [
      { competitionSeasonEntryId: 'entry:a', teamId: 'team:a' },
      { competitionSeasonEntryId: 'entry:b', teamId: 'team:b' },
    ],
    structureNodes: [
      { competitionStructureNodeId: 'node:qf', nodeType: 'ROUND', name: 'Quarterfinal', sequenceNo: 1 },
      { competitionStructureNodeId: 'node:sf', nodeType: 'ROUND', name: 'Semifinal', sequenceNo: 2 },
      { competitionStructureNodeId: 'node:consolation', nodeType: 'ROUND', name: 'Consolation', sequenceNo: 2 },
    ],
    structureEdges: [],
    structureEntryAssignments: [],
    fixtures: [{ competitionFixtureId: 'fixture:qf1', structureNodeId: 'node:qf', matchdayId: null, fixtureOrder: 1 }],
    fixtureSides: [
      { competitionFixtureSideId: 'side:h', competitionFixtureId: 'fixture:qf1', sideRole: 'HOME', competitionSeasonEntryId: 'entry:a', competitionSeasonSlotId: null, sourceStructurePositionId: null },
      { competitionFixtureSideId: 'side:a', competitionFixtureId: 'fixture:qf1', sideRole: 'AWAY', competitionSeasonEntryId: 'entry:b', competitionSeasonSlotId: null, sourceStructurePositionId: null },
    ],
    rulePayloads: rulePayloads ?? {
      progressionRules: [
        { id: 'rule:winner', scopeStructureNodeId: 'node:qf', type: 'GAME_WINNER', payload: null },
        { id: 'rule:loser', scopeStructureNodeId: 'node:qf', type: 'GAME_LOSER', payload: null },
      ],
      progressionDestinations: [
        { id: 'dest:winner', ruleId: 'rule:winner', sequenceNo: 1, type: 'STRUCTURE_NODE', payload: { competition_structure_node_id: 'node:sf' } },
        { id: 'dest:loser', ruleId: 'rule:loser', sequenceNo: 1, type: 'STRUCTURE_NODE', payload: { competition_structure_node_id: 'node:consolation' } },
      ],
    },
  }
}

describe('World DB fixture progression', () => {
  it('routes game winner and loser using only B04 rules', () => {
    const runtime = createWorldDbCompetitionRuntimeV1(buildBundle())
    const rules = createWorldDbCompetitionRulesV1(runtime.bundle)

    expect(resolveWorldDbFixtureProgressionV1(runtime, rules, [{
      competitionFixtureId: 'fixture:qf1',
      winnerEntryId: 'entry:b',
      loserEntryId: 'entry:a',
    }])).toEqual([
      {
        ruleId: 'rule:winner',
        ruleType: 'GAME_WINNER',
        sourceNodeId: 'node:qf',
        destinationNodeId: 'node:sf',
        competitionSeasonEntryId: 'entry:b',
      },
      {
        ruleId: 'rule:loser',
        ruleType: 'GAME_LOSER',
        sourceNodeId: 'node:qf',
        destinationNodeId: 'node:consolation',
        competitionSeasonEntryId: 'entry:a',
      },
    ])
  })

  it('fails on outcomes for fixtures outside the loaded competition season', () => {
    const runtime = createWorldDbCompetitionRuntimeV1(buildBundle())
    const rules = createWorldDbCompetitionRulesV1(runtime.bundle)

    expect(() => resolveWorldDbFixtureProgressionV1(runtime, rules, [{
      competitionFixtureId: 'fixture:missing',
      winnerEntryId: 'entry:a',
      loserEntryId: 'entry:b',
    }])).toThrow('Progression outcome fixture not found: fixture:missing')
  })

  it('does not apply standings-driven rules in the fixture-result evaluator', () => {
    const runtime = createWorldDbCompetitionRuntimeV1(buildBundle({
      progressionRules: [{ id: 'rule:rank', scopeStructureNodeId: 'node:qf', type: 'STANDING_POSITION', payload: null }],
      progressionDestinations: [{ id: 'dest:rank', ruleId: 'rule:rank', sequenceNo: 1, type: 'STRUCTURE_NODE', payload: { competition_structure_node_id: 'node:sf' } }],
    }))
    const rules = createWorldDbCompetitionRulesV1(runtime.bundle)

    expect(resolveWorldDbFixtureProgressionV1(runtime, rules, [{
      competitionFixtureId: 'fixture:qf1',
      winnerEntryId: 'entry:a',
      loserEntryId: 'entry:b',
    }])).toEqual([])
  })
})
