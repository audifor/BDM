// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { getBoardSummary } from '@/engine/board'
import { getUserTeam } from '@/engine/calendar'
import { useGameStore } from '@/stores/gameStore'
import { NgWorkspaceNavigationProvider } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'
import { BoardWorkspace } from './BoardWorkspace'

afterEach(cleanup)
beforeEach(() => {
  window.history.replaceState({}, '', '/?ui=ng&app=board')
  useGameStore.getState().resetGame()
})
function mount() {
  const world = createNewGame()
  useGameStore.getState().replaceWorld(world)
  render(<NgWorkspaceNavigationProvider><BoardWorkspace /></NgWorkspaceNavigationProvider>)
  return world
}
function select(label: string) {
  fireEvent.click(screen.getByRole('button', { name: label }))
}
describe('Courtside Board scope and canonical integration', () => {
  it('keeps a compact situational overview on real Board data, not placeholder confidence', () => {
    const world = mount()
    const team = getUserTeam(world)!
    const summary = getBoardSummary(world, team.id)!
    const board = screen.getByText('Confidence').closest('[data-ng-region="board-courtside-overview"]')
    expect(board).not.toBeNull()
    expect(board).toHaveTextContent(String(summary.state.confidence))
    expect(board).toHaveTextContent(summary.state.expectation.summary)
    expect(screen.getByText('Governance attention')).toBeInTheDocument()
  })
  it('shows the real Board mandate without manufacturing V2 objectives', () => {
    mount()
    select('Mandate')
    expect(document.querySelector('[data-ng-region="board-courtside-mandate"]')).not.toBeNull()
    expect(screen.getByText('Objetivos institucionales (Governance V2)')).toBeInTheDocument()
    expect(screen.getByText(/Esta institución todavía no tiene objetivos V2 registrados/)).toBeInTheDocument()
  })
  it('covers institutional hierarchy, meetings, requests and commitments even when empty', () => {
    mount()
    select('Boardroom')
    expect(screen.getByText('Órganos y poderes')).toBeInTheDocument()
    expect(screen.getByText('Reuniones del consejo')).toBeInTheDocument()
    select('Requests')
    expect(screen.getByText('Solicitudes de la institución')).toBeInTheDocument()
    expect(screen.getByText('Compromisos y seguimiento')).toBeInTheDocument()
  })
  it('retains the existing canonical decision and history workspaces', () => {
    mount()
    select('Governance')
    expect(document.querySelector('[data-ng-region="board-governance-queue"]')).not.toBeNull()
    select('History')
    expect(screen.getByText('Governance history')).toBeInTheDocument()
    expect(screen.getByText('Confianza: historial de cambios')).toBeInTheDocument()
  })
  it('uses the existing finance read model instead of inventing a transfer envelope', () => {
    mount()
    select('Resources')
    expect(document.querySelector('[data-ng-region="board-courtside-resources"]')).not.toBeNull()
    expect(screen.getByRole('button', { name: /Abrir Finanzas/ })).toBeInTheDocument()
    expect(screen.getByText('Autorizaciones de recursos')).toBeInTheDocument()
  })
})
