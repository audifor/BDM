import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import { facilityIdFromString, facilityOrganizationRelationshipIdFromString, facilityTeamRelationshipIdFromString, organizationIdFromString, teamIdFromString, type FacilityId, type FacilityOrganizationRelationshipId, type FacilityTeamRelationshipId, type OrganizationId, type TeamId } from '@/domain/ids'

/**
 * Non-ownership functional relationships between a Facility and an Organization. Deliberately
 * does not assume single-relationship exclusivity: an Organization can simultaneously OPERATE
 * and be a TENANT is impossible here (mutually exclusive per active kind is not enforced by this
 * type — GameWorld validation blocks exact-duplicate active relationships, not differing kinds).
 */
export const FACILITY_ORGANIZATION_RELATIONSHIP_KINDS = [
  'OWNER',
  'CO_OWNER',
  'OPERATOR',
  'TENANT',
  'LESSOR',
  'LESSEE',
  'MANAGER',
  'FINANCIER',
  'DEVELOPMENT_PARTNER',
] as const

export type FacilityOrganizationRelationshipKind = (typeof FACILITY_ORGANIZATION_RELATIONSHIP_KINDS)[number]

export interface FacilityOrganizationRelationship {
  readonly id: FacilityOrganizationRelationshipId
  readonly facilityId: FacilityId
  readonly organizationId: OrganizationId
  readonly kind: FacilityOrganizationRelationshipKind
  readonly validFrom: GameDate | null
  readonly validTo: GameDate | null
}

export interface CreateFacilityOrganizationRelationshipInput {
  readonly id: FacilityOrganizationRelationshipId | string
  readonly facilityId: FacilityId | string
  readonly organizationId: OrganizationId | string
  readonly kind: FacilityOrganizationRelationshipKind
  readonly validFrom?: GameDate | string | null
  readonly validTo?: GameDate | string | null
}

export function createFacilityOrganizationRelationship(input: CreateFacilityOrganizationRelationshipInput): FacilityOrganizationRelationship {
  if (!FACILITY_ORGANIZATION_RELATIONSHIP_KINDS.includes(input.kind)) throw new TypeError(`Facility organization relationship kind is invalid: ${String(input.kind)}`)
  const interval = gameDateInterval(input.validFrom, input.validTo, 'Facility organization relationship')
  return Object.freeze({
    id: facilityOrganizationRelationshipIdFromString(input.id),
    facilityId: facilityIdFromString(input.facilityId),
    organizationId: organizationIdFromString(input.organizationId),
    kind: input.kind,
    ...interval,
  })
}

/**
 * Non-ownership functional relationships between a Facility and a Team. A Team may use a
 * Facility without owning it, and may hold several simultaneous relationships of different
 * kinds (e.g. TRAINING at one Facility and HOME_VENUE at another).
 */
export const FACILITY_TEAM_RELATIONSHIP_KINDS = [
  'HOME_VENUE',
  'SECONDARY_HOME_VENUE',
  'TRAINING',
  'ACADEMY',
  'MEDICAL',
  'ADMINISTRATION',
  'TEMPORARY_HOME',
  'DEVELOPMENT',
  'STORAGE',
] as const

export type FacilityTeamRelationshipKind = (typeof FACILITY_TEAM_RELATIONSHIP_KINDS)[number]

export interface FacilityTeamRelationship {
  readonly id: FacilityTeamRelationshipId
  readonly facilityId: FacilityId
  readonly teamId: TeamId
  readonly kind: FacilityTeamRelationshipKind
  readonly validFrom: GameDate | null
  readonly validTo: GameDate | null
}

export interface CreateFacilityTeamRelationshipInput {
  readonly id: FacilityTeamRelationshipId | string
  readonly facilityId: FacilityId | string
  readonly teamId: TeamId | string
  readonly kind: FacilityTeamRelationshipKind
  readonly validFrom?: GameDate | string | null
  readonly validTo?: GameDate | string | null
}

export function createFacilityTeamRelationship(input: CreateFacilityTeamRelationshipInput): FacilityTeamRelationship {
  if (!FACILITY_TEAM_RELATIONSHIP_KINDS.includes(input.kind)) throw new TypeError(`Facility team relationship kind is invalid: ${String(input.kind)}`)
  const interval = gameDateInterval(input.validFrom, input.validTo, 'Facility team relationship')
  return Object.freeze({
    id: facilityTeamRelationshipIdFromString(input.id),
    facilityId: facilityIdFromString(input.facilityId),
    teamId: teamIdFromString(input.teamId),
    kind: input.kind,
    ...interval,
  })
}

function gameDateInterval(validFrom: GameDate | string | null | undefined, validTo: GameDate | string | null | undefined, label: string): { readonly validFrom: GameDate | null; readonly validTo: GameDate | null } {
  const from = validFrom === undefined || validFrom === null ? null : parseGameDate(validFrom)
  const to = validTo === undefined || validTo === null ? null : parseGameDate(validTo)
  if (from !== null && to !== null && compareGameDates(to, from) < 0) throw new RangeError(`${label} validTo cannot precede validFrom`)
  return { validFrom: from, validTo: to }
}

function isActiveOn(validFrom: GameDate | null, validTo: GameDate | null, onDate: GameDate): boolean {
  return (validFrom === null || compareGameDates(validFrom, onDate) <= 0) && (validTo === null || compareGameDates(onDate, validTo) <= 0)
}

export function getActiveFacilityOrganizationRelationships(relationships: readonly FacilityOrganizationRelationship[], facilityId: FacilityId, onDate: GameDate): readonly FacilityOrganizationRelationship[] {
  return relationships.filter((relationship) => relationship.facilityId === facilityId && isActiveOn(relationship.validFrom, relationship.validTo, onDate)).sort((a, b) => a.id.localeCompare(b.id))
}

export function getActiveFacilityTeamRelationships(relationships: readonly FacilityTeamRelationship[], facilityId: FacilityId, onDate: GameDate): readonly FacilityTeamRelationship[] {
  return relationships.filter((relationship) => relationship.facilityId === facilityId && isActiveOn(relationship.validFrom, relationship.validTo, onDate)).sort((a, b) => a.id.localeCompare(b.id))
}

export function getActiveFacilitiesForTeam(relationships: readonly FacilityTeamRelationship[], teamId: TeamId, onDate: GameDate): readonly FacilityTeamRelationship[] {
  return relationships.filter((relationship) => relationship.teamId === teamId && isActiveOn(relationship.validFrom, relationship.validTo, onDate)).sort((a, b) => a.id.localeCompare(b.id))
}
