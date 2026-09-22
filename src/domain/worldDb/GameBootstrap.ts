import type { WorldDbDatabaseInfoV1 } from './DatabaseInfo'
import { PLAYER_TRUTH_RATING_KEYS, PLAYER_TRUTH_TENDENCY_KEYS } from '@/domain/player/PlayerTruthCatalog'

export interface WorldDbGameBootstrapSelectionV1 {
  readonly source: WorldDbDatabaseInfoV1['source']
  readonly ecosystemId: string
  readonly competitionId: string
  readonly competitionSeasonId: string
  readonly teamId: string
}

export interface WorldDbGameBootstrapCountryV1 { readonly countryId: string; readonly name: string; readonly code: string }
export interface WorldDbGameBootstrapEcosystemV1 { readonly ecosystemId: string; readonly name: string; readonly kind: 'fibaLike' | 'nbaLike' | 'ncaaLike'; readonly category: 'men' | 'women' }
export interface WorldDbGameBootstrapCompetitionV1 { readonly competitionId: string; readonly name: string; readonly gender: 'male' | 'female'; readonly ecosystemId: string }
export interface WorldDbGameBootstrapSeasonV1 {
  readonly competitionSeasonId: string
  readonly seasonId: string
  readonly label: string
  readonly startDate: string
  readonly endDate: string
  readonly provenance: 'WORLD_DB' | 'DERIVED_SIMULATION_FROM_B04'
}
export interface WorldDbGameBootstrapOrganizationV1 { readonly organizationId: string; readonly entityId: string; readonly legalName: string | null; readonly foundedYear: number | null; readonly dissolvedYear: number | null; readonly primaryPlaceId: string | null; readonly website: string | null }
export interface WorldDbGameBootstrapOrganizationSectionV1 { readonly sectionId: string; readonly organizationId: string; readonly sport: string | null; readonly gender: string | null; readonly categoryScope: string | null; readonly canonicalName: string; readonly validFrom: string | null; readonly validTo: string | null }
export interface WorldDbGameBootstrapTeamV1 { readonly teamId: string; readonly name: string; readonly gender: 'male' | 'female'; readonly countryId: string; readonly organizationId: string; readonly organizationSectionId: string }
export interface WorldDbGameBootstrapOrganizationOwnershipV1 {
  readonly ownershipId: string
  readonly organizationId: string
  readonly ownerKind: 'PERSON' | 'ORGANIZATION'
  readonly ownerId: string
  readonly ownershipPercentage: number | null
  readonly validFrom: string | null
  readonly validTo: string | null
}

export interface WorldDbGameBootstrapPersonV1 {
  readonly personId: string
  readonly firstName: string
  readonly lastName: string
  readonly gender?: 'male' | 'female'
  readonly dateOfBirth?: string
  readonly nationalityIds: readonly string[]
  readonly physical?: { readonly heightCm: number; readonly weightKg: number; readonly wingspanCm: number; readonly standingReachCm: number }
}
export interface WorldDbGameBootstrapDevelopmentDimensionV1 { readonly dimensionCode: string; readonly ceiling: number; readonly growthRate: number; readonly declineSensitivity: number }
export interface WorldDbGameBootstrapPlayerV1 {
  readonly playerId: string
  readonly personId: string
  readonly primaryPosition: 'PG' | 'SG' | 'SF' | 'PF' | 'C'
  readonly secondaryPositions: readonly ('PG' | 'SG' | 'SF' | 'PF' | 'C')[]
  readonly dominantHand: 'LEFT' | 'RIGHT'
  readonly ratings: Readonly<Record<string, number>>
  readonly tendencies: Readonly<Record<string, number>>
  readonly development: readonly WorldDbGameBootstrapDevelopmentDimensionV1[]
}
export interface WorldDbGameBootstrapStaffV1 { readonly staffId: string; readonly personId: string; readonly attributes: Readonly<Record<string, number>>; readonly specialismIds: readonly string[] }
export interface WorldDbGameBootstrapStaffAssignmentV1 { readonly assignmentId: string; readonly staffId: string; readonly teamId: string; readonly roleCode: string; readonly assignedOn: string }
export interface WorldDbGameBootstrapRosterAssignmentV1 { readonly rosterId: string; readonly teamId: string; readonly playerId: string; readonly status: string }

