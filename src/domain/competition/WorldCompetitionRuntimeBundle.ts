import { parseWorldCompetitionFormatDocument } from './WorldCompetitionFormatParser'
import { array, enumValue, optionalText, record, requireUnique, text } from './WorldCompetitionFormatParserHelpers'
import type { WorldCompetitionFormatDocument } from './WorldCompetitionFormatTypes'
import { parseWorldCompetitionInitialScoreDocument, type WorldCompetitionInitialScoreDocument } from './WorldCompetitionInitialScore'

export const WORLD_COMPETITION_RUNTIME_BUNDLE_SCHEMA_VERSION = 1 as const
export const WORLD_COMPETITION_RUNTIME_BUNDLE_HASH_ALGORITHM = 'BLAKE3' as const
export const WORLD_COMPETITION_RUNTIME_BUNDLE_CONTENT_ID = 'bdm-phase1-competition-runtime-v1' as const
export const WORLD_COMPETITION_RUNTIME_BUNDLE_WORLD_DB_SCHEMA = 'DDL-PHASE1-A' as const

export interface WorldCompetitionRuntimeBundle {
  readonly bundleSchemaVersion: typeof WORLD_COMPETITION_RUNTIME_BUNDLE_SCHEMA_VERSION
  readonly contentId: typeof WORLD_COMPETITION_RUNTIME_BUNDLE_CONTENT_ID
  readonly contentHashAlgorithm: typeof WORLD_COMPETITION_RUNTIME_BUNDLE_HASH_ALGORITHM
  readonly contentHash: string
  readonly worldDbSchema: typeof WORLD_COMPETITION_RUNTIME_BUNDLE_WORLD_DB_SCHEMA
  readonly sourceCommit?: string
  readonly competitionFormats: readonly WorldCompetitionFormatDocument[]
  readonly initialScoreDocuments: readonly WorldCompetitionInitialScoreDocument[]
}

export function parseWorldCompetitionRuntimeBundle(value: unknown): WorldCompetitionRuntimeBundle {
  const raw = record(value, 'competition runtime bundle')
  if (raw.bundle_schema_version !== WORLD_COMPETITION_RUNTIME_BUNDLE_SCHEMA_VERSION) throw new RangeError(`Unsupported competition runtime bundle schema version: ${String(raw.bundle_schema_version)}`)
  const contentId = enumValue(raw.content_id, [WORLD_COMPETITION_RUNTIME_BUNDLE_CONTENT_ID] as const, 'content_id')
  const contentHashAlgorithm = enumValue(raw.content_hash_algorithm, [WORLD_COMPETITION_RUNTIME_BUNDLE_HASH_ALGORITHM] as const, 'content_hash_algorithm')
  const contentHash = text(raw.content_hash, 'content_hash').toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(contentHash)) throw new TypeError('content_hash must be a 64-character BLAKE3 hex digest')
  const worldDbSchema = enumValue(raw.world_db_schema, [WORLD_COMPETITION_RUNTIME_BUNDLE_WORLD_DB_SCHEMA] as const, 'world_db_schema')
  const competitionFormats = array(raw.competition_formats, 'competition_formats').map(parseWorldCompetitionFormatDocument)
  if (competitionFormats.length === 0) throw new RangeError('Competition runtime bundle requires at least one competition format')
  requireUnique(competitionFormats.map((format) => format.competitionSeasonId), 'competition season id')
  const initialScoreDocuments = raw.initial_score_documents === undefined ? [] : array(raw.initial_score_documents, 'initial_score_documents').map(parseWorldCompetitionInitialScoreDocument)
  requireUnique(initialScoreDocuments.map((document) => document.competitionSeasonId), 'initial score competition season id')
  const formatSeasonIds = new Set(competitionFormats.map((format) => format.competitionSeasonId))
  for (const document of initialScoreDocuments) if (!formatSeasonIds.has(document.competitionSeasonId)) throw new RangeError(`Initial score rules reference a competition season absent from the bundle: ${document.competitionSeasonId}`)
  const sourceCommit = optionalText(raw.source_commit, 'source_commit')
  return Object.freeze({ bundleSchemaVersion: WORLD_COMPETITION_RUNTIME_BUNDLE_SCHEMA_VERSION, contentId, contentHashAlgorithm, contentHash, worldDbSchema, ...(sourceCommit === undefined ? {} : { sourceCommit }), competitionFormats: Object.freeze(competitionFormats), initialScoreDocuments: Object.freeze(initialScoreDocuments) })
}
