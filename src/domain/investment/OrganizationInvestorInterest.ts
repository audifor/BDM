import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import {
  investorInterestIdFromString,
  organizationIdFromString,
  type InvestorInterestId,
  type OrganizationId,
} from '@/domain/ids'
import type { GameWorld } from '@/domain/world/GameWorld'
import {
  createOrganizationOwnershipActor,
  type OrganizationOwnershipActor,
} from '@/domain/ownership/OrganizationOwnership'

export type OrganizationInvestorActor = OrganizationOwnershipActor

export interface OrganizationInvestorInterest {
  readonly id: InvestorInterestId
  readonly organizationId: OrganizationId
  readonly investor: OrganizationInvestorActor
  readonly interestType: string
  readonly status: string | null
  readonly openedOn: GameDate | null
  readonly closedOn: GameDate | null
}

export interface CreateOrganizationInvestorInterestInput {
  readonly id: InvestorInterestId | string
  readonly organizationId: OrganizationId | string
  readonly investor: OrganizationInvestorActor
  readonly interestType: string
  readonly status?: string | null
  readonly openedOn?: GameDate | string | null
  readonly closedOn?: GameDate | string | null
}

export function createOrganizationInvestorInterest(input: CreateOrganizationInvestorInterestInput): OrganizationInvestorInterest {
  const interestType = nonEmptyText(input.interestType, 'Organization investor interest type')
  if (input.status !== undefined && input.status !== null && typeof input.status !== 'string') throw new TypeError('Organization investor interest status must be a string or null')
  const openedOn = input.openedOn === undefined || input.openedOn === null ? null : parseGameDate(input.openedOn)
  const closedOn = input.closedOn === undefined || input.closedOn === null ? null : parseGameDate(input.closedOn)
  if (openedOn !== null && closedOn !== null && compareGameDates(closedOn, openedOn) < 0) throw new RangeError('Organization investor interest closedOn cannot precede openedOn')
  return Object.freeze({
    id: investorInterestIdFromString(input.id),
    organizationId: organizationIdFromString(input.organizationId),
    investor: createOrganizationOwnershipActor(input.investor),
    interestType,
    status: input.status === undefined ? null : input.status,
    openedOn,
    closedOn,
  })
}

export function isOrganizationInvestorInterestActiveOn(interest: OrganizationInvestorInterest, onDate: GameDate): boolean {
  return (interest.openedOn === null || compareGameDates(interest.openedOn, onDate) <= 0)
    && (interest.closedOn === null || compareGameDates(onDate, interest.closedOn) <= 0)
}

export function getActiveInvestorInterests(world: GameWorld, organizationId: OrganizationId, onDate: GameDate = world.currentDate): readonly OrganizationInvestorInterest[] {
  return Object.values(world.organizationInvestorInterestsById)
    .filter((interest) => interest.organizationId === organizationId && isOrganizationInvestorInterestActiveOn(interest, onDate))
    .sort((left, right) => left.id.localeCompare(right.id))
}

export function getInvestorOrganizationInterests(world: GameWorld, investor: OrganizationInvestorActor, onDate: GameDate = world.currentDate): readonly OrganizationInvestorInterest[] {
  return Object.values(world.organizationInvestorInterestsById)
    .filter((interest) => sameInvestorActor(interest.investor, investor) && isOrganizationInvestorInterestActiveOn(interest, onDate))
    .sort((left, right) => left.id.localeCompare(right.id))
}

export function findInterestedInvestorsForOrganization(world: GameWorld, organizationId: OrganizationId, onDate: GameDate = world.currentDate): readonly OrganizationInvestorActor[] {
  const actors = new Map<string, OrganizationInvestorActor>()
  for (const interest of getActiveInvestorInterests(world, organizationId, onDate)) actors.set(actorKey(interest.investor), interest.investor)
  return Object.freeze([...actors.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, actor]) => actor))
}

export function findOrganizationsOfInterestForInvestor(world: GameWorld, investor: OrganizationInvestorActor, onDate: GameDate = world.currentDate): readonly OrganizationId[] {
  return Object.freeze([...new Set(getInvestorOrganizationInterests(world, investor, onDate).map((interest) => interest.organizationId))].sort((left, right) => left.localeCompare(right)))
}

export function actorKey(actor: OrganizationInvestorActor): string {
  return actor.kind === 'PERSON' ? `PERSON:${actor.personId}` : `ORGANIZATION:${actor.organizationId}`
}

function nonEmptyText(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new TypeError(`${label} must be non-empty`)
  return value
}

function sameInvestorActor(left: OrganizationInvestorActor, right: OrganizationInvestorActor): boolean {
  return left.kind === 'PERSON'
    ? right.kind === 'PERSON' && left.personId === right.personId
    : right.kind === 'ORGANIZATION' && left.organizationId === right.organizationId
}
