import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { DESKTOP_APPS, getLauncherApps, reorderLauncherApps, resolveLauncherOrder } from './DesktopAppRegistry'
import { DesktopDock, DesktopLauncher } from './DesktopNavigation'

const launcherProps = { canAdvanceDay: true, canLoad: true, isOpen: true, onAdvanceDay: () => undefined, onClose: () => undefined, onLoad: () => undefined, onQueryChange: () => undefined, onSave: () => undefined, onAppOpen: () => undefined, query: '', recentAppIds: ['squad'] }

describe('Desktop navigation', () => {
  it('renders the dock from the stable registry with a labelled launcher toggle', () => {
    const markup = renderToStaticMarkup(createElement(DesktopDock, { activeAppId: 'squad', onAppOpen: () => undefined, onLauncherToggle: () => undefined, openAppIds: ['squad'] }))
    expect(markup).toContain('data-testid="desktop-dock"')
    expect(markup).toContain('aria-label="Toggle BDM launcher"')
    expect(markup).toContain('is-collapsed')
    expect(markup).toContain('aria-current="page"')
    expect(markup).toContain('role="tooltip"')
    expect((markup.match(/class="desktop-dock__item/g) ?? []).length).toBe(DESKTOP_APPS.filter((app) => app.defaultPinned).length)
  })

  it('shows only modules enabled by canonical capabilities', () => {
    expect(getLauncherApps('', { hasDraft: false, hasTrades: false }).map((app) => app.id)).not.toContain('draft')
    expect(getLauncherApps('', { hasDraft: true, hasTrades: false }).map((app) => app.id)).toContain('draft')
    expect(getLauncherApps('', { hasDraft: false, hasTrades: true }).map((app) => app.id)).toContain('trades')
    expect(getLauncherApps('').map((app) => app.id)).not.toContain('inbox')
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
