import { afterEach, describe, expect, it, vi } from 'vitest'

import type { WorldCompetitionRuntimeBundle } from '@/domain/competition'
import type { WorldDbDatabaseInfoV1 } from '@/domain/worldDb/DatabaseInfo'
import type { WorldDbSelectionCatalogV1 } from '@/domain/worldDb/SelectionCatalog'
import type { WorldDatabaseRepository } from '@/tauri/TauriWorldDatabaseRepository'

import {
  createWorldDbSpainGame,
  discoverWorldDbSpainSelection,
  SPAIN_ACB_COMPETITION_ID,
  SPAIN_ACB_COMPETITION_SEASON_ID,
  SPAIN_ACB_ECOSYSTEM_ID,
} from './WorldDbSpainGame'
import { WorldDbSessionV1 } from './WorldDbSession'
import { createConfiguredGameAsync } from './createConfiguredGame'
import { WORLD_DB_SPAIN_UNIVERSE_ID } from './NewGameUniverseCatalog'

afterEach(() => vi.restoreAllMocks())

const source = { databaseId: 'bdm_world_ddl12.db', schemaId: 'DDL-PHASE1-A' } as const
const runtimeBundle: WorldCompetitionRuntimeBundle = {
  bundleSchemaVersion: 1,
  contentId: 'bdm-phase1-competition-runtime-v1',
  contentHashAlgorithm: 'BLAKE3',
  contentHash: 'a'.repeat(64),
  worldDbSchema: 'DDL-PHASE1-A',
  competitionFormats: [{ schemaVersion: '1.0', competitionId: SPAIN_ACB_COMPETITION_ID, competitionSeasonId: SPAIN_ACB_COMPETITION_SEASON_ID, seasonLabel: '2025-26', status: 'COMPLETE', variants: [], consequences: [], sources: [] }],
  initialScoreDocuments: [],
}

function catalog(): WorldDbSelectionCatalogV1 {
  const teamMemberships = Array.from({ length: 18 }, (_, index) => ({
    membershipId: `membership:${index}`,
    ecosystemId: SPAIN_ACB_ECOSYSTEM_ID,
    teamId: `team:ESP:male:${String(index).padStart(3, '0')}`,
    teamName: `ACB Team ${String(index + 1).padStart(2, '0')}`,
    levelId: null,
    membershipStatus: 'ACTIVE',
    validFrom: '2025-07-01',
    validTo: '2026-06-30',
  }))
  return {
    schemaVersion: 1,
    source,
    ecosystems: [{ ecosystemId: SPAIN_ACB_ECOSYSTEM_ID, code: 'SPAIN_ACB', name: 'Spain ACB', gender: 'M' }],
    levels: [],
    units: [],
    competitionAssignments: [{ assignmentId: 'assignment:acb', ecosystemId: SPAIN_ACB_ECOSYSTEM_ID, competitionId: SPAIN_ACB_COMPETITION_ID, competitionName: 'Liga Endesa', levelId: null, unitId: null, roleType: 'PRIMARY_LEAGUE' }],
    competitionSeasons: [{ competitionSeasonId: SPAIN_ACB_COMPETITION_SEASON_ID, competitionId: SPAIN_ACB_COMPETITION_ID, competitionName: 'Liga Endesa', seasonId: 'season:2025_26', editionNumber: 70 }],
    teamMemberships,
    teamUnitMemberships: [],
  }
}

function repository(): WorldDatabaseRepository {
  const info: WorldDbDatabaseInfoV1 = { schemaVersion: 1, source, competitionSeasonIds: [SPAIN_ACB_COMPETITION_SEASON_ID] }
  return {
    inspectDatabase: vi.fn(async () => info),
    loadSelectionCatalog: vi.fn(async () => catalog()),
    loadCompetitionSeason: vi.fn(),
    loadMatchRealizations: vi.fn(),
    loadGameBootstrapSlice: vi.fn(),
    loadCompetitionRuntimeBundle: vi.fn(async () => runtimeBundle),
  }
}

describe('World DB Spain ACB new-game selection', () => {
  it('exposes exactly the 18 canonical B02 team memberships and no fake fallback', async () => {
    const result = await discoverWorldDbSpainSelection({
      repository: repository(),
      databasePath: 'C:/BDM_DB/DDL-12/output/bdm_world_ddl12.db',
      runtimeBundlePath: 'C:/BDM_DB/phase1-competition-runtime-bundle.json',
    })

    expect(result.ecosystemId).toBe(SPAIN_ACB_ECOSYSTEM_ID)
    expect(result.competitionId).toBe(SPAIN_ACB_COMPETITION_ID)
    expect(result.competitionSeasonId).toBe(SPAIN_ACB_COMPETITION_SEASON_ID)
    expect(result.teams).toHaveLength(18)
    expect(new Set(result.teams.map((team) => team.key)).size).toBe(18)
    expect(result.teams[0]?.name).toBe('ACB Team 01')
  })

  it('rejects a stale or incomplete Spain ACB catalog instead of starting a partial career', async () => {
    const incomplete = repository()
    incomplete.loadSelectionCatalog = vi.fn(async () => ({ ...catalog(), teamMemberships: catalog().teamMemberships.slice(0, 17) }))
    await expect(discoverWorldDbSpainSelection({
      repository: incomplete,
      databasePath: 'world.db',
      runtimeBundlePath: 'runtime.json',
    })).rejects.toThrow('must contain 18 active teams')
  })

  it('routes async New Game creation through the selected canonical World DB team', async () => {
    const createdWorld = {} as Awaited<ReturnType<WorldDbSessionV1['bootstrapGameWorld']>>
    const bootstrap = vi.spyOn(WorldDbSessionV1.prototype, 'bootstrapGameWorld').mockResolvedValue(createdWorld)
    const selectedTeamId = catalog().teamMemberships[11]!.teamId
    const access = {
      repository: repository(),
      databasePath: 'world.db',
      runtimeBundlePath: 'runtime.json',
    }

    await expect(createConfiguredGameAsync({ universeId: WORLD_DB_SPAIN_UNIVERSE_ID, userTeamKey: selectedTeamId }, access)).resolves.toBe(createdWorld)
    expect(bootstrap).toHaveBeenCalledOnce()
    expect(bootstrap).toHaveBeenCalledWith(expect.objectContaining({
      source,
      ecosystemId: SPAIN_ACB_ECOSYSTEM_ID,
      competitionId: SPAIN_ACB_COMPETITION_ID,
      competitionSeasonId: SPAIN_ACB_COMPETITION_SEASON_ID,
      teamId: selectedTeamId,
    }))
  })

  it('rejects an unknown team instead of falling back to the prototype or test ACB game', async () => {
    const repositoryStub = repository()
    const access = { repository: repositoryStub, databasePath: 'world.db', runtimeBundlePath: 'runtime.json' }

    await expect(createWorldDbSpainGame('team:ESP:unknown', access)).rejects.toThrow('not in the canonical World DB catalog')
    expect(repositoryStub.loadGameBootstrapSlice).not.toHaveBeenCalled()
  })
})
