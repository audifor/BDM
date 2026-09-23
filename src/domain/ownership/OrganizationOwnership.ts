import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import {
  organizationControlIdFromString,
  organizationIdFromString,
  organizationOwnershipIdFromString,
  personIdFromString,
  type OrganizationControlId,
  type OrganizationId,
  type OrganizationOwnershipId,
  type PersonId,
} from '@/domain/ids'
import type { GameWorld } from '@/domain/world/GameWorld'

export type OrganizationOwnershipActor =
  | { readonly kind: 'PERSON'; readonly personId: PersonId }
  | { readonly kind: 'ORGANIZATION'; readonly organizationId: OrganizationId }

export interface OrganizationOwnership {
  readonly id: OrganizationOwnershipId
  readonly organizationId: OrganizationId
  readonly owner: OrganizationOwnershipActor
  readonly ownershipPercentage: number | null
  readonly validFrom: GameDate | null
  readonly validTo: GameDate | null
}

export interface OrganizationControl {
  readonly id: OrganizationControlId
  readonly organizationId: OrganizationId
  readonly controller: OrganizationOwnershipActor
  readonly validFrom: GameDate | null
  readonly validTo: GameDate | null
}

export interface CreateOrganizationOwnershipInput {
  readonly id: OrganizationOwnershipId | string
  readonly organizationId: OrganizationId | string
  readonly owner: OrganizationOwnershipActor
  readonly ownershipPercentage: number | null
  readonly validFrom?: GameDate | string | null
  readonly validTo?: GameDate | string | null
}

export interface CreateOrganizationControlInput {
  readonly id: OrganizationControlId | string
  readonly organizationId: OrganizationId | string
  readonly controller: OrganizationOwnershipActor
  readonly validFrom?: GameDate | string | null
  readonly validTo?: GameDate | string | null
}

export function createOrganizationOwnership(input: CreateOrganizationOwnershipInput): OrganizationOwnership {
  const ownershipPercentage = input.ownershipPercentage
  if (ownershipPercentage !== null && (!Number.isFinite(ownershipPercentage) || ownershipPercentage < 0 || ownershipPercentage > 100)) {
    throw new RangeError('Organization ownership percentage must be null or between 0 and 100')
  }
  const interval = gameDateInterval(input.validFrom, input.validTo, 'Organization ownership')
  return Object.freeze({
    id: organizationOwnershipIdFromString(input.id),
    organizationId: organizationIdFromString(input.organizationId),
    owner: createOrganizationOwnershipActor(input.owner),
    ownershipPercentage,
    ...interval,
  })
}

export function createOrganizationControl(input: CreateOrganizationControlInput): OrganizationControl {
  return Object.freeze({
    id: organizationControlIdFromString(input.id),
    organizationId: organizationIdFromString(input.organizationId),
    controller: createOrganizationOwnershipActor(input.controller),
    ...gameDateInterval(input.validFrom, input.validTo, 'Organization control'),
  })
}

export function createOrganizationOwnershipActor(actor: OrganizationOwnershipActor): OrganizationOwnershipActor {
  if (actor.kind === 'PERSON') return Object.freeze({ kind: 'PERSON', personId: personIdFromString(actor.personId) })
  if (actor.kind === 'ORGANIZATION') return Object.freeze({ kind: 'ORGANIZATION', organizationId: organizationIdFromString(actor.organizationId) })
  throw new TypeError('Organization ownership actor kind is invalid')
}

export function getActiveOrganizationOwnership(world: GameWorld, organizationId: OrganizationId, onDate: GameDate): readonly OrganizationOwnership[] {
  return Object.values(world.organizationOwnershipById)
    .filter((item) => item.organizationId === organizationId && isActiveOn(item.validFrom, item.validTo, onDate))
    .sort((a, b) => a.id.localeCompare(b.id))
}

export function getActiveOrganizationControllers(world: GameWorld, organizationId: OrganizationId, onDate: GameDate): readonly OrganizationControl[] {
  return Object.values(world.organizationControlById)
    .filter((item) => item.organizationId === organizationId && isActiveOn(item.validFrom, item.validTo, onDate))
    .sort((a, b) => a.id.localeCompare(b.id))
}

export function getTeamOrganizationOwnership(world: GameWorld, teamId: import('@/domain/ids').TeamId, onDate = world.currentDate): readonly OrganizationOwnership[] {
  const team = world.teams[teamId]
  if (team === undefined) throw new Error(`Team does not exist: ${teamId}`)
  return getActiveOrganizationOwnership(world, team.organizationId, onDate)
}

export function getTeamOrganizationControl(world: GameWorld, teamId: import('@/domain/ids').TeamId, onDate = world.currentDate): readonly OrganizationControl[] {
  const team = world.teams[teamId]
  if (team === undefined) throw new Error(`Team does not exist: ${teamId}`)
  return getActiveOrganizationControllers(world, team.organizationId, onDate)
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
