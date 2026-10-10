// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { Taskbar } from '@/ui-ng/system/Taskbar'
import { filterStartMenuApps } from '@/ui-ng/system/startMenuCatalog'
import { NgWorkspaceNavigationProvider } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'

afterEach(cleanup)

beforeEach(() => {
  window.history.replaceState({}, '', '/?ui=ng&app=home')
})

function mountTaskbar() {
  return render(
    <NgWorkspaceNavigationProvider>
      <Taskbar />
    </NgWorkspaceNavigationProvider>,
  )
}

describe('filterStartMenuApps', () => {
  it('filters workspace apps by label', () => {
    expect(filterStartMenuApps('ros')).toEqual(['roster'])
    expect(filterStartMenuApps('sta')).toEqual(['staff'])
    expect(filterStartMenuApps('')).toContain('home')
    expect(filterStartMenuApps('')).not.toContain('recruiting')
  })
})

describe('NG start menu', () => {
  it('places the BDM start button before Home', () => {
    mountTaskbar()
    const toolbar = screen.getByRole('toolbar')
    const buttons = toolbar.querySelectorAll('button')
    expect(buttons[0]).toHaveAccessibleName('Abrir menú de inicio BDM')
    expect(buttons[1]).toHaveTextContent('Home')
  })

  it('opens the start menu and launches a workspace app', () => {
    mountTaskbar()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú de inicio BDM' }))
    expect(screen.getByRole('dialog', { name: 'BDM Inicio' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Aplicaciones BDM' })).not.toBeInTheDocument()
    expect(screen.queryByText('Basketball Dynasty Manager')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Roster' }))
    expect(screen.queryByLabelText('BDM Inicio')).not.toBeInTheDocument()
    expect(new URL(window.location.href).searchParams.get('app')).toBe('roster')
    expect(screen.getByRole('button', { name: 'Roster' })).toBeInTheDocument()
  })

  it('keeps only BDM start and Home on the taskbar until a section is opened', () => {
    mountTaskbar()
    const toolbar = screen.getByRole('toolbar')
    const buttons = [...toolbar.querySelectorAll('button')]
    expect(buttons).toHaveLength(2)
    expect(buttons[0]).toHaveAccessibleName('Abrir menú de inicio BDM')
    expect(buttons[0]).not.toHaveTextContent('BDM')
    expect(buttons[1]).toHaveTextContent('Home')
    expect(screen.queryByRole('button', { name: 'Roster' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Training' })).not.toBeInTheDocument()
  })

  it('closes an opened section from the taskbar context menu and returns to Home', () => {
    mountTaskbar()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú de inicio BDM' }))
    fireEvent.click(screen.getByRole('button', { name: 'Roster' }))
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Roster' }))
    const slot = document.querySelector('.ng-taskbar__app-slot[data-app="roster"]')
    expect(slot?.querySelector('[role="menu"]')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Cerrar' }))
    expect(screen.queryByRole('button', { name: 'Roster' })).not.toBeInTheDocument()
    expect(new URL(window.location.href).searchParams.get('app')).toBeNull()
    expect(screen.getByRole('button', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
  })

  it('closes an opened section with middle click and ignores Home', () => {
    mountTaskbar()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú de inicio BDM' }))
    fireEvent.click(screen.getByRole('button', { name: 'Roster' }))
    fireEvent(
      screen.getByRole('button', { name: 'Roster' }),
      new MouseEvent('auxclick', { bubbles: true, button: 1 }),
    )
    expect(screen.queryByRole('button', { name: 'Roster' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Home' })).toHaveAttribute('aria-current', 'page')

    fireEvent(
      screen.getByRole('button', { name: 'Home' }),
      new MouseEvent('auxclick', { bubbles: true, button: 1 }),
    )
    expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument()
  })

  it('does not offer a close menu on Home', () => {
    mountTaskbar()
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Home' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('hides college and draft entries when they do not apply', () => {
    mountTaskbar()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú de inicio BDM' }))
    expect(screen.getByRole('navigation', { name: 'Categorías de aplicaciones' })).toBeInTheDocument()
    expect(screen.queryByText('College Performance Center')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Recruiting' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Draft' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Trades' })).not.toBeInTheDocument()
  })

  it('uses category icons as selectors and only renders the chosen category apps below', () => {
    mountTaskbar()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú de inicio BDM' }))
    const dialog = screen.getByRole('dialog', { name: 'BDM Inicio' })
    const nav = within(dialog).getByRole('navigation', { name: 'Categorías de aplicaciones' })
    const picker = within(nav).getAllByRole('button')
    expect(picker.length).toBeGreaterThanOrEqual(6)
    expect(within(nav).getByRole('button', { name: 'Equipo' })).toHaveAttribute('aria-pressed','true')
    expect(within(nav).getByRole('button', { name: 'Talent Operations' })).toHaveAttribute('aria-pressed','false')
    expect(dialog.querySelectorAll('.ng-start-menu__categories > .ng-start-menu__category')).toHaveLength(1)

    const teamPanel = dialog.querySelector('.ng-start-menu__category[data-category="equipo"]')
    expect(teamPanel).not.toBeNull()
    expect(teamPanel?.querySelectorAll('.ng-start-menu__category-apps .ng-start-menu__tile')).toHaveLength(8)
    expect(within(dialog).getByRole('button', { name: 'Roster' })).toBeInTheDocument()

    fireEvent.click(within(nav).getByRole('button', { name: 'Talent Operations' }))
    expect(within(nav).getByRole('button', { name: 'Talent Operations' })).toHaveAttribute('aria-pressed','true')
    const talent = dialog.querySelector('.ng-start-menu__category[data-category="talent"]')
    expect(talent).not.toBeNull()
    expect(talent?.querySelectorAll('.ng-start-menu__category-apps .ng-start-menu__tile')).toHaveLength(2)
    expect(within(dialog).queryByRole('button', { name: 'Roster' })).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Scouting' })).toBeInTheDocument()
    expect(dialog.querySelectorAll('.ng-start-menu__categories > .ng-start-menu__category')).toHaveLength(1)

    fireEvent.click(within(nav).getByRole('button', { name: 'Partidos y competición' }))
    expect(dialog.querySelector('.ng-start-menu__category[data-category="partidos"]')).not.toBeNull()
    expect(within(dialog).getByRole('button', { name: 'Match' })).toBeInTheDocument()
  })

  it('searches globally irrespective of selected category, and category selection clears search', () => {
    mountTaskbar()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú de inicio BDM' }))
    const dialog = screen.getByRole('dialog', { name: 'BDM Inicio' })
    const nav = within(dialog).getByRole('navigation', { name: 'Categorías de aplicaciones' })
    expect(within(dialog).queryByRole('button', { name: 'Finances' })).not.toBeInTheDocument()

    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Buscar en BDM' }),
      {target:{value:'finances'}})
    expect(dialog.querySelector('.ng-start-menu__category[data-category="search"]')).not.toBeNull()
    expect(within(dialog).getByRole('button', { name: 'Finances' })).toBeInTheDocument()

    fireEvent.click(within(nav).getByRole('button', { name: 'Equipo' }))
    expect(within(dialog).getByRole('textbox', { name: 'Buscar en BDM' })).toHaveValue('')
    expect(dialog.querySelector('.ng-start-menu__category[data-category="equipo"]')).not.toBeNull()
    expect(within(dialog).queryByRole('button', { name: 'Finances' })).not.toBeInTheDocument()
  })

  it('closes the start menu on Escape', () => {
    mountTaskbar()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú de inicio BDM' }))
    expect(screen.getByLabelText('BDM Inicio')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByLabelText('BDM Inicio')).not.toBeInTheDocument()
  })

  it('pins the current URL section on the taskbar', () => {
    window.history.replaceState({}, '', '/?ui=ng&app=training')
    mountTaskbar()
    const toolbar = screen.getByRole('toolbar')
    const buttons = [...toolbar.querySelectorAll('button')]
    expect(buttons[0]).toHaveAccessibleName('Abrir menú de inicio BDM')
    expect(buttons.map((button) => button.textContent)).toEqual(['', 'Home', 'Training'])
    expect(screen.queryByRole('button', { name: 'Roster' })).not.toBeInTheDocument()
  })
})
