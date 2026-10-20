// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { createF2Day0 } from '@/app/game/testSupport/PlayableF2Support'
import type { GameWorld } from '@/domain/world'
import type { TeamId } from '@/domain/ids'
import { getFreeAgents } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { useGameStore } from '@/stores/gameStore'
import { MarketWorkspace } from '@/ui-ng/applications/market/MarketWorkspace'
import { buildMarketOperationsHistory } from './marketOperationsHistory'
import { buildMarketViability } from './marketViability'

/** F3 · the Courtside Market lets the manager go from a sporting need to the economic verdict without leaving the screen. */
afterEach(cleanup)
beforeEach(() => {
  window.history.replaceState({}, '', '/?ui=ng&app=market')
  useGameStore.getState().resetGame()
})

let day0: GameWorld
// The New Game career of UCAM Murcia after its first match (27 Sep): opening treasury, synthetic free agents, uncapped rules, squad needs.
const career = () => day0
beforeAll(async () => { day0 = await createF2Day0() }, 300_000)

describe('F3 · Courtside Market: needs, economics and operations', () => {
  it('shows the squad needs with a way to search the free agents that cover them', () => {
    const world = career()
    useGameStore.getState().replaceWorld(world)
    render(<MarketWorkspace />)
    const needs = screen.getByTestId('market-needs')
    expect(within(needs).getByText('NECESIDADES DE PLANTILLA')).toBeInTheDocument()
    const search = within(needs).getAllByRole('button').find((button) => /Buscar agentes libres/.test(button.textContent ?? ''))
    expect(search).toBeDefined()
    fireEvent.click(search!)
    expect(screen.getByLabelText('Contrato')).toHaveValue('FREE')
    expect(screen.getByLabelText('Posición')).not.toHaveValue('ALL')
  })

  it('lists the identified synthetic free agents and states the economics of a candidate whose price is still unknown (never zero)', () => {
    const world = career()
    useGameStore.getState().replaceWorld(world)
    render(<MarketWorkspace />)
    fireEvent.change(screen.getByLabelText('Contrato'), { target: { value: 'FREE' } })
    expect(screen.getAllByText(/\[sintético\]/).length).toBeGreaterThan(0)
    const panel = screen.getAllByLabelText('Viabilidad económica')[0]!
    expect(within(panel).getByText('Pendiente de datos')).toBeInTheDocument()
    expect(within(panel).getAllByText('Desconocido').length).toBeGreaterThan(0)
    expect(within(panel).getByText('Presupuesto salarial autorizado')).toBeInTheDocument()
    expect(within(panel).getByText('Tesorería (no es margen salarial)')).toBeInTheDocument()
    expect(panel.textContent).not.toContain('0 €') // an unknown amount is shown as unknown
  })

  it('opens the dossier of a free agent from the search and offers contact whether or not a squad need recommends him', () => {
    const world = career()
    useGameStore.getState().replaceWorld(world)
    render(<MarketWorkspace />)
    fireEvent.change(screen.getByLabelText('Contrato'), { target: { value: 'FREE' } })
    fireEvent.change(screen.getByLabelText('Posición'), { target: { value: 'SG' } })
    fireEvent.click(screen.getAllByRole('button', { name: /Contactar agente libre/ })[0]!)
    const dialog = screen.getByRole('dialog', { name: 'Contacto con agente libre' })
    expect(within(dialog).getByText('Evaluado')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Viabilidad económica')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Contact player' })).toBeInTheDocument()
  })

  it('shows the outcome of a command that an authority refused, instead of failing silently', () => {
    const world = career()
    useGameStore.getState().replaceWorld(world)
    render(<MarketWorkspace />)
    const team = getUserTeam(world)!
    const stranger = getFreeAgents(world)[0]!
    useGameStore.getState().contactFreeAgent(team.id, stranger.id, 'proposal:that-does-not-exist')
    expect(useGameStore.getState().marketNotice?.kind).toBe('error')
  })

  it('the operations tab keeps negotiations apart from the history of executed operations', () => {
    const world = career()
    useGameStore.getState().replaceWorld(world)
    window.history.replaceState({}, '', '/?ui=ng&app=market&marketTab=operations')
    render(<MarketWorkspace initialTab="operations" />)
    const history = screen.getByTestId('market-history')
    expect(within(history).getByText(/Aún no se ha ejecutado ninguna operación/)).toBeInTheDocument()
    expect(buildMarketOperationsHistory(world, getUserTeam(world)!.id)).toHaveLength(0)
  })
})

describe('F3 · market viability model', () => {
  let world: GameWorld
  let teamId: TeamId
  beforeAll(() => { world = career(); teamId = getUserTeam(world)!.id })
  it('authorized − committed = margin, in major units, and cash is reported separately', () => {
    const view = buildMarketViability(world, teamId, { annualSalary: 100_000, years: 3 })
    expect(view.marginMajor).toBe(view.authorizedMajor! - view.committedMajor! - view.reservedMajor!)
    expect(view.totalContractMajor).toBe(300_000)
    expect(view.cashMajor).not.toBe(view.marginMajor)
    expect(view.verdict).toBe('VIABLE')
  })
  it('refuses a salary above the margin with Finance\'s own status even though the treasury could pay it', () => {
    const margin = buildMarketViability(world, teamId).marginMajor!
    const view = buildMarketViability(world, teamId, { annualSalary: margin + 1, years: 1 })
    expect(view).toMatchObject({ verdict: 'NOT_VIABLE', financeStatus: 'INSUFFICIENT_AUTHORIZED_HEADROOM' })
    expect(view.cashMajor!).toBeGreaterThan(margin)
  })
  it('reports an unknown price as unknown', () => {
    expect(buildMarketViability(world, teamId)).toMatchObject({ verdict: 'UNKNOWN', annualSalaryMajor: null, totalContractMajor: null })
  })
})
