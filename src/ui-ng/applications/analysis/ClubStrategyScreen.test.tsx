// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNewGame } from '@/app/game'
import { addDays } from '@/domain/date'
import { createPlayerContract } from '@/domain/contract'
import { contractIdFromString } from '@/domain/ids'
import { reviewClubManagementPlanning } from '@/app/gmPlanning'
import { createGMPlanState } from '@/domain/gmPlanning'
import { assessGMDecisionContext } from '@/engine/gmDecisionContext'
import { assessRoutedAcquisitionProposalIntelligence, assessRoutedFreeAgentOfferIntelligence, assessRoutedMarketCandidateFeasibility } from '@/app/marketIntelligence'
import { updateGameWorld } from '@/domain/world'
import { openRetentionNegotiation } from '@/engine/contractRetention/ContractRetentionEngine'
import { ClubStrategyScreen, RetentionPanel } from './ClubStrategyScreen'

afterEach(cleanup)

function preparedAiWorld() {
  const initial = createNewGame()
  const team = Object.values(initial.teams).filter((candidate) => candidate.coachId !== undefined && candidate.coachId !== initial.userCoachId).sort((left, right) => left.id.localeCompare(right.id))[0]!
  const shortRoster = updateGameWorld(initial, { teams: Object.values(initial.teams).map((candidate) => candidate.id === team.id ? { ...candidate, rosterPlayerIds: candidate.rosterPlayerIds.slice(0, 4) } : candidate) })
  return { world: reviewClubManagementPlanning(shortRoster, team.id, 'MATERIAL_ROSTER_CHANGE').world, team }
}

