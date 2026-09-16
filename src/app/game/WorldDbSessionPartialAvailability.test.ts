import { describe, expect, it, vi } from 'vitest'

import type { WorldCompetitionRuntimeBundle } from '@/domain/competition'
import type { WorldDbDatabaseInfoV1 } from '@/domain/worldDb/DatabaseInfo'
import type { WorldDatabaseRepository } from '@/tauri/TauriWorldDatabaseRepository'

import { WorldDbSessionV1 } from './WorldDbSession'

const runtimeBundle: WorldCompetitionRuntimeBundle = {
  bundleSchemaVersion: 1,
  contentId: 'bdm-phase1-competition-runtime-v1',
  contentHashAlgorithm: 'BLAKE3',
  contentHash: 'a'.repeat(64),
  worldDbSchema: 'DDL-PHASE1-A',
  competitionFormats: [
    {
      schemaVersion: '1.0',
      competitionId: 'competition:available',
      competitionSeasonId: 'season:available',
      seasonLabel: 'Available',
      status: 'COMPLETE',
      variants: [],
      consequences: [],
      sources: [],
    },
    {
      schemaVersion: '1.0',
      competitionId: 'competition:not-materialized',
      competitionSeasonId: 'season:not-materialized',
      seasonLabel: 'Not materialized',
      status: 'COMPLETE',
      variants: [],
      consequences: [],
      sources: [],
    },
  ],
  initialScoreDocuments: [],
}

describe('WorldDbSessionV1 partial Phase 1 availability', () => {
  it('opens a schema-compatible database and validates completeness at season selection', async () => {
    const repository: WorldDatabaseRepository = {
      inspectDatabase: vi.fn(async (): Promise<WorldDbDatabaseInfoV1> => ({
        schemaVersion: 1,
        source: { databaseId: 'phase1a.db', schemaId: 'DDL-PHASE1-A' },
        competitionSeasonIds: ['season:available'],
      })),
      loadCompetitionSeason: vi.fn(),
      loadMatchRealizations: vi.fn(),
      loadCompetitionRuntimeBundle: vi.fn(async () => runtimeBundle),
    }
    const session = new WorldDbSessionV1({
      repository,
      databasePath: 'phase1a.db',
      runtimeBundlePath: 'phase1-runtime.json',
    })

    await expect(session.open()).resolves.toMatchObject({
      databaseId: 'phase1a.db',
      availableCompetitionSeasonIds: ['season:available'],
    })
    expect(session.selectCompetitionSeasons(['season:available']).competitionSeasonIds).toEqual([
      'season:available',
    ])
    expect(() => session.selectCompetitionSeasons(['season:not-materialized'])).toThrow(
      'not present in the opened database',
    )
  })
})
