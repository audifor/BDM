// @vitest-environment jsdom
/*
 * MX0.5 — trade negotiation gameplay closure.
 *
 * The product contract: a trade response breakpoint must open the Trades workspace, show the real canonical
 * proposal, expose only the actions the trade service accepts for the stored revision, apply them through
 * `respondToTradeNegotiation` / `startUserTradeCommitment` / `recordTradeCommitmentEvent`, and leave Continue free
 * to advance. Nothing here builds a package by hand: the fixture proposes through the canonical service, exactly as
 * an AI club does, so every assertion is about the product flow rather than a UI fixture.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { createNewGame, evaluateSimulationBreakpoints, getContinueStopReason } from '@/app/game'
import { proposeTradeNegotiation, respondToTradeNegotiation, tradeNegotiationResponseReadiness } from '@/app/trades'
import { staffPersonIdFromString, teamStaffAssignmentIdFromString, type PlayerId } from '@/domain/ids'
import { responsibilityIdForTeam } from '@/domain/responsibility'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import type { TradeProposal } from '@/domain/trade'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { useGameStore } from '@/stores/gameStore'
import { TradesWorkspace } from '@/ui-ng/applications/trades/TradesWorkspace'
import { SystemBar } from '@/ui-ng/system/SystemBar'
import { NgWorkspaceNavigationProvider } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'

afterEach(cleanup)

beforeEach(() => {
  window.history.replaceState({}, '', '/?ui=ng&app=home')
  useGameStore.getState().resetGame()
})

/**
 * The shipped NBA-like competition, a user club, and a rival club that can negotiate through delegated staff. No
 * trade rule is injected: the season-scoped window the shipped NBA-like rule preset declares is what makes the season
 * tradeable. The fixture only selects which club is the user's (the shipped world starts in the FIBA-like
 * competition) and moves the world clock to that season's own opening day.
 */
function createTradeScenario() {
  const base = createNewGame()
  const season = Object.values(base.seasons).find((item) => base.tradeRulesBySeasonId[item.id] !== undefined)!
  const competition = base.competitions[season.competitionId]!
  const userTeamId = competition.participantTeamIds.find((teamId) => base.teams[teamId]!.coachId !== undefined)!
  if (base.tradeRulesBySeasonId[season.id]!.tradeWindow === undefined) throw new Error('The shipped NBA-like season must activate trading on its own')
  const initial = updateGameWorld(base, {
    userCoachId: base.teams[userTeamId]!.coachId!,
    currentSeasonId: season.id,
    currentDate: season.startDate,
    // The generated fixture keeps scheduled games from before this season's start; they are a schedule-integrity
    // breakpoint of their own and would outrank the trade response this suite certifies.
    games: Object.values(base.games).filter((game) => game.status !== 'scheduled' || game.date >= season.startDate),
  })
  const user = getUserTeam(initial)!
  const partner = competition.participantTeamIds.map((teamId) => initial.teams[teamId]!).find((team) => team.id !== user.id)!
  const players = [user.rosterPlayerIds[0]!, user.rosterPlayerIds[1]!, partner.rosterPlayerIds[0]!, partner.rosterPlayerIds[1]!]
  const world = updateGameWorld(initial, {
    contracts: Object.values(initial.contractsById).map((contract) => players.includes(contract.playerId)
      ? { ...contract, compensation: { annualSalary: 1_000_000, years: [{ cashSalary: 1_000_000, capHit: 1_000_000, guaranteedAmount: 1_000_000 }] } }
      : contract),
  })
  const staffPersonId = staffPersonIdFromString(`mx05-negotiator-${partner.id}`)
  const attributes = Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 60])) as Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number>
  const staffed = updateGameWorld(world, {
    staffPeople: [...Object.values(world.staffPeopleById), { id: staffPersonId, identity: { firstName: 'Trade', lastName: 'Negotiator' }, professional: { attributes } }],
    teamStaffAssignments: [...Object.values(world.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString(`mx05-negotiator-assignment-${partner.id}`), staffPersonId, teamId: partner.id, role: 'generalManager' as const, assignedOn: world.currentDate }],
  })
  const delegated = updateGameWorld(staffed, {
    responsibilities: [
      ...Object.values(staffed.responsibilitiesById).filter((item) => item.id !== responsibilityIdForTeam(partner.id, 'negotiatePlayerTrade')),
      { id: responsibilityIdForTeam(partner.id, 'negotiatePlayerTrade'), teamId: partner.id, kind: 'negotiatePlayerTrade' as const, mode: 'delegated' as const, holderStaffId: staffPersonId },
    ],
  })
  const proposal = (): TradeProposal => ({
    id: 'mx05-package',
    ecosystemId: competition.ecosystemId,
    seasonId: season.id,
    participantTeamIds: [user.id, partner.id],
    movements: [
      { asset: { kind: 'player' as const, playerId: players[0]! }, fromTeamId: user.id, toTeamId: partner.id },
      { asset: { kind: 'player' as const, playerId: players[2]! }, fromTeamId: partner.id, toTeamId: user.id },
    ],
  })
  return { world, delegated, user, partner, staffPersonId, proposal, players }
}

