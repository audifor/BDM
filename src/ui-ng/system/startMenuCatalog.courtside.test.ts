import { describe, expect, it } from 'vitest'
import { START_MENU_GROUPS, visibleStartMenuGroups } from '@/ui-ng/system/startMenuCatalog'

describe('Courtside Mercado IA', () => {
  it('presents Scouting exactly once as a Mercado section, never under Equipo or Talent', () => {
    const groups = START_MENU_GROUPS.filter((group) => group.appIds.includes('scouting'))
    expect(groups.map((group) => group.id)).toEqual(['mercado'])
    const equipo = START_MENU_GROUPS.find((group) => group.id === 'equipo')!
    expect(equipo.appIds).not.toContain('scouting')
  })
  it('keeps both the market hub and the scouting application addressable', () => {
    const mercado = visibleStartMenuGroups().find((group) => group.id === 'mercado')!
    expect(mercado.appIds).toContain('market')
    expect(mercado.appIds).toContain('scouting')
  })
})
