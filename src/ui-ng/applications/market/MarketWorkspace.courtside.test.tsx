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
  it('opens without financial budgets or a newly introduced target collection in older world data', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const older = { ...world,
      teamFinancesByTeamId: Object.fromEntries(
        Object.entries(world.teamFinancesByTeamId).filter(([id]) => id !== team.id)),
      marketTargetsById: undefined,
    } as unknown as typeof world
    useGameStore.getState().replaceWorld(older)
    render(<MarketWorkspace />)
    expect(screen.getByTestId('market-explore')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir presupuesto de mercado' }))
    expect(screen.getAllByText('Sin datos financieros')).toHaveLength(2)
    expect(screen.getByRole('dialog', { name: 'Presupuesto y decisiones de mercado' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Salario anual propuesto'), { target: { value: '20000' } })
    expect(screen.getByText('Presupuesto de jugadores no disponible.')).toBeInTheDocument()
  })

  it('opens the live organisation overview without displaying hidden player ratings', () => {
    const { world } = mount()
    const team = getUserTeam(world)!
    const rosterPlayer = world.players[team.rosterPlayerIds[0]!]!
    expect(screen.getByTestId('market-explore')).toBeInTheDocument()
    expect(screen.getByLabelText('Contrato')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain(JSON.stringify(rosterPlayer.basketball.ratings))
  })

  it('uses exactly four primary tabs, with free agents as a contract filter', () => {
    mount()
    const tabs = screen.getByRole('navigation', { name: /tabs/i })
    expect(tabs).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Agentes libres' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Planificación' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Contrato'), { target: { value: 'FREE' } })
    expect(screen.getByLabelText('Contrato')).toHaveValue('FREE')
    expect(screen.getByRole('option', { name: 'Vence en 6 meses' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Operaciones' }))
    expect(screen.getByRole('region', { name: 'Free-agent negotiations' })).toBeInTheDocument()
  })

  it('opens scouting inside Market without a second application shell', () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Scouting' }))
    expect(screen.getByTestId('scouting-war-room')).toBeInTheDocument()
    expect(new URLSearchParams(window.location.search).get('app')).toBe('market')
    expect(screen.getByRole('navigation', { name: 'Gestión de scouting' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Focos' }))
    expect(screen.getByRole('heading', { name: 'Focos de reclutamiento' })).toBeInTheDocument()
  })

  it('keeps recruitment targets and canonical contract horizons in one tab', () => {
    mount()
    expect(screen.getByLabelText('Candidatos de mercado')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Objetivos' }))
    expect(screen.getByTestId('market-targets')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Planificación' }))
    expect(screen.getByTestId('market-planning')).toBeInTheDocument()
    expect(screen.getByLabelText('Horizonte de plantilla')).toBeInTheDocument()
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

  it('adds a persistent objective and allows user-controlled priority changes', () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Objetivos' }))
    fireEvent.click(screen.getByRole('button', { name: '+ Añadir objetivo' }))
    const add = screen.getAllByRole('button', { name: 'Añadir' })[0]
    expect(add).toBeDefined()
    fireEvent.click(add!)
    const world = useGameStore.getState().world!
    expect(Object.values(world.marketTargetsById)).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar selector' }))
    const stored = screen.getByRole('region', { name: 'Objetivos guardados' })
    expect(stored).toBeInTheDocument()
    const priority = screen.getAllByLabelText(/^Prioridad /)[0]!
    fireEvent.change(priority, { target: { value: 'HIGH' } })
    expect(Object.values(useGameStore.getState().world!.marketTargetsById)[0]!.priority).toBe('HIGH')
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }))
    expect(Object.values(useGameStore.getState().world!.marketTargetsById)[0]!.knowledgeSnapshots).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Comparar' }))
    expect(screen.getByText('Hasta tres jugadores')).toBeInTheDocument()
  })

  it('still deep-links to a free-agent dossier when a player id is provided', () => {
    window.history.replaceState({}, '', '/?ui=ng&app=market&playerId=free-agent-target')
    mount()
    expect(screen.getByTestId('market-explore')).toBeInTheDocument()
  })
})