describe('ClubStrategyScreen', () => {
  it('exposes review intent only for the user club when an explicit command is supplied', () => {
    const initial = createNewGame()
    const team = Object.values(initial.teams).find((candidate) => candidate.coachId === initial.userCoachId)!
    const playerId = team.rosterPlayerIds[0]!
    const position = initial.players[playerId]!.basketball.primaryPosition
    const contract = createPlayerContract({ id: contractIdFromString(`screen-review:${team.id}`), teamId: team.id, playerId, kind: 'standard', term: { startsOn: addDays(initial.currentDate, -30), expiresOn: addDays(initial.currentDate, 120) }, compensation: { annualSalary: 1_000_000 } })
    const lineup = initial.lineupsByTeamId[team.id]!
    const world = updateGameWorld(initial, {
      contracts: [...Object.values(initial.contractsById).filter((item) => item.playerId !== playerId), contract],
      lineupsByTeamId: { ...initial.lineupsByTeamId, [team.id]: { ...lineup, starters: { ...lineup.starters, [position]: playerId } } },
    })
    const onDecideContractReview = vi.fn()
    render(<ClubStrategyScreen world={world} onDecideContractReview={onDecideContractReview} />)
    const article = screen.getByRole('article', { name: `${team.name} ${team.gender} strategy` })
    const choices = within(article).getByLabelText(`Contract review choices for ${initial.players[playerId]!.firstName} ${initial.players[playerId]!.lastName}`)
    const button = within(choices).getByRole('button', { name: 'Pursue extension' })
    button.click()
    expect(onDecideContractReview).toHaveBeenCalledWith(team.id, contract.id, 'PURSUE_EXTENSION')
    expect(within(article).getByText(/Intent is planning only\. It creates no salary terms/)).toBeInTheDocument()
  })

  it('shows retention initiation only for the eligible user-club predecessor contract', () => {
    const base = createNewGame()
    const team = Object.values(base.teams).find((candidate) => candidate.coachId === base.userCoachId)!
    const playerId = team.rosterPlayerIds[0]!
    const contract = Object.values(base.contractsById).find((item) => item.teamId === team.id && item.playerId === playerId)!
    const changed = { ...contract, term: { ...contract.term, expiresOn: addDays(base.currentDate, 90) } }
    const world = updateGameWorld(base, { contracts: Object.values(base.contractsById).map((item) => item.id === contract.id ? changed : item) })
    render(<ClubStrategyScreen world={world} />)
    const card = screen.getByRole('article', { name: `${team.name} ${team.gender} strategy` })
    expect(within(card).getByRole('button', { name: 'Manage negotiations in Contracts / Planning' })).toBeInTheDocument()
    expect(within(card).queryByRole('region', { name: 'Contract retention negotiations' })).not.toBeInTheDocument()
  })

  it('edits structured option and guarantee terms without showing response internals', () => {
    const base = createNewGame()
    const team = Object.values(base.teams).find((candidate) => candidate.coachId === base.userCoachId)!
    const playerId = team.rosterPlayerIds[0]!
    const contract = Object.values(base.contractsById).find((item) => item.teamId === team.id && item.playerId === playerId)!
    const changed = { ...contract, term: { ...contract.term, expiresOn: addDays(base.currentDate, 90) } }
    const noSalaryRules = updateGameWorld(base, { contracts: Object.values(base.contractsById).map((item) => item.id === contract.id ? changed : item) })
    const templateRules = Object.values(base.salaryRulesBySeasonId)[0]!
    const world = { ...noSalaryRules, salaryRulesBySeasonId: { ...noSalaryRules.salaryRulesBySeasonId, [base.currentSeasonId]: { ...templateRules, seasonId: base.currentSeasonId } } }
    const opened = openRetentionNegotiation(world, { teamId: team.id, contractId: contract.id, actionId: 'c3-ui-open' })
    if (!opened.ok) throw new Error(opened.reason)
    const onSubmitRetentionOffer = vi.fn()
    render(<RetentionPanel world={opened.world} teamId={team.id} isUserTeam onSubmitOffer={onSubmitRetentionOffer} />)
    const retention = screen.getByRole('region', { name: 'Contract retention negotiations' })
    const playerName = `${base.players[playerId]!.firstName} ${base.players[playerId]!.lastName}`
    fireEvent.change(within(retention).getByLabelText(`${playerName} retention years`), { target: { value: '2' } })
    fireEvent.change(within(retention).getByLabelText(`${playerName} year 2 option`), { target: { value: 'PLAYER' } })
    fireEvent.change(within(retention).getByLabelText(`${playerName} year 2 guaranteed amount`), { target: { value: String(Math.floor(changed.compensation.annualSalary / 2)) } })
    fireEvent.click(within(retention).getByText('Performance incentives'))
    fireEvent.click(within(retention).getByRole('button', { name: 'Add games-played incentive' }))
    const competition = Object.values(world.competitions).find((item) => item.participantTeamIds.includes(team.id))!
    fireEvent.change(within(retention).getByLabelText(`${playerName} incentive 1 games threshold`), { target: { value: '50' } })
    fireEvent.change(within(retention).getByLabelText(`${playerName} incentive 1 amount`), { target: { value: '75000' } })
    fireEvent.click(within(retention).getByText('Contract clauses'))
    fireEvent.click(within(retention).getByLabelText('Player approval required before a future trade'))
    fireEvent.click(within(retention).getByRole('button', { name: 'Submit offer' }))
    expect(onSubmitRetentionOffer).toHaveBeenCalledWith(team.id, opened.negotiation.id, 0, expect.stringContaining('retention-offer:'), expect.objectContaining({
      options: [{ year: 2, type: 'PLAYER', decisionAuthority: 'PLAYER' }],
      guarantees: [{ year: 2, guaranteedAmount: Math.floor(changed.compensation.annualSalary / 2) }],
      incentives: [{ type: 'GAMES_PLAYED', competitionId: competition.id, contractYear: 1, minimumGamesPlayed: 50, amount: 75_000 }],
      clauses: [{ type: 'TRADE_CONSENT_REQUIRED', decisionAuthority: 'PLAYER' }],
    }))
    expect(within(retention).getByText(/These are proposed terms only/)).toBeInTheDocument()
    expect(within(retention).queryByText(/compositeScore|MarketReality|salary target/i)).not.toBeInTheDocument()
  })

  it('shows AI club direction, evidence and review timing without adding action controls', () => {
    const { world, team } = preparedAiWorld()
    render(<ClubStrategyScreen world={world} />)
    const card = screen.getByRole('article', { name: `${team.name} ${team.gender} strategy` })
    expect(within(card).getAllByText(world.clubStrategicStatesByTeamId[team.id]!.mode).length).toBeGreaterThan(0)
    expect(within(card).getByText(world.clubStrategicStatesByTeamId[team.id]!.lastReviewedOn)).toBeInTheDocument()
    expect(within(card).getByRole('heading', { name: 'Selected plan' })).toBeInTheDocument()
    expect(within(card).getByRole('heading', { name: 'Contract outlook' })).toBeInTheDocument()
    expect(within(card).getByText(/roster maximum: not configured/)).toBeInTheDocument()
    expect(within(card).getAllByText(/Planned next workflow/).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button')).toEqual([screen.getByRole('button', { name: 'Manage negotiations in Contracts / Planning' })])
  })

  it('shows derived top needs for both AI clubs and the user club as advisory data', () => {
    const initial = createNewGame()
    const userTeam = Object.values(initial.teams).find((candidate) => candidate.coachId === initial.userCoachId)!
    const world = updateGameWorld(initial, { teams: Object.values(initial.teams).map((candidate) => candidate.id === userTeam.id ? { ...candidate, rosterPlayerIds: candidate.rosterPlayerIds.slice(0, 4) } : candidate) })
    render(<ClubStrategyScreen world={world} />)
    expect(screen.getByRole('heading', { name: 'Club strategy and needs' })).toBeInTheDocument()
    const userArticle = screen.getByRole('article', { name: `${userTeam.name} ${userTeam.gender} strategy` })
    expect(within(userArticle).getByRole('region', { name: `${userTeam.name} ${userTeam.gender} top needs` })).toBeInTheDocument()
    expect(within(userArticle).getByRole('heading', { name: 'Recommended offer preparation (advisory)' })).toBeInTheDocument()
    expect(within(userArticle).getByRole('heading', { name: 'Recommended plan' })).toBeInTheDocument()
    expect(within(userArticle).getAllByText(/Recommended next workflow/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Your club, advisory/)).toBeInTheDocument()
    expect(screen.queryByText(/generated-player-/)).not.toBeInTheDocument()
    expect(screen.getAllByRole('button')).toEqual([screen.getByRole('button', { name: 'Manage negotiations in Contracts / Planning' })])
  })

  it('shows selected plans with their current workflow rather than hiding unfinished routes', () => {
    const { world, team: aiTeam } = preparedAiWorld()
    render(<ClubStrategyScreen world={world} />)
    const card = screen.getByRole('article', { name: `${aiTeam.name} ${aiTeam.gender} strategy` })
    expect(within(card).getAllByText(/Selected:/).length).toBeGreaterThan(0)
    expect(within(card).getAllByText(/Planned next workflow:/).length).toBeGreaterThan(0)
  })

  it('shows known candidates for a current incoming-market route without transaction controls', () => {
    const initial = createNewGame()
    const team = Object.values(initial.teams).find((candidate) => candidate.coachId !== undefined && candidate.coachId !== initial.userCoachId)!
    const shortRoster = updateGameWorld(initial, { teams: Object.values(initial.teams).map((candidate) => candidate.id === team.id ? { ...candidate, rosterPlayerIds: candidate.rosterPlayerIds.slice(0, 4) } : candidate) })
    const context = assessGMDecisionContext(shortRoster, team.id)
    const need = context.needsAssessment.needs.find((candidateNeed) => context.options.some((option) => option.needId === candidateNeed.id && option.kind === 'EXTERNAL_ACQUISITION' && option.planningEligibility === 'SELECTABLE'))!
    const option = context.options.find((candidate) => candidate.needId === need.id && candidate.kind === 'EXTERNAL_ACQUISITION')!
    const plan = createGMPlanState({ id: `${team.id}:${need.id}`, teamId: team.id, needId: need.id, selectedOptionKind: 'EXTERNAL_ACQUISITION', selectedOn: shortRoster.currentDate, lastReviewedOn: shortRoster.currentDate, selectionReason: 'INITIAL_SELECTION', executionReadinessAtSelection: option.executionReadiness as Exclude<typeof option.executionReadiness, 'BLOCKED'>, strategyAtSelection: context.strategy, originalOptionPriority: option.priority })
    const externalPlayer = Object.values(initial.teams).find((candidate) => candidate.id !== team.id)!.rosterPlayerIds[0]!
    const organizationKnowledge = { organizationId: team.organizationId, subjectPlayerId: externalPlayer, dimensions: Object.fromEntries(['creation', 'shooting', 'interiorDefense'].map((dimension) => [dimension, { coverage: 1, confidence: 0.9, assessedAt: initial.currentDate, provenance: 'scoutReport' as const, estimate: 75, uncertainty: 3 }])) }
    const world = updateGameWorld(shortRoster, { gmPlanStates: [...Object.values(shortRoster.gmPlanStatesById).filter((candidate) => candidate.teamId !== team.id), plan], organizationKnowledge: [...shortRoster.organizationKnowledge, organizationKnowledge] })
    const proposals = assessRoutedAcquisitionProposalIntelligence(world, team.id)
    const offers = assessRoutedFreeAgentOfferIntelligence(world, team.id)
    const feasibility = assessRoutedMarketCandidateFeasibility(world, team.id)
    expect(proposals).toHaveLength(1)
    expect(offers).toHaveLength(1)
    expect(proposals[0]!.planId).toBe(plan.id)
    expect(offers[0]!.sourceProposalId).toBe(proposals[0]!.id)
    if (proposals[0]!.preferredCandidate !== undefined) {
      expect(feasibility[0]!.candidates.map((candidate) => candidate.playerId)).toContain(proposals[0]!.preferredCandidate.playerId)
    }
    render(<ClubStrategyScreen world={world} />)
    const card = screen.getByRole('article', { name: `${team.name} ${team.gender} strategy` })
    expect(within(card).getByRole('heading', { name: 'Known market candidates' })).toBeInTheDocument()
    expect(within(card).getByText(`${initial.players[externalPlayer]!.firstName} ${initial.players[externalPlayer]!.lastName}`)).toBeInTheDocument()
    expect(within(card).getByText(/Position fit: UNKNOWN/)).toBeInTheDocument()
    expect(within(card).getByText(/Known evidence:/)).toBeInTheDocument()
    expect(within(card).getByRole('heading', { name: 'Preferred acquisition proposal' })).toBeInTheDocument()
    expect(within(card).getByRole('heading', { name: 'Free-agent offer readiness' })).toBeInTheDocument()
    expect(screen.getAllByRole('button')).toEqual([screen.getByRole('button', { name: 'Manage negotiations in Contracts / Planning' })])
  })
})
