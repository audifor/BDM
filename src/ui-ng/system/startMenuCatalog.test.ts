import { describe, expect, it } from 'vitest'

import type { GameCapabilities } from '@/ui/gameContext'
import {
  allStartMenuApps,
  filterStartMenuApps,
  START_MENU_GROUPS,
  visibleStartMenuGroups,
} from '@/ui-ng/system/startMenuCatalog'

const FIBA: GameCapabilities = { hasDraft: false, hasTrades: false, hasSalaryCap: false, isNcaa: false }
const NCAA: GameCapabilities = { hasDraft: false, hasTrades: false, hasSalaryCap: false, isNcaa: true }
const NBA: GameCapabilities = { hasDraft: true, hasTrades: true, hasSalaryCap: true, isNcaa: false }

describe('startMenuCatalog', () => {
  it('includes every remaining launcher group including College Performance Center', () => {
    const labels = START_MENU_GROUPS.map((group) => group.label)
    expect(labels).toContain('Partidos y competición')
    expect(labels).toContain('Mercado')
    expect(labels).toContain('Gestión del club')
    expect(labels).toContain('Mi carrera')
    expect(labels).toContain('Mundo y narrativa')
    expect(labels).toContain('College Performance Center')
    expect(START_MENU_GROUPS.find((group) => group.id === 'college')?.appIds).toEqual(['recruiting', 'nil', 'boosters'])
    expect(START_MENU_GROUPS.find((group) => group.id === 'equipo')?.appIds).toEqual(
      expect.arrayContaining(['player', 'scouting']),
    )
  })

  it('exposes college and club apps in the searchable catalog', () => {
    expect(allStartMenuApps()).toEqual(expect.arrayContaining(['schedule', 'club', 'recruiting', 'nil', 'boosters']))
    expect(filterStartMenuApps('rec', NCAA)).toEqual(['recruiting'])
    expect(filterStartMenuApps('sta', FIBA)).toEqual(['staff'])
  })

  it('hides sections that do not apply to the current club', () => {
    expect(filterStartMenuApps('', FIBA)).not.toEqual(expect.arrayContaining(['recruiting', 'nil', 'boosters', 'draft', 'trades']))
    expect(filterStartMenuApps('rec', FIBA)).toEqual([])
    expect(visibleStartMenuGroups(FIBA).map((group) => group.id)).not.toContain('college')
    expect(visibleStartMenuGroups(NCAA).map((group) => group.id)).toContain('college')
    expect(filterStartMenuApps('', NBA)).toEqual(expect.arrayContaining(['draft', 'trades', 'market']))
    expect(filterStartMenuApps('', NBA)).not.toEqual(expect.arrayContaining(['recruiting']))
  })
})
