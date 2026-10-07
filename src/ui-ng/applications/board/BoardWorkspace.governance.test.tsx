// @vitest-environment jsdom
/*
 * MX0.7 — Board / Governance product loop.
 *
 * The Board workspace is the surface that owns Board confidence and, from MX0.7, the club's canonical
 * Governance matters. These tests pin the product loop: the queue shows real decisions with their
 * canonical ownership, the user's appointed bodies can approve/reject/execute through the canonical
 * commands, the canonical blocker is shown when a command is refused, and a breakpoint deep link
 * selects the exact matter. No fixture value is invented by the workspace: every matter comes from
 * canonical state built by the canonical services.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'

import { createNewGame } from '@/app/game'
import { playerContractSigningDecisionId } from '@/app/governance'
import { createGovernanceClubScenario, withCoachFiring, withIssuedGovernanceRequest, withProposedSigning } from '@/app/governance/testFixtures'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { getBoardSummary } from '@/engine/board'
import { useGameStore } from '@/stores/gameStore'
import { NgWorkspaceNavigationProvider } from '@/ui-ng/workspace/NgWorkspaceNavigationProvider'

import { BoardWorkspace } from './BoardWorkspace'

afterEach(cleanup)

beforeEach(() => {
  window.history.replaceState({}, '', '/?ui=ng&app=board')
  useGameStore.getState().resetGame()
})

function mountBoard(world: GameWorld, query = '') {
  useGameStore.getState().replaceWorld(world)
  window.history.replaceState({}, '', `/?ui=ng&app=board${query}`)
  return render(
    <NgWorkspaceNavigationProvider>
      <BoardWorkspace />
    </NgWorkspaceNavigationProvider>,
  )
}

function openGovernanceTab() {
  fireEvent.click(screen.getByRole('button', { name: 'Governance' }))
}

describe('MX0.7 Board governance surface', () => {
  it('says honestly that a shipped career has no canonical governance institution', () => {
    mountBoard(createNewGame())

    expect(screen.getByText('No canonical Governance institution is recorded for this club, so nothing can be decided here yet.')).toBeInTheDocument()
    openGovernanceTab()
    expect(screen.getByText('No canonical Governance decision is recorded for this club.')).toBeInTheDocument()
    expect(screen.getByText('No governance request is recorded for this club.')).toBeInTheDocument()
  })

  it('shows a real pending signing matter with its canonical ownership and user actions', () => {
    const scenario = createGovernanceClubScenario()
    const world = withProposedSigning(scenario)
    mountBoard(world)

    openGovernanceTab()

    const card = screen.getByText(/^Player signing · /).closest('article')!
    expect(within(card).getByText(/PLAYER_CONTRACT_SIGNING · PROPOSED/)).toBeInTheDocument()
    expect(within(card).getByText(/Proposer: Executive/)).toBeInTheDocument()
    expect(within(card).getByText(/Awaiting: Board \(you\)/)).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Approve as Board' })).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Reject as Board' })).toBeInTheDocument()
    // PLAYER_CONTRACT_SIGNING has no canonical execution command, so no Execute action may appear.
    expect(within(card).queryByRole('button', { name: /^Execute/ })).toBeNull()
  })

  it('approves a matter through the canonical command and reports the applied status', () => {
    const scenario = createGovernanceClubScenario()
    const world = withProposedSigning(scenario)
    mountBoard(world)
    openGovernanceTab()

    fireEvent.click(screen.getByRole('button', { name: 'Approve as Board' }))

    const stored = useGameStore.getState().world!
    const decisionId = playerContractSigningDecisionId(scenario.institutionId, scenario.negotiation.id)
    expect(Object.values(stored.governanceDecisionEventsById).filter((event) => event.decisionId === decisionId && event.kind === 'APPROVED')).toHaveLength(1)
    expect(screen.getByText(/APPROVED recorded/)).toBeInTheDocument()
    expect(within(screen.getByText(/^Player signing · /).closest('article')!).getByText(/PLAYER_CONTRACT_SIGNING · APPROVED/)).toBeInTheDocument()
  })

  it('never offers an action for a matter the user coach holds no appointment in', () => {
    const scenario = createGovernanceClubScenario()
    // The same real proposed matter, but with the user's appointments gone: no body is user-owned.
    const foreign = updateGameWorld(withProposedSigning(scenario), { governanceAppointments: [] })
    mountBoard(foreign)
    openGovernanceTab()

    const card = screen.getByText(/^Player signing · /).closest('article')!
    expect(within(card).getByText('This matter is decided by another actor; the user coach holds no pending role in it.')).toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: /^(Approve|Reject|Execute)/ })).toBeNull()
    expect(within(card).getByText(/Proposer: Executive/)).toBeInTheDocument()
  })

  it('never offers an approval event for a decision type canon owns instead', () => {
    const scenario = createGovernanceClubScenario()
    const firing = withCoachFiring(scenario, { approved: false })
    mountBoard(firing.world)
    openGovernanceTab()

    const card = screen.getByText(/Head coach · /).closest('article')!
    expect(within(card).getByText('Recording an approval for this decision type is not yet a club action.')).toBeInTheDocument()
    expect(within(card).getByText(/unlocks when the required approvals above are recorded/)).toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: /^(Approve|Reject|Execute)/ })).toBeNull()
  })

  it('executes an approved coach firing from the user appointment and reports the consequence', () => {
    const scenario = createGovernanceClubScenario()
    const firing = withCoachFiring(scenario, { approved: true })
    mountBoard(firing.world)
    openGovernanceTab()

    fireEvent.click(screen.getByRole('button', { name: 'Execute as Executive' }))

    const stored = useGameStore.getState().world!
    expect(stored.teams[scenario.teamId]!.coachId).toBeUndefined()
    expect(stored.coachEmploymentByCoachId[scenario.world.userCoachId]!.status).toBe('unemployed')
    // The fired coach controls no club any more, so the surface reports it instead of a stale board.
    expect(screen.getByText('No team assigned to the user coach.')).toBeInTheDocument()
  })

  it('deep links from a governance breakpoint to the exact matter', () => {
    const scenario = createGovernanceClubScenario()
    const world = withProposedSigning(scenario)
    const decisionId = playerContractSigningDecisionId(scenario.institutionId, scenario.negotiation.id)
    const other = withIssuedGovernanceRequest({ ...scenario, world })

    mountBoard(other.world, `&decisionId=${encodeURIComponent(decisionId)}`)

    // A governance context opens the governance tab directly and marks the addressed matter.
    const selected = screen.getByText(/^Player signing · /).closest('article')!
    expect(selected).toHaveAttribute('data-selected', 'true')
    // The request that was not addressed by the deep link stays unselected.
    expect(screen.getByText(/addressed to you/)).not.toHaveAttribute('data-selected', 'true')
    expect(screen.getByText(/read-only: no canonical response command exists yet/)).toBeInTheDocument()
  })

  it('deep links a governance request and keeps it read-only', () => {
    const scenario = createGovernanceClubScenario()
    const issued = withIssuedGovernanceRequest({ ...scenario, world: withProposedSigning(scenario) })
    mountBoard(issued.world, `&requestId=${encodeURIComponent(issued.requestId)}`)

    const request = screen.getByText(/addressed to you/).closest('li')!
    expect(request).toHaveAttribute('data-selected', 'true')
    expect(screen.getByText(/^Player signing · /).closest('article')!).not.toHaveAttribute('data-selected')
  })

  it('lists every recorded governance event in history', () => {
    const scenario = createGovernanceClubScenario()
    const issued = withIssuedGovernanceRequest({ ...scenario, world: withProposedSigning(scenario) })
    mountBoard(issued.world)

    fireEvent.click(screen.getByRole('button', { name: 'History' }))
    const history = screen.getByText('Governance history').closest('div')!
    expect(within(history).getByText('PROPOSED')).toBeInTheDocument()
    expect(within(history).getByText('ISSUED')).toBeInTheDocument()
    expect(within(history).getByText(issued.summary)).toBeInTheDocument()
  })

  it('keeps Board confidence and objectives intact on the overview tab', () => {
    const scenario = createGovernanceClubScenario()
    const summary = getBoardSummary(scenario.world, scenario.teamId)!
    mountBoard(scenario.world)

    expect(screen.getByText('Confidence')).toBeInTheDocument()
    expect(screen.getByText(scenario.team.name)).toBeInTheDocument()
    expect(screen.getAllByText(summary.state.expectation.summary).length).toBeGreaterThan(0)
    expect(screen.getAllByText(summary.state.objectives[0]!.label).length).toBeGreaterThan(0)
    expect(screen.getByText('Governance attention')).toBeInTheDocument()
  })
})
