import { getCurrentComposerStep, selectComposerOption, startComposition, type ComposerState } from './ComposerEngine'
import type { EntityActionEnvironment } from './ActionAvailability'
import type { ActionDefinition, ActionId } from './ActionDefinition'
import type { ComposerSelection } from './ComposerDefinition'
import type { EntityActionRegistry } from './EntityActionRegistry'
import type { EntityRef, EntityType } from './EntityRef'

export interface ActionSignature {
  readonly version: 2
  readonly entityType: EntityType
  readonly rootActionId: string
  readonly selections: readonly Pick<ComposerSelection, 'stepId' | 'optionId' | 'value'>[]
}

export interface QuickAction {
  readonly signature: ActionSignature
  readonly label: string
}

export interface ActionUsageEntry {
  readonly signature: ActionSignature
  readonly count: number
  readonly lastUsedAt: string
}

export interface EntityActionUsagePreferences {
  readonly version: 2
  readonly entries: readonly ActionUsageEntry[]
  readonly slotsByEntityType: Readonly<Record<string, readonly string[]>>
}

export const EMPTY_ACTION_USAGE_PREFERENCES: EntityActionUsagePreferences = { version: 2, entries: [], slotsByEntityType: {} }

export function signatureKey(signature: ActionSignature): string {
  return JSON.stringify(signature)
}

export function createActionSignature(entityType: EntityType, action: ActionDefinition<EntityType>, composition: ComposerState): ActionSignature {
  const reusable = composition.status === 'completed' || composition.status === 'handedOff' || composition.status === 'selecting' || composition.status === 'readyToConfirm'
    ? composition.draft.selections.filter((selection) => {
      const step = composition.definition.steps.find((candidate) => candidate.id === selection.stepId)
      return step?.kind !== 'target'
    })
    : []
  return { version: 2, entityType, rootActionId: action.id, selections: reusable.map(({ stepId, optionId, value }) => ({ stepId, optionId, value })) }
}

export function coldStartQuickActions(entityType: EntityType, registry?: EntityActionRegistry): readonly QuickAction[] {
  const rootActionIds = registry?.getQuickActionIds(entityType) ?? (entityType === 'player' ? ['player.talk', 'player.limit', 'player.rest', 'player.negotiate'] : [])
  return rootActionIds.map((rootActionId) => ({ signature: { version: 2, entityType, rootActionId, selections: [] }, label: rootActionId.slice(rootActionId.indexOf('.') + 1) }))
}

export function resolveQuickActions(entity: EntityRef, environment: EntityActionEnvironment, registry: EntityActionRegistry, preferences: EntityActionUsagePreferences): readonly QuickAction[] {
  const catalog = registry.getCatalog(entity.type)
  const candidates = [...preferences.entries.filter((entry) => entry.signature.entityType === entity.type && isKnownSignature(entry.signature, registry))]
  const byKey = new Map(candidates.map((entry) => [signatureKey(entry.signature), entry]))
  const defaults = coldStartQuickActions(entity.type, registry).filter((quick) => registry.getCatalog(entity.type).some((action) => action.id === quick.signature.rootActionId))
  const savedSlots = preferences.slotsByEntityType[entity.type] ?? []
  if (savedSlots.length === 0 && candidates.length === 0) return defaults.slice(0, 4)
  const pool = new Map<string, QuickAction>()
  for (const entry of candidates) pool.set(signatureKey(entry.signature), toQuickAction(entry.signature, catalog))
  for (const quick of defaults) pool.set(signatureKey(quick.signature), quick)
  for (const action of catalog) pool.set(signatureKey({ version: 2, entityType: entity.type, rootActionId: action.id, selections: [] }), toQuickAction({ version: 2, entityType: entity.type, rootActionId: action.id, selections: [] }, catalog))

  const slots = savedSlots.filter((key) => pool.has(key)).slice(0, 4)
  const ranked = [...pool.keys()].sort((left, right) => compareEntries(byKey.get(right), byKey.get(left), right, left))
  for (const key of ranked) {
    if (slots.length === 4 || slots.includes(key)) continue
    slots.push(key)
  }
  return slots.slice(0, 4).map((key) => pool.get(key)!)
}

