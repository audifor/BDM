import { describe, expect, it } from 'vitest'

import type { WorldDbCompetitionBundleV1 } from '@/domain/worldDb/CompetitionBundle'
import { createWorldDbCompetitionRuntimeV1 } from './WorldDbCompetitionRuntime'
import { createWorldDbCompetitionRulesV1 } from './WorldDbCompetitionRules'
import { instantiateWorldDbCompetitionV1 } from './WorldDbCompetitionInstance'

function bundle(pairingType: string, pairingPayload: Readonly<Record<string, unknown>> | null = null): WorldDbCompetitionBundleV1 {
  return {
    schemaVersion: 1,
    source: { databaseId: 'phase1.db', schemaId: 'DDL-PHASE1-A' },
    competitionSeason: {
      competitionSeasonId: 'edition:test:2026-27',
      competitionId: 'competition:test',
      seasonId: 'season:2026-27',
      editionNumber: null,
    },
    entries: [],
    structureNodes: [
      { competitionStructureNodeId: 'node:opening', nodeType: 'ROUND', name: 'Opening', sequenceNo: null },
      { competitionStructureNodeId: 'node:final', nodeType: 'ROUND', name: 'Final', sequenceNo: null },
    ],
    structurePositions: [],
    structureEdges: [],
    structureEntryAssignments: [],
    fixtures: [],
    fixtureSides: [],
    rulePayloads: {
      pairing: [
        { id: 'pairing:opening', scopeStructureNodeId: 'node:opening', type: pairingType, payload: pairingPayload },
      ],
      progressionRules: [
        { id: 'progression:opening', scopeStructureNodeId: 'node:opening', type: 'GAME_WINNER', payload: null },
      ],
      progressionDestinations: [
        {
          id: 'destination:final',
          ruleId: 'progression:opening',
          sequenceNo: 1,
          type: 'STRUCTURE_NODE',
          payload: { competition_structure_node_id: 'node:final' },
        },
      ],
    },
  }
}

function runtimeAndRules(pairingType: string, pairingPayload: Readonly<Record<string, unknown>> | null = null) {
  const value = bundle(pairingType, pairingPayload)
  return {
    runtime: createWorldDbCompetitionRuntimeV1(value),
    rules: createWorldDbCompetitionRulesV1(value),
  }
}

describe('World DB competition instance', () => {
  it('keeps declarative draws pending until an explicit deterministic order exists', () => {
    const { runtime, rules } = runtimeAndRules('DRAW_PAIRING')
    const instance = instantiateWorldDbCompetitionV1(runtime, rules, {
      participantTeamIds: ['team:a', 'team:b', 'team:c', 'team:d'],
    })

    expect(instance.status).toBe('awaitingDraw')
    expect(instance.fixtures).toEqual([])
    expect(instance.requirements).toEqual([
      {
        kind: 'DRAW',
        structureNodeId: 'node:opening',
        teamIds: ['team:a', 'team:b', 'team:c', 'team:d'],
      },
    ])
  })

  it('materializes a draw into save-owned fixtures without inventing canonical fixture IDs', () => {
    const { runtime, rules } = runtimeAndRules('DRAW_PAIRING')
    const instance = instantiateWorldDbCompetitionV1(runtime, rules, {
      participantTeamIds: ['team:a', 'team:b', 'team:c', 'team:d'],
      pairingOrderByNodeId: {
        'node:opening': ['team:c', 'team:a', 'team:d', 'team:b'],
      },
    })

    expect(instance.status).toBe('ready')
    expect(instance.fixtures).toEqual([
      {
        instanceFixtureId: 'instance-fixture:edition:test:2026-27:node:opening:1',
        sourceCompetitionFixtureId: null,
        structureNodeId: 'node:opening',
        ordinal: 1,
        homeTeamId: 'team:c',
        awayTeamId: 'team:a',
      },
      {
        instanceFixtureId: 'instance-fixture:edition:test:2026-27:node:opening:2',
        sourceCompetitionFixtureId: null,
        structureNodeId: 'node:opening',
        ordinal: 2,
        homeTeamId: 'team:d',
        awayTeamId: 'team:b',
      },
    ])
  })

  it('expands round-robin meetings generically from B04 pairing payloads', () => {
    const { runtime, rules } = runtimeAndRules('ROUND_ROBIN_PAIRING', { meetings_per_pair: 2 })
    const instance = instantiateWorldDbCompetitionV1(runtime, rules, {
      participantTeamIds: ['team:a', 'team:b', 'team:c'],
    })

    expect(instance.status).toBe('ready')
    expect(instance.fixtures).toHaveLength(6)
    expect(instance.fixtures.map((fixture) => [fixture.homeTeamId, fixture.awayTeamId])).toEqual([
      ['team:a', 'team:b'],
      ['team:a', 'team:c'],
      ['team:b', 'team:c'],
      ['team:b', 'team:a'],
      ['team:c', 'team:a'],
      ['team:c', 'team:b'],
    ])
  })

  it('rejects an explicit draw order that is not a permutation of the participants', () => {
    const { runtime, rules } = runtimeAndRules('DRAW_PAIRING')
    expect(() => instantiateWorldDbCompetitionV1(runtime, rules, {
      participantTeamIds: ['team:a', 'team:b', 'team:c', 'team:d'],
      pairingOrderByNodeId: {
        'node:opening': ['team:a', 'team:b', 'team:c', 'team:x'],
      },
    })).toThrow('Pairing order for node:opening contains an unknown participant')
  })
})
