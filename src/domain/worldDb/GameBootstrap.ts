import type { WorldDbDatabaseInfoV1 } from './DatabaseInfo'

export interface WorldDbGameBootstrapSelectionV1 {
  readonly source: WorldDbDatabaseInfoV1['source']
  readonly ecosystemId: string
  readonly competitionId: string
  readonly competitionSeasonId: string
  readonly teamId: string
}

export interface WorldDbGameBootstrapCountryV1 {
  readonly countryId: string
  readonly name: string
  readonly code: string
}

export interface WorldDbGameBootstrapEcosystemV1 {
  readonly ecosystemId: string
  readonly name: string
  readonly kind: 'fibaLike' | 'nbaLike' | 'ncaaLike'
  readonly category: 'men' | 'women'
}

export interface WorldDbGameBootstrapCompetitionV1 {
  readonly competitionId: string
  readonly name: string
  readonly gender: 'male' | 'female'
  readonly ecosystemId: string
}

export interface WorldDbGameBootstrapSeasonV1 {
  readonly competitionSeasonId: string
  readonly seasonId: string
  readonly label: string
  readonly startDate: string
  readonly endDate: string
}

export interface WorldDbGameBootstrapTeamV1 {
  readonly teamId: string
  readonly name: string
  readonly gender: 'male' | 'female'
  readonly countryId: string
}

export interface WorldDbGameBootstrapPlayerV1 {
  readonly playerId: string
  readonly firstName: string
  readonly lastName: string
  readonly gender: 'male' | 'female'
  readonly nationalityId: string
  readonly dateOfBirth: string
  readonly heightCm: number
  readonly weightKg: number
  readonly wingspanCm?: number
  readonly standingReachCm?: number
  readonly dominantHand?: 'LEFT' | 'RIGHT'
  readonly primaryPosition: 'PG' | 'SG' | 'SF' | 'PF' | 'C'
  /** Runtime-supported canonical ratings. No overall is accepted or persisted. */
  readonly ratings: Readonly<Record<string, number>>
}

export interface WorldDbGameBootstrapRosterAssignmentV1 {
  readonly teamId: string
  readonly playerId: string
  readonly status: string
}

export interface WorldDbGameBootstrapMatchV1 {
  readonly matchId: string
  readonly scheduledAt: string | null
  readonly playedAt: string | null
  readonly status: 'SCHEDULED' | 'COMPLETED' | string
  readonly homeTeamId: string
  readonly awayTeamId: string
  readonly homeScore?: number | null
  readonly awayScore?: number | null
}

export interface WorldDbGameBootstrapSliceV1 {
  readonly schemaVersion: 1
  readonly source: WorldDbDatabaseInfoV1['source']
  readonly ecosystem: WorldDbGameBootstrapEcosystemV1
  readonly competition: WorldDbGameBootstrapCompetitionV1
  readonly season: WorldDbGameBootstrapSeasonV1
  readonly countries: readonly WorldDbGameBootstrapCountryV1[]
  readonly teams: readonly WorldDbGameBootstrapTeamV1[]
  readonly players: readonly WorldDbGameBootstrapPlayerV1[]
  readonly rosterAssignments: readonly WorldDbGameBootstrapRosterAssignmentV1[]
  readonly matches: readonly WorldDbGameBootstrapMatchV1[]
}

export function validateWorldDbGameBootstrapSelectionV1(
  catalog: import('./SelectionCatalog').WorldDbSelectionCatalogV1,
  selection: WorldDbGameBootstrapSelectionV1,
): void {
  if (selection.source.databaseId !== catalog.source.databaseId || selection.source.schemaId !== catalog.source.schemaId) {
    throw new Error('World DB bootstrap selection source identity mismatch')
  }
  if (!catalog.ecosystems.some((row) => row.ecosystemId === selection.ecosystemId)) throw new Error(`World DB bootstrap ecosystem does not exist: ${selection.ecosystemId}`)
  const assignment = catalog.competitionAssignments.find((row) => row.ecosystemId === selection.ecosystemId && row.competitionId === selection.competitionId)
  if (assignment === undefined) throw new Error(`World DB bootstrap competition is not assigned to ecosystem: ${selection.competitionId}`)
  const season = catalog.competitionSeasons.find((row) => row.competitionSeasonId === selection.competitionSeasonId)
  if (season === undefined) throw new Error(`World DB bootstrap competition season does not exist: ${selection.competitionSeasonId}`)
  if (season.competitionId !== selection.competitionId) throw new Error(`World DB bootstrap competition season does not belong to competition: ${selection.competitionSeasonId}`)
  const team = catalog.teamMemberships.find((row) => row.ecosystemId === selection.ecosystemId && row.teamId === selection.teamId)
  if (team === undefined) throw new Error(`World DB bootstrap team is not in ecosystem: ${selection.teamId}`)
}

