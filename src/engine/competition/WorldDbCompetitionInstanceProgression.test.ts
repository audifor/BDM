import { describe, expect, it } from 'vitest'

import type { WorldDbCompetitionBundleV1 } from '@/domain/worldDb/CompetitionBundle'
import { instantiateWorldDbCompetitionV1 } from './WorldDbCompetitionInstance'
import { applyWorldDbCompetitionInstanceOutcomesV1 } from './WorldDbCompetitionInstanceProgression'
import { createWorldDbCompetitionRulesV1 } from './WorldDbCompetitionRules'
import { createWorldDbCompetitionRuntimeV1 } from './WorldDbCompetitionRuntime'

function cupBundle(): WorldDbCompetitionBundleV1 {
  return {
    schemaVersion: 1,
    source: { databaseId: 'phase1.db', schemaId: 'DDL-PHASE1-A' },
    competitionSeason: {
      competitionSeasonId: 'edition:test:cup:2026-27',
      competitionId: 'competition:test:cup',
      seasonId: 'season:2026-27',
      editionNumber: null,
    },
    entries: [],
    structureNodes: [
      { competitionStructureNodeId: 'node:qf', nodeType: 'ROUND', name: 'Quarterfinals', sequenceNo: null },
      { competitionStructureNodeId: 'node:sf', nodeType: 'ROUND', name: 'Semifinals', sequenceNo: null },
      { competitionStructureNodeId: 'node:final', nodeType: 'ROUND', name: 'Final', sequenceNo: null },
    ],
    structurePositions: [],
    structureEdges: [],
    structureEntryAssignments: [],
    fixtures: [],
    fixtureSides: [],
    rulePayloads: {
      pairing: [
        { id: 'pair:qf', scopeStructureNodeId: 'node:qf', type: 'DRAW_PAIRING', payload: { draw_also_fixes_semifinal_bracket_paths: true } },
        { id: 'pair:sf', scopeStructureNodeId: 'node:sf', type: 'FIXED_BRACKET_PAIRING', payload: { source: 'INITIAL_DRAW_SEMIFINAL_PATHS' } },
      ],
      contestFormats: [
        { id: 'contest:qf', scopeStructureNodeId: 'node:qf', type: 'SINGLE_GAME' },
        { id: 'contest:sf', scopeStructureNodeId: 'node:sf', type: 'SINGLE_GAME' },
        { id: 'contest:final', scopeStructureNodeId: 'node:final', type: 'SINGLE_GAME' },
      ],
      progressionRules: [
        { id: 'progress:qf', scopeStructureNodeId: 'node:qf', type: 'GAME_WINNER', payload: null },
        { id: 'progress:sf', scopeStructureNodeId: 'node:sf', type: 'GAME_WINNER', payload: null },
      ],
      progressionDestinations: [
        { id: 'dest:sf', ruleId: 'progress:qf', sequenceNo: 1, type: 'STRUCTURE_NODE', payload: { competition_structure_node_id: 'node:sf' } },
        { id: 'dest:final', ruleId: 'progress:sf', sequenceNo: 1, type: 'STRUCTURE_NODE', payload: { competition_structure_node_id: 'node:final' } },
      ],
    },
  }
}

function setupCup() {
  const bundle = cupBundle()
  const runtime = createWorldDbCompetitionRuntimeV1(bundle)
  const rules = createWorldDbCompetitionRulesV1(bundle)
  const participants = Array.from({ length: 8 }, (_, index) => `team:${index + 1}`)
  const instance = instantiateWorldDbCompetitionV1(runtime, rules, {
    participantTeamIds: participants,
    pairingOrderByNodeId: { 'node:qf': participants },
  })
  return { runtime, rules, instance }
}

describe('World DB competition instance progression', () => {
  it('preserves bracket path order from source fixture ordinals', () => {
    const { runtime, rules, instance } = setupCup()
    const progressed = applyWorldDbCompetitionInstanceOutcomesV1(runtime, rules, instance, {
      outcomes: [
        { instanceFixtureId: instance.fixtures[0]!.instanceFixtureId, winnerTeamId: 'team:2', loserTeamId: 'team:1' },
        { instanceFixtureId: instance.fixtures[1]!.instanceFixtureId, winnerTeamId: 'team:3', loserTeamId: 'team:4' },
        { instanceFixtureId: instance.fixtures[2]!.instanceFixtureId, winnerTeamId: 'team:6', loserTeamId: 'team:5' },
        { instanceFixtureId: instance.fixtures[3]!.instanceFixtureId, winnerTeamId: 'team:7', loserTeamId: 'team:8' },
      ],
    })

    expect(progressed.nodeParticipantTeamIds['node:sf']).toEqual(['team:2', 'team:3', 'team:6', 'team:7'])
    expect(progressed.fixtures.filter((fixture) => fixture.structureNodeId === 'node:sf').map((fixture) => [fixture.homeTeamId, fixture.awayTeamId])).toEqual([
      ['team:2', 'team:3'],
      ['team:6', 'team:7'],
    ])
  })

  it('creates a single-game final even when B04 has no redundant final pairing rule', () => {
    const { runtime, rules, instance } = setupCup()
    const semifinals = applyWorldDbCompetitionInstanceOutcomesV1(runtime, rules, instance, {
      outcomes: instance.fixtures.map((fixture) => ({
        instanceFixtureId: fixture.instanceFixtureId,
        winnerTeamId: fixture.homeTeamId,
        loserTeamId: fixture.awayTeamId,
      })),
    })
    const sfFixtures = semifinals.fixtures.filter((fixture) => fixture.structureNodeId === 'node:sf')
    const final = applyWorldDbCompetitionInstanceOutcomesV1(runtime, rules, semifinals, {
      outcomes: sfFixtures.map((fixture) => ({
        instanceFixtureId: fixture.instanceFixtureId,
        winnerTeamId: fixture.awayTeamId,
        loserTeamId: fixture.homeTeamId,
      })),
    })

    expect(final.nodeParticipantTeamIds['node:final']).toEqual(['team:2', 'team:6'])
    expect(final.fixtures.filter((fixture) => fixture.structureNodeId === 'node:final')).toEqual([
      {
        instanceFixtureId: 'instance-fixture:edition:test:cup:2026-27:node:final:1',
        sourceCompetitionFixtureId: null,
        structureNodeId: 'node:final',
        ordinal: 1,
        homeTeamId: 'team:2',
        awayTeamId: 'team:6',
      },
    ])
  })

  it('is idempotent for repeated identical outcomes and rejects conflicting rewrites', () => {
    const { runtime, rules, instance } = setupCup()
    const outcome = {
      instanceFixtureId: instance.fixtures[0]!.instanceFixtureId,
      winnerTeamId: instance.fixtures[0]!.homeTeamId,
      loserTeamId: instance.fixtures[0]!.awayTeamId,
    }
    const once = applyWorldDbCompetitionInstanceOutcomesV1(runtime, rules, instance, { outcomes: [outcome] })
    const twice = applyWorldDbCompetitionInstanceOutcomesV1(runtime, rules, once, { outcomes: [outcome] })
    expect(twice.fixtureOutcomesById).toEqual(once.fixtureOutcomesById)

    expect(() => applyWorldDbCompetitionInstanceOutcomesV1(runtime, rules, once, {
      outcomes: [{
        instanceFixtureId: outcome.instanceFixtureId,
        winnerTeamId: outcome.loserTeamId,
        loserTeamId: outcome.winnerTeamId,
      }],
    })).toThrow('Competition instance fixture outcome conflict')
  })
})
