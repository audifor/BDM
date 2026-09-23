import { compareGameDates, type GameDate } from '@/domain/date'
import type { OrganizationId } from '@/domain/ids'
import { getActiveOrganizationControllers, getActiveOrganizationOwnership, type OrganizationOwnership, type OrganizationOwnershipActor } from '@/domain/ownership/OrganizationOwnership'
import type { GameWorld } from '@/domain/world/GameWorld'

export interface EffectiveOwnershipResolution {
  readonly actor: OrganizationOwnershipActor
  readonly organizationId: OrganizationId
  readonly knownPercentage: number
  readonly hasUnknownContribution: boolean
  readonly hasCycle: boolean
}

export interface EffectiveOwnershipGraph {
  readonly organizationId: OrganizationId
  readonly resolutions: readonly EffectiveOwnershipResolution[]
  readonly hasUnknownContribution: boolean
  readonly hasCycle: boolean
}

export interface CommonOwnershipActorResolution {
  readonly actor: OrganizationOwnershipActor
  readonly organizationAId: OrganizationId
  readonly organizationBId: OrganizationId
  readonly knownPercentageA: number
  readonly knownPercentageB: number
  readonly directPercentageA: number
  readonly directPercentageB: number
  readonly directHasUnknownContributionA: boolean
  readonly directHasUnknownContributionB: boolean
  readonly hasUnknownContributionA: boolean
  readonly hasUnknownContributionB: boolean
  readonly hasCycleA: boolean
  readonly hasCycleB: boolean
}

export interface CommonControllerResolution {
  readonly actor: OrganizationOwnershipActor
  readonly organizationAId: OrganizationId
  readonly organizationBId: OrganizationId
}

export function getDirectOrganizationOwnership(world: GameWorld, organizationId: OrganizationId, onDate: GameDate = world.currentDate): readonly OrganizationOwnership[] {
  return getActiveOrganizationOwnership(world, organizationId, onDate)
}

export function getOrganizationsDirectlyOwnedByActor(world: GameWorld, actor: OrganizationOwnershipActor, onDate: GameDate = world.currentDate): readonly OrganizationId[] {
  const organizationIds = new Set<string>()
  for (const ownership of Object.values(world.organizationOwnershipById)) {
    if (!isActive(ownership.validFrom, ownership.validTo, onDate) || !sameActor(ownership.owner, actor)) continue
    organizationIds.add(ownership.organizationId)
  }
  return Object.freeze([...organizationIds].sort((left, right) => left.localeCompare(right)) as OrganizationId[])
}

export function resolveEffectiveOrganizationOwnership(world: GameWorld, organizationId: OrganizationId, onDate: GameDate = world.currentDate): EffectiveOwnershipGraph {
  const resolved = resolveOrganization(world, organizationId, onDate, new Set([organizationId]))
  return Object.freeze({
    organizationId,
    resolutions: Object.freeze([...resolved.values()].sort((left, right) => actorKey(left.actor).localeCompare(actorKey(right.actor)))),
    hasUnknownContribution: [...resolved.values()].some((resolution) => resolution.hasUnknownContribution),
    hasCycle: [...resolved.values()].some((resolution) => resolution.hasCycle),
  })
}

export function getEffectiveOrganizationOwnership(world: GameWorld, organizationId: OrganizationId, onDate: GameDate = world.currentDate): readonly EffectiveOwnershipResolution[] {
  return resolveEffectiveOrganizationOwnership(world, organizationId, onDate).resolutions
}

export function findCommonOwnershipActors(world: GameWorld, organizationAId: OrganizationId, organizationBId: OrganizationId, onDate: GameDate = world.currentDate): readonly CommonOwnershipActorResolution[] {
  if (organizationAId === organizationBId) return Object.freeze([])
  const graphA = resolveEffectiveOrganizationOwnership(world, organizationAId, onDate)
  const graphB = resolveEffectiveOrganizationOwnership(world, organizationBId, onDate)
  const directA = directResolutionMap(getDirectOrganizationOwnership(world, organizationAId, onDate), organizationAId)
  const directB = directResolutionMap(getDirectOrganizationOwnership(world, organizationBId, onDate), organizationBId)
  const byActorA = new Map(graphA.resolutions.map((resolution) => [actorKey(resolution.actor), resolution]))
  const byActorB = new Map(graphB.resolutions.map((resolution) => [actorKey(resolution.actor), resolution]))
  const keys = [...byActorA.keys()].filter((key) => byActorB.has(key)).sort((left, right) => left.localeCompare(right))
  return Object.freeze(keys.map((key) => {
    const left = byActorA.get(key)!
    const right = byActorB.get(key)!
    return Object.freeze({
      actor: left.actor,
      organizationAId,
      organizationBId,
      knownPercentageA: left.knownPercentage,
      knownPercentageB: right.knownPercentage,
      directPercentageA: directA.get(key)?.knownPercentage ?? 0,
      directPercentageB: directB.get(key)?.knownPercentage ?? 0,
      directHasUnknownContributionA: directA.get(key)?.hasUnknownContribution ?? false,
      directHasUnknownContributionB: directB.get(key)?.hasUnknownContribution ?? false,
      hasUnknownContributionA: left.hasUnknownContribution,
      hasUnknownContributionB: right.hasUnknownContribution,
      hasCycleA: left.hasCycle,
      hasCycleB: right.hasCycle,
    })
  }))
}