/** The canonical incoming package: the rival club proposes to the user through its delegated negotiator. */
function createIncomingProposal() {
  const scenario = createTradeScenario()
  const incoming = proposeTradeNegotiation(scenario.delegated, scenario.proposal(), scenario.partner.id, { kind: 'STAFF', staffPersonId: scenario.staffPersonId })
  if (incoming.status !== 'PROPOSED' || incoming.negotiation === undefined) throw new Error(`Fixture could not propose a trade: ${incoming.status} ${(incoming.reasons ?? []).join(', ')}`)
  return { ...scenario, world: incoming.world, negotiation: incoming.negotiation }
}

function tradesUrl(negotiationId?: string): string {
  return negotiationId === undefined ? '/?ui=ng&app=trades' : `/?ui=ng&app=trades&negotiationId=${encodeURIComponent(negotiationId)}`
}

function mountTrades(world: GameWorld, url = tradesUrl()) {
  window.history.replaceState({}, '', url)
  useGameStore.getState().replaceWorld(world)
  return render(
    <NgWorkspaceNavigationProvider>
      <TradesWorkspace />
    </NgWorkspaceNavigationProvider>,
  )
}

function userResponseCard(): HTMLElement {
  const card = document.querySelector<HTMLElement>('[data-requires-user-response="true"]')
  if (card === null) throw new Error('No negotiation card is asking for the user response')
  return card
}

const playerName = (world: GameWorld, playerId: PlayerId) => `${world.players[playerId]!.firstName} ${world.players[playerId]!.lastName}`

