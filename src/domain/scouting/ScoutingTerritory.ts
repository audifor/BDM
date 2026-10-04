import { parseGameDate, type GameDate } from '@/domain/date'
import type { CompetitionId, CountryId, OrganizationId, PlayerId, StaffPersonId, TeamId } from '@/domain/ids'
import type { StaffRoleId } from '@/domain/staff'

export type ScoutingTerritory =
  | { readonly kind: 'COUNTRY'; readonly countryId: CountryId }
  | { readonly kind: 'COMPETITION'; readonly competitionId: CompetitionId }

export type ScoutingTerritoryAssignmentStatus = 'ACTIVE' | 'ENDED'

export interface ScoutingTerritoryAssignment {
  readonly id: string
  readonly organizationId: OrganizationId
  readonly requestingTeamId: TeamId
  readonly scoutStaffId: StaffPersonId
  readonly recruitmentFocusId?: string
  readonly priority?: import('./Scouting').ScoutingPriority
  readonly territory: ScoutingTerritory
  readonly startedAt: GameDate
  readonly status: ScoutingTerritoryAssignmentStatus
  readonly lastProcessedAt?: GameDate
  readonly endedAt?: GameDate
}

export interface OrganizationPlayerAwareness {
  readonly id: string
  readonly organizationId: OrganizationId
  readonly playerId: PlayerId
  readonly discoveredAt: GameDate
  readonly source: 'TERRITORY_DISCOVERY'|'RECRUITING_DISCOVERY'
  readonly discoveredByStaffId: StaffPersonId
  readonly territory: ScoutingTerritory
}

/** Role fit authority for broad player discovery; advance scouts remain opponent/tactical specialists. */
export const SCOUTING_TERRITORY_ROLES: Readonly<Record<ScoutingTerritory['kind'], readonly StaffRoleId[]>> = {
  COUNTRY: ['headScout', 'regionalScout', 'internationalScout'],
  COMPETITION: ['headScout', 'regionalScout', 'internationalScout', 'collegeScout', 'proScout'],
}

export function scoutingTerritoryKey(territory: ScoutingTerritory): string {
  return territory.kind === 'COUNTRY' ? `country:${territory.countryId}` : `competition:${territory.competitionId}`
}

export const SCOUTING_TERRITORY_WORKLOAD_COST = 2

export function createScoutingTerritoryAssignment(value: ScoutingTerritoryAssignment): ScoutingTerritoryAssignment {
  validateTerritory(value.territory)
  if (value.recruitmentFocusId !== undefined && value.recruitmentFocusId.trim() === '') throw new TypeError('Recruitment Focus attribution must not be empty')
  if (value.priority !== undefined && !['LOW', 'NORMAL', 'HIGH', 'URGENT'].includes(value.priority)) throw new TypeError('Scouting territory priority is invalid')
  if (value.status !== 'ACTIVE' && value.status !== 'ENDED') throw new TypeError('Scouting territory assignment status is invalid')
  if (value.status === 'ENDED' && value.endedAt === undefined) throw new TypeError('Ended scouting territory assignment requires endedAt')
  if (value.status === 'ACTIVE' && value.endedAt !== undefined) throw new TypeError('Active scouting territory assignment cannot have endedAt')
  return Object.freeze({ ...value, startedAt: parseGameDate(value.startedAt), ...(value.lastProcessedAt === undefined ? {} : { lastProcessedAt: parseGameDate(value.lastProcessedAt) }), ...(value.endedAt === undefined ? {} : { endedAt: parseGameDate(value.endedAt) }), territory: Object.freeze({ ...value.territory }) })
}

export function createOrganizationPlayerAwareness(value: OrganizationPlayerAwareness): OrganizationPlayerAwareness {
  if (value.source !== 'TERRITORY_DISCOVERY' && value.source !== 'RECRUITING_DISCOVERY') throw new TypeError('Organization player awareness source is invalid')
  validateTerritory(value.territory)
  return Object.freeze({ ...value, discoveredAt: parseGameDate(value.discoveredAt), territory: Object.freeze({ ...value.territory }) })
}

function validateTerritory(value: ScoutingTerritory): void {
  if (value === null || typeof value !== 'object') throw new TypeError('Scouting territory is invalid')
  if (value.kind === 'COUNTRY' && value.countryId.length > 0) return
  if (value.kind === 'COMPETITION' && value.competitionId.length > 0) return
  throw new TypeError('Scouting territory is invalid')
}
