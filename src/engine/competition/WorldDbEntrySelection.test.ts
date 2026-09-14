import { describe, expect, it } from 'vitest'

import type { WorldDbCompetitionBundleV1 } from '@/domain/worldDb/CompetitionBundle'
import { createWorldDbCompetitionRuntimeV1 } from './WorldDbCompetitionRuntime'
import { createWorldDbCompetitionRulesV1 } from './WorldDbCompetitionRules'
import { resolveWorldDbEntrySelectionV1 } from './WorldDbEntrySelection'

function bundle(rulePayloads: WorldDbCompetitionBundleV1['rulePayloads'], teamIds: readonly string[] = []): WorldDbCompetitionBundleV1 {
  return {
    schemaVersion: 1,
    source: { databaseId: 'phase1.db', schemaId: 'DDL-PHASE1-A' },
    competitionSeason: {
      competitionSeasonId: 'edition:target',
      competitionId: 'competition:target',
      seasonId: 'season:2026-27',
      editionNumber: null,
    },
    entries: teamIds.map((teamId, index) => ({ competitionSeasonEntryId: `entry:${index + 1}`, teamId })),
    structureNodes: [],
    structurePositions: [],
    structureEdges: [],
    structureEntryAssignments: [],
    fixtures: [],
    fixtureSides: [],
    rulePayloads,
  }
}

function resolve(value: WorldDbCompetitionBundleV1, input: Parameters<typeof resolveWorldDbEntrySelectionV1>[2] = {}) {
  return resolveWorldDbEntrySelectionV1(
    createWorldDbCompetitionRuntimeV1(value),
    createWorldDbCompetitionRulesV1(value),
    input,
  )
}

describe('World DB entry selection', () => {
  it('uses materialized direct entries when no selection process is declared', () => {
    expect(resolve(bundle({}, ['team:a', 'team:b']))).toEqual({
      status: 'ready',
      teamIds: ['team:a', 'team:b'],
      requirements: [],
    })
  })

  it('resolves Copa-style RANK_BASED top eight from supplied source standings', () => {
    const value = bundle({
      entrySelectionProcesses: [
        { id: 'process:copa', method: 'RANK_BASED' },
      ],
      entrySelectionCriteria: [
        {
          id: 'criterion:copa',
          processId: 'process:copa',
          sequenceNo: 0,
          type: 'PAYLOAD',
          payload: {
            source_competition_season_id: 'edition:league',
            reference_point: 'AFTER_MATCHDAY_17',
            rank_from: 1,
            rank_to: 8,
            team_count: 8,
          },
        },
      ],
    })
    const standings = Array.from({ length: 18 }, (_, index) => `team:${index + 1}`)

    expect(resolve(value, { standingTeamIdsByCompetitionSeasonId: { 'edition:league': standings } })).toEqual({
      status: 'ready',
      teamIds: standings.slice(0, 8),
      requirements: [],
    })
  })

  it('keeps RANK_BASED pending when the source standings snapshot is unavailable', () => {
    const value = bundle({
      entrySelectionProcesses: [{ id: 'process:rank', method: 'RANK_BASED' }],
      entrySelectionCriteria: [{
        id: 'criterion:rank',
        processId: 'process:rank',
        sequenceNo: 0,
        type: 'PAYLOAD',
        payload: { source_competition_season_id: 'edition:source', rank_from: 1, rank_to: 4, team_count: 4 },
      }],
    })
    const result = resolve(value)
    expect(result.status).toBe('pending')
    expect(result.requirements[0]).toMatchObject({
      processId: 'process:rank',
      method: 'RANK_BASED',
      expectedTeamCount: 4,
    })
  })

  it('keeps NCAA-style committee selection pending instead of fabricating a field', () => {
    const value = bundle({
      entrySelectionProcesses: [{ id: 'process:ncaa', method: 'COMMITTEE_SELECTION' }],
      entrySelectionCriteria: [{
        id: 'criterion:ncaa',
        processId: 'process:ncaa',
        sequenceNo: 0,
        type: 'PAYLOAD',
        payload: { team_count: 76 },
      }],
    })
    expect(resolve(value)).toMatchObject({
      status: 'pending',
      teamIds: [],
      requirements: [{ processId: 'process:ncaa', method: 'COMMITTEE_SELECTION', expectedTeamCount: 76 }],
    })
  })

  it('accepts an explicit institutional selection only when its declared size is satisfied', () => {
    const value = bundle({
      entrySelectionProcesses: [{ id: 'process:ncaa', method: 'COMMITTEE_SELECTION' }],
      entrySelectionCriteria: [{
        id: 'criterion:ncaa',
        processId: 'process:ncaa',
        sequenceNo: 0,
        type: 'PAYLOAD',
        payload: { team_count: 4 },
      }],
    })
    expect(resolve(value, {
      explicitTeamIdsByProcessId: { 'process:ncaa': ['team:a', 'team:b', 'team:c', 'team:d'] },
    })).toEqual({
      status: 'ready',
      teamIds: ['team:a', 'team:b', 'team:c', 'team:d'],
      requirements: [],
    })
    expect(() => resolve(value, {
      explicitTeamIdsByProcessId: { 'process:ncaa': ['team:a', 'team:b'] },
    })).toThrow('expected 4 teams, found 2')
  })
})
