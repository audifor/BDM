import type { WorldCompetitionRuntimeBundle } from '@/domain/competition'
import {
  createWorldDbCompetitionRuntime,
  type GameWorld,
  type WorldDbCompetitionRuntime,
  type WorldDbCompetitionRuntimeBundlePin,
} from '@/domain/world'
import type { WorldDbDatabaseInfoV1 } from '@/domain/worldDb/DatabaseInfo'
import type { WorldDbPlayableCatalogV1 } from '@/domain/worldDb/PlayableCatalog'
import {
  createWorldCompetitionCatalog,
  type WorldCompetitionCatalog,
} from '@/engine/competition/WorldCompetitionCatalog'
import type { WorldDbCompetitionPlanningContextV1 } from '@/engine/competition/WorldDbPhysicalGamePlanner'
import type { WorldDatabaseRepository } from '@/tauri/TauriWorldDatabaseRepository'

import {
  loadWorldDbCompetitionPlanningContextsV1,
  loadWorldDbCompetitionRuntimeCatalogV1,
} from './WorldDbCompetitionContextLoader'

export interface WorldDbSessionAccessV1 {
  readonly repository: WorldDatabaseRepository
  readonly databasePath: string
  readonly runtimeBundlePath: string
}

export interface WorldDbSessionSnapshotV1 {
  readonly databasePath: string
  readonly runtimeBundlePath: string
  readonly databaseId: string
  readonly schemaId: string
  readonly runtimeBundlePin: WorldDbCompetitionRuntimeBundlePin
  readonly availableCompetitionSeasonIds: readonly string[]
}

export interface PreparedWorldDbSessionV1 {
  readonly world: GameWorld
  readonly contexts: readonly WorldDbCompetitionPlanningContextV1[]
  readonly catalog: WorldCompetitionCatalog
  readonly session: WorldDbSessionSnapshotV1
}

/**
 * Application owner for one external, read-only World DB source.
 *
 * Physical paths and loaded immutable context stay outside GameWorld/Save V4. Rust opens SQLite
 * read-only per repository operation, so this session owns the logical lifecycle and cached context,
 * not a native connection handle. Save V4 remains responsible only for active logical season IDs and
 * the immutable competition-runtime bundle pin.
 */
export class WorldDbSessionV1 {
  private readonly repository: WorldDatabaseRepository
  private readonly databasePath: string
  private readonly runtimeBundlePath: string
  private databaseInfo: WorldDbDatabaseInfoV1 | null = null
  private runtimeBundle: WorldCompetitionRuntimeBundle | null = null
  private catalog: WorldCompetitionCatalog | null = null
  private playableCatalog: WorldDbPlayableCatalogV1 | null = null
  private cachedContextKey: string | null = null
  private cachedContexts: readonly WorldDbCompetitionPlanningContextV1[] = Object.freeze([])

  constructor(access: WorldDbSessionAccessV1) {
    this.repository = access.repository
    this.databasePath = requirePath(access.databasePath, 'databasePath')
    this.runtimeBundlePath = requirePath(access.runtimeBundlePath, 'runtimeBundlePath')
  }

  get isOpen(): boolean {
    return this.databaseInfo !== null
  }

  async open(): Promise<WorldDbSessionSnapshotV1> {
    if (this.isOpen) throw new Error('World DB session is already open')

    const [databaseInfo, runtimeBundle] = await Promise.all([
      this.repository.inspectDatabase(this.databasePath),
      this.repository.loadCompetitionRuntimeBundle(this.runtimeBundlePath),
    ])
    if (databaseInfo.source.schemaId !== runtimeBundle.worldDbSchema) {
      throw new Error(
        `Incompatible World DB schema: database ${databaseInfo.source.schemaId}, runtime ${runtimeBundle.worldDbSchema}`,
      )
    }

    this.databaseInfo = databaseInfo
    this.runtimeBundle = runtimeBundle
    this.catalog = createWorldCompetitionCatalog(runtimeBundle)
    this.playableCatalog = null
    this.cachedContextKey = null
    this.cachedContexts = Object.freeze([])
    return this.snapshot()
  }

  close(): void {
    this.databaseInfo = null
    this.runtimeBundle = null
    this.catalog = null
    this.playableCatalog = null
    this.cachedContextKey = null
    this.cachedContexts = Object.freeze([])
  }

  async reopen(): Promise<WorldDbSessionSnapshotV1> {
    this.close()
    return this.open()
  }

  snapshot(): WorldDbSessionSnapshotV1 {
    const info = this.requireDatabaseInfo()
    const bundle = this.requireRuntimeBundle()
    return Object.freeze({
      databasePath: this.databasePath,
      runtimeBundlePath: this.runtimeBundlePath,
      databaseId: info.source.databaseId,
      schemaId: info.source.schemaId,
      runtimeBundlePin: runtimeBundlePin(bundle),
      availableCompetitionSeasonIds: Object.freeze([...info.competitionSeasonIds]),
    })
  }

  async discoverPlayableCatalog(): Promise<WorldDbPlayableCatalogV1> {
    const info = this.requireDatabaseInfo()
    if (this.playableCatalog !== null) return this.playableCatalog

    const catalog = await this.repository.discoverPlayableCatalog(this.databasePath)
    if (catalog.source.databaseId !== info.source.databaseId) {
      throw new Error(
        `World DB discovery database identity mismatch: expected ${info.source.databaseId}, received ${catalog.source.databaseId}`,
      )
    }
    if (catalog.source.schemaId !== info.source.schemaId) {
      throw new Error(
        `World DB discovery schema identity mismatch: expected ${info.source.schemaId}, received ${catalog.source.schemaId}`,
      )
    }
    this.playableCatalog = catalog
    return catalog
  }