describe('TradesWorkspace trade negotiation closure', () => {
  it('opens the negotiation a breakpoint selected and shows the canonical proposal with legal controls', async () => {
    const scenario = createIncomingProposal()
    const stop = getContinueStopReason(scenario.world)
    expect(stop?.type === 'breakpoint' && stop.breakpoint.reason === 'tradeNegotiationResponse').toBe(true)

    mountTrades(scenario.world, tradesUrl(scenario.negotiation.id))
    const card = within(userResponseCard())

    expect(card.getByText(/Opened from your trade response/)).toBeInTheDocument()
    expect(card.getByText(scenario.partner.name)).toBeInTheDocument()
    // Both sides of the real stored package, taken from the revision rather than from any local draft.
    expect(card.getByText(new RegExp(playerName(scenario.world, scenario.players[0]!)))).toBeInTheDocument()
    expect(card.getByText(new RegExp(playerName(scenario.world, scenario.players[2]!)))).toBeInTheDocument()
    expect(card.getByRole('button', { name: 'Accept' })).toBeInTheDocument()
    expect(card.getByRole('button', { name: 'Reject' })).toBeInTheDocument()
    // The breakpoint loads the stored package into the editor, which is what makes the counter legal.
    await waitFor(() => expect(card.getByRole('button', { name: 'Counter with this package' })).toBeEnabled())
    // The user is the recipient of this revision, so withdrawing is not a legal action for them.
    expect(card.queryByRole('button', { name: 'Withdraw' })).not.toBeInTheDocument()
  })

  it('accepts through the canonical service: response recorded, breakpoint gone, no asset moved', () => {
    const scenario = createIncomingProposal()
    const rostersBefore = scenario.negotiation.participantTeamIds.map((teamId) => [...scenario.world.teams[teamId]!.rosterPlayerIds])

    mountTrades(scenario.world, tradesUrl(scenario.negotiation.id))
    fireEvent.click(within(userResponseCard()).getByRole('button', { name: 'Accept' }))

    const after = useGameStore.getState().world!
    const updated = after.tradeNegotiationsById[scenario.negotiation.id]!
    expect(updated.actions.some((action) => action.kind === 'ACCEPT' && action.teamId === scenario.user.id && action.revisionId === scenario.negotiation.currentRevisionId)).toBe(true)
    // Acceptance is nonbinding: the exchange only moves through the trade engine after every commitment review.
    expect(after.teams[scenario.user.id]!.rosterPlayerIds).toEqual(rostersBefore[0])
    expect(after.teams[scenario.partner.id]!.rosterPlayerIds).toEqual(rostersBefore[1])
    expect(evaluateSimulationBreakpoints(after).candidates.some((candidate) => candidate.reason === 'tradeNegotiationResponse')).toBe(false)
    const stop = getContinueStopReason(after)
    expect(stop?.type === 'breakpoint' && stop.breakpoint.reason === 'tradeNegotiationResponse').toBe(false)
  })

  it('rejects through the canonical service: negotiation terminal and nothing moves', () => {
    const scenario = createIncomingProposal()
    const rostersBefore = scenario.negotiation.participantTeamIds.map((teamId) => [...scenario.world.teams[teamId]!.rosterPlayerIds])

    mountTrades(scenario.world, tradesUrl(scenario.negotiation.id))
    fireEvent.click(within(userResponseCard()).getByRole('button', { name: 'Reject' }))

    const after = useGameStore.getState().world!
    expect(after.tradeNegotiationsById[scenario.negotiation.id]!.status).toBe('REJECTED')
    expect(after.teams[scenario.user.id]!.rosterPlayerIds).toEqual(rostersBefore[0])
    expect(after.teams[scenario.partner.id]!.rosterPlayerIds).toEqual(rostersBefore[1])
    expect(Object.values(after.tradeHistoryById).some((record) => record.negotiationId === scenario.negotiation.id)).toBe(false)
    expect(evaluateSimulationBreakpoints(after).candidates.some((candidate) => candidate.reason === 'tradeNegotiationResponse')).toBe(false)
  })

  it('counters through the canonical service: a new revision moves the response back to the rival club', () => {
    const scenario = createIncomingProposal()

    mountTrades(scenario.world, tradesUrl(scenario.negotiation.id))
    fireEvent.click(within(userResponseCard()).getByRole('button', { name: 'Load package into editor' }))
    fireEvent.click(within(userResponseCard()).getByRole('button', { name: 'Counter with this package' }))

    const after = useGameStore.getState().world!
    const updated = after.tradeNegotiationsById[scenario.negotiation.id]!
    expect(updated.status).toBe('COUNTERED')
    expect(updated.revisions).toHaveLength(2)
    expect(updated.currentRevisionId).not.toBe(scenario.negotiation.currentRevisionId)
    expect(updated.revisions[updated.revisions.length - 1]!.proposedByTeamId).toBe(scenario.user.id)
    expect(updated.revisions[updated.revisions.length - 1]!.movements).toEqual(scenario.negotiation.revisions[0]!.movements)
    // The user no longer owns the response, so Continue has nothing to stop for on this revision.
    expect(evaluateSimulationBreakpoints(after).candidates.some((candidate) => candidate.reason === 'tradeNegotiationResponse')).toBe(false)
    const stopAfterCounter = getContinueStopReason(after)
    expect(stopAfterCounter?.type === 'breakpoint' && stopAfterCounter.breakpoint.reason === 'tradeNegotiationResponse').toBe(false)
  })

  it('states that a resolved negotiation no longer needs a response instead of offering a stale action', () => {
    const scenario = createIncomingProposal()
    const resolved = respondToTradeNegotiation(scenario.world, {
      negotiationId: scenario.negotiation.id,
      expectedRevisionId: scenario.negotiation.currentRevisionId,
      teamId: scenario.user.id,
      actor: { kind: 'USER' },
      action: 'REJECT',
    })

    mountTrades(resolved.world, tradesUrl(scenario.negotiation.id))

    expect(screen.getByText('This negotiation no longer requires your response.')).toBeInTheDocument()
    expect(document.querySelector('[data-requires-user-response="true"]')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument()
  })

  it('surfaces the canonical validation reason and refuses the response when the stored revision is stale', () => {
    const scenario = createIncomingProposal()
    const movingPlayerId = scenario.players[0]!
    const movingContract = Object.values(scenario.world.contractsById).find((contract) => contract.playerId === movingPlayerId)!
    // A guarantee change keeps salary matching intact, so the only canonical reason left is the stale snapshot.
    const changed = updateGameWorld(scenario.world, {
      contracts: Object.values(scenario.world.contractsById).map((contract) => {
        if (contract.id !== movingContract.id) return contract
        const years = contract.compensation.years ?? []
        return { ...contract, compensation: { ...contract.compensation, years: years.map((year) => ({ ...year, guaranteedAmount: 800_000 })) } }
      }),
    })

    mountTrades(changed, tradesUrl(scenario.negotiation.id))

    expect(screen.getAllByText(/PLAYER_CONTRACT_CHANGED/).length).toBeGreaterThan(0)
    expect(document.querySelector('[data-requires-user-response="true"]')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Counter with this package' })).not.toBeInTheDocument()
  })

  it('round-trips the negotiation through save/load, and keeps a resolved one resolved', () => {
    const scenario = createIncomingProposal()
    const pending = deserializeGameWorldV4(serializeGameWorldV4(scenario.world, '2032-10-01T00:00:00.000Z'))

    // The negotiation, the season-scoped window it is legal under, and both rosters are canonical world state.
    expect(pending.tradeNegotiationsById[scenario.negotiation.id]).toEqual(scenario.negotiation)
    expect(pending.tradeRulesBySeasonId[scenario.negotiation.seasonId]).toEqual(scenario.world.tradeRulesBySeasonId[scenario.negotiation.seasonId])
    expect(pending.teams[scenario.user.id]!.rosterPlayerIds).toEqual(scenario.world.teams[scenario.user.id]!.rosterPlayerIds)

    // A reloaded game still asks the user, so Continue still stops on the stored package.
    expect(tradeNegotiationResponseReadiness(pending, pending.tradeNegotiationsById[scenario.negotiation.id]!, scenario.user.id).status).toBe('READY')
    expect(evaluateSimulationBreakpoints(pending).candidates.some((candidate) => candidate.reason === 'tradeNegotiationResponse' && candidate.sourceId === scenario.negotiation.id)).toBe(true)
    const stop = getContinueStopReason(pending)
    expect(stop?.type === 'breakpoint' && stop.breakpoint.reason === 'tradeNegotiationResponse').toBe(true)

    const resolved = respondToTradeNegotiation(pending, {
      negotiationId: scenario.negotiation.id,
      expectedRevisionId: pending.tradeNegotiationsById[scenario.negotiation.id]!.currentRevisionId,
      teamId: scenario.user.id,
      actor: { kind: 'USER' },
      action: 'ACCEPT',
    })
    const restored = deserializeGameWorldV4(serializeGameWorldV4(resolved.world, '2032-10-02T00:00:00.000Z'))

    expect(restored.tradeNegotiationsById[scenario.negotiation.id]!.actions.some((action) => action.kind === 'ACCEPT' && action.teamId === scenario.user.id)).toBe(true)
    expect(restored.tradeNegotiationsById[scenario.negotiation.id]!.revisions.length).toBe(scenario.negotiation.revisions.length)
    // The answered revision is not offered again after the reload.
    expect(evaluateSimulationBreakpoints(restored).candidates.some((candidate) => candidate.reason === 'tradeNegotiationResponse' && candidate.sourceId === scenario.negotiation.id)).toBe(false)
  })

  it('leaves the autonomous response to the user: an AI-run club still has no response policy', () => {
    const scenario = createIncomingProposal()

    // Activation enables the user's side of trading only: the AI club that opened this discussion cannot answer it.
    expect(tradeNegotiationResponseReadiness(scenario.world, scenario.negotiation, scenario.partner.id)).toEqual({ status: 'MORE_INFORMATION_REQUIRED', reasons: ['NO_DEFENSIBLE_AUTONOMOUS_TRADE_RESPONSE_POLICY'] })
    // The revision is waiting for the club that actually has an authority to answer it.
    expect(tradeNegotiationResponseReadiness(scenario.world, scenario.negotiation, scenario.user.id).status).toBe('READY')
  })

  it('works from the launcher without a breakpoint and lists the pending response', () => {
    const scenario = createIncomingProposal()

    mountTrades(scenario.world, tradesUrl())

    const said = within(userResponseCard())
    expect(said.getByText(/Your response is required for this revision\./)).toBeInTheDocument()
    expect(said.queryByText(/Opened from your trade response/)).not.toBeInTheDocument()
    // The package builder is still available for a new proposal.
    expect(screen.getByRole('button', { name: 'Propose trade' })).toBeDisabled()
    expect(screen.getByLabelText('Trade partner')).toBeInTheDocument()
  })

  it('carries the breakpoint negotiation from the SystemBar resolver into the workspace', async () => {
    const scenario = createIncomingProposal()
    window.history.replaceState({}, '', '/?ui=ng&app=home')
    useGameStore.getState().replaceWorld(scenario.world)
    render(
      <NgWorkspaceNavigationProvider>
        <SystemBar />
        <TradesWorkspace />
      </NgWorkspaceNavigationProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Trades' }))

    const url = new URL(window.location.href)
    expect(url.searchParams.get('app')).toBe('trades')
    expect(url.searchParams.get('negotiationId')).toBe(scenario.negotiation.id)
    expect(await screen.findByText(/Opened from your trade response/)).toBeInTheDocument()
  })
})
