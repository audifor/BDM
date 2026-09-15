import type { GameWorld } from './GameWorld'

export interface WorldDbCompetitionRuntimeBundlePin {
  readonly contentId: string
  readonly contentHash: string
  readonly worldDbSchema: string
}

export interface WorldDbCompetitionRuntime {
  /**
   * Optional only for transitional callers created before #91. Canonical Save V4 always writes an
   * explicit pin or null, and attachWorldDbCompetitionRuntime preserves an existing pin when omitted.
   */
  readonly competitionRuntimeBundle?: WorldDbCompetitionRuntimeBundlePin | null
  readonly competitionPlanIds: readonly string[]
  readonly competitionSeasonIds: readonly string[]
}

export const EMPTY_WORLD_DB_COMPETITION_RUNTIME: WorldDbCompetitionRuntime = Object.freeze({
  competitionRuntimeBundle: null,
  competitionPlanIds: Object.freeze([] as string[]),
  competitionSeasonIds: Object.freeze([] as string[]),
})

/**
 * Normalizes the World DB competition persistence state owned by Save V4.
 * The runtime remains intentionally small: active identities plus the immutable runtime-bundle pin
 * required to detect format/schema drift when a save is resumed.
 */
export function createWorldDbCompetitionRuntime(
  value: Partial<WorldDbCompetitionRuntime> = EMPTY_WORLD_DB_COMPETITION_RUNTIME,
): WorldDbCompetitionRuntime {
  return Object.freeze({
    competitionRuntimeBundle: normalizeRuntimeBundlePin(value.competitionRuntimeBundle ?? null),
    competitionPlanIds: Object.freeze([...(value.competitionPlanIds ?? [])]),
    competitionSeasonIds: Object.freeze([...(value.competitionSeasonIds ?? [])]),
  })
}

/**
 * Adds/replaces the persisted World DB competition runtime projection. Transitional callers that
 * only update plan/season ids preserve an already-pinned runtime bundle identity automatically.
 */
export function attachWorldDbCompetitionRuntime(
  world: GameWorld,
  runtime: WorldDbCompetitionRuntime,
): GameWorld {
  const currentPin = world.worldDbCompetitionRuntime?.competitionRuntimeBundle ?? null
  return Object.freeze({
    ...world,
    worldDbCompetitionRuntime: createWorldDbCompetitionRuntime({
      ...runtime,
      competitionRuntimeBundle:
        runtime.competitionRuntimeBundle === undefined
          ? currentPin
          : runtime.competitionRuntimeBundle,
    }),
  })
}

/**
 * Transitional domain augmentation for Save V4. Legacy constructors still create worlds without
 * this field; the V4 serializer normalizes that case to EMPTY_WORLD_DB_COMPETITION_RUNTIME and the
 * V4 reader always rehydrates the explicit runtime projection.
 */
declare module './GameWorld' {
  interface GameWorld {
    readonly worldDbCompetitionRuntime?: WorldDbCompetitionRuntime
  }
}

function normalizeRuntimeBundlePin(
  value: WorldDbCompetitionRuntimeBundlePin | null,
): WorldDbCompetitionRuntimeBundlePin | null {
  if (value === null) return null
  if (value.contentId.length === 0) {
    throw new TypeError('World DB competition runtime bundle contentId must be non-empty')
  }
  if (!/^[a-f0-9]{64}$/.test(value.contentHash)) {
    throw new TypeError(
      'World DB competition runtime bundle contentHash must be a 64-character lowercase hex digest',
    )
  }
  if (value.worldDbSchema.length === 0) {
    throw new TypeError('World DB competition runtime bundle worldDbSchema must be non-empty')
  }
  return Object.freeze({ ...value })
}
