import { describe, expect, it } from 'vitest'
import type { WorldDbCompetitionBundleV1 } from '@/domain/worldDb/CompetitionBundle'
import { projectWorldDbPhysicalMatchPolicyV1 } from './WorldDbPhysicalMatchPolicy'

function bundle(rulePayloads: WorldDbCompetitionBundleV1['rulePayloads']): WorldDbCompetitionBundleV1 {
  return {
    schemaVersion: 1,
    source: { databaseId: 'world.db', schemaId: 'DDL-PHASE1-A' },
    competitionSeason: {
      competitionSeasonId: 'edition:NAM:nba-cup:2025-26',
      competitionId: 'competition:NAM:nba-cup',
      seasonId: 'season:2025-26',
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

describe('WorldDbPhysicalMatchPolicy', () => {
  it('projects season-level sharing and node-scoped physical contexts without interpreting vocabulary', () => {
    const policy = projectWorldDbPhysicalMatchPolicyV1(bundle({
      entrySelectionCriteria: [{
        id: 'criterion:1',
        type: 'PAYLOAD',
        payload: {
          shared_competition_season_id: 'edition:NAM:nba:2025-26',
          shared_match_policy: {
            GROUP_PLAY: 'ALSO_NBA_REGULAR_SEASON',
            CHAMPIONSHIP: 'CUP_ONLY',
          },
        },
      }],
      opponentScope: [{
        id: 'scope:group',
        scopeStructureNodeId: 'node:EAST_A',
        type: 'SAME_GROUP',
        payload: { physical_match_context: 'SHARED_WITH_NBA_REGULAR_SEASON' },
      }],
      pairing: [{
        id: 'pairing:qf',
        scopeStructureNodeId: 'node:QUARTERFINALS',
        type: 'SEEDED_BRACKET_PAIRING',
        payload: { physical_match_context: 'SHARED_WITH_NBA_REGULAR_SEASON' },
      }],
    }))

    expect(policy.sharedCompetitionSeasonId).toBe('edition:NAM:nba:2025-26')
    expect(policy.sharedMatchPolicyByPhaseKey).toEqual({
      GROUP_PLAY: 'ALSO_NBA_REGULAR_SEASON',
      CHAMPIONSHIP: 'CUP_ONLY',
    })
    expect(policy.physicalMatchContextByNodeId).toEqual({
      'node:EAST_A': 'SHARED_WITH_NBA_REGULAR_SEASON',
      'node:QUARTERFINALS': 'SHARED_WITH_NBA_REGULAR_SEASON',
    })
  })

  it('rejects conflicting node contexts rather than choosing one silently', () => {
    expect(() => projectWorldDbPhysicalMatchPolicyV1(bundle({
      pairing: [{
        id: 'pairing:1',
        scopeStructureNodeId: 'node:1',
        payload: { physical_match_context: 'SHARED' },
      }],
      hosting: [{
        id: 'hosting:1',
        scopeStructureNodeId: 'node:1',
        payload: { physical_match_context: 'EXCLUSIVE' },
      }],
    }))).toThrow('Conflicting physical-match node context')
  })

  it('rejects conflicting or self-referencing shared competition seasons', () => {
    expect(() => projectWorldDbPhysicalMatchPolicyV1(bundle({
      entrySelectionCriteria: [
        { id: 'criterion:1', payload: { shared_competition_season_id: 'edition:one' } },
        { id: 'criterion:2', payload: { shared_competition_season_id: 'edition:two' } },
      ],
    }))).toThrow('Conflicting shared competition seasons')

    expect(() => projectWorldDbPhysicalMatchPolicyV1(bundle({
      entrySelectionCriteria: [{
        id: 'criterion:self',
        payload: { shared_competition_season_id: 'edition:NAM:nba-cup:2025-26' },
      }],
    }))).toThrow('cannot reference itself')
  })

  it('requires an explicit target season when a shared-match phase policy is declared', () => {
    expect(() => projectWorldDbPhysicalMatchPolicyV1(bundle({
      entrySelectionCriteria: [{
        id: 'criterion:missing-target',
        payload: { shared_match_policy: { GROUP_PLAY: 'SHARED' } },
      }],
    }))).toThrow('requires shared_competition_season_id')
  })
})
