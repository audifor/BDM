import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import { organizationIdFromString, organizationLifecycleStateIdFromString, type OrganizationId, type OrganizationLifecycleStateId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world/GameWorld'

export const ORGANIZATION_LIFECYCLE_STATUSES = ['ACTIVE', 'SUSPENDED', 'ADMINISTERED', 'DISSOLVED', 'SUCCEEDED', 'MERGED', 'INACTIVE'] as const
export type OrganizationLifecycleStatus = typeof ORGANIZATION_LIFECYCLE_STATUSES[number]

export interface OrganizationLifecycleState {
  readonly id: OrganizationLifecycleStateId
  readonly organizationId: OrganizationId
  readonly status: OrganizationLifecycleStatus
  readonly effectiveFrom: GameDate
  readonly effectiveTo: GameDate | null
  readonly sourceStructuralChangeId: string | null
  readonly notes: string | null
}

export interface CreateOrganizationLifecycleStateInput {
  readonly id: OrganizationLifecycleStateId | string
  readonly organizationId: OrganizationId | string
  readonly status: OrganizationLifecycleStatus
  readonly effectiveFrom: GameDate | string
  readonly effectiveTo?: GameDate | string | null
  readonly sourceStructuralChangeId?: string | null
  readonly notes?: string | null
}

export function createOrganizationLifecycleState(input: CreateOrganizationLifecycleStateInput): OrganizationLifecycleState {
  if (!ORGANIZATION_LIFECYCLE_STATUSES.includes(input.status)) throw new TypeError('Organization lifecycle status is invalid')
  const effectiveFrom = parseGameDate(input.effectiveFrom)
  const effectiveTo = input.effectiveTo === undefined || input.effectiveTo === null ? null : parseGameDate(input.effectiveTo)
  if (effectiveTo !== null && compareGameDates(effectiveTo, effectiveFrom) < 0) throw new RangeError('Organization lifecycle effectiveTo cannot precede effectiveFrom')
  return Object.freeze({
    id: organizationLifecycleStateIdFromString(input.id), organizationId: organizationIdFromString(input.organizationId), status: status as OrganizationLifecycleStatus,
    effectiveFrom, effectiveTo, sourceStructuralChangeId: nullableText(input.sourceStructuralChangeId), notes: nullableText(input.notes),
  })
}

export function getOrganizationLifecycleAt(world: GameWorld, organizationId: OrganizationId, onDate: GameDate | string = world.currentDate): OrganizationLifecycleState {
  const date = parseGameDate(onDate)
  const states = Object.values(world.organizationLifecycleStatesById)
    .filter((state) => state.organizationId === organizationId && state.effectiveFrom <= date && (state.effectiveTo === null || date <= state.effectiveTo))
    .sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom) || left.id.localeCompare(right.id))
  return states.at(-1) ?? createOrganizationLifecycleState({ id: `lifecycle:${organizationId}:default`, organizationId, status: 'ACTIVE', effectiveFrom: '0001-01-01' })
}

export function isOrganizationOperationalAt(world: GameWorld, organizationId: OrganizationId, onDate: GameDate | string = world.currentDate): boolean {
  const status = getOrganizationLifecycleAt(world, organizationId, onDate).status
  return status === 'ACTIVE' || status === 'ADMINISTERED'
}

function nullableText(value: string | null | undefined): string | null {
  return value === undefined || value === null ? null : value
}
