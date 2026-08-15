import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { getTeamRoster } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { filterAndSortRoster, SquadScreen } from './SquadScreen'

describe('SquadScreen', () => {
  it('renders real roster positions and the seven source ratings without invented fields', () => {
    const world = createNewGame(); const markup = renderToStaticMarkup(createElement(SquadScreen, { world })); const player = getTeamRoster(world, getUserTeam(world)!.id)[0]!
    expect(markup).toContain(player.firstName); expect(markup).toContain('FIN'); expect(markup).toContain('SHO'); expect(markup).toContain('PDE'); expect(markup).toContain('FAT')
    expect(markup).not.toContain('OVERALL'); expect(markup).not.toContain('SALARY'); expect(markup).not.toContain('POTENTIAL')
  })

  it('filters and sorts presentation rows without mutating the roster', () => {
    const world = createNewGame(); const roster = getTeamRoster(world, getUserTeam(world)!.id); const original = roster.map((player) => player.id)
    expect(filterAndSortRoster(world, roster, `${roster[0]!.firstName} ${roster[0]!.lastName}`, 'ALL', 'name', 'ascending')).toHaveLength(1)
    expect(filterAndSortRoster(world, roster, '', roster[0]!.basketball.primaryPosition, 'name', 'ascending').every((player) => player.basketball.primaryPosition === roster[0]!.basketball.primaryPosition)).toBe(true)
    const sorted = filterAndSortRoster(world, roster, '', 'ALL', 'shooting', 'descending'); expect(sorted[0]!.basketball.ratings.shooting).toBeGreaterThanOrEqual(sorted.at(-1)!.basketball.ratings.shooting); expect(roster.map((player) => player.id)).toEqual(original)
  })

  it('shows the selected inspector with actual fatigue and development stimulus', () => {
    const world = createNewGame(); const player = getTeamRoster(world, getUserTeam(world)!.id)[0]!; const markup = renderToStaticMarkup(createElement(SquadScreen, { world, selectedPlayerId: player.id }))
    expect(markup).toContain('PLAYER INSPECTOR'); expect(markup).toContain('Career Fatigue'); expect(markup).toContain('Development stimulus'); expect(markup).toContain(`${player.basketball.ratings.finishing}`)
  })
})
