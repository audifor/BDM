import type { WorldDbDatabaseInfoV1 } from './DatabaseInfo'

export interface WorldDbPlayableSeasonV1 {
  readonly competitionSeasonId: string
  readonly seasonId: string
  readonly editionNumber: number | null
}

export interface WorldDbPlayableCompetitionV1 {
  readonly competitionId: string
  readonly name: string
  readonly ecosystemLevelId: string | null
  readonly ecosystemUnitId: string | null
  readonly roleType: string
  readonly seasons: readonly WorldDbPlayableSeasonV1[]
}

export interface WorldDbPlayableLevelV1 {
  readonly ecosystemLevelId: string
  readonly parentLevelId: string | null
  readonly levelCode: string
  readonly name: string
  readonly tierOrder: number | null
}

export interface WorldDbPlayableUnitV1 {
  readonly ecosystemUnitId: string
  readonly ecosystemLevelId: string | null
  readonly parentUnitId: string | null
  readonly unitType: string
  readonly code: string
  readonly name: string
}

export interface WorldDbPlayableTeamMembershipV1 {
  readonly ecosystemLevelId: string | null
  readonly membershipStatus: string
}

export interface WorldDbPlayableTeamUnitMembershipV1 {
  readonly ecosystemUnitId: string
  readonly membershipStatus: string
}

export interface WorldDbPlayableTeamV1 {
  readonly teamId: string
  readonly name: string
  readonly memberships: readonly WorldDbPlayableTeamMembershipV1[]
  readonly unitMemberships: readonly WorldDbPlayableTeamUnitMembershipV1[]
}

export interface WorldDbPlayableEcosystemV1 {
  readonly competitionEcosystemId: string
  readonly code: string
  readonly name: string
  readonly gender: string | null
  readonly levels: readonly WorldDbPlayableLevelV1[]
  readonly units: readonly WorldDbPlayableUnitV1[]
  readonly competitions: readonly WorldDbPlayableCompetitionV1[]
  readonly teams: readonly WorldDbPlayableTeamV1[]
}

export interface WorldDbPlayableCatalogV1 {
  readonly schemaVersion: 1
  readonly source: WorldDbDatabaseInfoV1['source']
  readonly ecosystems: readonly WorldDbPlayableEcosystemV1[]
}

export function assertWorldDbPlayableCatalogV1(value: unknown): asserts value is WorldDbPlayableCatalogV1 {
  const root = requireRecord(value, 'World DB playable catalog')
  if (root.schemaVersion !== 1) throw new TypeError('World DB playable catalog schemaVersion must be 1')
  const source = requireRecord(root.source, 'World DB playable catalog source')
  requireText(source.databaseId, 'World DB playable catalog source.databaseId')
  requireText(source.schemaId, 'World DB playable catalog source.schemaId')

  for (const ecosystemValue of requireArray(root.ecosystems, 'World DB playable catalog ecosystems')) {
    const ecosystem = requireRecord(ecosystemValue, 'World DB playable ecosystem')
    requireText(ecosystem.competitionEcosystemId, 'World DB playable ecosystem competitionEcosystemId')
    requireText(ecosystem.code, 'World DB playable ecosystem code')
    requireText(ecosystem.name, 'World DB playable ecosystem name')
    requireNullableText(ecosystem.gender, 'World DB playable ecosystem gender')

    for (const levelValue of requireArray(ecosystem.levels, 'World DB playable ecosystem levels')) {
      const level = requireRecord(levelValue, 'World DB playable level')
      requireText(level.ecosystemLevelId, 'World DB playable level ecosystemLevelId')
      requireNullableText(level.parentLevelId, 'World DB playable level parentLevelId')
      requireText(level.levelCode, 'World DB playable level levelCode')
      requireText(level.name, 'World DB playable level name')
      requireNullableInteger(level.tierOrder, 'World DB playable level tierOrder')
    }

    for (const unitValue of requireArray(ecosystem.units, 'World DB playable ecosystem units')) {
      const unit = requireRecord(unitValue, 'World DB playable unit')
      requireText(unit.ecosystemUnitId, 'World DB playable unit ecosystemUnitId')
      requireNullableText(unit.ecosystemLevelId, 'World DB playable unit ecosystemLevelId')
      requireNullableText(unit.parentUnitId, 'World DB playable unit parentUnitId')
      requireText(unit.unitType, 'World DB playable unit unitType')
      requireText(unit.code, 'World DB playable unit code')
      requireText(unit.name, 'World DB playable unit name')
    }

    for (const competitionValue of requireArray(ecosystem.competitions, 'World DB playable ecosystem competitions')) {
      const competition = requireRecord(competitionValue, 'World DB playable competition')
      requireText(competition.competitionId, 'World DB playable competition competitionId')
      requireText(competition.name, 'World DB playable competition name')
      requireNullableText(competition.ecosystemLevelId, 'World DB playable competition ecosystemLevelId')
      requireNullableText(competition.ecosystemUnitId, 'World DB playable competition ecosystemUnitId')
      requireText(competition.roleType, 'World DB playable competition roleType')
      for (const seasonValue of requireArray(competition.seasons, 'World DB playable competition seasons')) {
        const season = requireRecord(seasonValue, 'World DB playable season')
        requireText(season.competitionSeasonId, 'World DB playable season competitionSeasonId')
        requireText(season.seasonId, 'World DB playable season seasonId')
        requireNullableInteger(season.editionNumber, 'World DB playable season editionNumber')
      }
    }

    for (const teamValue of requireArray(ecosystem.teams, 'World DB playable ecosystem teams')) {
      const team = requireRecord(teamValue, 'World DB playable team')
      requireText(team.teamId, 'World DB playable team teamId')
      requireText(team.name, 'World DB playable team name')
      for (const membershipValue of requireArray(team.memberships, 'World DB playable team memberships')) {
        const membership = requireRecord(membershipValue, 'World DB playable team membership')
        requireNullableText(membership.ecosystemLevelId, 'World DB playable team membership ecosystemLevelId')
        requireText(membership.membershipStatus, 'World DB playable team membership membershipStatus')
      }
      for (const membershipValue of requireArray(team.unitMemberships, 'World DB playable team unit memberships')) {
        const membership = requireRecord(membershipValue, 'World DB playable team unit membership')
        requireText(membership.ecosystemUnitId, 'World DB playable team unit membership ecosystemUnitId')
        requireText(membership.membershipStatus, 'World DB playable team unit membership membershipStatus')
      }
    }
  }
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function requireArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`)
  return value
}

function requireText(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new TypeError(`${label} must be a non-empty string`)
}

function requireNullableText(value: unknown, label: string): void {
  if (value !== null && (typeof value !== 'string' || value.trim().length === 0)) {
    throw new TypeError(`${label} must be null or a non-empty string`)
  }
}

function requireNullableInteger(value: unknown, label: string): void {
  if (value !== null && !Number.isInteger(value)) throw new TypeError(`${label} must be null or an integer`)
}
