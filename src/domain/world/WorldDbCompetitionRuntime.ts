import type { GameWorld } from './GameWorld'

export interface WorldDbCompetitionRuntime {
  readonly competitionPlanIds: readonly string[]
  readonly competitionSeasonIds: readonly string[]
}

export const EMPTY_WORLD_DB_COMPETITION_RUNTIME: WorldDbCompetitionRuntime = Object.freeze({
  competitionPlanIds: Object.freeze([] as string[]),
  competitionSeasonIds: Object.freeze([] as string[]),
})

/**
 * Normalizes the minimal World DB competition persistence state owned by Save V4.
 * Identity/hash/drift metadata deliberately belongs to the later catalog-identity slice.
 */
export function createWorldDbCompetitionRuntime(
  value: Partial<WorldDbCompetitionRuntime> = EMPTY_WORLD_DB_COMPETITION_RUNTIME,
): WorldDbCompetitionRuntime {
  return Object.freeze({
    competitionPlanIds: Object.freeze([...(value.competitionPlanIds ?? [])]),
    competitionSeasonIds: Object.freeze([...(value.competitionSeasonIds ?? [])]),
  })
}

/** Adds/replaces only the persisted World DB competition runtime projection. */
export function attachWorldDbCompetitionRuntime(
  world: GameWorld,
  runtime: WorldDbCompetitionRuntime,
): GameWorld {
  return Object.freeze({
    ...world,
    worldDbCompetitionRuntime: createWorldDbCompetitionRuntime(runtime),
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
