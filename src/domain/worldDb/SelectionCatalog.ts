import type { WorldDbDatabaseInfoV1 } from './DatabaseInfo'

export interface WorldDbSelectionEcosystemV1 {
  readonly ecosystemId: string
  readonly code: string
  readonly name: string
  readonly gender: string | null
}

export interface WorldDbSelectionLevelV1 {
  readonly levelId: string
  readonly ecosystemId: string
  readonly parentLevelId: string | null
  readonly code: string
  readonly name: string
  readonly tierOrder: number | null
}

export interface WorldDbSelectionUnitV1 {
  readonly unitId: string
  readonly ecosystemId: string
  readonly levelId: string | null
  readonly parentUnitId: string | null
  readonly organizationId: string | null
  readonly unitType: string
  readonly code: string
  readonly name: string
}

export interface WorldDbSelectionCompetitionAssignmentV1 {
  readonly assignmentId: string
  readonly ecosystemId: string
  readonly competitionId: string
  readonly competitionName: string
  readonly levelId: string | null
  readonly unitId: string | null
  readonly roleType: string
}

export interface WorldDbSelectionCompetitionSeasonV1 {
  readonly competitionSeasonId: string
  readonly competitionId: string
  readonly competitionName: string
  readonly seasonId: string
  readonly editionNumber: number | null
}

export interface WorldDbSelectionTeamMembershipV1 {
  readonly membershipId: string
  readonly ecosystemId: string
  readonly teamId: string
  readonly teamName: string
  readonly levelId: string | null
  readonly membershipStatus: string
  readonly validFrom: string | null
  readonly validTo: string | null
}

export interface WorldDbSelectionTeamUnitMembershipV1 {
  readonly membershipId: string
  readonly unitId: string
  readonly teamId: string
  readonly teamName: string
  readonly membershipStatus: string
  readonly validFrom: string | null
  readonly validTo: string | null
}

export interface WorldDbSelectionCatalogV1 {
  readonly schemaVersion: 1
  readonly source: WorldDbDatabaseInfoV1['source']
  readonly ecosystems: readonly WorldDbSelectionEcosystemV1[]
  readonly levels: readonly WorldDbSelectionLevelV1[]
  readonly units: readonly WorldDbSelectionUnitV1[]
  readonly competitionAssignments: readonly WorldDbSelectionCompetitionAssignmentV1[]
  readonly competitionSeasons: readonly WorldDbSelectionCompetitionSeasonV1[]
  readonly teamMemberships: readonly WorldDbSelectionTeamMembershipV1[]
  readonly teamUnitMemberships: readonly WorldDbSelectionTeamUnitMembershipV1[]
}

export function assertWorldDbSelectionCatalogV1(value: unknown): asserts value is WorldDbSelectionCatalogV1 {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new TypeError('Unsupported World DB selection catalog version')
  }
  if (!isRecord(value.source)) throw new TypeError('World DB selection source must be an object')
  requireText(value.source.databaseId, 'World DB selection databaseId')
  requireText(value.source.schemaId, 'World DB selection schemaId')

  assertArray(value.ecosystems, 'ecosystems', (entry) => {
    requireText(entry.ecosystemId, 'ecosystemId')
    requireText(entry.code, 'ecosystem code')
    requireText(entry.name, 'ecosystem name')
    requireNullableText(entry.gender, 'ecosystem gender')
  }, 'ecosystemId')
  assertArray(value.levels, 'levels', (entry) => {
    requireText(entry.levelId, 'levelId')
    requireText(entry.ecosystemId, 'level ecosystemId')
    requireNullableText(entry.parentLevelId, 'parentLevelId')
    requireText(entry.code, 'level code')
    requireText(entry.name, 'level name')
    requireNullableInteger(entry.tierOrder, 'tierOrder')
  }, 'levelId')
  assertArray(value.units, 'units', (entry) => {
    requireText(entry.unitId, 'unitId')
    requireText(entry.ecosystemId, 'unit ecosystemId')
    requireNullableText(entry.levelId, 'unit levelId')
    requireNullableText(entry.parentUnitId, 'parentUnitId')
    requireNullableText(entry.organizationId, 'organizationId')
    requireText(entry.unitType, 'unitType')
    requireText(entry.code, 'unit code')
    requireText(entry.name, 'unit name')
  }, 'unitId')
  assertArray(value.competitionAssignments, 'competitionAssignments', (entry) => {
    requireText(entry.assignmentId, 'assignmentId')
    requireText(entry.ecosystemId, 'assignment ecosystemId')
    requireText(entry.competitionId, 'assignment competitionId')
    requireText(entry.competitionName, 'competitionName')
    requireNullableText(entry.levelId, 'assignment levelId')
    requireNullableText(entry.unitId, 'assignment unitId')
    requireText(entry.roleType, 'roleType')
  }, 'assignmentId')
  assertArray(value.competitionSeasons, 'competitionSeasons', (entry) => {
    requireText(entry.competitionSeasonId, 'competitionSeasonId')
    requireText(entry.competitionId, 'season competitionId')
    requireText(entry.competitionName, 'season competitionName')
    requireText(entry.seasonId, 'seasonId')
    requireNullableInteger(entry.editionNumber, 'editionNumber')
  }, 'competitionSeasonId')
  assertArray(value.teamMemberships, 'teamMemberships', (entry) => {
    requireText(entry.membershipId, 'team membershipId')
    requireText(entry.ecosystemId, 'team ecosystemId')
    requireText(entry.teamId, 'teamId')
    requireText(entry.teamName, 'teamName')
    requireNullableText(entry.levelId, 'team levelId')
    requireText(entry.membershipStatus, 'team membershipStatus')
    requireNullableText(entry.validFrom, 'team validFrom')
    requireNullableText(entry.validTo, 'team validTo')
  }, 'membershipId')
  assertArray(value.teamUnitMemberships, 'teamUnitMemberships', (entry) => {
    requireText(entry.membershipId, 'team-unit membershipId')
    requireText(entry.unitId, 'team-unit unitId')
    requireText(entry.teamId, 'team-unit teamId')
    requireText(entry.teamName, 'team-unit teamName')
    requireText(entry.membershipStatus, 'team-unit membershipStatus')
    requireNullableText(entry.validFrom, 'team-unit validFrom')
    requireNullableText(entry.validTo, 'team-unit validTo')
  }, 'membershipId')
}

function assertArray(
  value: unknown,
  label: string,
  assertEntry: (entry: Record<string, unknown>) => void,
  idField: string,
): void {
  if (!Array.isArray(value)) throw new TypeError(`World DB selection ${label} must be an array`)
  const ids: string[] = []
  for (const item of value) {
    if (!isRecord(item)) throw new TypeError(`World DB selection ${label} entries must be objects`)
    assertEntry(item)
    const id = item[idField]
    if (typeof id !== 'string') throw new TypeError(`World DB selection ${label} id must be a string`)
    ids.push(id)
  }
  if (new Set(ids).size !== ids.length) {
    throw new TypeError(`World DB selection ${label} must not contain duplicate IDs`)
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

function requireNullableText(value: unknown, label: string): asserts value is string | null {
  if (value === null) return
  requireText(value, label)
}

function requireNullableInteger(value: unknown, label: string): asserts value is number | null {
  if (value === null) return
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new TypeError(`${label} must be an integer or null`)
  }
}
