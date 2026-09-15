import { describe, expect, it, vi } from 'vitest'

import type { WorldCompetitionRuntimeBundle } from '@/domain/competition'
import type { GameWorld } from '@/domain/world'
import type { WorldDbCompetitionBundleV1 } from '@/domain/worldDb/CompetitionBundle'
import type { WorldDbDatabaseInfoV1 } from '@/domain/worldDb/DatabaseInfo'
import type { WorldDbMatchRealizationBundleV1 } from '@/domain/worldDb/MatchRealizationBundle'
import type { WorldDatabaseRepository } from '@/tauri/TauriWorldDatabaseRepository'

import { WorldDbSessionV1 } from './WorldDbSession'

const HASH = 'a'.repeat(64)
const databaseInfo: WorldDbDatabaseInfoV1 = {
  schemaVersion: 1,
  source: { databaseId: 'bdm_world_phase1a.db', schemaId: 'DDL-PHASE1-A' },
  competitionSeasonIds: ['season:cup', 'season:regular'],
}
const runtimeBundle: WorldCompetitionRuntimeBundle = {
  bundleSchemaVersion: 1,
  contentId: 'bdm-phase1-competition-runtime-v1',
  contentHashAlgorithm: 'BLAKE3',
  contentHash: HASH,
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

function competitionBundle(
  competitionSeasonId: string,
  databaseId = databaseInfo.source.databaseId,
): WorldDbCompetitionBundleV1 {
  return {
    schemaVersion: 1,
    source: { databaseId, schemaId: databaseInfo.source.schemaId },
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

function repository(
  info: WorldDbDatabaseInfoV1 = databaseInfo,
  bundle: WorldCompetitionRuntimeBundle = runtimeBundle,
): WorldDatabaseRepository {
  return {
    inspectDatabase: vi.fn(async () => info),
    loadCompetitionSeason: vi.fn(async (_path, id) => competitionBundle(id)),
    loadMatchRealizations: vi.fn(async (_path, id) => matchBundle(id)),
    loadCompetitionRuntimeBundle: vi.fn(async () => bundle),
  }
}

function session(repo: WorldDatabaseRepository): WorldDbSessionV1 {
  return new WorldDbSessionV1({
    repository: repo,
    databasePath: ' C:/BDM_DB/DDL-PHASE1-A/output/bdm_world_phase1a.db ',
    runtimeBundlePath: ' C:/BDM_DB/phase1-competition-runtime-bundle.json ',
  })
}

function world(
  competitionSeasonIds: readonly string[] = ['season:regular'],
  pinned = true,
): GameWorld {
  return {
    worldDbCompetitionRuntime: {
      competitionRuntimeBundle: pinned
        ? {
            contentId: runtimeBundle.contentId,
            contentHash: runtimeBundle.contentHash,
            worldDbSchema: runtimeBundle.worldDbSchema,
          }
        : null,
      competitionPlanIds: [],
      competitionSeasonIds,
    },
  } as unknown as GameWorld
}

describe('WorldDbSessionV1', () => {
  it('opens the external database and exposes non-persisted source identity', async () => {
    const repo = repository()
    const runtime = session(repo)

    const snapshot = await runtime.open()

    expect(snapshot).toEqual({
      databasePath: 'C:/BDM_DB/DDL-PHASE1-A/output/bdm_world_phase1a.db',
      runtimeBundlePath: 'C:/BDM_DB/phase1-competition-runtime-bundle.json',
      databaseId: 'bdm_world_phase1a.db',
      schemaId: 'DDL-PHASE1-A',
      runtimeBundlePin: {
        contentId: runtimeBundle.contentId,
        contentHash: HASH,
        worldDbSchema: 'DDL-PHASE1-A',
      },
      availableCompetitionSeasonIds: ['season:cup', 'season:regular'],
    })
    expect(runtime.isOpen).toBe(true)
    expect(repo.inspectDatabase).toHaveBeenCalledWith(
      'C:/BDM_DB/DDL-PHASE1-A/output/bdm_world_phase1a.db',
    )
  })

  it('rejects an incompatible database/runtime schema pair', async () => {
    const runtime = session(repository({
      ...databaseInfo,
      source: { ...databaseInfo.source, schemaId: 'DDL-OLD' },
    }))

    await expect(runtime.open()).rejects.toThrow('Incompatible World DB schema')
    expect(runtime.isOpen).toBe(false)
  })

  it('creates a deterministic active subset only from executable database seasons', async () => {
    const runtime = session(repository())
    await runtime.open()

    expect(runtime.selectCompetitionSeasons(['season:regular', 'season:cup'])).toEqual({
      competitionRuntimeBundle: {
        contentId: runtimeBundle.contentId,
        contentHash: HASH,
        worldDbSchema: runtimeBundle.worldDbSchema,
      },
      competitionPlanIds: [],
      competitionSeasonIds: ['season:cup', 'season:regular'],
    })
    expect(() => runtime.selectCompetitionSeasons(['season:missing'])).toThrow('not present')
  })

  it('rehydrates Save V4 contexts and caches immutable B04/B12 reads', async () => {
    const repo = repository()
    const runtime = session(repo)
    await runtime.open()

    const first = await runtime.prepareWorld(world())
    const second = await runtime.prepareWorld(first.world)

    expect(first.contexts).toHaveLength(1)
    expect(second.contexts).toBe(first.contexts)
    expect(repo.loadCompetitionSeason).toHaveBeenCalledTimes(1)
    expect(repo.loadMatchRealizations).toHaveBeenCalledTimes(1)
    expect(repo.loadCompetitionRuntimeBundle).toHaveBeenCalledTimes(3)
  })

  it('reloads contexts when the Save V4 active season subset changes', async () => {
    const repo = repository()
    const runtime = session(repo)
    await runtime.open()

    await runtime.prepareWorld(world(['season:regular']))
    await runtime.prepareWorld(world(['season:regular', 'season:cup']))

    expect(repo.loadCompetitionSeason).toHaveBeenCalledTimes(3)
    expect(repo.loadMatchRealizations).toHaveBeenCalledTimes(3)
  })

  it('rejects B04 context loaded from a different database identity', async () => {
    const repo = repository()
    repo.loadCompetitionSeason = vi.fn(async (_path, id) => competitionBundle(id, 'other.db'))
    const runtime = session(repo)
    await runtime.open()

    await expect(runtime.prepareWorld(world())).rejects.toThrow('database identity mismatch')
  })

  it('closes and reopens without persisting physical paths in GameWorld', async () => {
    const repo = repository()
    const runtime = session(repo)
    await runtime.open()
    runtime.close()

    expect(runtime.isOpen).toBe(false)
    expect(() => runtime.snapshot()).toThrow('session is closed')

    await runtime.reopen()
    expect(runtime.isOpen).toBe(true)
    expect(repo.inspectDatabase).toHaveBeenCalledTimes(2)
  })

  it('rejects empty external paths before repository access', () => {
    expect(() => new WorldDbSessionV1({
      repository: repository(),
      databasePath: ' ',
      runtimeBundlePath: 'runtime.json',
    })).toThrow('databasePath')
  })
})
