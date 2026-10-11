// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { useGameStore } from '@/stores/gameStore'
import { Taskbar } from '@/ui-ng/system/Taskbar'
import { NgWorkspaceNavigationProvider } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'
import { navigateToPlayer, navigateToStaff } from '@/ui-ng/workspace/workspaceApps'
import type { PlayerId, StaffPersonId } from '@/domain/ids'

afterEach(cleanup)

beforeEach(() => {
  window.history.replaceState({}, '', '/?ui=ng&app=home')
  useGameStore.getState().resetGame()
})

function mountTaskbar() {
  return render(
    <NgWorkspaceNavigationProvider>
      <Taskbar />
    </NgWorkspaceNavigationProvider>,
  )
}

/*
 * MX0.4 shell truth: the taskbar status is a canonical signal. It used to be the static caption
 * "Simulation idle", which claimed the simulation was idle even while a background day advance was running.
 */
describe('Taskbar simulation status', () => {
  it('reports the idle state when no simulation is running', () => {
    mountTaskbar()

    expect(screen.getByText('Simulation idle')).toBeInTheDocument()
  })

  it('reports the running state from the canonical simulation flag, not from a caption', () => {
    useGameStore.setState({ simulationBusy: true })
    mountTaskbar()

    expect(screen.getByText('Simulation running')).toBeInTheDocument()
    expect(screen.queryByText('Simulation idle')).not.toBeInTheDocument()
  })
})

describe('Grouped entity instances in the taskbar', () => {
  it('shows two player dossiers, can close one and restore the other', () => {
    mountTaskbar()
    act(() => {
      navigateToPlayer('player:alpha' as PlayerId)
      navigateToPlayer('player:beta' as PlayerId)
    })
    fireEvent.pointerEnter(screen.getByRole('button', { name: /^Player$/ }))
    const list = screen.getByRole('menu', { name: 'Instancias de Player' })
    expect(within(list).getByRole('menuitem', { name: 'player:alpha' })).toBeInTheDocument()
    expect(within(list).getByRole('menuitem', { name: 'player:beta' })).toBeInTheDocument()
    fireEvent.click(within(list).getByRole('button', { name: 'Cerrar player:beta' }))
    expect(window.location.search).toContain('playerId=player%3Aalpha')
    expect(within(list).getAllByRole('menuitem')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /instancias de Player/ })).not.toBeInTheDocument()
    fireEvent.click(within(list).getByRole('menuitem', { name: 'player:alpha' }))
    expect(window.location.search).toContain('playerId=player%3Aalpha')
  })

  it('left click activates without closing instances, even when a modal is open; middle click closes the group', () => {
    mountTaskbar()
    act(() => {
      navigateToPlayer('player:alpha' as PlayerId)
      navigateToPlayer('player:beta' as PlayerId)
      navigateToStaff('staff:alpha' as StaffPersonId)
    })
    // The taskbar must never destroy a group because a modal is visible.
    const modal = document.createElement('div')
    modal.setAttribute('role', 'dialog')
    modal.setAttribute('aria-label', 'Player action')
    document.body.appendChild(modal)
    try {
      const playerIcon = screen.getByRole('button', { name: /^Player$/ })
      fireEvent.click(playerIcon)
      expect(new URL(window.location.href).searchParams.get('playerId')).toBe('player:beta')
      fireEvent.pointerEnter(playerIcon)
      let group = screen.getByRole('menu', { name: 'Instancias de Player' })
      expect(within(group).getAllByRole('menuitem')).toHaveLength(2)
      expect(within(group).queryByRole('button', { name: /Cerrar todas/i })).not.toBeInTheDocument()
      fireEvent.auxClick(playerIcon, { button: 1 })
      expect(screen.queryByRole('menu', { name: 'Instancias de Player' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^Player$/ })).not.toBeInTheDocument()
      const staffIcon = screen.getByRole('button', { name: /^Staff$/ })
      fireEvent.click(staffIcon)
      fireEvent.pointerEnter(staffIcon)
      group = screen.getByRole('menu', { name: 'Instancias de Staff' })
      expect(within(group).getAllByRole('menuitem')).toHaveLength(1)
      fireEvent.auxClick(staffIcon, { button: 1 })
      expect(screen.queryByRole('menu', { name: 'Instancias de Staff' })).not.toBeInTheDocument()
      expect(screen.getByRole('dialog', { name: 'Player action' })).toBeInTheDocument()
    } finally {
      modal.remove()
    }
  })

  it('retains distinct staff dossiers, with names and individual actions', () => {
    mountTaskbar()
    act(() => {
      navigateToStaff('staff:first' as StaffPersonId)
      navigateToStaff('staff:second' as StaffPersonId)
    })
    fireEvent.pointerEnter(screen.getByRole('button', { name: /^Staff$/ }))
    const list = screen.getByRole('menu', { name: 'Instancias de Staff' })
    fireEvent.click(within(list).getByRole('menuitem', { name: 'staff:first' }))
    expect(new URL(window.location.href).searchParams.get('staffId')).toBe('staff:first')
  })
  it('opens on icon hover, without extra number controls, and preserves the menu while hovering it', () => {
    mountTaskbar()
    act(() => {
      navigateToPlayer('player:alpha' as PlayerId)
      navigateToPlayer('player:beta' as PlayerId)
    })
    const icon = screen.getByRole('button', { name: /^Player$/ })
    expect(screen.queryByRole('button', { name: /Ver 2 instancias/ })).not.toBeInTheDocument()
    fireEvent.pointerEnter(icon)
    const list = screen.getByRole('menu', { name: 'Instancias de Player' })
    expect(within(list).getAllByRole('menuitem')).toHaveLength(2)
    fireEvent.pointerLeave(icon)
    fireEvent.pointerEnter(list)
    expect(list).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('menu', { name: 'Instancias de Player' })).not.toBeInTheDocument()
  })

})
