import type { EntityActionEnvironment } from './ActionAvailability'
import type { CommandResult, JsonValue } from './EntityCommand'
import type { EntityRef } from './EntityRef'

export type ComposerStepKind = 'property' | 'target' | 'value' | 'scope' | 'confirm'

export interface ComposerSelection {
  readonly stepId: string
  readonly optionId: string
  readonly value: JsonValue
}

export interface ComposerDraft {
  readonly selections: readonly ComposerSelection[]
}

export interface ComposerContext<Environment extends EntityActionEnvironment = EntityActionEnvironment> {
  readonly entity: EntityRef
  readonly environment: Environment
  readonly draft: ComposerDraft
  readonly currentStepId: string
}

export interface ComposerOption {
  readonly id: string
  readonly labelKey: string
  readonly value: JsonValue
  readonly disabledReason?: string
}

export type ComposerOptionResolver<Environment extends EntityActionEnvironment = EntityActionEnvironment> =
  (context: ComposerContext<Environment>) => readonly ComposerOption[]

/** Declarative future composer steps. EAC-01 does not execute or transition them. */
interface ComposerStepBase {
  readonly id: string
  readonly kind: ComposerStepKind
  readonly labelKey: string
}

export interface ComposerSelectionStep<Environment extends EntityActionEnvironment = EntityActionEnvironment> extends ComposerStepBase {
  readonly kind: Exclude<ComposerStepKind, 'confirm'>
  readonly options: ComposerOptionResolver<Environment>
}

export interface ComposerConfirmStep extends ComposerStepBase {
  readonly kind: 'confirm'
}

export type ComposerStep<Environment extends EntityActionEnvironment = EntityActionEnvironment> = ComposerSelectionStep<Environment> | ComposerConfirmStep

export type ComposerResultBuilder<Environment extends EntityActionEnvironment = EntityActionEnvironment> =
  (context: ComposerContext<Environment>) => CommandResult

export interface ComposerDefinition<Environment extends EntityActionEnvironment = EntityActionEnvironment> {
  readonly steps: readonly ComposerStep<Environment>[]
  /** Optional action-owned branch resolver. Undefined means the declaration's next step. */
  readonly nextStepId?: (context: ComposerContext<Environment>) => string | undefined
  /** Optional until EAC-02 adoption; the engine rejects compositions without it. */
  readonly buildResult?: ComposerResultBuilder<Environment>
}

export function defineComposer<Environment extends EntityActionEnvironment>(definition: ComposerDefinition<Environment>): ComposerDefinition<Environment> {
  const { steps } = definition
  const ids = new Set<string>()
  for (const step of steps) {
    if (step.id.trim().length === 0 || step.labelKey.trim().length === 0) {
      throw new TypeError('Composer step id and labelKey must be non-empty')
    }
    if (ids.has(step.id)) throw new Error(`Duplicate composer step id: ${step.id}`)
    ids.add(step.id)
  }
  return { ...definition, steps: [...steps] }
}

export function getComposerSelection(draft: ComposerDraft, stepId: string): ComposerSelection | undefined {
  return draft.selections.find((selection) => selection.stepId === stepId)
}
