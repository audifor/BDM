import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { DESKTOP_APPS, DOCK_APP_ICON_REGISTRY, getLauncherApps, reorderLauncherApps, resolveLauncherOrder } from './DesktopAppRegistry'
import { DesktopDock, DesktopLauncher } from './DesktopNavigation'

const launcherProps = { canAdvanceDay: true, canLoad: true, isOpen: true, onAdvanceDay: () => undefined, onClose: () => undefined, onLoad: () => undefined, onQueryChange: () => undefined, onSave: () => undefined, onAppOpen: () => undefined, query: '', recentAppIds: ['squad'] }

describe('Desktop navigation', () => {
  it('renders the dock from the stable registry with a labelled launcher toggle', () => {
    const markup = renderToStaticMarkup(createElement(DesktopDock, { activeAppId: 'squad', onAppOpen: () => undefined, onLauncherToggle: () => undefined, openAppIds: ['squad'] }))
    expect(markup).toContain('data-testid="desktop-dock"')
    expect(markup).toContain('aria-label="Toggle BDM launcher"')
    expect(markup).toContain('title="Plantilla"')
    expect(markup).toContain('is-expanded')
    expect(markup).toContain('aria-current="page"')
    expect(markup).toContain('role="tooltip"')
    expect(markup).toContain('<img')
    expect(markup).not.toContain('<svg')
    expect((markup.match(/class="desktop-dock__item/g) ?? []).length).toBe(DESKTOP_APPS.filter((app) => app.defaultPinned).length)
  })

  it('maps every canonical app icon concept to its individual PNG asset', () => {
    expect(DOCK_APP_ICON_REGISTRY).toMatchObject({
      home: expect.stringMatching(/home\.png$/), team: expect.stringMatching(/team\.png$/), roster: expect.stringMatching(/roster\.png$/), tactics: expect.stringMatching(/tactics\.png$/), schedule: expect.stringMatching(/schedule\.png$/), scouting: expect.stringMatching(/scouting\.png$/), league: expect.stringMatching(/league\.png$/), finances: expect.stringMatching(/finances\.png$/), training: expect.stringMatching(/training\.png$/), inbox: expect.stringMatching(/inbox\.png$/), news: expect.stringMatching(/news\.png$/), draft: expect.stringMatching(/draft\.png$/), 'trade-center': expect.stringMatching(/trade-center\.png$/), settings: expect.stringMatching(/settings\.png$/),
    })
    expect(Object.keys(DOCK_APP_ICON_REGISTRY)).toHaveLength(14)
    expect(DESKTOP_APPS.every((app) => app.icon in DOCK_APP_ICON_REGISTRY)).toBe(true)
    expect(DESKTOP_APPS.find((app) => app.id === 'bdm')?.icon).toBe('home')
    expect(DESKTOP_APPS.find((app) => app.id === 'squad')?.icon).toBe('roster')
    expect(DESKTOP_APPS.find((app) => app.id === 'trades')?.icon).toBe('trade-center')
    expect(DESKTOP_APPS.find((app) => app.id === 'settings')?.icon).toBe('settings')
  })

  it('shows only modules enabled by canonical capabilities', () => {
    expect(getLauncherApps('', { hasDraft: false, hasTrades: false }).map((app) => app.id)).not.toContain('draft')
    expect(getLauncherApps('', { hasDraft: true, hasTrades: false }).map((app) => app.id)).toContain('draft')
    expect(getLauncherApps('', { hasDraft: false, hasTrades: true }).map((app) => app.id)).toContain('trades')
    expect(getLauncherApps('').map((app) => app.id)).not.toContain('inbox')
  })

  it('groups the college modules under College Performance Center', () => {
    for (const appId of ['recruiting', 'nil', 'boosters']) expect(DESKTOP_APPS.find((app) => app.id === appId)?.launcherGroup).toBe('College Performance Center')
  })

  it('finds launcher apps regardless of accents', () => {
    expect(getLauncherApps('tacticas').map((app) => app.id)).toContain('tactics')
    expect(getLauncherApps('tácticas').map((app) => app.id)).toContain('tactics')
  })

  it('keeps persistent order deterministic across removed, hidden and newly registered IDs', () => {
    const order = resolveLauncherOrder(['trades', 'unknown', 'squad'])
    expect(order.slice(0, 2)).toEqual(['trades', 'squad'])
    expect(new Set(order).size).toBe(order.length)
    expect(reorderLauncherApps(order, 'squad', 'trades').slice(0, 2)).toEqual(['squad', 'trades'])
    expect(getLauncherApps('', { hasTrades: false }, order).map((app) => app.id)).not.toContain('trades')
    expect(getLauncherApps('', { hasTrades: true }, order).map((app) => app.id)).toContain('trades')
  })

  it('renders no launcher when closed and does not mutate gameplay data', () => {
    const world = createNewGame(); const before = JSON.stringify(world)
    expect(renderToStaticMarkup(createElement(DesktopLauncher, { ...launcherProps, isOpen: false }))).toBe('')
    expect(JSON.stringify(world)).toBe(before)
  })
})
