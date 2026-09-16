export interface WorldDbDatabaseInfoV1 {
  readonly schemaVersion: 1
  readonly source: {
    readonly databaseId: string
    readonly schemaId: string
  }
  readonly competitionSeasonIds: readonly string[]
}

export function assertWorldDbDatabaseInfoV1(value: unknown): asserts value is WorldDbDatabaseInfoV1 {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new TypeError('Unsupported World DB database info version')
  }
  if (!isRecord(value.source)) throw new TypeError('World DB database source must be an object')
  requireText(value.source.databaseId, 'World DB databaseId')
  requireText(value.source.schemaId, 'World DB schemaId')
  if (!Array.isArray(value.competitionSeasonIds)) {
    throw new TypeError('World DB competitionSeasonIds must be an array')
  }
  const ids = value.competitionSeasonIds.map((entry) => {
    requireText(entry, 'World DB competitionSeasonId')
    return entry
  })
  if (new Set(ids).size !== ids.length) {
    throw new TypeError('World DB competitionSeasonIds must not contain duplicates')
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireText(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string`)
  }
}