export function findCommonControllers(world: GameWorld, organizationAId: OrganizationId, organizationBId: OrganizationId, onDate: GameDate = world.currentDate): readonly CommonControllerResolution[] {
  if (organizationAId === organizationBId) return Object.freeze([])
  const controllersA = new Map(getActiveOrganizationControllers(world, organizationAId, onDate).map((control) => [actorKey(control.controller), control.controller]))
  const controllersB = new Map(getActiveOrganizationControllers(world, organizationBId, onDate).map((control) => [actorKey(control.controller), control.controller]))
  return Object.freeze([...controllersA.keys()].filter((key) => controllersB.has(key)).sort((left, right) => left.localeCompare(right)).map((key) => Object.freeze({ actor: controllersA.get(key)!, organizationAId, organizationBId })))
}

export function actorKey(actor: OrganizationOwnershipActor): string {
  return actor.kind === 'PERSON' ? `PERSON:${actor.personId}` : `ORGANIZATION:${actor.organizationId}`
}

function resolveOrganization(world: GameWorld, organizationId: OrganizationId, onDate: GameDate, path: ReadonlySet<OrganizationId>): Map<string, EffectiveOwnershipResolution> {
  const result = new Map<string, EffectiveOwnershipResolution>()
  for (const ownership of getDirectOrganizationOwnership(world, organizationId, onDate)) {
    const owner = ownership.owner
    const ownerKey = actorKey(owner)
    const edgePercentage = ownership.ownershipPercentage
    merge(result, {
      actor: owner,
      organizationId,
      knownPercentage: edgePercentage ?? 0,
      hasUnknownContribution: edgePercentage === null,
      hasCycle: false,
    })
    if (owner.kind !== 'ORGANIZATION') continue
    if (path.has(owner.organizationId)) {
      merge(result, { actor: owner, organizationId, knownPercentage: 0, hasUnknownContribution: true, hasCycle: true })
      continue
    }
    const nested = resolveOrganization(world, owner.organizationId, onDate, new Set([...path, owner.organizationId]))
    for (const resolution of nested.values()) {
      const knownPercentage = edgePercentage === null ? 0 : (edgePercentage * resolution.knownPercentage) / 100
      merge(result, {
        actor: resolution.actor,
        organizationId,
        knownPercentage,
        hasUnknownContribution: edgePercentage === null || resolution.hasUnknownContribution,
        hasCycle: resolution.hasCycle,
      })
    }
  }
  return result
}

function directResolutionMap(rows: readonly OrganizationOwnership[], organizationId: OrganizationId): Map<string, EffectiveOwnershipResolution> {
  const result = new Map<string, EffectiveOwnershipResolution>()
  for (const row of rows) merge(result, { actor: row.owner, organizationId, knownPercentage: row.ownershipPercentage ?? 0, hasUnknownContribution: row.ownershipPercentage === null, hasCycle: false })
  return result
}

function merge(target: Map<string, EffectiveOwnershipResolution>, value: EffectiveOwnershipResolution): void {
  const key = actorKey(value.actor)
  const current = target.get(key)
  target.set(key, current === undefined ? value : {
    actor: current.actor,
    organizationId: current.organizationId,
    knownPercentage: current.knownPercentage + value.knownPercentage,
    hasUnknownContribution: current.hasUnknownContribution || value.hasUnknownContribution,
    hasCycle: current.hasCycle || value.hasCycle,
  })
}

function sameActor(left: OrganizationOwnershipActor, right: OrganizationOwnershipActor): boolean {
  return actorKey(left) === actorKey(right)
}

function isActive(validFrom: GameDate | null, validTo: GameDate | null, onDate: GameDate): boolean {
  return (validFrom === null || compareGameDates(validFrom, onDate) <= 0) && (validTo === null || compareGameDates(onDate, validTo) <= 0)
}
