// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { useGameStore } from '@/stores/gameStore'
import { Taskbar } from '@/ui-ng/system/Taskbar'
import { NgWorkspaceNavigationProvider } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'

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
