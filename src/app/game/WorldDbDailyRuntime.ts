import type { GameDate } from '@/domain/date'
import type { GameWorld, WorldDbCompetitionRuntime } from '@/domain/world'
import type { WorldDbCompetitionPlanningContextV1 } from '@/engine/competition/WorldDbPhysicalGamePlanner'
import type { WorldDatabaseRepository } from '@/tauri/TauriWorldDatabaseRepository'

import { advanceGameDay } from './advanceGameDay'
import {
  DEFAULT_CONTINUE_DAY_LIMIT,
  getContinueStopReason,
  type ContinueResult,
} from './ContinueFlow'
import {
  loadWorldDbCompetitionPlanningContextsV1,
  loadWorldDbCompetitionRuntimeCatalogV1,
} from './WorldDbCompetitionContextLoader'
import { materializeWorldDbPhysicalGamesV1 } from './WorldDbGameMaterialization'
import {
  tickSimulateUntilDate,
  type SimulateUntilTick,
} from './simulateUntilDate'

export interface WorldDbDailyRuntimeAccessV1 {
  readonly repository: WorldDatabaseRepository
  readonly databasePath: string
  readonly runtimeBundlePath: string
}

/** True only when the save references at least one executable World DB competition season. */
export function hasActiveWorldDbCompetitionRuntimeV1(world: GameWorld): boolean {
  return (world.worldDbCompetitionRuntime?.competitionSeasonIds.length ?? 0) > 0
}

/**
 * External, non-persisted runtime session for immutable World DB competition context.
 *
 * The runtime bundle is revalidated on every preparation so content/schema drift keeps failing
 * closed. B04/B12 contexts are cached until the pinned bundle identity or active season set
 * changes; progression itself remains derived from the current GameWorld by the materializer.
 */
export class WorldDbDailyRuntimeSessionV1 {
  private readonly repository: WorldDatabaseRepository
  private readonly databasePath: string
  private readonly runtimeBundlePath: string
  private cachedContextKey: string | null = null
  private cachedContexts: readonly WorldDbCompetitionPlanningContextV1[] = Object.freeze([])

  constructor(access: WorldDbDailyRuntimeAccessV1) {
    this.repository = access.repository
    this.databasePath = requireNonEmptyPath(access.databasePath, 'databasePath')
    this.runtimeBundlePath = requireNonEmptyPath(access.runtimeBundlePath, 'runtimeBundlePath')
  }

  /** Rehydrates immutable context and materializes every currently resolvable physical Game. */
  async prepare(world: GameWorld): Promise<GameWorld> {
    if (!hasActiveWorldDbCompetitionRuntimeV1(world)) return world

    const loadedCatalog = await loadWorldDbCompetitionRuntimeCatalogV1(
      this.repository,
      this.runtimeBundlePath,
      world,
    )
    const runtime = loadedCatalog.world.worldDbCompetitionRuntime
    if (runtime === undefined) {
      throw new Error('World DB runtime disappeared while preparing competition context')
    }

    const contextKey = createContextCacheKey(runtime)
    if (contextKey !== this.cachedContextKey) {
      const contexts = await loadWorldDbCompetitionPlanningContextsV1(
        this.repository,
        this.databasePath,
        runtime,
      )
      this.cachedContexts = contexts
      this.cachedContextKey = contextKey
    }

    return materializeWorldDbPhysicalGamesV1(
      loadedCatalog.world,
      this.cachedContexts,
      loadedCatalog.world.currentDate,
    ).world
  }

  /** Canonical one-day boundary: materialize before today's simulation and again after results. */
  async advanceDay(world: GameWorld): Promise<GameWorld> {
    const prepared = await this.prepare(world)
    const advanced = advanceGameDay(prepared)
    return this.prepare(advanced)
  }

  /** World DB-aware Continue loop; preparation occurs before every stop check. */
  async continueGame(
    world: GameWorld,
    dayLimit = DEFAULT_CONTINUE_DAY_LIMIT,
  ): Promise<ContinueResult> {
    if (!Number.isInteger(dayLimit) || dayLimit < 1) {
      throw new RangeError('Continue day limit must be a positive integer')
    }

    let current = await this.prepare(world)
    let daysAdvanced = 0

    while (daysAdvanced < dayLimit) {
      const interruption = getContinueStopReason(current)
      if (interruption !== undefined) {
        return {
          world: current,
          daysAdvanced,
          finalDate: current.currentDate,
          stopReason: interruption,
        }
      }

      current = await this.advanceDay(current)
      daysAdvanced += 1
    }

    return {
      world: current,
      daysAdvanced,
      finalDate: current.currentDate,
      stopReason: getContinueStopReason(current) ?? { type: 'safetyLimit' },
    }
  }

  /** One holiday/simulate-until tick using the same pre/post World DB materialization boundary. */
  async tickSimulateUntilDate(world: GameWorld, targetDate: GameDate): Promise<SimulateUntilTick> {
    const prepared = await this.prepare(world)
    const tick = tickSimulateUntilDate(prepared, targetDate)
    if (tick.event.type === 'finished') return tick
    return {
      world: await this.prepare(tick.world),
      event: tick.event,
    }
  }
}

function createContextCacheKey(runtime: WorldDbCompetitionRuntime): string {
  const pin = runtime.competitionRuntimeBundle
  return JSON.stringify({
    competitionSeasonIds: runtime.competitionSeasonIds,
    contentId: pin?.contentId ?? null,
    contentHash: pin?.contentHash ?? null,
    worldDbSchema: pin?.worldDbSchema ?? null,
  })
}

function requireNonEmptyPath(value: string, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`World DB ${field} must be a non-empty string`)
  }
  return value.trim()
}
