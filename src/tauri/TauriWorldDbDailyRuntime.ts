import type { GameDate } from '@/domain/date'
import type { GameWorld } from '@/domain/world'
import {
  hasActiveWorldDbCompetitionRuntimeV1,
  WorldDbDailyRuntimeSessionV1,
  type ContinueResult,
  type SimulateUntilTick,
} from '@/app/game'

import { tauriWorldDatabaseRepository } from './TauriWorldDatabaseRepository'

let configuredSession: WorldDbDailyRuntimeSessionV1 | null = null
let configuredKey: string | null = null

/**
 * Prepares an active World DB save using physical paths supplied by the host environment.
 * Paths remain process configuration and are never attached to GameWorld or Save V4.
 */
export async function prepareConfiguredWorldDbRuntimeV1(world: GameWorld): Promise<GameWorld> {
  if (!hasActiveWorldDbCompetitionRuntimeV1(world)) return world
  return configuredWorldDbDailyRuntimeSessionV1().prepare(world)
}

export async function continueConfiguredWorldDbGameV1(world: GameWorld): Promise<ContinueResult> {
  if (!hasActiveWorldDbCompetitionRuntimeV1(world)) {
    throw new Error('Configured World DB Continue requires an active World DB competition runtime')
  }
  return configuredWorldDbDailyRuntimeSessionV1().continueGame(world)
}

export async function tickConfiguredWorldDbSimulateUntilDateV1(
  world: GameWorld,
  targetDate: GameDate,
): Promise<SimulateUntilTick> {
  if (!hasActiveWorldDbCompetitionRuntimeV1(world)) {
    throw new Error('Configured World DB simulation requires an active World DB competition runtime')
  }
  return configuredWorldDbDailyRuntimeSessionV1().tickSimulateUntilDate(world, targetDate)
}

function configuredWorldDbDailyRuntimeSessionV1(): WorldDbDailyRuntimeSessionV1 {
  const databasePath = readRequiredEnvironmentPath(
    'VITE_BDM_WORLD_DB_DATABASE_PATH',
    import.meta.env.VITE_BDM_WORLD_DB_DATABASE_PATH,
  )
  const runtimeBundlePath = readRequiredEnvironmentPath(
    'VITE_BDM_WORLD_DB_RUNTIME_BUNDLE_PATH',
    import.meta.env.VITE_BDM_WORLD_DB_RUNTIME_BUNDLE_PATH,
  )
  const key = `${databasePath}\u0000${runtimeBundlePath}`

  if (configuredSession === null || configuredKey !== key) {
    configuredSession = new WorldDbDailyRuntimeSessionV1({
      repository: tauriWorldDatabaseRepository,
      databasePath,
      runtimeBundlePath,
    })
    configuredKey = key
  }

  return configuredSession
}

function readRequiredEnvironmentPath(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(
      `World DB runtime is active but ${name} is not configured. Physical World DB paths must be supplied externally.`,
    )
  }
  return value.trim()
}
