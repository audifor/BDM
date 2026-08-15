import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'

import { actionDisabled, actionEnabled } from './ActionAvailability'
import { actionIdFromString, defineAction } from './ActionDefinition'
import { defineComposer } from './ComposerDefinition'
import { startComposition } from './ComposerEngine'
import { createEntityActionHandoff, createEntityCommand } from './EntityCommand'
import { EntityActionRegistry } from './EntityActionRegistry'
import { createEntityRef } from './EntityRef'
import { resolveQuickActions } from './QuickActions'
import { PLAYER_TEST_ACTIONS, TEAM_TEST_ACTIONS } from './testActions'

describe('EntityActionRegistry', () => {
  const world = createNewGame()
  const team = Object.values(world.teams)[0]!
  const player = world.players[team.rosterPlayerIds[0]!]!
  const playerRef = createEntityRef('player', player.id)
  const teamRef = createEntityRef('team', team.id)
  const environment = { world, controlledTeamId: team.id }

  it('creates validated lightweight EntityRefs', () => {
    expect(playerRef).toEqual({ type: 'player', id: player.id })
    expect(() => createEntityRef('', player.id)).toThrow('Entity type')
    expect(() => createEntityRef('player', '')).toThrow('Entity id')
  })

  it('registers Player and Team catalogs without sharing actions between types', () => {
    const registry = new EntityActionRegistry([ { entityType: 'player', actions: PLAYER_TEST_ACTIONS }, { entityType: 'team', actions: TEAM_TEST_ACTIONS } ])
    expect(registry.getActions(playerRef, environment).map((entry) => entry.definition.id)).toEqual(PLAYER_TEST_ACTIONS.map((action) => action.id))
    expect(registry.getActions(teamRef, environment).map((entry) => entry.definition.id)).toEqual(TEAM_TEST_ACTIONS.map((action) => action.id))
  })

  it('preserves declared order and disabled positions with their reason', () => {
    const disabledFirst = defineAction({ id: actionIdFromString('player.test.disabled'), entityType: 'player', labelKey: 'disabled', order: 1, availability: () => actionDisabled('Not applicable'), resultKind: 'handoff' as const })
    const enabledSecond = defineAction({ id: actionIdFromString('player.test.enabled'), entityType: 'player', labelKey: 'enabled', order: 2, availability: () => actionEnabled(), resultKind: 'handoff' as const })
    const registry = new EntityActionRegistry([{ entityType: 'player', actions: [enabledSecond, disabledFirst] }])
    const actions = registry.getActions(playerRef, environment)
    expect(actions.map((entry) => entry.definition.id)).toEqual([disabledFirst.id, enabledSecond.id])
    expect(actions[0]!.availability).toEqual({ kind: 'disabled', reason: 'Not applicable' })
  })

  it('rejects duplicate action IDs and mismatched catalogs', () => {
    const action = PLAYER_TEST_ACTIONS[0]!
    expect(() => new EntityActionRegistry([{ entityType: 'player', actions: [action, action] }])).toThrow('Duplicate action id')
    expect(() => new EntityActionRegistry([{ entityType: 'team', actions: [action] }])).toThrow('does not match catalog type')
  })

  it('accepts a future entity type without changing the registry core', () => {
    const futureAction = defineAction({ id: actionIdFromString('venue.test.inspect'), entityType: 'venue', labelKey: 'venue.inspect', order: 1, availability: () => actionEnabled(), resultKind: 'handoff' as const })
    const registry = new EntityActionRegistry([{ entityType: 'venue', actions: [futureAction] }])
    expect(registry.getActions(createEntityRef('venue', 'venue-1'), environment)[0]!.definition.id).toBe(futureAction.id)
  })

  it('lets a future entity supply catalog, cold start, composition and handoff through public APIs', () => {
    const futureAction = defineAction({ id: actionIdFromString('testFutureEntity.inspect'), entityType: 'testFutureEntity', labelKey: 'testFutureEntity.inspect', order: 1, availability: actionEnabled, resultKind: 'handoff' as const, buildResult: ({ entity }) => createEntityActionHandoff({ target: 'testFutureEntity.inspect', entity }) })
    const second = defineAction({ id: actionIdFromString('testFutureEntity.compare'), entityType: 'testFutureEntity', labelKey: 'testFutureEntity.compare', order: 2, availability: actionEnabled, resultKind: 'handoff' as const })
    const third = defineAction({ id: actionIdFromString('testFutureEntity.follow'), entityType: 'testFutureEntity', labelKey: 'testFutureEntity.follow', order: 3, availability: actionEnabled, resultKind: 'handoff' as const })
    const registry = new EntityActionRegistry([{ entityType: 'testFutureEntity', actions: [futureAction, second, third], quickActionIds: [futureAction.id, second.id, third.id] }]).freeze()
    const entity = createEntityRef('testFutureEntity', 'future-1')
    expect(registry.getCatalog(entity.type)).toHaveLength(3)
    expect(resolveQuickActions(entity, environment, registry, { version: 2, entries: [], slotsByEntityType: {} })).toHaveLength(3)
    const composition = startComposition(entity, futureAction, environment)
    expect(composition).toMatchObject({ status: 'handedOff', handoff: { target: 'testFutureEntity.inspect', entity } })
  })

  it('allows bootstrap registration then rejects mutation after freeze while retaining reads', () => {
    const registry = new EntityActionRegistry()
    registry.register({ entityType: 'player', actions: PLAYER_TEST_ACTIONS }).freeze()
    expect(registry.getCatalog('player')).toHaveLength(2)
    expect(() => registry.register({ entityType: 'team', actions: TEAM_TEST_ACTIONS })).toThrow('frozen')
  })

  it('keeps command and handoff contracts data-only and leaves GameWorld unchanged', () => {
    const before = structuredClone(world)
    const command = createEntityCommand({ type: 'player.test.release', entity: playerRef, payload: { confirmed: true } })
    const handoff = createEntityActionHandoff({ target: 'player.inspect', entity: playerRef, data: { source: 'test' } })
    expect(command).toMatchObject({ kind: 'command', entity: playerRef })
    expect(handoff).toMatchObject({ kind: 'handoff', entity: playerRef })
    expect(world).toEqual(before)
  })

  it('defines a declarative composer without UI dependencies', () => {
    expect(defineComposer({ steps: [{ id: 'target', kind: 'target', labelKey: 'target', options: () => [] }] }).steps).toHaveLength(1)
    expect(() => defineComposer({ steps: [{ id: 'target', kind: 'target', labelKey: 'target', options: () => [] }, { id: 'target', kind: 'confirm', labelKey: 'confirm' }] })).toThrow('Duplicate composer step id')
  })
})