export function assertWorldDbGameBootstrapSliceV1(value: unknown): asserts value is WorldDbGameBootstrapSliceV1 {
  if (!isRecord(value) || value.schemaVersion !== 1) throw new TypeError('Unsupported World DB game bootstrap slice version')
  requireSource(value.source)
  requireRecord(value.ecosystem, 'World DB bootstrap ecosystem')
  requireRecord(value.competition, 'World DB bootstrap competition')
  requireRecord(value.season, 'World DB bootstrap season')
  for (const [field, expected] of [['ecosystemId', 'ecosystem'], ['name', 'ecosystem'], ['kind', 'ecosystem'], ['category', 'ecosystem']] as const) requireText(value.ecosystem[field], `World DB bootstrap ${expected} ${field}`)
  for (const field of ['competitionId', 'name', 'gender', 'ecosystemId'] as const) requireText(value.competition[field], `World DB bootstrap competition ${field}`)
  for (const field of ['competitionSeasonId', 'seasonId', 'label', 'startDate', 'endDate'] as const) requireText(value.season[field], `World DB bootstrap season ${field}`)
  assertArray(value.countries, 'countries', (entry) => { for (const field of ['countryId', 'name', 'code'] as const) requireText(entry[field], `World DB bootstrap country ${field}`) }, 'countryId')
  assertArray(value.teams, 'teams', (entry) => { for (const field of ['teamId', 'name', 'gender', 'countryId'] as const) requireText(entry[field], `World DB bootstrap team ${field}`) }, 'teamId')
  assertArray(value.players, 'players', (entry) => { for (const field of ['playerId', 'firstName', 'lastName', 'gender', 'nationalityId', 'dateOfBirth', 'primaryPosition'] as const) requireText(entry[field], `World DB bootstrap player ${field}`); if (!isRecord(entry.ratings)) throw new TypeError('World DB bootstrap player ratings must be an object') }, 'playerId')
  assertArray(value.rosterAssignments, 'rosterAssignments', (entry) => { for (const field of ['teamId', 'playerId', 'status'] as const) requireText(entry[field], `World DB bootstrap roster assignment ${field}`) }, undefined)
  assertArray(value.matches, 'matches', (entry) => { for (const field of ['matchId', 'status', 'homeTeamId', 'awayTeamId'] as const) requireText(entry[field], `World DB bootstrap match ${field}`) }, 'matchId')
}

function assertArray(value: unknown, label: string, assertEntry: (entry: Record<string, unknown>) => void, idField: string | undefined): void {
  if (!Array.isArray(value)) throw new TypeError(`World DB bootstrap ${label} must be an array`)
  const ids = new Set<string>()
  for (const item of value) {
    if (!isRecord(item)) throw new TypeError(`World DB bootstrap ${label} entries must be objects`)
    assertEntry(item)
    if (idField !== undefined) {
      const id = item[idField]
      if (typeof id !== 'string') throw new TypeError(`World DB bootstrap ${label} ID must be a string`)
      if (ids.has(id)) throw new TypeError(`World DB bootstrap ${label} must not contain duplicate IDs`)
      ids.add(id)
    }
  }
}

function requireSource(value: unknown): asserts value is WorldDbDatabaseInfoV1['source'] {
  if (!isRecord(value)) throw new TypeError('World DB bootstrap source must be an object')
  requireText(value.databaseId, 'World DB bootstrap databaseId')
  requireText(value.schemaId, 'World DB bootstrap schemaId')
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function requireRecord(value: unknown, label: string): asserts value is Record<string, unknown> { if (!isRecord(value)) throw new TypeError(`${label} must be an object`) }
function requireText(value: unknown, label: string): asserts value is string { if (typeof value !== 'string' || value.trim().length === 0) throw new TypeError(`${label} must be a non-empty string`) }
