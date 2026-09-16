import { invoke } from '@tauri-apps/api/core'

import {
  parseWorldCompetitionRuntimeBundle,
  type WorldCompetitionRuntimeBundle,
} from '@/domain/competition'
import { assertWorldDbCompetitionBundleV1, type WorldDbCompetitionBundleV1 } from '@/domain/worldDb/CompetitionBundle'
import { assertWorldDbDatabaseInfoV1, type WorldDbDatabaseInfoV1 } from '@/domain/worldDb/DatabaseInfo'
import { assertWorldDbMatchRealizationBundleV1, type WorldDbMatchRealizationBundleV1 } from '@/domain/worldDb/MatchRealizationBundle'
import { assertWorldDbSelectionCatalogV1, type WorldDbSelectionCatalogV1 } from '@/domain/worldDb/SelectionCatalog'
import { assertWorldDbGameBootstrapSliceV1, type WorldDbGameBootstrapSliceV1 } from '@/domain/worldDb/GameBootstrap'

export interface WorldDatabaseRepository {
  inspectDatabase(databasePath: string): Promise<WorldDbDatabaseInfoV1>
  loadSelectionCatalog(databasePath: string): Promise<WorldDbSelectionCatalogV1>
  loadCompetitionSeason(databasePath: string, competitionSeasonId: string): Promise<WorldDbCompetitionBundleV1>
  loadMatchRealizations(databasePath: string, competitionSeasonId: string): Promise<WorldDbMatchRealizationBundleV1>
  loadGameBootstrapSlice(databasePath: string, competitionSeasonId: string, ecosystemId: string): Promise<WorldDbGameBootstrapSliceV1>
  loadCompetitionRuntimeBundle(bundlePath: string): Promise<WorldCompetitionRuntimeBundle>
}

export const tauriWorldDatabaseRepository: WorldDatabaseRepository = {
  async inspectDatabase(databasePath) {
    const value = await invoke<unknown>('inspect_world_db_v1', { databasePath })
    assertWorldDbDatabaseInfoV1(value)
    return value
  },

  async loadSelectionCatalog(databasePath) {
    const value = await invoke<unknown>('load_world_db_selection_catalog_v1', { databasePath })
    assertWorldDbSelectionCatalogV1(value)
    return value
  },

  async loadCompetitionSeason(databasePath, competitionSeasonId) {
    const value = await invoke<unknown>('load_world_db_competition_bundle_v1', {
      databasePath,
      competitionSeasonId,
    })
    assertWorldDbCompetitionBundleV1(value)
    return value
  },

  async loadMatchRealizations(databasePath, competitionSeasonId) {
    const value = await invoke<unknown>('load_world_db_match_realizations_v1', {
      databasePath,
      competitionSeasonId,
    })
    assertWorldDbMatchRealizationBundleV1(value)
    return value
  },

  async loadGameBootstrapSlice(databasePath, competitionSeasonId, ecosystemId) {
    const value = await invoke<unknown>('load_world_db_game_bootstrap_slice_v1', { databasePath, competitionSeasonId, ecosystemId })
    assertWorldDbGameBootstrapSliceV1(value)
    return value
  },

  async loadCompetitionRuntimeBundle(bundlePath) {
    const value = await invoke<unknown>('load_world_db_competition_runtime_bundle_v1', {
      bundlePath,
    })
    return parseWorldCompetitionRuntimeBundle(value)
  },
}