  selectCompetitionSeasons(competitionSeasonIds: readonly string[]): WorldDbCompetitionRuntime {
    this.requireOpen()
    const ids = normalizeSelectedSeasonIds(competitionSeasonIds)
    this.assertSeasonSelection(ids)
    return createWorldDbCompetitionRuntime({
      competitionRuntimeBundle: runtimeBundlePin(this.requireRuntimeBundle()),
      competitionPlanIds: [],
      competitionSeasonIds: ids,
    })
  }

  /**
   * Revalidates the Save V4 runtime pin, reloads immutable B04/B12 context for its active seasons,
   * and rejects a different physical World DB even when its schema contract happens to match.
   */
  async prepareWorld(world: GameWorld): Promise<PreparedWorldDbSessionV1> {
    this.requireOpen()
    const loaded = await loadWorldDbCompetitionRuntimeCatalogV1(
      this.repository,
      this.runtimeBundlePath,
      world,
    )
    const runtime = loaded.world.worldDbCompetitionRuntime
    if (runtime === undefined) throw new Error('World DB runtime disappeared during session preparation')

    this.assertRuntimePin(runtime)
    this.assertSeasonSelection(runtime.competitionSeasonIds)
    const contexts = await this.loadContexts(runtime)
    this.assertContextSource(contexts)

    return Object.freeze({
      world: loaded.world,
      contexts,
      catalog: loaded.catalog,
      session: this.snapshot(),
    })
  }

  private async loadContexts(
    runtime: WorldDbCompetitionRuntime,
  ): Promise<readonly WorldDbCompetitionPlanningContextV1[]> {
    const key = JSON.stringify({
      databaseId: this.requireDatabaseInfo().source.databaseId,
      competitionSeasonIds: runtime.competitionSeasonIds,
      runtimeBundlePin: runtime.competitionRuntimeBundle ?? null,
    })
    if (key !== this.cachedContextKey) {
      this.cachedContexts = await loadWorldDbCompetitionPlanningContextsV1(
        this.repository,
        this.databasePath,
        runtime,
      )
      this.cachedContextKey = key
    }
    return this.cachedContexts
  }

  private assertRuntimePin(runtime: WorldDbCompetitionRuntime): void {
    const pin = runtime.competitionRuntimeBundle
    const expected = runtimeBundlePin(this.requireRuntimeBundle())
    if (
      pin === null || pin === undefined
      || pin.contentId !== expected.contentId
      || pin.contentHash !== expected.contentHash
      || pin.worldDbSchema !== expected.worldDbSchema
    ) {
      throw new Error('World DB session runtime bundle identity does not match the opened session')
    }
  }

  private assertSeasonSelection(competitionSeasonIds: readonly string[]): void {
    const info = this.requireDatabaseInfo()
    const catalog = this.requireCatalog()
    const available = new Set(info.competitionSeasonIds)
    for (const id of competitionSeasonIds) {
      if (!available.has(id)) {
        throw new Error(`World DB competition season is not present in the opened database: ${id}`)
      }
      if (catalog.formatsBySeasonId[id] === undefined) {
        throw new Error(`World DB competition season has no executable runtime format: ${id}`)
      }
    }
  }

  private assertContextSource(contexts: readonly WorldDbCompetitionPlanningContextV1[]): void {
    const source = this.requireDatabaseInfo().source
    for (const context of contexts) {
      if (context.bundle.source.databaseId !== source.databaseId) {
        throw new Error(
          `World DB database identity mismatch: expected ${source.databaseId}, received ${context.bundle.source.databaseId}`,
        )
      }
      if (context.bundle.source.schemaId !== source.schemaId) {
        throw new Error(
          `World DB schema identity mismatch: expected ${source.schemaId}, received ${context.bundle.source.schemaId}`,
        )
      }
    }
  }

  private requireOpen(): void {
    this.requireDatabaseInfo()
    this.requireRuntimeBundle()
    this.requireCatalog()
  }

  private requireDatabaseInfo(): WorldDbDatabaseInfoV1 {
    if (this.databaseInfo === null) throw new Error('World DB session is closed')
    return this.databaseInfo
  }

  private requireRuntimeBundle(): WorldCompetitionRuntimeBundle {
    if (this.runtimeBundle === null) throw new Error('World DB session is closed')
    return this.runtimeBundle
  }

  private requireCatalog(): WorldCompetitionCatalog {
    if (this.catalog === null) throw new Error('World DB session is closed')
    return this.catalog
  }
}

function runtimeBundlePin(bundle: WorldCompetitionRuntimeBundle): WorldDbCompetitionRuntimeBundlePin {
  return Object.freeze({
    contentId: bundle.contentId,
    contentHash: bundle.contentHash,
    worldDbSchema: bundle.worldDbSchema,
  })
}

function normalizeSelectedSeasonIds(values: readonly string[]): readonly string[] {
  if (values.length === 0) throw new TypeError('World DB selection requires at least one competition season')
  const ids = values.map((value) => {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new TypeError('World DB competition season IDs must be non-empty strings')
    }
    return value.trim()
  })
  if (new Set(ids).size !== ids.length) {
    throw new TypeError('World DB competition season selection must not contain duplicates')
  }
  return Object.freeze([...ids].sort())
}

function requirePath(value: string, field: 'databasePath' | 'runtimeBundlePath'): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`World DB ${field} must be a non-empty string`)
  }
  return value.trim()
}