export function resumeQuickAction(entity: EntityRef, environment: EntityActionEnvironment, registry: EntityActionRegistry, quick: QuickAction): ComposerState {
  const action = registry.getCatalog(entity.type).find((candidate) => candidate.id === quick.signature.rootActionId as ActionId)
  if (action === undefined) throw new Error('Quick action is no longer available')
  let state = startComposition(entity, action, environment)
  for (const selection of quick.signature.selections) {
    if (state.status !== 'selecting' || getCurrentComposerStep(state).id !== selection.stepId) throw new Error('Quick action no longer matches this composer')
    state = selectComposerOption(state, selection.optionId)
  }
  return state
}

export function recordActionUsage(preferences: EntityActionUsagePreferences, signature: ActionSignature, usedAt: string): EntityActionUsagePreferences {
  const key = signatureKey(signature); const existing = preferences.entries.find((entry) => signatureKey(entry.signature) === key)
  const entries = existing === undefined ? [...preferences.entries, { signature, count: 1, lastUsedAt: usedAt }] : preferences.entries.map((entry) => signatureKey(entry.signature) === key ? { ...entry, count: entry.count + 1, lastUsedAt: usedAt } : entry)
  const current = preferences.slotsByEntityType[signature.entityType] ?? coldStartQuickActions(signature.entityType).map((quick) => signatureKey(quick.signature))
  const slots = current.slice(0, 4)
  if (!slots.includes(key)) {
    const candidate = entries.find((entry) => signatureKey(entry.signature) === key)!
    const replaceAt = slots.reduce((lowestIndex, _slot, candidateIndex) => entryCount(entries, slots[candidateIndex]!) < entryCount(entries, slots[lowestIndex]!) ? candidateIndex : lowestIndex, 0)
    if (slots.length < 4) slots.push(key)
    else if (candidate.count >= entryCount(entries, slots[replaceAt]!) + 2) slots[replaceAt] = key
  }
  return { ...preferences, entries, slotsByEntityType: { ...preferences.slotsByEntityType, [signature.entityType]: slots } }
}

function isValidSignature(signature: ActionSignature, entity: EntityRef, environment: EntityActionEnvironment, registry: EntityActionRegistry): boolean {
  try { resumeQuickAction(entity, environment, registry, { signature, label: '' }); return true } catch { return false }
}
function isKnownSignature(signature: ActionSignature, registry: EntityActionRegistry): boolean {
  const action = registry.getCatalog(signature.entityType).find((candidate) => candidate.id === signature.rootActionId)
  if (action === undefined || signature.selections.some((selection) => action.composer?.steps.find((step) => step.id === selection.stepId)?.kind === 'target')) return false
  return signature.selections.every((selection) => action.composer?.steps.some((step) => step.id === selection.stepId) === true)
}
function toQuickAction(signature: ActionSignature, catalog: readonly ActionDefinition<EntityType>[]): QuickAction {
  const action = catalog.find((candidate) => candidate.id === signature.rootActionId)!; const suffix = signature.selections.map((selection) => String(selection.value).toUpperCase()).join(' ')
  return { signature, label: `${action.labelKey.slice(action.labelKey.lastIndexOf('.') + 1).toUpperCase()}${suffix === '' ? '' : ` ${suffix}`}` }
}
function compareEntries(left: ActionUsageEntry | undefined, right: ActionUsageEntry | undefined, leftKey: string, rightKey: string): number {
  if ((left?.count ?? 0) !== (right?.count ?? 0)) return (left?.count ?? 0) - (right?.count ?? 0)
  if ((left?.lastUsedAt ?? '') !== (right?.lastUsedAt ?? '')) return (left?.lastUsedAt ?? '').localeCompare(right?.lastUsedAt ?? '')
  return rightKey.localeCompare(leftKey)
}
function entryCount(entries: readonly ActionUsageEntry[], key: string): number { return entries.find((entry) => signatureKey(entry.signature) === key)?.count ?? 0 }
