import type { ActionAvailability, EntityActionEnvironment } from './ActionAvailability'
import type { ComposerDefinition, ComposerResultBuilder } from './ComposerDefinition'
import type { ActionResultKind } from './EntityCommand'
import type { EntityRef, EntityType } from './EntityRef'

declare const actionIdBrand: unique symbol
export type ActionId = string & { readonly [actionIdBrand]: 'ActionId' }
export type ActionCapabilityStatus = 'EXECUTABLE_NOW' | 'HANDOFF_NOW' | 'DOMAIN_MISSING' | 'FUTURE_SYSTEM'

export interface ActionDefinition<Type extends EntityType, Environment extends EntityActionEnvironment = EntityActionEnvironment> {
  readonly id: ActionId
  readonly entityType: Type
  readonly labelKey: string
  readonly descriptionKey?: string
  /** Presentation-neutral semantic metadata for future action boards. */
  readonly semanticGroup?: string
  readonly iconKey?: string
  readonly capabilityStatus?: ActionCapabilityStatus
  readonly order: number
  readonly availability: {
    bivarianceHack(entity: EntityRef<Type>, environment: Environment): ActionAvailability
  }['bivarianceHack']
  readonly composer?: ComposerDefinition<Environment>
  /** Used only by actions that complete directly without declarative steps. */
  readonly buildResult?: ComposerResultBuilder<Environment>
  readonly resultKind: ActionResultKind
}

export function actionIdFromString(value: string): ActionId {
  if (value.trim().length === 0) throw new TypeError('Action id must be non-empty')
  return value as ActionId
}

export function defineAction<Type extends EntityType, Environment extends EntityActionEnvironment>(definition: ActionDefinition<Type, Environment>): ActionDefinition<Type, Environment> {
  if (definition.labelKey.trim().length === 0) throw new TypeError('Action labelKey must be non-empty')
  if (!Number.isInteger(definition.order) || definition.order < 0) throw new RangeError('Action order must be a non-negative integer')
  return definition
}
