import { describe, expect, it } from 'vitest'

import { useRosterWorkspaceSession } from '@/ui-ng/applications/roster/rosterWorkspaceSession'
import { filterRosterByPosition } from '@/ui-ng/applications/roster/rosterPositionFilter'
import { createNewGame } from '@/app/game'
import { getUserTeam } from '@/engine/calendar'
import { getTeamRoster } from '@/domain/world'

describe('useRosterWorkspaceSession', () => {
  it('stores and resets roster session fields', () => {
    useRosterWorkspaceSession.getState().reset()
    useRosterWorkspaceSession.getState().setActivePreset('psico')
    useRosterWorkspaceSession.getState().setSearchQuery('mart')
    useRosterWorkspaceSession.getState().setPositionFilter('SG')
    useRosterWorkspaceSession.getState().setSelectedRowIds(['a', 'b'])
    useRosterWorkspaceSession.getState().setScrollTop(240)

    expect(useRosterWorkspaceSession.getState()).toMatchObject({
      activePreset: 'psico',
      searchQuery: 'mart',
      positionFilter: 'SG',
      selectedRowIds: ['a', 'b'],
      scrollTop: 240,
    })

    useRosterWorkspaceSession.getState().reset()
    expect(useRosterWorkspaceSession.getState()).toMatchObject({
      activePreset: 'general',
      searchQuery: '',
      positionFilter: 'ALL',
      selectedRowIds: [],
      scrollTop: 0,
    })
  })
})

describe('filterRosterByPosition', () => {
  it('filters roster rows by canonical primary position', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const roster = getTeamRoster(world, team.id)
    const guards = roster.filter((player) => player.basketball.primaryPosition === 'PG')

    expect(filterRosterByPosition(roster, 'PG')).toEqual(guards)
    expect(filterRosterByPosition(roster, 'ALL')).toEqual(roster)
  })
})
