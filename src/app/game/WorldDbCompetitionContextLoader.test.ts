import { describe, expect, it, vi } from 'vitest'
import type { WorldDbCompetitionRuntime } from '@/domain/world'
import type { WorldDbCompetitionBundleV1 } from '@/domain/worldDb/CompetitionBundle'
import type { WorldDbMatchRealizationBundleV1 } from '@/domain/worldDb/MatchRealizationBundle'
import type { WorldDatabaseRepository } from '@/tauri/TauriWorldDatabaseRepository'
import { loadWorldDbCompetitionPlanningContextsV1 } from './WorldDbCompetitionContextLoader'

const runtime: WorldDbCompetitionRuntime = {
  competitionPlanIds: ['plan:regular', 'plan:cup'],
  competitionSeasonIds: ['season:regular', 'season:cup'],
}

function competitionBundle(competitionSeasonId: string): WorldDbCompetitionBundleV1 {
  return {
    schemaVersion: 1,
    source: { databaseId: 'world.db', schemaId: 'DDL-PHASE1-A' },
    competitionSeason: {
      competitionSeasonId,
      competitionId: `competition:${competitionSeasonId}`,
      seasonId: 'season:2026',
      editionNumber: 1,
    },
    entries: [],
    structureNodes: [],
    structureEdges: [],
    structureEntryAssignments: [],
    fixtures: [],
    fixtureSides: [],
    rulePayloads: {},
  }
}

function matchBundle(competitionSeasonId: string): WorldDbMatchRealizationBundleV1 {
  return { schemaVersion: 1, competitionSeasonId, matches: [], realizations: [] }
}

function repository(): WorldDatabaseRepository {
  return {
    loadCompetitionSeason: vi.fn(async (_databasePath, competitionSeasonId) => competitionBundle(competitionSeasonId)),
    loadMatchRealizations: vi.fn(async (_databasePath, competitionSeasonId) => matchBundle(competitionSeasonId)),
  }
}

describe('WorldDbCompetitionContextLoader', () => {
  it('reloads B04 and B12 for every persisted competition season', async () => {
    const repo = repository()
    const contexts = await loadWorldDbCompetitionPlanningContextsV1(repo, 'C:/BDM_DB/world.db', runtime)

    expect(contexts.map((context) => context.bundle.competitionSeason.competitionSeasonId)).toEqual([
      'season:regular',
      'season:cup',
    ])
    expect(contexts.map((context) => context.matchRealizations?.competitionSeasonId)).toEqual([
      'season:regular',
      'season:cup',
    ])
    expect(repo.loadCompetitionSeason).toHaveBeenCalledTimes(2)
    expect(repo.loadMatchRealizations).toHaveBeenCalledTimes(2)
  })

  it('returns no contexts for an empty persisted runtime', async () => {
    const repo = repository()
    const contexts = await loadWorldDbCompetitionPlanningContextsV1(repo, 'C:/BDM_DB/world.db', {
      competitionPlanIds: [],
      competitionSeasonIds: [],
    })

    expect(contexts).toEqual([])
    expect(repo.loadCompetitionSeason).not.toHaveBeenCalled()
    expect(repo.loadMatchRealizations).not.toHaveBeenCalled()
  })

  it('rejects a B04 competition-season mismatch', async () => {
    const repo = repository()
    repo.loadCompetitionSeason = vi.fn(async () => competitionBundle('season:wrong'))

    await expect(
      loadWorldDbCompetitionPlanningContextsV1(repo, 'C:/BDM_DB/world.db', runtime),
    ).rejects.toThrow('World DB competition season mismatch')
  })

  it('rejects a B12 competition-season mismatch', async () => {
    const repo = repository()
    repo.loadMatchRealizations = vi.fn(async () => matchBundle('season:wrong'))

    await expect(
      loadWorldDbCompetitionPlanningContextsV1(repo, 'C:/BDM_DB/world.db', runtime),
    ).rejects.toThrow('World DB B12 competition season mismatch')
  })

  it('rejects an empty physical path before repository access', async () => {
    const repo = repository()

    await expect(loadWorldDbCompetitionPlanningContextsV1(repo, ' ', runtime)).rejects.toThrow(
      'databasePath',
    )
    expect(repo.loadCompetitionSeason).not.toHaveBeenCalled()
    expect(repo.loadMatchRealizations).not.toHaveBeenCalled()
  })
})
