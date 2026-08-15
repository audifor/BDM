import type { EntityActionEnvironment } from './ActionAvailability'
import type { ActionDefinition } from './ActionDefinition'
import type { ComposerContext, ComposerDefinition, ComposerDraft, ComposerOption, ComposerSelection, ComposerStep } from './ComposerDefinition'
import type { CommandResult } from './EntityCommand'
import type { EntityRef, EntityType } from './EntityRef'

export type ComposerErrorCode = 'invalid-transition' | 'invalid-option' | 'action-unavailable' | 'invalid-definition'

export class ComposerTransitionError extends Error {
  public constructor(readonly code: ComposerErrorCode, message: string) {
    super(message)
    this.name = 'ComposerTransitionError'
  }
}

interface ComposerSession<Environment extends EntityActionEnvironment> {
  readonly entity: EntityRef
  readonly action: ActionDefinition<EntityType, Environment>
  readonly environment: Environment
  readonly definition: ComposerDefinition<Environment>
  readonly draft: ComposerDraft
  /** Traversed steps, including the current selection or confirmation step. */
  readonly path: readonly string[]
}

export interface IdleComposition {
  readonly status: 'idle'
}

export interface SelectingComposition<Environment extends EntityActionEnvironment> extends ComposerSession<Environment> {
  readonly status: 'selecting'
  readonly currentStepId: string
}

export interface ReadyToConfirmComposition<Environment extends EntityActionEnvironment> extends ComposerSession<Environment> {
  readonly status: 'readyToConfirm'
  readonly currentStepId: string
}

export interface CompletedComposition<Environment extends EntityActionEnvironment> extends ComposerSession<Environment> {
  readonly status: 'completed'
  readonly command: Extract<CommandResult, { readonly kind: 'command' }>
}

export interface HandedOffComposition<Environment extends EntityActionEnvironment> extends ComposerSession<Environment> {
  readonly status: 'handedOff'
  readonly handoff: Extract<CommandResult, { readonly kind: 'handoff' }>
}

export interface CancelledComposition<Environment extends EntityActionEnvironment> extends ComposerSession<Environment> {
  readonly status: 'cancelled'
}

export type ComposerState<Environment extends EntityActionEnvironment = EntityActionEnvironment> =
  | IdleComposition
  | SelectingComposition<Environment>
  | ReadyToConfirmComposition<Environment>
  | CompletedComposition<Environment>
  | HandedOffComposition<Environment>
  | CancelledComposition<Environment>

export const idleComposition = (): IdleComposition => ({ status: 'idle' })

export function startComposition<Type extends EntityType, Environment extends EntityActionEnvironment>(entity: EntityRef<Type>, action: ActionDefinition<Type, Environment>, environment: Environment): ComposerState<Environment> {
  const availability = action.availability(entity, environment)
  if (availability.kind === 'disabled') throw new ComposerTransitionError('action-unavailable', availability.reason)
  const composer = action.composer
  if (composer === undefined || composer.steps.length === 0) {
    const session = createSession(entity, action, environment, { steps: [], buildResult: action.buildResult }, [], '')
    return finish(session)
  }
  const first = composer.steps[0]!
  const session = createSession(entity, action, environment, composer, [first.id], first.id)
  return first.kind === 'confirm' ? ready(session, first.id) : selecting(session, first.id)
}

export function getCurrentComposerStep<Environment extends EntityActionEnvironment>(state: ComposerState<Environment>): ComposerStep<Environment> {
  if (state.status !== 'selecting' && state.status !== 'readyToConfirm') throw invalidTransition(state, 'read a current step')
  return stepById(state.definition, state.currentStepId)
}

export function getComposerOptions<Environment extends EntityActionEnvironment>(state: ComposerState<Environment>): readonly ComposerOption[] {
  if (state.status !== 'selecting') throw invalidTransition(state, 'resolve options')
  const step = stepById(state.definition, state.currentStepId)
  if (step.kind === 'confirm') throw invalidTransition(state, 'resolve options for confirmation')
  const options = step.options(contextFor(state, step.id))
  const ids = new Set<string>()
  for (const option of options) {
    if (option.id.trim().length === 0 || option.labelKey.trim().length === 0) throw invalidDefinition(`Composer option for ${step.id} must have an id and labelKey`)
    if (ids.has(option.id)) throw invalidDefinition(`Duplicate composer option id for ${step.id}: ${option.id}`)
    ids.add(option.id)
  }
  return [...options]
}

export function selectComposerOption<Environment extends EntityActionEnvironment>(state: ComposerState<Environment>, optionId: string): ComposerState<Environment> {
  if (state.status !== 'selecting') throw invalidTransition(state, 'select an option')
  const step = stepById(state.definition, state.currentStepId)
  const option = getComposerOptions(state).find((candidate) => candidate.id === optionId)
  if (option === undefined) throw new ComposerTransitionError('invalid-option', `Option does not belong to step ${step.id}: ${optionId}`)
  if (option.disabledReason !== undefined) throw new ComposerTransitionError('invalid-option', option.disabledReason)
  const draft = withSelection(state.draft, { stepId: step.id, optionId: option.id, value: option.value })
  const nextStepId = nextStep(state.definition, contextFor({ ...state, draft }, step.id), step.id)
  if (nextStepId === undefined) return finish({ ...state, draft })
  if (state.path.includes(nextStepId)) throw invalidDefinition(`Composer definition revisits step: ${nextStepId}`)
  const next = stepById(state.definition, nextStepId)
  const session = { ...state, draft, path: [...state.path, next.id] }
  return next.kind === 'confirm' ? ready(session, next.id) : selecting(session, next.id)
}