/** Persisted fixtures are optional. Spain 2025-26 currently has none; the app derives B04 games. */
export interface WorldDbGameBootstrapMatchV1 { readonly matchId: string; readonly scheduledAt: string | null; readonly playedAt: string | null; readonly status: 'SCHEDULED' | 'COMPLETED' | string; readonly homeTeamId: string; readonly awayTeamId: string; readonly homeScore?: number | null; readonly awayScore?: number | null }

export interface WorldDbGameBootstrapSliceV1 {
  readonly schemaVersion: 1
  readonly source: WorldDbDatabaseInfoV1['source']
  readonly ecosystem: WorldDbGameBootstrapEcosystemV1
  readonly competition: WorldDbGameBootstrapCompetitionV1
  readonly season: WorldDbGameBootstrapSeasonV1
  readonly countries: readonly WorldDbGameBootstrapCountryV1[]
  readonly organizations: readonly WorldDbGameBootstrapOrganizationV1[]
  readonly organizationSections: readonly WorldDbGameBootstrapOrganizationSectionV1[]
  readonly organizationOwnership?: readonly WorldDbGameBootstrapOrganizationOwnershipV1[]
  readonly teams: readonly WorldDbGameBootstrapTeamV1[]
  readonly persons: readonly WorldDbGameBootstrapPersonV1[]
  readonly players: readonly WorldDbGameBootstrapPlayerV1[]
  readonly staffProfiles: readonly WorldDbGameBootstrapStaffV1[]
  readonly staffAssignments: readonly WorldDbGameBootstrapStaffAssignmentV1[]
  readonly rosterAssignments: readonly WorldDbGameBootstrapRosterAssignmentV1[]
  readonly matches: readonly WorldDbGameBootstrapMatchV1[]
}

export function validateWorldDbGameBootstrapSelectionV1(catalog: import('./SelectionCatalog').WorldDbSelectionCatalogV1, selection: WorldDbGameBootstrapSelectionV1): void {
  if (selection.source.databaseId !== catalog.source.databaseId || selection.source.schemaId !== catalog.source.schemaId) throw new Error('World DB bootstrap selection source identity mismatch')
  if (!catalog.ecosystems.some((row) => row.ecosystemId === selection.ecosystemId)) throw new Error(`World DB bootstrap ecosystem does not exist: ${selection.ecosystemId}`)
  const assignment = catalog.competitionAssignments.find((row) => row.ecosystemId === selection.ecosystemId && row.competitionId === selection.competitionId)
  if (assignment === undefined) throw new Error(`World DB bootstrap competition is not assigned to ecosystem: ${selection.competitionId}`)
  const season = catalog.competitionSeasons.find((row) => row.competitionSeasonId === selection.competitionSeasonId)
  if (season === undefined) throw new Error(`World DB bootstrap competition season does not exist: ${selection.competitionSeasonId}`)
  if (season.competitionId !== selection.competitionId) throw new Error(`World DB bootstrap competition season does not belong to competition: ${selection.competitionSeasonId}`)
  if (!catalog.teamMemberships.some((row) => row.ecosystemId === selection.ecosystemId && row.teamId === selection.teamId)) throw new Error(`World DB bootstrap team is not in ecosystem: ${selection.teamId}`)
}

