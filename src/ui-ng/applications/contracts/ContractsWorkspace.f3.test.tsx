// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { createConfiguredGame } from '@/app/game/createConfiguredGame'
import { ACB_TEST_UNIVERSE_ID } from '@/data/acb2026'
import { useGameStore } from '@/stores/gameStore'
import { ContractsWorkspace } from './ContractsWorkspace'

afterEach(cleanup)
beforeEach(() => {
  window.history.replaceState({}, '', '/?ui=ng&app=contracts')
  useGameStore.getState().resetGame()
})

describe('F3 · Contracts shows the continuity picture of every active contract', () => {
  it('lists remaining duration, the renewal window and the guaranteed obligations ahead for the manager\'s club', () => {
    const world = createConfiguredGame({ universeId: ACB_TEST_UNIVERSE_ID, userTeamKey: 'ucm' })
    useGameStore.getState().replaceWorld(world)
    render(<ContractsWorkspace />)
    expect(screen.getAllByTestId('contract-remaining')).toHaveLength(16)
    expect(screen.getAllByTestId('contract-continuity')).toHaveLength(16)
    // The earliest contract ends on 2028-07-01; its 365-day window opens on 2027-07-02 (leap year), and every other one opens later.
    expect(screen.getAllByText('Renewal window opens 2027-07-02').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/^Remaining \d+ a \d+ m$/)[0]).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('Renewal window open\n') // no window is open at the start of the career
  })
})
