export interface WorldDbMatchV1 {
  readonly matchId: string
  readonly competitionSeasonId: string
  readonly scheduledAt: string | null
  readonly playedAt: string | null
  readonly facilityId: string | null
  readonly status: string
  readonly homeTeamId: string
  readonly awayTeamId: string
}

export interface WorldDbGameFixtureRealizationV1 {
  readonly gameFixtureRealizationId: string
  readonly matchId: string
  readonly competitionFixtureId: string
  readonly realizationType: string
  readonly status: string
}

export interface WorldDbMatchRealizationBundleV1 {
  readonly schemaVersion: 1
  readonly competitionSeasonId: string
  readonly matches: readonly WorldDbMatchV1[]
  readonly realizations: readonly WorldDbGameFixtureRealizationV1[]
}

export function assertWorldDbMatchRealizationBundleV1(value: unknown): asserts value is WorldDbMatchRealizationBundleV1 {
  if (!isRecord(value) || value.schemaVersion !== 1) throw new TypeError('Unsupported World DB match realization bundle version')
  requireText(value.competitionSeasonId, 'World DB match realization competitionSeasonId')
  requireArray(value.matches, 'World DB matches')
  requireArray(value.realizations, 'World DB fixture realizations')

  const matchIds = new Set<string>()
  for (const [index, item] of value.matches.entries()) {
    if (!isRecord(item)) throw new TypeError(`World DB matches[${index}] must be an object`)
    requireText(item.matchId, `World DB matches[${index}].matchId`)
    if (matchIds.has(item.matchId)) throw new Error(`Duplicate World DB match: ${item.matchId}`)
    matchIds.add(item.matchId)
    requireText(item.competitionSeasonId, `World DB matches[${index}].competitionSeasonId`)
    requireText(item.status, `World DB matches[${index}].status`)
    requireText(item.homeTeamId, `World DB matches[${index}].homeTeamId`)
    requireText(item.awayTeamId, `World DB matches[${index}].awayTeamId`)
  }

  const realizationIds = new Set<string>()
  for (const [index, item] of value.realizations.entries()) {
    if (!isRecord(item)) throw new TypeError(`World DB fixture realizations[${index}] must be an object`)
    requireText(item.gameFixtureRealizationId, `World DB fixture realizations[${index}].gameFixtureRealizationId`)
    if (realizationIds.has(item.gameFixtureRealizationId)) throw new Error(`Duplicate World DB fixture realization: ${item.gameFixtureRealizationId}`)
    realizationIds.add(item.gameFixtureRealizationId)
    requireText(item.matchId, `World DB fixture realizations[${index}].matchId`)
    requireText(item.competitionFixtureId, `World DB fixture realizations[${index}].competitionFixtureId`)
    requireText(item.realizationType, `World DB fixture realizations[${index}].realizationType`)
    requireText(item.status, `World DB fixture realizations[${index}].status`)
    if (!matchIds.has(item.matchId)) throw new Error(`World DB fixture realization references missing match: ${item.matchId}`)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireArray(value: unknown, label: string): asserts value is readonly unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`)
}

function requireText(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${label} must be a non-empty string`)
}
