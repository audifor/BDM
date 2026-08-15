import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { DESKTOP_APPS, getLauncherApps } from './DesktopAppRegistry'
import { DesktopDock, DesktopLauncher } from './DesktopNavigation'

const launcherProps = {
  canAdvanceDay: true,
  canLoad: true,
  isOpen: true,
  onAdvanceDay: () => undefined,
  onClose: () => undefined,
  onLoad: () => undefined,
  onQueryChange: () => undefined,
  onSave: () => undefined,
  onAppOpen: () => undefined,
  query: '',
  recentAppIds: ['squad'],
}

describe('Desktop navigation', () => {
  it('renders the floating dock from the central registry with semantic active state and accessible tooltips', () => {
    const markup = renderToStaticMarkup(createElement(DesktopDock, { activeAppId: 'squad', onAppOpen: () => undefined, onLauncherToggle: () => undefined, openAppIds: ['squad'] }))
    expect(markup).toContain('data-testid="desktop-dock"')
    expect(markup).toContain('aria-label="Abrir lanzador BDM"')
    expect(markup).toContain('is-collapsed')
    expect(markup).toContain('aria-current="page"')
    expect(markup).toContain('role="tooltip"')
    expect((markup.match(/class="desktop-dock__item/g) ?? []).length).toBe(DESKTOP_APPS.filter((app) => app.defaultPinned).length)
    expect((markup.match(/desktop-dock__label/g) ?? []).length).toBe(DESKTOP_APPS.filter((app) => app.defaultPinned).length)
    expect(markup).toContain('Plantilla')
    expect(markup).toContain('M8 11a3 3')
    expect(markup).toContain('M5 4h14v16H5zM8 2v4')
  })

  it('keeps future apps disabled and filters launcher apps locally', () => {
    const markup = renderToStaticMarkup(createElement(DesktopLauncher, launcherProps))
    expect(DESKTOP_APPS.find((app) => app.id === 'inbox')?.availability).toBe('future')
    expect(markup).toContain('disabled=""')
    expect(getLauncherApps('plantilla').map((app) => app.id)).toEqual(['squad'])
    expect(getLauncherApps('').map((app) => app.id)).not.toContain('bdm')
  })

  it('renders no launcher when closed and does not mutate gameplay data', () => {
    const world = createNewGame()
    const before = JSON.stringify(world)
    expect(renderToStaticMarkup(createElement(DesktopLauncher, { ...launcherProps, isOpen: false }))).toBe('')
    expect(JSON.stringify(world)).toBe(before)
  })
})
