import { describe, expect, it } from 'vitest'
import { START_MENU_GROUPS, START_MENU_RAIL_APPS, visibleStartMenuGroups } from '@/ui-ng/system/startMenuCatalog'
describe('Courtside Mercado IA unificada', () => {
  it('shows exactly one Mercado application with no Scouting shortcut or rail duplicate', () => {
    const marketGroups = START_MENU_GROUPS.filter((group) => group.appIds.includes('market'))
    expect(marketGroups.map((group) => group.id)).toEqual(['mercado'])
    expect(START_MENU_GROUPS.every((group) => !group.appIds.includes('scouting'))).toBe(true)
    expect(START_MENU_RAIL_APPS).not.toContain('scouting')
    const mercado = visibleStartMenuGroups().find((group) => group.id === 'mercado')!
    expect(mercado.appIds).toContain('market')
    expect(mercado.appIds).not.toContain('scouting')
  })
})
