import { backComposition, cancelComposition, confirmComposition, idleComposition, selectComposerOption, startComposition, type ComposerState } from '@/app/entityActions/ComposerEngine'
import { resumeQuickAction, type QuickAction } from '@/app/entityActions/QuickActions'
import type { EntityActionEnvironment } from '@/app/entityActions/ActionAvailability'
import type { CommandResult } from '@/app/entityActions/EntityCommand'
import type { EntityRef } from '@/app/entityActions/EntityRef'
import { productionEntityActionRegistry } from '@/app/entityActions/productionRegistry'
import { create } from 'zustand'

export interface ComposerAnchor { readonly x: number; readonly y: number }
type ComposerMode = 'closed' | 'board' | 'quick' | 'composing' | 'result'

interface EntityActionComposerStore {
  readonly mode: ComposerMode
  readonly entity: EntityRef | null
  readonly environment: EntityActionEnvironment | null
  readonly anchor: ComposerAnchor | null
  readonly composition: ComposerState | null
  readonly result: CommandResult | null
  readonly message: string | null
  open(entity: EntityRef, environment: EntityActionEnvironment, anchor: ComposerAnchor): void
  openQuick(entity: EntityRef, environment: EntityActionEnvironment, anchor: ComposerAnchor): void
  chooseAction(actionId: string): void
  chooseQuickAction(quick: QuickAction): void
  selectOption(optionId: string): void
  confirm(): void
  back(): void
  cancel(): void
  close(): void
  setMessage(message: string | null): void
}

function terminalResult(state: ComposerState): CommandResult | null {
  return state.status === 'completed' ? state.command : state.status === 'handedOff' ? state.handoff : null
}

export const useEntityActionComposerStore = create<EntityActionComposerStore>((set, get) => ({
  mode: 'closed', entity: null, environment: null, anchor: null, composition: null, result: null, message: null,
  open: (entity, environment, anchor) => set({ mode: 'board', entity, environment, anchor, composition: null, result: null, message: null }),
  openQuick: (entity, environment, anchor) => set({ mode: 'quick', entity, environment, anchor, composition: null, result: null, message: null }),
  chooseAction: (actionId) => {
    const { entity, environment } = get()
    if (entity === null || environment === null) return
    const action = productionEntityActionRegistry.getCatalog(entity.type).find((candidate) => candidate.id === actionId)
    if (action === undefined) return
    try {
      const composition = startComposition(entity, action, environment)
      const result = terminalResult(composition)
      set(result === null ? { mode: 'composing', composition, message: null } : { mode: 'result', composition, result, message: null })
    } catch (error) { set({ message: error instanceof Error ? error.message : 'Unable to start action' }) }
  },
  chooseQuickAction: (quick) => {
    const { entity, environment } = get(); if (entity === null || environment === null) return
    try { const composition = resumeQuickAction(entity, environment, productionEntityActionRegistry, quick); const result = terminalResult(composition); set(result === null ? { mode: 'composing', composition, message: null } : { mode: 'result', composition, result, message: null }) } catch (error) { set({ message: error instanceof Error ? error.message : 'Quick action is no longer available' }) }
  },
  selectOption: (optionId) => {
    const composition = get().composition
    if (composition === null) return
    try {
      const next = selectComposerOption(composition, optionId); const result = terminalResult(next)
      set(result === null ? { composition: next } : { mode: 'result', composition: next, result })
    } catch (error) { set({ message: error instanceof Error ? error.message : 'Invalid option' }) }
  },
  confirm: () => {
    const composition = get().composition
    if (composition === null) return
    try { const next = confirmComposition(composition); set({ mode: 'result', composition: next, result: terminalResult(next) }) } catch (error) { set({ message: error instanceof Error ? error.message : 'Unable to confirm' }) }
  },
  back: () => { const composition = get().composition; if (composition === null) return; try { set({ composition: backComposition(composition), message: null }) } catch (error) { set({ message: error instanceof Error ? error.message : 'Unable to go back' }) } },
  cancel: () => { const composition = get().composition; if (composition !== null && (composition.status === 'selecting' || composition.status === 'readyToConfirm')) cancelComposition(composition); set({ mode: 'closed', entity: null, environment: null, anchor: null, composition: idleComposition(), result: null, message: null }) },
  close: () => set({ mode: 'closed', entity: null, environment: null, anchor: null, composition: idleComposition(), result: null, message: null }),
  setMessage: (message) => set({ message }),
}))
