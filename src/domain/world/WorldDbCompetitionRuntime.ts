import type { GameWorld } from './GameWorld'
import { parseGameDate } from '@/domain/date'

export interface WorldDbCompetitionRuntimeBundlePin {
  readonly contentId: string
  readonly contentHash: string
  readonly worldDbSchema: string
}

export interface WorldDbCompetitionRuntime {
  readonly worldDbV2?: WorldDbV2Provenance
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
    ...(value.worldDbV2 === undefined ? {} : { worldDbV2: readWorldDbV2Provenance(value.worldDbV2) }),
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
      worldDbV2: runtime.worldDbV2 ?? world.worldDbCompetitionRuntime?.worldDbV2,
      competitionRuntimeBundle:
        runtime.competitionRuntimeBundle === undefined
          ? currentPin
          : runtime.competitionRuntimeBundle,
    }),
  })
}

export interface WorldDbV2Provenance {
  readonly contracts?: 'BDM_GENERATED_INITIAL_V1_PBM_REFERENCE_ONLY'
  readonly freeAgents?: 'ORIGINAL_SPANISH_MALE_18_40_SEEDED_MAX_60' | 'ORIGINAL_COUNTRY_MALE_18_40_SEEDED_MAX_60'
  readonly masterSha256: string
  readonly sourceDate: string
  readonly startDate: string
  readonly seed: string
  readonly sourceCompetitionId: string
  readonly nativeCompetitionId: string
  readonly fictional: true
  readonly profiles: 'BDM_GENERATED_CANONICAL'
  readonly economy: 'BDM_GAME_BALANCE_NOT_PBM'
}

export function readWorldDbV2Provenance(value: unknown): WorldDbV2Provenance {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid WorldDB V2 provenance')
  const v=value as Record<string,unknown>
  const keys=['masterSha256','sourceDate','startDate','seed','sourceCompetitionId','nativeCompetitionId','fictional','profiles','economy']
  if (Object.keys(v).some(k=>!keys.includes(k)&&k!=='contracts'&&k!=='freeAgents') || keys.some(k=>!(k in v))) throw new TypeError('Incomplete WorldDB V2 provenance')
  if(v.contracts!==undefined&&v.contracts!=='BDM_GENERATED_INITIAL_V1_PBM_REFERENCE_ONLY')throw new TypeError('Invalid WorldDB V2 contracts provenance')
  if(v.freeAgents!==undefined&&v.freeAgents!=='ORIGINAL_SPANISH_MALE_18_40_SEEDED_MAX_60'&&v.freeAgents!=='ORIGINAL_COUNTRY_MALE_18_40_SEEDED_MAX_60')throw new TypeError('Invalid WorldDB V2 free agents provenance')
  for(const key of keys.filter(k=>k!=='fictional'))if(typeof v[key]!=='string'||!v[key])throw new TypeError('Invalid WorldDB V2 provenance '+key)
  if(!/^[a-f0-9]{64}$/.test(String(v.masterSha256))||!/^\d{4}-\d{2}-\d{2}$/.test(String(v.sourceDate))||!/^\d{4}-\d{2}-\d{2}$/.test(String(v.startDate))||v.fictional!==true||v.profiles!=='BDM_GENERATED_CANONICAL'||v.economy!=='BDM_GAME_BALANCE_NOT_PBM')throw new TypeError('Invalid WorldDB V2 provenance policy')
  parseGameDate(String(v.sourceDate))
  parseGameDate(String(v.startDate))
  return Object.freeze({...v}) as unknown as WorldDbV2Provenance
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
