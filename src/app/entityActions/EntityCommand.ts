import type { EntityRef } from './EntityRef'

export type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue }

/** A composed request for a future Application executor; it carries no executable behavior. */
export interface EntityCommand<Type extends string = string, Payload extends JsonValue | undefined = JsonValue | undefined> {
  readonly kind: 'command'
  readonly type: Type
  readonly entity: EntityRef
  readonly payload?: Payload
}

export interface EntityActionHandoff<Target extends string = string, Data extends JsonValue | undefined = JsonValue | undefined> {
  readonly kind: 'handoff'
  readonly target: Target
  readonly entity: EntityRef
  readonly data?: Data
}

export type CommandResult = EntityCommand | EntityActionHandoff
export type ActionResultKind = CommandResult['kind']

export function createEntityCommand<Type extends string, Payload extends JsonValue | undefined>(input: Omit<EntityCommand<Type, Payload>, 'kind'>): EntityCommand<Type, Payload> {
  if (input.type.trim().length === 0) throw new TypeError('Entity command type must be non-empty')
  return { kind: 'command', ...input }
}

export function createEntityActionHandoff<Target extends string, Data extends JsonValue | undefined>(input: Omit<EntityActionHandoff<Target, Data>, 'kind'>): EntityActionHandoff<Target, Data> {
  if (input.target.trim().length === 0) throw new TypeError('Entity action handoff target must be non-empty')
  return { kind: 'handoff', ...input }
}
