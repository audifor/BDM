import { describe, expect, it } from 'vitest'
import type { WorldCompetitionRuntimeBundle } from '@/domain/competition'
import { getWorldDbCompetitionRuntimeStateV1, withWorldDbCompetitionRuntimeStateV1 } from '@/domain/worldDb/CompetitionRuntimeState'
import type { WorldDatabaseRepository } from '@/tauri/TauriWorldDatabaseRepository'
import { createNewGame } from './createNewGame'
import { loadWorldDbCompetitionRuntimeBundleV1 } from './WorldDbCompetitionRuntimeBundleLoader'

const format = {
  schemaVersion: '1.0',
  competitionId: 'competition:test',
  competitionSeasonId: 'competition-season:test',
  seasonLabel: 'Test',
  status: 'COMPLETE',
  variants: [],
  consequences: [],
  sources: [],
} as const

const bundle: WorldCompetitionRuntimeBundle = {
  bundleSchemaVersion: 1,
  contentId: 'bdm-phase1-competition-runtime-v1',
  contentHashAlgorithm: 'BLAKE3',
  contentHash: 'a'.repeat(64),
  worldDbSchema: 'DDL-PHASE1-A',
  competitionFormats: [format],
  initialScoreDocuments: [],
}

function repository(value: WorldCompetitionRuntimeBundle): WorldDatabaseRepository {
  return {
    async loadCompetitionSeason() { throw new Error('not used') },
    async loadMatchRealizations() { throw new Error('not used') },
    async loadCompetitionRuntimeBundle() { return value },
  }
}

function worldForSeason(competitionSeasonId: string, pinnedHash: string | null = null) {
  return withWorldDbCompetitionRuntimeStateV1(createNewGame(), {
    schemaVersion: 1,
    competitionRuntimeBundle: pinnedHash === null ? null : {
      contentId: bundle.contentId,
      contentHash: pinnedHash,
      worldDbSchema: bundle.worldDbSchema,
    },
    competitionSeasonSources: [{ databaseId: 'world.db', competitionSeasonId }],
    gameFixtureBindings: [],
    resolvedStructurePositions: [],
    fixtureOutcomes: [],
  })
}

describe('World DB competition runtime bundle loader', () => {
  it('loads a catalog and pins bundle identity when every active save season is present', async () => {
    const loaded = await loadWorldDbCompetitionRuntimeBundleV1(
      worldForSeason('competition-season:test'),
      'phase1.json',
      repository(bundle),
    )
    expect(loaded.bundle.contentHash).toBe('a'.repeat(64))
    expect(loaded.catalog.formatsBySeasonId['competition-season:test']).toEqual(format)
    expect(getWorldDbCompetitionRuntimeStateV1(loaded.world).competitionRuntimeBundle).toEqual({
      contentId: bundle.contentId,
      contentHash: bundle.contentHash,
      worldDbSchema: bundle.worldDbSchema,
    })
  })

  it('rejects a runtime bundle that cannot reconstruct an active save season', async () => {
    await expect(loadWorldDbCompetitionRuntimeBundleV1(
      worldForSeason('competition-season:missing'),
      'phase1.json',
      repository(bundle),
    )).rejects.toThrow('missing active season')
  })

  it('rejects runtime bundle drift after the save has pinned a different digest', async () => {
    await expect(loadWorldDbCompetitionRuntimeBundleV1(
      worldForSeason('competition-season:test', 'b'.repeat(64)),
      'phase1.json',
      repository(bundle),
    )).rejects.toThrow('runtime bundle drift')
  })
})
