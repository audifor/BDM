import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { actionEnabled } from './ActionAvailability'
import { actionIdFromString, defineAction } from './ActionDefinition'
import { MemoryActionUsagePreferencesRepository } from './ActionUsagePreferencesRepository'
import { createEntityCommand } from './EntityCommand'
import { EntityActionRegistry } from './EntityActionRegistry'
import { createEntityRef } from './EntityRef'
import { coldStartQuickActions, EMPTY_ACTION_USAGE_PREFERENCES, recordActionUsage, resolveQuickActions, resumeQuickAction } from './QuickActions'
import { productionEntityActionRegistry } from './productionRegistry'

describe('QuickActions', () => {
  it('uses stable Player cold-start slots and resumes executable shortcuts through ComposerEngine', () => {
    const world = createNewGame(); const team = Object.values(world.teams)[0]!; const entity = createEntityRef('player', team.rosterPlayerIds[0]!); const environment = { world, controlledTeamId: team.id }
    expect(resolveQuickActions(entity, environment, productionEntityActionRegistry, EMPTY_ACTION_USAGE_PREFERENCES).map((quick) => quick.signature.rootActionId)).toEqual(['player.talk', 'player.limit', 'player.rest', 'player.negotiate'])
    const release = { signature: { version: 2 as const, entityType: 'player', rootActionId: 'player.release', selections: [] }, label: 'RELEASE' }
    const resumed = resumeQuickAction(entity, environment, productionEntityActionRegistry, release)
    expect(resumed.status).toBe('readyToConfirm')
  })

  it('keeps existing slots until a new signature exceeds the lowest slot by two uses', () => {
    const defaults = coldStartQuickActions('player'); const signature = { version: 2 as const, entityType: 'player', rootActionId: 'player.tag', selections: [] }
    let preferences = EMPTY_ACTION_USAGE_PREFERENCES
    preferences = recordActionUsage(preferences, { version: 2, entityType: 'player', rootActionId: defaults[0]!.signature.rootActionId, selections: [] }, '2026-01-01T00:00:00.000Z')
    preferences = recordActionUsage(preferences, signature, '2026-01-02T00:00:00.000Z')
    expect(preferences.slotsByEntityType.player).not.toContain(JSON.stringify(signature))
    preferences = recordActionUsage(preferences, signature, '2026-01-03T00:00:00.000Z')
    expect(preferences.slotsByEntityType.player).toContain(JSON.stringify(signature))
  })

  it('persists versioned preferences and resolves a non-Player fixture through the same resolver', () => {
    const repository = new MemoryActionUsagePreferencesRepository(); repository.save(recordActionUsage(repository.load(), { version: 2, entityType: 'staff', rootActionId: 'staff.note', selections: [] }, '2026-01-01T00:00:00.000Z'))
    expect(repository.load().version).toBe(2)
    const registry = new EntityActionRegistry([{ entityType: 'staff', actions: [defineAction({ id: actionIdFromString('staff.note'), entityType: 'staff', labelKey: 'staff.note', order: 1, availability: actionEnabled, resultKind: 'command', buildResult: ({ entity }) => createEntityCommand({ type: 'staff.note', entity }) })] }]).freeze()
    const world = createNewGame(); const entity = createEntityRef('staff', 'staff-1')
    expect(resolveQuickActions(entity, { world }, registry, repository.load())).toHaveLength(1)
  })

  it('keeps Player, Staff and Team cold starts and usage slots isolated by EntityType', () => {
    const world = createNewGame(); const team = Object.values(world.teams)[0]!; const staffId = Object.values(world.staffPeopleById)[0]!.id
    expect(resolveQuickActions(createEntityRef('staff', staffId), { world, controlledTeamId: team.id }, productionEntityActionRegistry, EMPTY_ACTION_USAGE_PREFERENCES).map((quick) => quick.signature.rootActionId)).toEqual(['staff.talk', 'staff.assign', 'staff.assess', 'staff.develop'])
    expect(resolveQuickActions(createEntityRef('team', team.id), { world, controlledTeamId: team.id }, productionEntityActionRegistry, EMPTY_ACTION_USAGE_PREFERENCES).map((quick) => quick.signature.rootActionId)).toEqual(['team.assess', 'team.manage', 'team.arrange', 'team.delegate'])
    const preferences = recordActionUsage(EMPTY_ACTION_USAGE_PREFERENCES, { version: 2, entityType: 'player', rootActionId: 'player.release', selections: [] }, '2026-01-01T00:00:00.000Z')
    expect(preferences.slotsByEntityType.staff).toBeUndefined(); expect(preferences.slotsByEntityType.team).toBeUndefined()
  })
})
