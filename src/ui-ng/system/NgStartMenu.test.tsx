// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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

  it('keeps only BDM and Home on the taskbar until a section is opened', () => {
    mountTaskbar()
    const toolbar = screen.getByRole('toolbar')
    const labels = [...toolbar.querySelectorAll('button')].map((button) => button.textContent)
    expect(labels).toEqual(['BDM', 'Home'])
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
    expect(new URL(window.location.href).searchParams.get('app')).toBe('home')
    expect(screen.getByRole('button', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
  })

  it('does not offer a close menu on Home', () => {
    mountTaskbar()
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Home' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('hides college and draft entries when they do not apply', () => {
    mountTaskbar()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú de inicio BDM' }))
    expect(screen.getByText('Equipo')).toBeInTheDocument()
    expect(screen.queryByText('College Performance Center')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Recruiting' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Draft' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Trades' })).not.toBeInTheDocument()
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
    const labels = [...toolbar.querySelectorAll('button')].map((button) => button.textContent)
    expect(labels).toEqual(['BDM', 'Home', 'Training'])
    expect(screen.queryByRole('button', { name: 'Roster' })).not.toBeInTheDocument()
  })
})
