// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { createNewGame } from '@/app/game'
import { addDays } from '@/domain/date'
import { updateGameWorld } from '@/domain/world'
import { createPlayerContract } from '@/domain/contract'
import { contractIdFromString } from '@/domain/ids'
import { createRetentionNegotiation, retentionNegotiationIdFor } from '@/domain/contract/ContractRetentionNegotiation'
import { getUserTeam } from '@/engine/calendar'
import { useGameStore } from '@/stores/gameStore'
import { ContractsWorkspace } from './ContractsWorkspace'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('ContractsWorkspace', () => {
  it('shows current roster contracts and makes canonical expiring intent actionable', () => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    const playerId = team.rosterPlayerIds[0]!
    const contract = Object.values(base.contractsById).find((item) => item.teamId === team.id && item.playerId === playerId)!
    const expiring = { ...contract, term: { ...contract.term, expiresOn: addDays(base.currentDate, 90) } }
    const world = updateGameWorld(base, { contracts: Object.values(base.contractsById).map((item) => item.id === contract.id ? expiring : item) })
    useGameStore.getState().replaceWorld(world)

    render(<ContractsWorkspace />)
    expect(screen.getByRole('heading', { name: 'Current roster contracts' })).toBeInTheDocument()
    expect(screen.getByText(`${base.players[playerId]!.firstName} ${base.players[playerId]!.lastName}`)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Expiring' }))
    expect(screen.getByRole('heading', { name: 'Expiring and planning' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(`Planning intent for ${base.players[playerId]!.firstName} ${base.players[playerId]!.lastName}`), { target: { value: 'PURSUE_EXTENSION' } })
    expect(Object.values(useGameStore.getState().world!.contractReviewDecisionsById)).toContainEqual(expect.objectContaining({ contractId: contract.id, intent: 'PURSUE_EXTENSION' }))
    fireEvent.click(screen.getByRole('button', { name: 'Negotiations' }))
    const negotiationArticle = screen.getByRole('article', { name: `${base.players[playerId]!.firstName} ${base.players[playerId]!.lastName} retention` })
    fireEvent.click(within(negotiationArticle).getByRole('button', { name: 'Open negotiation' }))
    expect(Object.values(useGameStore.getState().world!.retentionNegotiationsById)).toContainEqual(expect.objectContaining({ predecessorContractId: contract.id, status: 'OPEN' }))
  })

  it('previews a release and executes only after explicit confirmation through the canonical service', () => {
    const world = createNewGame()
    const team = getUserTeam(world)!
    const playerId = team.rosterPlayerIds[0]!
    useGameStore.getState().replaceWorld(world)
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<ContractsWorkspace />)
    fireEvent.click(screen.getByRole('button', { name: 'Release / risk' }))
    fireEvent.change(screen.getByLabelText('Player'), { target: { value: playerId } })
    expect(screen.getByRole('heading', { name: 'Release preview' })).toBeInTheDocument()
    expect(screen.getByText(/Guaranteed Finance schedule:/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Execute release' }))
    expect(window.confirm).toHaveBeenCalled()
    expect(useGameStore.getState().world!.teams[team.id]!.rosterPlayerIds).not.toContain(playerId)
    expect(Object.values(useGameStore.getState().world!.playerTransactionsById).some((item) => item.kind === 'released' && item.playerId === playerId)).toBe(true)
  })

  it('shows a future successor distinctly from the current contract', () => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    const predecessor = Object.values(base.contractsById).find((item) => item.teamId === team.id)!
    const successor = createPlayerContract({ id: contractIdFromString(`hub-successor:${predecessor.id}`), playerId: predecessor.playerId, teamId: team.id, kind: 'standard', predecessorContractId: predecessor.id, term: { startsOn: predecessor.term.expiresOn, expiresOn: addDays(predecessor.term.expiresOn, 365) }, compensation: { annualSalary: 2_000_000, years: [{ cashSalary: 2_000_000, capTreatment: { policy: 'NOT_APPLICABLE' }, guaranteedAmount: 1_000_000 }] } })
    useGameStore.getState().replaceWorld(updateGameWorld(base, { contracts: [...Object.values(base.contractsById), successor] }))
    render(<ContractsWorkspace />)
    fireEvent.click(screen.getByRole('button', { name: 'Signed future' }))
    expect(screen.getByRole('heading', { name: 'Signed for future' })).toBeInTheDocument()
    expect(screen.getByText('Successor of contract ending ' + predecessor.term.expiresOn)).toBeInTheDocument()
    expect(screen.getByText(/Future guaranteed exposure/)).toBeInTheDocument()
  })

  it('keeps accepted unsupported terms visible and blocks the signing action', () => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    const predecessor = Object.values(base.contractsById).find((item) => item.teamId === team.id)!
    const negotiationId = retentionNegotiationIdFor(team.id, predecessor.playerId, predecessor.id, 'hub-unsupported')
    const negotiation = createRetentionNegotiation({ id: negotiationId, openingActionId: 'hub-unsupported', teamId: team.id, organizationId: team.organizationId, playerId: predecessor.playerId, predecessorContractId: predecessor.id, openedOn: base.currentDate, openedByCoachId: team.coachId!, status: 'ACCEPTED', acceptedTerms: { salary: predecessor.compensation.annualSalary, years: 1, options: [{ year: 1, type: 'PLAYER', decisionAuthority: 'PLAYER' }] }, rounds: [] })
    const world = updateGameWorld(base, { retentionNegotiations: [negotiation] })
    expect(world.retentionNegotiationsById[negotiationId]).toBeDefined()
    useGameStore.getState().replaceWorld(world)
    render(<ContractsWorkspace />)
    fireEvent.click(screen.getByRole('button', { name: 'Negotiations' }))
    const playerArticle = screen.getByRole('article', { name: `${base.players[predecessor.playerId]!.firstName} ${base.players[predecessor.playerId]!.lastName} retention` })
    expect(playerArticle.textContent).toMatch(/accepted in principle terms.*year 1 player option/i)
    expect(playerArticle.textContent).toMatch(/signing blocked: accepted terms include options/i)
    expect(screen.queryByRole('button', { name: /Request signing approval/ })).not.toBeInTheDocument()
  })
})
