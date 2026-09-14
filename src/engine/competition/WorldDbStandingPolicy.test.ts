import { describe, expect, it } from 'vitest'

import type { WorldDbCompetitionBundleV1 } from '@/domain/worldDb/CompetitionBundle'
import { createWorldDbCompetitionRulesV1 } from './WorldDbCompetitionRules'
import { resolveWorldDbStandingPolicyForNodeV1 } from './WorldDbStandingPolicy'

function rules(payloads: WorldDbCompetitionBundleV1['rulePayloads']) {
  const bundle: WorldDbCompetitionBundleV1 = {
    schemaVersion: 1,
    source: { databaseId: 'world.db', schemaId: 'DDL-PHASE1-A' },
    competitionSeason: { competitionSeasonId: 'season:1', competitionId: 'competition:1', seasonId: '2026', editionNumber: null },
    entries: [], structureNodes: [], structureEdges: [], structureEntryAssignments: [], fixtures: [], fixtureSides: [], rulePayloads: payloads,
  }
  return createWorldDbCompetitionRulesV1(bundle)
}

describe('WorldDbStandingPolicy', () => {
  it('reconstructs one node policy and preserves ordered opaque tiebreak semantics', () => {
    const policy = resolveWorldDbStandingPolicyForNodeV1(rules({
      standingSchemes: [{ id: 'scheme:1', name: 'Official' }],
      standingTables: [{ id: 'table:1', schemeId: 'scheme:1', scopeStructureNodeId: 'node:regular' }],
      standingMetricDefinitions: [{ id: 'metric:w', schemeId: 'scheme:1', metricCode: 'WINS', operation: 'COUNT', sourceScope: 'RESULTS' }],
      standingPointsRules: [{ id: 'points:1', schemeId: 'scheme:1', priority: 10, type: 'WIN_LOSS' }],
      standingNormalizationRules: [{ id: 'norm:1', schemeId: 'scheme:1', priority: 5, type: 'WIN_PERCENTAGE' }],
      tiebreakerRulesets: [{ id: 'tb:1', schemeId: 'scheme:1', name: 'Official order' }],
      tiebreakerRules: [
        { id: 'tb:2', rulesetId: 'tb:1', sequenceNo: 2, criterion: 'POINT_DIFFERENCE' },
        { id: 'tb:1', rulesetId: 'tb:1', sequenceNo: 1, criterion: 'HEAD_TO_HEAD' },
      ],
      tiebreakerConditions: [{ id: 'condition:1', ruleId: 'tb:1', type: 'TIED_ENTRIES', payload: { min: 2 } }],
      tiebreakerActions: [{ id: 'action:1', ruleId: 'tb:1', type: 'APPLY_CRITERION' }],
    }), 'node:regular')

    expect(policy?.scheme.id).toBe('scheme:1')
    expect(policy?.normalizationRules.map((row) => row.id)).toEqual(['norm:1'])
    expect(policy?.tiebreakerRulesets[0]?.rules.map((item) => item.rule.criterion)).toEqual(['HEAD_TO_HEAD', 'POINT_DIFFERENCE'])
    expect(policy?.tiebreakerRulesets[0]?.rules[0]?.conditions.map((row) => row.id)).toEqual(['condition:1'])
  })

  it('returns null when a node has no standing table', () => {
    expect(resolveWorldDbStandingPolicyForNodeV1(rules({}), 'node:none')).toBeNull()
  })

  it('rejects ambiguous tables and broken tiebreak references', () => {
    expect(() => resolveWorldDbStandingPolicyForNodeV1(rules({
      standingSchemes: [{ id: 'scheme:1' }],
      standingTables: [
        { id: 'table:1', schemeId: 'scheme:1', scopeStructureNodeId: 'node:regular' },
        { id: 'table:2', schemeId: 'scheme:1', scopeStructureNodeId: 'node:regular' },
      ],
    }), 'node:regular')).toThrow('multiple standing tables')

    expect(() => resolveWorldDbStandingPolicyForNodeV1(rules({
      standingSchemes: [{ id: 'scheme:1' }],
      standingTables: [{ id: 'table:1', schemeId: 'scheme:1', scopeStructureNodeId: 'node:regular' }],
      tiebreakerRules: [{ id: 'rule:1', rulesetId: 'missing', sequenceNo: 1, criterion: 'HEAD_TO_HEAD' }],
    }), 'node:regular')).toThrow('unknown ruleset')
  })

  it('rejects duplicate sequence numbers inside one ruleset', () => {
    expect(() => resolveWorldDbStandingPolicyForNodeV1(rules({
      standingSchemes: [{ id: 'scheme:1' }],
      standingTables: [{ id: 'table:1', schemeId: 'scheme:1', scopeStructureNodeId: 'node:regular' }],
      tiebreakerRulesets: [{ id: 'tb:1', schemeId: 'scheme:1' }],
      tiebreakerRules: [
        { id: 'rule:1', rulesetId: 'tb:1', sequenceNo: 1, criterion: 'A' },
        { id: 'rule:2', rulesetId: 'tb:1', sequenceNo: 1, criterion: 'B' },
      ],
    }), 'node:regular')).toThrow('duplicate sequence')
  })
})
