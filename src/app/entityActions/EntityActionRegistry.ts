import type { ActionAvailability, EntityActionEnvironment } from './ActionAvailability'
import type { ActionDefinition, ActionId } from './ActionDefinition'
import type { EntityRef, EntityType } from './EntityRef'

export interface EntityActionCatalog<Type extends EntityType, Environment extends EntityActionEnvironment = EntityActionEnvironment> {
  readonly entityType: Type
  readonly actions: readonly ActionDefinition<Type, Environment>[]
  /** Stable per-type cold-start roots. The registry keeps this product policy out of QuickActions. */
  readonly quickActionIds?: readonly ActionId[]
}

export interface ResolvedEntityAction<Type extends EntityType, Environment extends EntityActionEnvironment = EntityActionEnvironment> {
  readonly definition: ActionDefinition<Type, Environment>
  readonly availability: ActionAvailability
}

/**
 * Application-layer registry. It owns catalog assembly and ordering only; it has
 * no UI, composer state, executor, or GameWorld mutation responsibilities.
 */
export class EntityActionRegistry<Environment extends EntityActionEnvironment = EntityActionEnvironment> {
  private readonly catalogs = new Map<EntityType, readonly ActionDefinition<EntityType, Environment>[]>()
  private readonly actionTypes = new Map<ActionId, EntityType>()
  private readonly quickActionIds = new Map<EntityType, readonly ActionId[]>()
  private frozen = false

  public constructor(catalogs: readonly EntityActionCatalog<EntityType, Environment>[] = []) {
    for (const catalog of catalogs) this.register(catalog)
  }

  public register<Type extends EntityType>(catalog: EntityActionCatalog<Type, Environment>): this {
    if (this.frozen) throw new Error('Entity action registry is frozen')
    if (this.catalogs.has(catalog.entityType)) throw new Error(`Action catalog already registered: ${catalog.entityType}`)
    const ordered = [...catalog.actions]
      .map((action, registrationIndex) => ({ action, registrationIndex }))
      .sort((left, right) => left.action.order - right.action.order || left.registrationIndex - right.registrationIndex)
      .map(({ action }) => action)

    const catalogActionIds = new Set<ActionId>()
    for (const action of ordered) {
      if (action.entityType !== catalog.entityType) throw new Error(`Action ${action.id} does not match catalog type ${catalog.entityType}`)
      if (catalogActionIds.has(action.id) || this.actionTypes.has(action.id)) throw new Error(`Duplicate action id: ${action.id}`)
      catalogActionIds.add(action.id)
    }

    for (const action of ordered) this.actionTypes.set(action.id, catalog.entityType)
    this.catalogs.set(catalog.entityType, ordered as readonly ActionDefinition<EntityType, Environment>[])
    const knownIds = new Set(ordered.map((action) => action.id))
    const quickActionIds = catalog.quickActionIds ?? []
    if (quickActionIds.some((id) => !knownIds.has(id))) throw new Error(`Quick action does not belong to catalog: ${catalog.entityType}`)
    this.quickActionIds.set(catalog.entityType, [...quickActionIds])
    return this
  }

  /** Ends bootstrap registration; runtime consumers can only read thereafter. */
  public freeze(): this {
    this.frozen = true
    return this
  }

  public getCatalog<Type extends EntityType>(entityType: Type): readonly ActionDefinition<Type, Environment>[] {
    return (this.catalogs.get(entityType) ?? []) as readonly ActionDefinition<Type, Environment>[]
  }

  public getQuickActionIds(entityType: EntityType): readonly ActionId[] {
    return this.quickActionIds.get(entityType) ?? []
  }

  public getActions<Type extends EntityType>(entity: EntityRef<Type>, environment: Environment): readonly ResolvedEntityAction<Type, Environment>[] {
    return this.getCatalog(entity.type).map((definition) => ({ definition, availability: definition.availability(entity, environment) }))
  }
}
