// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { createF3Day0, f3AdvanceDay, f3Store, f3World } from '@/app/game/testSupport/PlayableF3Support'
import { f3PlayTransfer, f3TransferCandidates, f3TransferFor } from '@/app/game/testSupport/PlayableF3TransferSupport'
import type { PlayerId } from '@/domain/ids'
import { getFreeAgents, type GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { initializeFreeAgentMarketTruth } from '@/engine/market'
import { assessSellerAskingFee } from '@/engine/transfer'
import { useGameStore } from '@/stores/gameStore'
import { PlayerContractOpportunities } from '@/ui-ng/applications/player/components/PlayerContractOpportunities'
import { MarketWorkspace } from '@/ui-ng/applications/market/MarketWorkspace'
import { buildMarketOperationsHistory } from './marketOperationsHistory'

/** F3 adendo · the Courtside screens start, follow and finish a transfer and a custom free-agent offer with real commands only. */
vi.setConfig({ testTimeout: 600_000, hookTimeout: 900_000 })
afterEach(cleanup)
beforeEach(() => { window.history.replaceState({}, '', '/?ui=ng&app=market') })

let day0: GameWorld
beforeAll(async () => { day0 = await createF3Day0(); f3Store().replaceWorld(day0) }, 900_000)
const willing = (id: PlayerId) => initializeFreeAgentMarketTruth(day0, [id]).marketRealityByPlayerId[id]!.playerWillingness >= 50

describe('F3 adendo · Market: buscar a cualquier jugador y contactar con su club', () => {
  it('the search offers the contracted players of the whole league with contract-expiry and willingness filters, and a rival player starts a purchase from his club', () => {
    f3Store().replaceWorld(day0)
    render(<MarketWorkspace />)
    expect(screen.getByLabelText('Vence antes de')).toBeInTheDocument()
    expect(screen.getByLabelText('Disponibilidad para negociar')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Contrato'), { target: { value: 'ROSTERED' } })
    const heading = screen.getByText(/BUSCAR JUGADORES · \d+/)
    expect(Number(heading.textContent!.match(/\d+/)![0])).toBeGreaterThan(100) // every club of the league, not only free agents
    const playerId = f3TransferCandidates(day0)[0]!
    const player = day0.players[playerId]!
    fireEvent.change(screen.getByLabelText('Buscar jugadores'), { target: { value: `${player.firstName} ${player.lastName}` } })
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(`${player.firstName} ${player.lastName}`) })[0]!)
    const panel = screen.getByLabelText('Compra a otro club')
    const owner = Object.values(day0.teams).find((team) => team.rosterPlayerIds.includes(playerId))!
    expect(within(panel).getByTestId('transfer-owner')).toHaveTextContent(owner.name)
    // The seller's price is private: nothing on screen reveals it before the club answers.
    const ask = assessSellerAskingFee(day0, owner.id, playerId)!
    expect(panel.textContent).not.toContain(String(ask.askingFee))
    expect(within(panel).getByText('Autorización para compensaciones')).toBeInTheDocument()
    expect(within(panel).getByText(/El salario se negocia después con el jugador/)).toBeInTheDocument()
  })

  it('proposing a compensation creates the negotiation with the club, which follows in Operaciones and can be withdrawn without any movement', () => {
    f3Store().replaceWorld(day0)
    const team = getUserTeam(day0)!
    const playerId = f3TransferCandidates(day0)[1]!
    const player = day0.players[playerId]!
    render(<MarketWorkspace />)
    fireEvent.change(screen.getByLabelText('Contrato'), { target: { value: 'ROSTERED' } })
    fireEvent.change(screen.getByLabelText('Buscar jugadores'), { target: { value: `${player.firstName} ${player.lastName}` } })
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(`${player.firstName} ${player.lastName}`) })[0]!)
    const panel = screen.getByLabelText('Compra a otro club')
    fireEvent.change(within(panel).getByLabelText('Compensación propuesta'), { target: { value: '90000' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Contactar con el club y proponer' }))
    const transfer = f3TransferFor(team.id, playerId)!
    expect(transfer).toMatchObject({ status: 'IN_PROGRESS', clubStatus: 'AWAITING_CLUB_RESPONSE' })
    expect(transfer.clubRounds[0]!.fee).toBe(90_000)
    cleanup()
    window.history.replaceState({}, '', '/?ui=ng&app=market&marketTab=operations')
    render(<MarketWorkspace initialTab="operations" />)
    const section = screen.getByTestId('market-transfers')
    expect(within(section).getByTestId('transfer-state')).toHaveTextContent('Esperando la respuesta del club')
    fireEvent.click(within(section).getByRole('button', { name: 'Retirar la operación' }))
    expect(f3World().playerTransferNegotiationsById[transfer.id]).toMatchObject({ status: 'CLOSED', closeReason: 'WITHDRAWN_BY_BUYER' })
    expect(f3World().teams[team.id]!.rosterPlayerIds).toEqual(day0.teams[team.id]!.rosterPlayerIds)
  })

  it('with the clubs and the player agreed, Operaciones shows the agreed terms, the pending authorization and the economic viability; the buttons are the real commands', () => {
    f3Store().replaceWorld(day0)
    const team = getUserTeam(day0)!
    const candidates = f3TransferCandidates(day0, 40).filter(willing)
    const outcome = f3PlayTransfer(candidates[0]!, { stopBefore: 'GOVERNANCE' })
    expect(outcome.stoppedAt).toBe('READY_FOR_GOVERNANCE')
    const transfer = f3TransferFor(team.id, candidates[0]!)!
    window.history.replaceState({}, '', '/?ui=ng&app=market&marketTab=operations')
    render(<MarketWorkspace initialTab="operations" />)
    const entry = screen.getByTestId('market-transfers')
    expect(within(entry).getByTestId('transfer-agreed-fee')).toHaveTextContent('Compensación acordada entre clubes')
    expect(within(entry).getByTestId('transfer-agreed-terms')).toBeInTheDocument()
    expect(within(entry).getByLabelText('Viabilidad económica del salario')).toBeInTheDocument()
    expect(within(entry).getByTestId('transfer-governance')).toHaveTextContent('Sin solicitar')
    expect(within(entry).queryByRole('button', { name: 'Completar traspaso' })).toBeNull()
    fireEvent.click(within(entry).getAllByRole('button', { name: /Solicitar autorización/ })[0]!)
    expect(f3World().governanceDecisionsById[f3World().playerTransferNegotiationsById[transfer.id]!.governanceDecisionId!]).toBeDefined()
    // Complete after the Board decided, through the visible button, and see it in the history of operations.
    f3AdvanceDay()
    cleanup()
    render(<MarketWorkspace initialTab="operations" />)
    fireEvent.click(within(screen.getByTestId('market-transfers')).getByRole('button', { name: 'Completar traspaso' }))
    expect(f3World().playerTransferNegotiationsById[transfer.id]!.status).toBe('EXECUTED')
    expect(f3World().teams[team.id]!.rosterPlayerIds).toContain(candidates[0]!)
    cleanup()
    render(<MarketWorkspace initialTab="operations" />)
    expect(within(screen.getByTestId('market-transfers')).getByTestId('transfer-executed')).toBeInTheDocument()
    const rows = buildMarketOperationsHistory(f3World(), team.id)
    expect(rows.some((row) => row.kind === 'TRASPASO' && row.playerId === candidates[0])).toBe(true)
    expect(within(screen.getByTestId('market-history')).getByText('TRASPASO')).toBeInTheDocument()
  })
})

