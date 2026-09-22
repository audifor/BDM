import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import { organizationIdFromString, organizationSuccessionIdFromString, type OrganizationId, type OrganizationSuccessionId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world/GameWorld'

export const ORGANIZATION_SUCCESSION_TYPES = ['TOTAL', 'PARTIAL'] as const
export type OrganizationSuccessionType = typeof ORGANIZATION_SUCCESSION_TYPES[number]

export interface OrganizationSuccession {
  readonly id: OrganizationSuccessionId
  readonly predecessorOrganizationId: OrganizationId
  readonly successorOrganizationId: OrganizationId
  readonly effectiveDate: GameDate
  readonly successionType: OrganizationSuccessionType
  readonly transfersRights: boolean
  readonly transfersObligations: boolean
  readonly transfersCompetitionRights: boolean
  readonly notes: string | null
}

export interface CreateOrganizationSuccessionInput {
  readonly id: OrganizationSuccessionId | string
  readonly predecessorOrganizationId: OrganizationId | string
  readonly successorOrganizationId: OrganizationId | string
  readonly effectiveDate: GameDate | string
  readonly successionType: OrganizationSuccessionType
  readonly transfersRights: boolean
  readonly transfersObligations: boolean
  readonly transfersCompetitionRights: boolean
  readonly notes?: string | null
}

export function createOrganizationSuccession(input: CreateOrganizationSuccessionInput): OrganizationSuccession {
  const predecessorOrganizationId = organizationIdFromString(input.predecessorOrganizationId)
  const successorOrganizationId = organizationIdFromString(input.successorOrganizationId)
  if (predecessorOrganizationId === successorOrganizationId) throw new RangeError('Organization succession cannot reference the same predecessor and successor')
  if (!ORGANIZATION_SUCCESSION_TYPES.includes(input.successionType)) throw new TypeError('Organization succession type is invalid')
  for (const value of [input.transfersRights, input.transfersObligations, input.transfersCompetitionRights]) if (typeof value !== 'boolean') throw new TypeError('Organization succession transfer flags must be boolean')
  return Object.freeze({ id: organizationSuccessionIdFromString(input.id), predecessorOrganizationId, successorOrganizationId, effectiveDate: parseGameDate(input.effectiveDate), successionType: input.successionType, transfersRights: input.transfersRights, transfersObligations: input.transfersObligations, transfersCompetitionRights: input.transfersCompetitionRights, notes: input.notes ?? null })
}

export interface OrganizationSuccessionResolution {
  readonly organizationIds: readonly OrganizationId[]
  readonly terminalOrganizationId: OrganizationId
  readonly cycleDetected: boolean
}

export function resolveOrganizationSuccessionChain(world: GameWorld, organizationId: OrganizationId, onDate: GameDate | string = world.currentDate): OrganizationSuccessionResolution {
  const date = parseGameDate(onDate)
  const organizationIds: OrganizationId[] = [organizationId]
  const visited = new Set<OrganizationId>(organizationIds)
  let current = organizationId
  while (true) {
    const next = Object.values(world.organizationSuccessionsById)
      .filter((item) => item.predecessorOrganizationId === current && compareGameDates(item.effectiveDate, date) <= 0)
      .sort((left, right) => compareGameDates(right.effectiveDate, left.effectiveDate) || left.id.localeCompare(right.id))[0]
    if (next === undefined) return Object.freeze({ organizationIds: Object.freeze(organizationIds), terminalOrganizationId: current, cycleDetected: false })
    if (visited.has(next.successorOrganizationId)) return Object.freeze({ organizationIds: Object.freeze(organizationIds), terminalOrganizationId: current, cycleDetected: true })
    visited.add(next.successorOrganizationId); organizationIds.push(next.successorOrganizationId); current = next.successorOrganizationId
  }
}

export function getEffectiveOrganizationSuccessor(world: GameWorld, organizationId: OrganizationId, onDate: GameDate | string = world.currentDate): OrganizationId {
  const resolution = resolveOrganizationSuccessionChain(world, organizationId, onDate)
  if (resolution.cycleDetected) throw new Error(`Organization succession cycle detected from ${organizationId}`)
  return resolution.terminalOrganizationId
}
