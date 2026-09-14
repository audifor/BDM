import { parseWorldCompetitionFormatDocument } from './WorldCompetitionFormatParser'
import { array, optionalText, record, requireUnique, text } from './WorldCompetitionFormatParserHelpers'
import type { WorldCompetitionFormatDocument } from './WorldCompetitionFormatTypes'

export const WORLD_COMPETITION_RUNTIME_BUNDLE_SCHEMA_VERSION = 1 as const

export interface WorldCompetitionRuntimeBundle {
  readonly bundleSchemaVersion: typeof WORLD_COMPETITION_RUNTIME_BUNDLE_SCHEMA_VERSION
  readonly contentId: string
  readonly contentSha256: string
  readonly worldDbSchema: string
  readonly sourceCommit?: string
  readonly competitionFormats: readonly WorldCompetitionFormatDocument[]
}

export function parseWorldCompetitionRuntimeBundle(value: unknown): WorldCompetitionRuntimeBundle {
  const raw = record(value, 'competition runtime bundle')
  if (raw.bundle_schema_version !== WORLD_COMPETITION_RUNTIME_BUNDLE_SCHEMA_VERSION) throw new RangeError(`Unsupported competition runtime bundle schema version: ${String(raw.bundle_schema_version)}`)

  const contentSha256 = text(raw.content_sha256, 'content_sha256').toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(contentSha256)) throw new TypeError('content_sha256 must be a 64-character SHA-256 hex digest')

  const competitionFormats = array(raw.competition_formats, 'competition_formats').map(parseWorldCompetitionFormatDocument)
  if (competitionFormats.length === 0) throw new RangeError('Competition runtime bundle requires at least one competition format')
  requireUnique(competitionFormats.map((format) => format.competitionSeasonId), 'competition season id')

  const sourceCommit = optionalText(raw.source_commit, 'source_commit')
  return Object.freeze({
    bundleSchemaVersion: WORLD_COMPETITION_RUNTIME_BUNDLE_SCHEMA_VERSION,
    contentId: text(raw.content_id, 'content_id'),
    contentSha256,
    worldDbSchema: text(raw.world_db_schema, 'world_db_schema'),
    ...(sourceCommit === undefined ? {} : { sourceCommit }),
    competitionFormats: Object.freeze(competitionFormats),
  })
}
