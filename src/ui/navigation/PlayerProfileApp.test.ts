import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game/createNewGame'
import { getUserTeam } from '@/engine/calendar'
import { getTeamRoster } from '@/domain/world'

import { PlayerProfileApp } from './PlayerProfileApp'

describe('PlayerProfileApp', () => {
  it('uses the compact app frame and only canonical player data', () => {
    const world = createNewGame(); const team = getUserTeam(world)!; const player = getTeamRoster(world, team.id)[0]!
    const markup = renderToStaticMarkup(createElement(PlayerProfileApp, { destination: { type: 'player', playerId: player.id, section: 'overview' }, onOpenEntity: () => undefined, world }))
    expect(markup).not.toContain('PLAYER PROFILE'); expect(markup).toContain(`${player.firstName} ${player.lastName}`); expect(markup).toContain('Attribute summary'); expect(markup).toContain(team.name); expect(markup).not.toContain('OVR')
  })
})