describe('F3 adendo · Market: oferta a medida a un agente libre', () => {
  it('after the contact answer the manager writes salary, years and role; the offer is exactly what he typed and the answer comes from the real engine', () => {
    f3Store().replaceWorld(day0)
    const team = getUserTeam(day0)!
    const free = getFreeAgents(day0).map((player) => player.id).find(willing)!
    f3Store().contactFreeAgentDirectly(team.id, free)
    f3AdvanceDay()
    window.history.replaceState({}, '', '/?ui=ng&app=market&marketTab=operations')
    render(<MarketWorkspace initialTab="operations" />)
    const form = screen.getByRole('form', { name: 'Oferta a medida' })
    expect(within(form).getByText(/el modelo de contratos no admite otra fecha de inicio/)).toBeInTheDocument()
    const negotiation = Object.values(f3World().negotiationsById).find((item) => item.playerId === free)!
    fireEvent.change(within(form).getByLabelText(`Salario ofrecido ${negotiation.id}`), { target: { value: '123000' } })
    fireEvent.change(within(form).getByLabelText(`Años ofrecidos ${negotiation.id}`), { target: { value: '3' } })
    fireEvent.change(within(form).getByLabelText(`Rol prometido ${negotiation.id}`), { target: { value: 'STARTER' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Presentar oferta' }))
    const offered = f3World().negotiationsById[negotiation.id]!
    expect(useGameStore.getState().marketNotice?.text ?? '').not.toMatch(/Operación no realizada|bloqueada|rechaza/)
    expect(offered).toMatchObject({ status: 'OPEN', salary: 123_000, years: 3, role: 'STARTER' })
  })
})

describe('F3 adendo · ficha del jugador: la compra y el contacto estan cableados', () => {
  it('a rival player\'s Contract tab starts the purchase from his club; the fake contact-route previews are gone', () => {
    f3Store().replaceWorld(day0)
    const playerId = f3TransferCandidates(day0)[2]!
    render(<PlayerContractOpportunities world={day0} playerId={playerId} playerName="Rival" onScouting={() => undefined} />)
    expect(screen.getByLabelText('Compra a otro club')).toBeInTheDocument()
    expect(screen.queryByText(/PLANNED RPG FEATURE/)).toBeNull()
    expect(screen.queryByText(/PREVIEW ONLY/)).toBeNull()
  })

  it('a free agent\'s Contract tab points to the free-agent market instead of a club purchase', () => {
    const free = getFreeAgents(day0)[0]!
    render(<PlayerContractOpportunities world={day0} playerId={free.id} playerName="Libre" onScouting={() => undefined} />)
    expect(screen.queryByLabelText('Compra a otro club')).toBeNull()
    expect(screen.getByRole('button', { name: /ABRIR MERCADO DE AGENTES LIBRES/ })).toBeInTheDocument()
  })
})