export function assertWorldDbGameBootstrapSliceV1(value: unknown): asserts value is WorldDbGameBootstrapSliceV1 {
  if (!isRecord(value) || value.schemaVersion !== 1) throw new TypeError('Unsupported World DB game bootstrap slice version')
  requireSource(value.source)
  requireRecord(value.ecosystem, 'World DB bootstrap ecosystem')
  requireRecord(value.competition, 'World DB bootstrap competition')
  requireRecord(value.season, 'World DB bootstrap season')
  const ecosystem = value.ecosystem
  const competition = value.competition
  const season = value.season
  for (const field of ['ecosystemId', 'name', 'kind', 'category'] as const) requireText(ecosystem[field], `World DB bootstrap ecosystem ${field}`)
  for (const field of ['competitionId', 'name', 'gender', 'ecosystemId'] as const) requireText(competition[field], `World DB bootstrap competition ${field}`)
  for (const field of ['competitionSeasonId', 'seasonId', 'label', 'startDate', 'endDate', 'provenance'] as const) requireText(season[field], `World DB bootstrap season ${field}`)
  assertArray(value.countries, 'countries', (entry) => { for (const field of ['countryId', 'name', 'code'] as const) requireText(entry[field], `World DB bootstrap country ${field}`) }, 'countryId')
  assertArray(value.organizations, 'organizations', (entry) => { for (const field of ['organizationId', 'entityId'] as const) requireText(entry[field], `World DB bootstrap organization ${field}`); for (const field of ['legalName', 'primaryPlaceId', 'website'] as const) requireNullableText(entry[field], `World DB bootstrap organization ${field}`); for (const field of ['foundedYear', 'dissolvedYear'] as const) requireNullableInteger(entry[field], `World DB bootstrap organization ${field}`) }, 'organizationId')
  assertArray(value.organizationSections, 'organizationSections', (entry) => { for (const field of ['sectionId', 'organizationId', 'canonicalName'] as const) requireText(entry[field], `World DB bootstrap organization section ${field}`); for (const field of ['sport', 'gender', 'categoryScope', 'validFrom', 'validTo'] as const) requireNullableText(entry[field], `World DB bootstrap organization section ${field}`) }, 'sectionId')
  assertArray(value.organizationOwnership ?? [], 'organizationOwnership', (entry) => { for (const field of ['ownershipId', 'organizationId', 'ownerKind', 'ownerId'] as const) requireText(entry[field], `World DB bootstrap ownership ${field}`); if (entry.ownerKind !== 'PERSON' && entry.ownerKind !== 'ORGANIZATION') throw new TypeError(`World DB bootstrap ownership ownerKind is unsupported: ${String(entry.ownerKind)}`); if (typeof entry.ownershipPercentage !== 'number' && entry.ownershipPercentage !== null) throw new TypeError('World DB bootstrap ownership percentage must be a number or null'); for (const field of ['validFrom', 'validTo'] as const) requireNullableText(entry[field], `World DB bootstrap ownership ${field}`) }, 'ownershipId')
  assertArray(value.teams, 'teams', (entry) => { for (const field of ['teamId', 'name', 'gender', 'countryId', 'organizationId', 'organizationSectionId'] as const) requireText(entry[field], `World DB bootstrap team ${field}`) }, 'teamId')
  const organizationIds = new Set((value.organizations as Record<string, unknown>[]).map((entry) => entry.organizationId as string))
  const sectionsById = new Map((value.organizationSections as Record<string, unknown>[]).map((entry) => [entry.sectionId as string, entry]))
  for (const section of value.organizationSections as Record<string, unknown>[]) if (!organizationIds.has(section.organizationId as string)) throw new TypeError(`World DB bootstrap organization section references a missing organization: ${String(section.sectionId)}`)
  for (const team of value.teams as Record<string, unknown>[]) { const section = sectionsById.get(team.organizationSectionId as string); if (!organizationIds.has(team.organizationId as string) || section === undefined || section.organizationId !== team.organizationId) throw new TypeError(`World DB bootstrap team organization relation is invalid: ${String(team.teamId)}`) }
  assertArray(value.persons, 'persons', (entry) => { for (const field of ['personId', 'firstName', 'lastName'] as const) requireText(entry[field], `World DB bootstrap person ${field}`); if (entry.gender !== undefined) requireText(entry.gender, 'World DB bootstrap person gender'); if (entry.dateOfBirth !== undefined) requireText(entry.dateOfBirth, 'World DB bootstrap person dateOfBirth'); if (!Array.isArray(entry.nationalityIds)) throw new TypeError('World DB bootstrap person nationalityIds must be an array'); if (entry.physical !== undefined && !isRecord(entry.physical)) throw new TypeError('World DB bootstrap person physical must be an object') }, 'personId')
  assertArray(value.players, 'players', (entry) => { for (const field of ['playerId', 'personId', 'primaryPosition', 'dominantHand'] as const) requireText(entry[field], `World DB bootstrap player ${field}`); assertExactKeys(entry.ratings, PLAYER_TRUTH_RATING_KEYS, 'ratings'); assertExactKeys(entry.tendencies, PLAYER_TRUTH_TENDENCY_KEYS, 'tendencies'); if (!Array.isArray(entry.development)) throw new TypeError('World DB bootstrap player development must be an array') }, 'playerId')
  assertArray(value.staffProfiles, 'staffProfiles', (entry) => { for (const field of ['staffId', 'personId'] as const) requireText(entry[field], `World DB bootstrap staff ${field}`); if (!isRecord(entry.attributes) || !Array.isArray(entry.specialismIds)) throw new TypeError('World DB bootstrap staff profile is incomplete') }, 'staffId')
  const profiledPersonIds = new Set<string>([
    ...((value.players as Record<string, unknown>[]).map((entry) => entry.personId as string)),
    ...((value.staffProfiles as Record<string, unknown>[]).map((entry) => entry.personId as string)),
  ])
  for (const person of value.persons as Record<string, unknown>[]) if (profiledPersonIds.has(person.personId as string) && (person.gender === undefined || person.dateOfBirth === undefined || !isRecord(person.physical))) throw new TypeError(`World DB bootstrap profiled person is incomplete: ${String(person.personId)}`)
  assertArray(value.staffAssignments, 'staffAssignments', (entry) => { for (const field of ['assignmentId', 'staffId', 'teamId', 'roleCode', 'assignedOn'] as const) requireText(entry[field], `World DB bootstrap staff assignment ${field}`) }, 'assignmentId')
  assertArray(value.rosterAssignments, 'rosterAssignments', (entry) => { for (const field of ['rosterId', 'teamId', 'playerId', 'status'] as const) requireText(entry[field], `World DB bootstrap roster assignment ${field}`) }, undefined)
  assertArray(value.matches, 'matches', (entry) => { for (const field of ['matchId', 'status', 'homeTeamId', 'awayTeamId'] as const) requireText(entry[field], `World DB bootstrap match ${field}`) }, 'matchId')
}

