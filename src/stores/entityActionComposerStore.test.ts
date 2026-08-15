import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { createEntityRef } from '@/app/entityActions/EntityRef'
import { useEntityActionComposerStore } from './entityActionComposerStore'

describe('entityActionComposerStore', () => {
  it('opens, requires release confirmation, and resets on cancellation or a new target', () => {
    const world = createNewGame(); const team = Object.values(world.teams)[0]!; const first = team.rosterPlayerIds[0]!; const second = team.rosterPlayerIds[1]!
    const store = useEntityActionComposerStore.getState(); const environment = { world, controlledTeamId: team.id }
    store.open(createEntityRef('player', first), environment, { x: 10, y: 10 }); store.chooseAction('player.release')
    expect(useEntityActionComposerStore.getState().composition?.status).toBe('readyToConfirm')
    store.confirm(); expect(useEntityActionComposerStore.getState().result?.kind).toBe('command')
    store.open(createEntityRef('player', second), environment, { x: 20, y: 20 })
    expect(useEntityActionComposerStore.getState().entity?.id).toBe(second); expect(useEntityActionComposerStore.getState().composition).toBeNull()
    useEntityActionComposerStore.getState().cancel(); expect(useEntityActionComposerStore.getState().mode).toBe('closed')
  })
})
