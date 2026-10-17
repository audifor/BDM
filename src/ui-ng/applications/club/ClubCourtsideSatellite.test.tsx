// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { createNewGame } from '@/app/game'
import { useGameStore } from '@/stores/gameStore'
import { NgWorkspaceNavigationProvider } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'

import { BoardWorkspace } from '@/ui-ng/applications/board/BoardWorkspace'
import { FinancesWorkspace } from '@/ui-ng/applications/finances/FinancesWorkspace'
import { FacilitiesWorkspace } from '@/ui-ng/applications/facilities/FacilitiesWorkspace'

afterEach(cleanup)
beforeEach(() => {
  window.history.replaceState({}, '', '/?ui=ng&app=club')
  useGameStore.getState().resetGame()
})

function renderWorkspace(workspace: React.ReactNode) {
  useGameStore.getState().replaceWorld(createNewGame())
  return render(<NgWorkspaceNavigationProvider>{workspace}</NgWorkspaceNavigationProvider>)
}

describe('Courtside club satellite views', () => {
  it('keeps the canonical Board decisions and Requests in a two-column Courtside layout', () => {
    renderWorkspace(<BoardWorkspace />)
    const root = document.querySelector('[data-ng-region="board-workspace"]')
    expect(root).toHaveClass('cs-club-management', 'cs-club-board')
    fireEvent.click(screen.getByRole('button', { name: 'Governance' }))
    expect(root?.querySelector('.cs-board__governance-layout')).not.toBeNull()
    expect(root?.querySelector('[data-ng-region="board-governance-queue"]')).not.toBeNull()
    expect(root?.querySelector('[data-ng-region="board-governance-requests"]')).not.toBeNull()
  })

  it('offers instant access to every canonical finance section without losing navigation', () => {
    renderWorkspace(<FinancesWorkspace />)
    const root = document.querySelector('[data-ng-region="finances-workspace"]')
    expect(root).toHaveClass('cs-club-management', 'cs-club-finances')
    const jump = screen.getByRole('combobox', { name: 'Ir a área financiera' })
    expect(jump.querySelectorAll('option')).toHaveLength(14)
    fireEvent.change(jump, { target: { value: 'cap' } })
    expect(screen.getByRole('heading', { name: 'Salary cap' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cash flow' }))
    expect(jump).toHaveValue('cash')
  })

  it('makes facility priorities visible and moves secondary KPIs to an expandable detail', () => {
    renderWorkspace(<FacilitiesWorkspace />)
    const root = document.querySelector('[data-ng-region="facilities-workspace"]')
    expect(root).toHaveClass('cs-club-management', 'cs-club-facilities')
    const summary = root?.querySelector('.cs-facilities__summary')
    expect(summary?.querySelectorAll('.cs-facilities__primary .ng-canon__metric')).toHaveLength(4)
    const extra = screen.getByText('Ver indicadores adicionales')
    const details = extra.closest('details')
    expect(details).not.toHaveAttribute('open')
    fireEvent.click(extra)
    expect(details).toHaveAttribute('open')
    expect(screen.getByText('Capital committed')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Projects' }))
    expect(root?.querySelector('[data-ng-region="facilities-projects"]')).not.toBeNull()
  })
})