export function confirmComposition<Environment extends EntityActionEnvironment>(state: ComposerState<Environment>): ComposerState<Environment> {
  if (state.status !== 'readyToConfirm') throw invalidTransition(state, 'confirm')
  return finish(state)
}

export function backComposition<Environment extends EntityActionEnvironment>(state: ComposerState<Environment>): ComposerState<Environment> {
  if (state.status !== 'selecting' && state.status !== 'readyToConfirm') throw invalidTransition(state, 'go back')
  if (state.path.length < 2) throw invalidTransition(state, 'go back from the first step')
  const previousStepId = state.path[state.path.length - 2]!
  const draft: ComposerDraft = { selections: state.draft.selections.filter((selection) => selection.stepId !== previousStepId) }
  const previous = stepById(state.definition, previousStepId)
  const session = { ...state, draft, path: state.path.slice(0, -1) }
  return previous.kind === 'confirm' ? ready(session, previous.id) : selecting(session, previous.id)
}

export function cancelComposition<Environment extends EntityActionEnvironment>(state: ComposerState<Environment>): CancelledComposition<Environment> {
  if (state.status !== 'selecting' && state.status !== 'readyToConfirm') throw invalidTransition(state, 'cancel')
  return { ...state, status: 'cancelled' }
}

function createSession<Type extends EntityType, Environment extends EntityActionEnvironment>(entity: EntityRef<Type>, action: ActionDefinition<Type, Environment>, environment: Environment, definition: ComposerDefinition<Environment>, path: readonly string[], currentStepId: string): ComposerSession<Environment> {
  return { entity, action: action as ActionDefinition<EntityType, Environment>, environment, definition, draft: { selections: [] }, path: [...path] }
}

function selecting<Environment extends EntityActionEnvironment>(session: ComposerSession<Environment>, currentStepId: string): SelectingComposition<Environment> {
  return { ...session, status: 'selecting', currentStepId }
}

function ready<Environment extends EntityActionEnvironment>(session: ComposerSession<Environment>, currentStepId: string): ReadyToConfirmComposition<Environment> {
  return { ...session, status: 'readyToConfirm', currentStepId }
}

function finish<Environment extends EntityActionEnvironment>(session: ComposerSession<Environment>): ComposerState<Environment> {
  const builder = session.definition.buildResult ?? session.action.buildResult
  if (builder === undefined) throw invalidDefinition(`Action ${session.action.id} does not define a result builder`)
  const result = builder(contextFor(session, session.path.at(-1) ?? ''))
  if (result.kind !== session.action.resultKind) throw invalidDefinition(`Action ${session.action.id} returned ${result.kind}, expected ${session.action.resultKind}`)
  return result.kind === 'command' ? { ...session, status: 'completed', command: result } : { ...session, status: 'handedOff', handoff: result }
}

function nextStep<Environment extends EntityActionEnvironment>(definition: ComposerDefinition<Environment>, context: ComposerContext<Environment>, currentStepId: string): string | undefined {
  if (definition.nextStepId !== undefined) return definition.nextStepId(context)
  const currentIndex = definition.steps.findIndex((step) => step.id === currentStepId)
  if (currentIndex < 0) throw invalidDefinition(`Composer step does not exist: ${currentStepId}`)
  return definition.steps[currentIndex + 1]?.id
}

function stepById<Environment extends EntityActionEnvironment>(definition: ComposerDefinition<Environment>, id: string): ComposerStep<Environment> {
  const step = definition.steps.find((candidate) => candidate.id === id)
  if (step === undefined) throw invalidDefinition(`Composer step does not exist: ${id}`)
  return step
}

function contextFor<Environment extends EntityActionEnvironment>(session: Pick<ComposerSession<Environment>, 'entity' | 'environment' | 'draft'>, currentStepId: string): ComposerContext<Environment> {
  return { entity: session.entity, environment: session.environment, draft: session.draft, currentStepId }
}

function withSelection(draft: ComposerDraft, selection: ComposerSelection): ComposerDraft {
  return { selections: [...draft.selections.filter((candidate) => candidate.stepId !== selection.stepId), selection] }
}

function invalidTransition<Environment extends EntityActionEnvironment>(state: ComposerState<Environment>, operation: string): ComposerTransitionError {
  return new ComposerTransitionError('invalid-transition', `Cannot ${operation} while composition is ${state.status}`)
}

function invalidDefinition(message: string): ComposerTransitionError {
  return new ComposerTransitionError('invalid-definition', message)
}
