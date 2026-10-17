// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { createNewGame } from '@/app/game'
import { getUserTeam } from '@/engine/calendar'
import { useGameStore } from '@/stores/gameStore'
import { MarketWorkspace } from '@/ui-ng/applications/market/MarketWorkspace'

afterEach(cleanup)
beforeEach(() => {
  window.history.replaceState({}, '', '/?ui=ng&app=market')
  useGameStore.getState().resetGame()
})

function mount() {
  const world = createNewGame()
  useGameStore.getState().replaceWorld(world)
  return { ...render(<MarketWorkspace />), world }
}

describe('Courtside Market command centre', () => {
  it('opens the live organisation overview without displaying hidden player ratings', () => {
    const { world } = mount()
    const team = getUserTeam(world)!
    const rosterPlayer = world.players[team.rosterPlayerIds[0]!]!
    expect(screen.getByTestId('market-command-centre')).toBeInTheDocument()
    expect(screen.getByText('Actividad de mercado')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain(JSON.stringify(rosterPlayer.basketball.ratings))
  })

  it('preserves the free-agent search and negotiation actions in dedicated tabs', () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Agentes libres' }))
    expect(screen.getByLabelText('Search free agents')).toBeInTheDocument()
    expect(screen.getByLabelText('Filter market by position')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Operaciones' }))
    expect(screen.getByRole('region', { name: 'Free-agent negotiations' })).toBeInTheDocument()
  })

  it('opens the canonical scouting workspace from the market hub', () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Scouting →' }))
    expect(new URLSearchParams(window.location.search).get('app')).toBe('scouting')
  })

  it('opens an evidence-aware explorer and its temporary decision board', () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Explorar →' }))
    expect(screen.getByTestId('market-explore')).toBeInTheDocument()
    expect(screen.getByLabelText('Candidatos de mercado')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Objetivos' }))
    expect(screen.getByTestId('market-targets')).toBeInTheDocument()
  })

  it('uses contract planning horizons and never invented future contracts', () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Planificación' }))
    expect(screen.getByTestId('market-planning')).toBeInTheDocument()
    expect(screen.getByLabelText('Horizonte de plantilla')).toBeInTheDocument()
    expect(screen.getByText('Mapa de profundidad')).toBeInTheDocument()
  })

  it('opens real player and staff budgets with a salary-affordability check', () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir presupuesto de mercado' }))
    expect(screen.getByRole('dialog', { name: 'Presupuesto y decisiones de mercado' })).toBeInTheDocument()
    expect(screen.getByText('SALARIOS STAFF')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Salario anual propuesto'), { target: { value: '0' } })
    expect(screen.getByText('Dentro del margen salarial')).toBeInTheDocument()
  })

  it('adds market candidates through a compact target selection dialog', () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Objetivos' }))
    fireEvent.click(screen.getByRole('button', { name: '+ Añadir objetivo' }))
    expect(screen.getByRole('dialog', { name: 'Añadir objetivos' })).toBeInTheDocument()
    expect(screen.getByLabelText('Buscar jugador para objetivo')).toBeInTheDocument()
  })

  it('still deep-links to a free-agent dossier when a player id is provided', () => {
    window.history.replaceState({}, '', '/?ui=ng&app=market&playerId=free-agent-target')
    mount()
    expect(screen.getByLabelText('Search free agents')).toBeInTheDocument()
  })
})
