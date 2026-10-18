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
import { EnforcementWorkspace } from '@/ui-ng/applications/enforcement/EnforcementWorkspace'

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
    const primaryTabs = root?.querySelectorAll('.ng-workspace-tabs__tab')
    expect(primaryTabs).toHaveLength(5)
    fireEvent.click(screen.getByRole('button', { name: 'Plantilla' }))
    fireEvent.click(screen.getByRole('button', { name: 'Límite salarial' }))
    expect(screen.getByRole('heading', { name: 'Salary cap' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Caja' }))
    fireEvent.click(screen.getByRole('button', { name: 'Movimientos' }))
    expect(screen.getByRole('heading', { name: 'Caja y cobros' })).toBeInTheDocument()
  })

  it('preserves enforcement records while adding an institutional risk summary', () => {
    renderWorkspace(<EnforcementWorkspace />)
    const root = document.querySelector('[data-ng-region="enforcement-workspace"]')
    expect(root).toHaveClass('cs-club-management', 'cs-club-enforcement')
    expect(root?.querySelectorAll('.cs-enforcement__stat')).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: 'Investigations' }))
    expect(screen.getByText('No investigations recorded.')).toBeInTheDocument()
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
