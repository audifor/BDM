import { describe, expect, it, vi } from 'vitest'
import type { WorldCompetitionRuntimeBundle } from '@/domain/competition'
import { attachWorldDbCompetitionRuntime, type WorldDbCompetitionRuntime } from '@/domain/world'
import type { WorldDbCompetitionBundleV1 } from '@/domain/worldDb/CompetitionBundle'
import type { WorldDbDatabaseInfoV1 } from '@/domain/worldDb/DatabaseInfo'
import type { WorldDbMatchRealizationBundleV1 } from '@/domain/worldDb/MatchRealizationBundle'
import type { WorldDatabaseRepository } from '@/tauri/TauriWorldDatabaseRepository'
import { createNewGame } from './createNewGame'
import {
  loadWorldDbCompetitionPlanningContextsV1,
  loadWorldDbCompetitionRuntimeCatalogV1,
} from './WorldDbCompetitionContextLoader'

const runtime: WorldDbCompetitionRuntime = {
  competitionRuntimeBundle: null,
  competitionPlanIds: ['plan:regular', 'plan:cup'],
  competitionSeasonIds: ['season:regular', 'season:cup'],
}

const runtimeBundle: WorldCompetitionRuntimeBundle = {
  bundleSchemaVersion: 1,
  contentId: 'bdm-phase1-competition-runtime-v1',
  contentHashAlgorithm: 'BLAKE3',
  contentHash: 'a'.repeat(64),
  worldDbSchema: 'DDL-PHASE1-A',
  competitionFormats: [
    {
      schemaVersion: '1.0',
      competitionId: 'competition:regular',
      competitionSeasonId: 'season:regular',
      seasonLabel: 'Regular',
      status: 'COMPLETE',
      variants: [],
      consequences: [],
      sources: [],
    },
    {
      schemaVersion: '1.0',
      competitionId: 'competition:cup',
      competitionSeasonId: 'season:cup',
      seasonLabel: 'Cup',
      status: 'COMPLETE',
      variants: [],
      consequences: [],
      sources: [],
    },
  ],
  initialScoreDocuments: [],
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

function repository(bundle: WorldCompetitionRuntimeBundle = runtimeBundle): WorldDatabaseRepository {
  return {
    inspectDatabase: vi.fn(async (): Promise<WorldDbDatabaseInfoV1> => ({
      schemaVersion: 1,
      source: { databaseId: 'world.db', schemaId: 'DDL-PHASE1-A' },
      competitionSeasonIds: ['season:regular', 'season:cup'],
    })),
    loadSelectionCatalog: vi.fn(),
    loadCompetitionSeason: vi.fn(async (_databasePath, competitionSeasonId) => competitionBundle(competitionSeasonId)),
    loadMatchRealizations: vi.fn(async (_databasePath, competitionSeasonId) => matchBundle(competitionSeasonId)),
    loadCompetitionRuntimeBundle: vi.fn(async () => bundle),
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
      competitionRuntimeBundle: null,
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

  it('rejects an empty runtime bundle path before repository access', async () => {
    const repo = repository()
    const world = attachWorldDbCompetitionRuntime(createNewGame(), runtime)

    await expect(
      loadWorldDbCompetitionRuntimeCatalogV1(repo, ' ', world),
    ).rejects.toThrow('bundlePath')
    expect(repo.loadCompetitionRuntimeBundle).not.toHaveBeenCalled()
  })

  it('loads the runtime catalog and pins its logical identity', async () => {
    const world = attachWorldDbCompetitionRuntime(createNewGame(), runtime)
    const loaded = await loadWorldDbCompetitionRuntimeCatalogV1(
      repository(),
      'C:/BDM_DB/phase1-competition-runtime-bundle.json',
      world,
    )

    expect(loaded.catalog.formatsBySeasonId['season:regular']).toBeDefined()
    expect(loaded.catalog.formatsBySeasonId['season:cup']).toBeDefined()
    expect(loaded.world.worldDbCompetitionRuntime?.competitionRuntimeBundle).toEqual({
      contentId: runtimeBundle.contentId,
      contentHash: runtimeBundle.contentHash,
      worldDbSchema: runtimeBundle.worldDbSchema,
    })
  })

  it('rejects a runtime bundle that is missing an active saved season', async () => {
    const incompleteBundle: WorldCompetitionRuntimeBundle = {
      ...runtimeBundle,
      competitionFormats: runtimeBundle.competitionFormats.slice(0, 1),
    }
    const world = attachWorldDbCompetitionRuntime(createNewGame(), runtime)

    await expect(
      loadWorldDbCompetitionRuntimeCatalogV1(repository(incompleteBundle), 'phase1.json', world),
    ).rejects.toThrow('missing active season')
  })

  it('rejects runtime bundle drift after identity has been pinned', async () => {
    const world = attachWorldDbCompetitionRuntime(createNewGame(), {
      ...runtime,
      competitionRuntimeBundle: {
        contentId: runtimeBundle.contentId,
        contentHash: 'b'.repeat(64),
        worldDbSchema: runtimeBundle.worldDbSchema,
      },
    })

    await expect(
      loadWorldDbCompetitionRuntimeCatalogV1(repository(), 'phase1.json', world),
    ).rejects.toThrow('runtime bundle drift')
  })
})