function assertArray(value: unknown, label: string, assertEntry: (entry: Record<string, unknown>) => void, idField: string | undefined): void { if (!Array.isArray(value)) throw new TypeError(`World DB bootstrap ${label} must be an array`); const ids = new Set<string>(); for (const item of value) { if (!isRecord(item)) throw new TypeError(`World DB bootstrap ${label} entries must be objects`); assertEntry(item); if (idField !== undefined) { const id = item[idField]; if (typeof id !== 'string') throw new TypeError(`World DB bootstrap ${label} ID must be a string`); if (ids.has(id)) throw new TypeError(`World DB bootstrap ${label} must not contain duplicate IDs`); ids.add(id) } } }
function requireSource(value: unknown): asserts value is WorldDbDatabaseInfoV1['source'] { if (!isRecord(value)) throw new TypeError('World DB bootstrap source must be an object'); requireText(value.databaseId, 'World DB bootstrap databaseId'); requireText(value.schemaId, 'World DB bootstrap schemaId') }
function requireNullableText(value: unknown, label: string): void { if (value !== null && typeof value !== 'string') throw new TypeError(`${label} must be a string or null`) }
function requireNullableInteger(value: unknown, label: string): void { if (value !== null && (typeof value !== 'number' || !Number.isInteger(value))) throw new TypeError(`${label} must be an integer or null`) }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function assertExactKeys(value: unknown, expected: readonly string[], field: string): void {
  if (!isRecord(value)) throw new TypeError(`World DB bootstrap player ${field} must be an object`)
  const keys = Object.keys(value)
  if (keys.length !== expected.length || keys.some((key) => !expected.includes(key))) {
    throw new RangeError(`World DB bootstrap player ${field} must contain exactly ${expected.length} canonical keys`)
  }
}
function requireRecord(value: unknown, label: string): asserts value is Record<string, unknown> { if (!isRecord(value)) throw new TypeError(`${label} must be an object`) }
function requireText(value: unknown, label: string): asserts value is string { if (typeof value !== 'string' || value.trim().length === 0) throw new TypeError(`${label} must be a non-empty string`) }
