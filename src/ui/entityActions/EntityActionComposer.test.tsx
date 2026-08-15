import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { createEntityRef } from '@/app/entityActions/EntityRef'
import { useEntityActionComposerStore } from '@/stores/entityActionComposerStore'
import { EntityActionComposer } from './EntityActionComposer'

describe('EntityActionComposer', () => {
  it('renders the stable twenty-slot Player action board from the production catalog', () => {
    const world = createNewGame(); const team = Object.values(world.teams)[0]!; const playerId = team.rosterPlayerIds[0]!
    useEntityActionComposerStore.getState().open(createEntityRef('player', playerId), { world, controlledTeamId: team.id }, { x: 10, y: 10 })
    const markup = renderToStaticMarkup(createElement(EntityActionComposer, { onResult: () => ({ kind: 'noExecutor' }) }))
    expect((markup.match(/entity-action-composer__root/g) ?? [])).toHaveLength(20)
    expect(markup).toContain('TALK'); expect(markup).toContain('RELEASE'); expect(markup.indexOf('TALK')).toBeLessThan(markup.indexOf('RELEASE'))
    useEntityActionComposerStore.getState().close()
  })

  it('renders exactly four screen-independent quick slots', () => {
    const world = createNewGame(); const team = Object.values(world.teams)[0]!; const playerId = team.rosterPlayerIds[0]!
    useEntityActionComposerStore.getState().openQuick(createEntityRef('player', playerId), { world, controlledTeamId: team.id }, { x: 10, y: 10 })
    const markup = renderToStaticMarkup(createElement(EntityActionComposer, { onResult: () => ({ kind: 'noExecutor' }) }))
    expect((markup.match(/entity-action-composer__root/g) ?? [])).toHaveLength(4)
    expect(markup).toContain('TALK'); expect(markup).toContain('LIMIT')
    useEntityActionComposerStore.getState().close()
  })

  it('adapts the same board and Quick grid to Staff and Team catalogs', () => {
    const world = createNewGame(); const team = Object.values(world.teams)[0]!; const staffId = Object.values(world.staffPeopleById)[0]!.id
    useEntityActionComposerStore.getState().open(createEntityRef('staff', staffId), { world, controlledTeamId: team.id }, { x: 10, y: 10 })
    let markup = renderToStaticMarkup(createElement(EntityActionComposer, { onResult: () => ({ kind: 'noExecutor' }) }))
    expect(markup).toContain('STAFF ACTIONS'); expect((markup.match(/entity-action-composer__root/g) ?? [])).toHaveLength(8)
    useEntityActionComposerStore.getState().open(createEntityRef('team', team.id), { world, controlledTeamId: team.id }, { x: 10, y: 10 })
    markup = renderToStaticMarkup(createElement(EntityActionComposer, { onResult: () => ({ kind: 'noExecutor' }) }))
    expect(markup).toContain('TEAM ACTIONS'); expect((markup.match(/entity-action-composer__root/g) ?? [])).toHaveLength(8)
    useEntityActionComposerStore.getState().openQuick(createEntityRef('team', team.id), { world, controlledTeamId: team.id }, { x: 10, y: 10 })
    markup = renderToStaticMarkup(createElement(EntityActionComposer, { onResult: () => ({ kind: 'noExecutor' }) }))
    expect(markup).toContain('TEAM ACTIONS'); expect((markup.match(/entity-action-composer__root/g) ?? [])).toHaveLength(4)
    useEntityActionComposerStore.getState().close()
  })
})
