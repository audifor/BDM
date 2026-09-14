import { describe, expect, it } from 'vitest'

import type { WorldDbCompetitionBundleV1 } from '@/domain/worldDb/CompetitionBundle'
import { createWorldDbCompetitionRulesV1 } from './WorldDbCompetitionRules'

function bundle(rulePayloads: WorldDbCompetitionBundleV1['rulePayloads']): WorldDbCompetitionBundleV1 {
  return {
    schemaVersion: 1,
    source: { databaseId: 'phase1.db', schemaId: 'DDL-PHASE1-A' },
    competitionSeason: {
      competitionSeasonId: 'season:test',
      competitionId: 'competition:test',
      seasonId: 'season:2026-27',
      editionNumber: null,
    },
    entries: [],
    structureNodes: [],
    structureEdges: [],
    structureEntryAssignments: [],
    fixtures: [],
    fixtureSides: [],
    rulePayloads,
  }
}

describe('World DB competition rules projection', () => {
  it('indexes scoped rules without knowing the competition', () => {
    const rules = createWorldDbCompetitionRulesV1(bundle({
      pairing: [{ id: 'pair:1', scopeStructureNodeId: 'node:qf', type: 'DRAW_PAIRING' }],
      hosting: [{ id: 'host:1', scopeStructureNodeId: 'node:qf', type: 'NEUTRAL' }],
      progressionRules: [{ id: 'progress:1', scopeStructureNodeId: 'node:qf', type: 'GAME_WINNER' }],
    }))

    expect(rules.rulesByNodeId['node:qf']?.map((rule) => rule.id)).toEqual([
      'pair:1',
      'host:1',
      'progress:1',
    ])
  })

  it('supports Phase 1 initial-score rules generically', () => {
    const rules = createWorldDbCompetitionRulesV1(bundle({
      initialScore: [{
        id: 'score:1',
        scopeStructureNodeId: 'node:r1',
        type: 'INITIAL_SCORE_HANDICAP',
        priority: 0,
        compositionMode: 'ADDITIVE',
        payload: { beneficiary: 'LOWER_LEVEL_TEAM', pointsPerLevel: 7 },
      }],
    }))

    expect(rules.initialScore[0]?.type).toBe('INITIAL_SCORE_HANDICAP')
    expect(rules.initialScore[0]?.payload).toEqual({ beneficiary: 'LOWER_LEVEL_TEAM', pointsPerLevel: 7 })
  })

  it('projects canonical standings and tiebreak policy without interpreting criteria', () => {
    const rules = createWorldDbCompetitionRulesV1(bundle({
      standingSchemes: [{ id: 'standing:1', name: 'Regular season' }],
      standingTables: [{ id: 'table:1', schemeId: 'standing:1', scopeStructureNodeId: 'node:regular', name: 'League table' }],
      standingMetricDefinitions: [{ id: 'metric:1', schemeId: 'standing:1', metricCode: 'WINS', operation: 'COUNT', sourceScope: 'RESULTS' }],
      tiebreakerRulesets: [{ id: 'tb:1', schemeId: 'standing:1', name: 'Official order' }],
      tiebreakerRules: [{ id: 'tb-rule:1', rulesetId: 'tb:1', sequenceNo: 1, criterion: 'HEAD_TO_HEAD', unavailableDataAction: 'NEXT' }],
      tiebreakerConditions: [{ id: 'tb-condition:1', ruleId: 'tb-rule:1', type: 'TIED_ENTRIES', payload: { minimum: 2 } }],
      tiebreakerActions: [{ id: 'tb-action:1', ruleId: 'tb-rule:1', type: 'APPLY_CRITERION', payload: null }],
    }))

    expect(rules.standingTables[0]?.scopeStructureNodeId).toBe('node:regular')
    expect(rules.tiebreakerRules[0]?.criterion).toBe('HEAD_TO_HEAD')
    expect(rules.tiebreakerConditions[0]?.payload).toEqual({ minimum: 2 })
    expect(rules.rulesByNodeId['node:regular']?.map((rule) => rule.id)).toEqual(['table:1'])
  })

  it('keeps absent standings policy families backward compatible', () => {
    const rules = createWorldDbCompetitionRulesV1(bundle({}))
    expect(rules.standingSchemes).toEqual([])
    expect(rules.tiebreakerRules).toEqual([])
  })

  it('rejects malformed rule records at the engine boundary', () => {
    expect(() => createWorldDbCompetitionRulesV1(bundle({
      pairing: [{ type: 'DRAW_PAIRING' }],
    }))).toThrow('must have a non-empty id')
  })
})
