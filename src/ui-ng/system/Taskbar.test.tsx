// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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
    navigateToPlayer('player:alpha' as PlayerId)
    navigateToPlayer('player:beta' as PlayerId)
    fireEvent.click(screen.getByRole('button', { name: 'Ver 2 instancias de Player' }))
    const list = screen.getByRole('menu', { name: 'Instancias de Player' })
    expect(within(list).getByRole('menuitem', { name: 'player:alpha' })).toBeInTheDocument()
    expect(within(list).getByRole('menuitem', { name: 'player:beta' })).toBeInTheDocument()
    fireEvent.click(within(list).getByRole('button', { name: 'Cerrar player:beta' }))
    expect(window.location.search).toContain('playerId=player%3Aalpha')
    expect(screen.getByRole('button', { name: 'Ver 1 instancias de Player' })).toBeInTheDocument()
    fireEvent.click(within(list).getByRole('menuitem', { name: 'player:alpha' }))
    expect(window.location.search).toContain('playerId=player%3Aalpha')
  })

  it('closes all player instances on the dock icon without affecting staff', () => {
    mountTaskbar()
    navigateToPlayer('player:alpha' as PlayerId)
    navigateToPlayer('player:beta' as PlayerId)
    navigateToStaff('staff:alpha' as StaffPersonId)
    fireEvent.click(screen.getByRole('button', { name: 'Player', exact: true }))
    expect(screen.queryByRole('button', { name: 'Ver 2 instancias de Player' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver 1 instancias de Staff' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Staff', exact: true }))
    expect(screen.queryByRole('button', { name: 'Ver 1 instancias de Staff' })).not.toBeInTheDocument()
  })

  it('retains distinct staff dossiers, with names and individual actions', () => {
    mountTaskbar()
    navigateToStaff('staff:first' as StaffPersonId)
    navigateToStaff('staff:second' as StaffPersonId)
    fireEvent.click(screen.getByRole('button', { name: 'Ver 2 instancias de Staff' }))
    const list = screen.getByRole('menu', { name: 'Instancias de Staff' })
    fireEvent.click(within(list).getByRole('menuitem', { name: 'staff:first' }))
    expect(new URL(window.location.href).searchParams.get('staffId')).toBe('staff:first')
  })
})
