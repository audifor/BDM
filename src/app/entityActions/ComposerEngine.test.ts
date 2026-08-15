import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'

import { actionEnabled } from './ActionAvailability'
import { actionIdFromString, defineAction } from './ActionDefinition'
import { backComposition, cancelComposition, ComposerTransitionError, confirmComposition, getComposerOptions, selectComposerOption, startComposition } from './ComposerEngine'
import { defineComposer, getComposerSelection } from './ComposerDefinition'
import { createEntityActionHandoff, createEntityCommand } from './EntityCommand'
import { createEntityRef } from './EntityRef'

describe('generic ComposerEngine', () => {
  const world = createNewGame()
  const team = Object.values(world.teams)[0]!
  const player = world.players[team.rosterPlayerIds[0]!]!
  const entity = createEntityRef('player', player.id)
  const environment = { world, controlledTeamId: team.id }

  it('completes a direct command without a composer', () => {
    const action = defineAction({ id: actionIdFromString('player.test.follow'), entityType: 'player', labelKey: 'follow', order: 1, availability: () => actionEnabled(), resultKind: 'command' as const, buildResult: ({ entity: selected }) => createEntityCommand({ type: 'player.test.follow', entity: selected }) })
    const state = startComposition(entity, action, environment)
    expect(state.status).toBe('completed')
    if (state.status === 'completed') expect(state.command.type).toBe('player.test.follow')
  })

  it('builds a parameterized command through property, value, scope, and confirmation', () => {
    const action = defineAction({
      id: actionIdFromString('player.test.limit'), entityType: 'player', labelKey: 'limit', order: 1, availability: () => actionEnabled(), resultKind: 'command' as const,
      composer: defineComposer({
        steps: [
          { id: 'property', kind: 'property', labelKey: 'property', options: () => [{ id: 'minutes', labelKey: 'minutes', value: 'minutes' }] },
          { id: 'value', kind: 'value', labelKey: 'value', options: () => [15, 20, 25, 30].map((value) => ({ id: String(value), labelKey: String(value), value })) },
          { id: 'scope', kind: 'scope', labelKey: 'scope', options: () => [{ id: 'nextGame', labelKey: 'nextGame', value: 'nextGame' }, { id: 'next5Games', labelKey: 'next5Games', value: 'next5Games' }] },
          { id: 'confirm', kind: 'confirm', labelKey: 'confirm' },
        ],
        buildResult: ({ entity: selected, draft }) => createEntityCommand({ type: 'player.test.limit', entity: selected, payload: Object.fromEntries(draft.selections.map((selection) => [selection.stepId, selection.value])) }),
      }),
    })
    const started = startComposition(entity, action, environment)
    const afterProperty = selectComposerOption(started, 'minutes')
    expect(afterProperty).not.toBe(started)
    if (started.status === 'selecting') expect(started.draft.selections).toEqual([])
    const afterValue = selectComposerOption(afterProperty, '25')
    const beforeConfirm = selectComposerOption(afterValue, 'next5Games')
    expect(beforeConfirm.status).toBe('readyToConfirm')
    const completed = confirmComposition(beforeConfirm)
    expect(completed.status).toBe('completed')
    if (completed.status === 'completed') expect(completed.command.payload).toEqual({ property: 'minutes', value: 25, scope: 'next5Games' })
  })

  it('resolves dynamic target options from permitted application context', () => {
    const action = defineAction({
      id: actionIdFromString('player.test.assign'), entityType: 'player', labelKey: 'assign', order: 1, availability: () => actionEnabled(), resultKind: 'command' as const,
      composer: defineComposer({
        steps: [{ id: 'target', kind: 'target', labelKey: 'target', options: ({ environment: current }) => Object.values(current.world.teams).filter((candidate) => candidate.id !== current.controlledTeamId).map((candidate) => ({ id: candidate.id, labelKey: candidate.name, value: candidate.id })) }],
        buildResult: ({ entity: selected, draft }) => createEntityCommand({ type: 'player.test.assign', entity: selected, payload: { targetTeamId: getComposerSelection(draft, 'target')!.value } }),
      }),
    })
    const started = startComposition(entity, action, environment)
    const options = getComposerOptions(started)
    expect(options.every((option) => option.value !== team.id)).toBe(true)
    const completed = selectComposerOption(started, options[0]!.id)
    expect(completed.status).toBe('completed')
  })

  it('produces a handoff after a composition without navigation', () => {
    const action = defineAction({
      id: actionIdFromString('player.test.negotiate'), entityType: 'player', labelKey: 'negotiate', order: 1, availability: () => actionEnabled(), resultKind: 'handoff' as const,
      composer: defineComposer({ steps: [{ id: 'property', kind: 'property', labelKey: 'property', options: () => [{ id: 'renewal', labelKey: 'renewal', value: 'renewal' }] }], buildResult: ({ entity: selected }) => createEntityActionHandoff({ target: 'contract.negotiation', entity: selected }) }),
    })
    const completed = selectComposerOption(startComposition(entity, action, environment), 'renewal')
    expect(completed.status).toBe('handedOff')
    if (completed.status === 'handedOff') expect(completed.handoff.target).toBe('contract.negotiation')
  })

  it('keeps branching in its definition and discards abandoned branch selections on back', () => {
    const action = defineAction({
      id: actionIdFromString('player.test.branch'), entityType: 'player', labelKey: 'branch', order: 1, availability: () => actionEnabled(), resultKind: 'command' as const,
      composer: defineComposer({
        steps: [
          { id: 'property', kind: 'property', labelKey: 'property', options: () => [{ id: 'b1', labelKey: 'b1', value: 'b1' }, { id: 'b2', labelKey: 'b2', value: 'b2' }] },
          { id: 'branchOne', kind: 'value', labelKey: 'branchOne', options: () => [{ id: 'c1', labelKey: 'c1', value: 'c1' }] },
          { id: 'branchTwo', kind: 'value', labelKey: 'branchTwo', options: () => [{ id: 'c2', labelKey: 'c2', value: 'c2' }] },
          { id: 'confirm', kind: 'confirm', labelKey: 'confirm' },
        ],
        nextStepId: ({ currentStepId, draft }) => {
          if (currentStepId === 'property') return getComposerSelection(draft, 'property')!.value === 'b1' ? 'branchOne' : 'branchTwo'
          return 'confirm'
        },
        buildResult: ({ entity: selected, draft }) => createEntityCommand({ type: 'player.test.branch', entity: selected, payload: Object.fromEntries(draft.selections.map((selection) => [selection.stepId, selection.value])) }),
      }),
    })
    const started = startComposition(entity, action, environment)
    const b1 = selectComposerOption(started, 'b1')
    const c1 = selectComposerOption(b1, 'c1')
    expect(c1.status).toBe('readyToConfirm')
    const backToBranch = backComposition(c1)
    const backToProperty = backComposition(backToBranch)
    if (backToProperty.status === 'selecting') expect(backToProperty.draft.selections.some((selection) => selection.value === 'c1')).toBe(false)
    const b2 = selectComposerOption(backToProperty, 'b2')
    expect(getComposerOptions(b2).map((option) => option.id)).toEqual(['c2'])
  })

  it('rejects invalid transitions, unavailable actions, and invalid options explicitly', () => {
    const unavailable = defineAction({ id: actionIdFromString('player.test.unavailable'), entityType: 'player', labelKey: 'unavailable', order: 1, availability: () => ({ kind: 'disabled' as const, reason: 'Unavailable' }), resultKind: 'command' as const, buildResult: ({ entity: selected }) => createEntityCommand({ type: 'unavailable', entity: selected }) })
    expect(() => startComposition(entity, unavailable, environment)).toThrow(ComposerTransitionError)
    const action = defineAction({ id: actionIdFromString('player.test.choice'), entityType: 'player', labelKey: 'choice', order: 1, availability: () => actionEnabled(), resultKind: 'command' as const, composer: defineComposer({ steps: [{ id: 'value', kind: 'value', labelKey: 'value', options: () => [{ id: 'valid', labelKey: 'valid', value: 'valid' }] }], buildResult: ({ entity: selected }) => createEntityCommand({ type: 'choice', entity: selected }) }) })
    const state = startComposition(entity, action, environment)
    expect(() => selectComposerOption(state, 'invalid')).toThrow(/Option does not belong/)
    expect(() => confirmComposition(state)).toThrow(/Cannot confirm/)
  })

  it('cancels without output and never mutates prior state or GameWorld', () => {
    const action = defineAction({ id: actionIdFromString('player.test.cancel'), entityType: 'player', labelKey: 'cancel', order: 1, availability: () => actionEnabled(), resultKind: 'command' as const, composer: defineComposer({ steps: [{ id: 'value', kind: 'value', labelKey: 'value', options: () => [{ id: 'one', labelKey: 'one', value: 1 }] }], buildResult: ({ entity: selected }) => createEntityCommand({ type: 'cancel', entity: selected }) }) })
    const worldBefore = structuredClone(world)
    const started = startComposition(entity, action, environment)
    const cancelled = cancelComposition(started)
    expect(cancelled.status).toBe('cancelled')
    expect(started.status).toBe('selecting')
    expect(world).toEqual(worldBefore)
  })
})
