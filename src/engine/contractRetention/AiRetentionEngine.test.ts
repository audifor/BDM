import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { createContractReviewDecision, contractReviewDecisionIdFor } from '@/domain/contract/ContractReviewDecision'
import { createPlayerContract } from '@/domain/contract/PlayerContract'
import { createClubStrategicState } from '@/domain/clubStrategy'
import { addDays } from '@/domain/date'
import { agentIdFromString, contractIdFromString } from '@/domain/ids'
import { calculateTeamPlayerPayroll, updateGameWorld } from '@/domain/world'
import { assessContractReviewOutlook } from '@/engine/clubNeeds/ContractReviewEngine'
import { advanceDayWithTrace } from '@/engine/calendar/CalendarEngine'
import { openAiRetentionNegotiation, submitAiRetentionOffer } from './ContractRetentionEngine'
import { progressAiRetentionNegotiations, progressAiRetentionNegotiationsWithEvidence } from './AiRetentionEngine'

function fixture() {
  const base = createNewGame()
  const team = Object.values(base.teams).find((candidate) => candidate.coachId !== undefined && candidate.coachId !== base.userCoachId)!
  const playerId = team.rosterPlayerIds[0]!
  const player = base.players[playerId]!
  const position = player.basketball.primaryPosition
  const prior = Object.values(base.contractsById).find((contract) => contract.playerId === playerId)!
  const contract = createPlayerContract({
    id: contractIdFromString(`bs11c6-ai-retention:${team.id}`),
    playerId,
    teamId: team.id,
    kind: 'standard',
    term: { startsOn: addDays(base.currentDate, -30), expiresOn: addDays(base.currentDate, 120) },
    compensation: { annualSalary: prior.compensation.annualSalary },
  })
  const lineup = base.lineupsByTeamId[team.id]!
  const templateRules = Object.values(base.salaryRulesBySeasonId)[0]!
  const withContract = updateGameWorld(base, {
    contracts: [...Object.values(base.contractsById).filter((item) => item.playerId !== playerId), contract],
    lineupsByTeamId: { ...base.lineupsByTeamId, [team.id]: { ...lineup, starters: { ...lineup.starters, [position]: playerId } } },
    salaryRulesBySeasonId: { ...base.salaryRulesBySeasonId, [base.currentSeasonId]: { ...templateRules, seasonId: base.currentSeasonId } },
  })
  const finance = withContract.teamFinancesByTeamId[team.id]!
  const strategicState = createClubStrategicState({
    teamId: team.id,
    mode: 'CONTEND',
    horizon: 'NOW',
    financialPosture: 'HEALTHY',
    riskTolerance: 'HIGH',
    developmentEmphasis: 20,
    retentionPosture: 'PROTECT_CORE',
    acquisitionAggression: 'HIGH',
    sellingWillingness: 'LOW',
    establishedOn: withContract.currentDate,
    lastReviewedOn: withContract.currentDate,
    transitionReason: 'INITIAL_ASSESSMENT',
  })
  const world = {
    ...withContract,
    teamFinancesByTeamId: { ...withContract.teamFinancesByTeamId, [team.id]: { ...finance, playerSalaryBudget: 1_000_000_000 } },
    clubStrategicStatesByTeamId: { ...withContract.clubStrategicStatesByTeamId, [team.id]: strategicState },
  }
  return { world, team, playerId, contract }
}

function setAiIntent(world: ReturnType<typeof fixture>['world'], teamId: ReturnType<typeof fixture>['team']['id'], contractId: ReturnType<typeof fixture>['contract']['id'], intent: 'PURSUE_EXTENSION' | 'ALLOW_EXPIRY' | 'REVIEW_RELEASE' | 'DEFER') {
  const team = world.teams[teamId]!
  const contract = world.contractsById[contractId]!
  const decision = createContractReviewDecision({
    id: contractReviewDecisionIdFor(team.id, contract.playerId, contract.id),
    teamId: team.id,
    playerId: contract.playerId,
    contractId: contract.id,
    intent,
    decidedOn: world.currentDate,
    decidedByCoachId: team.coachId!,
    ...(intent === 'DEFER' ? { reviewAgainOn: addDays(world.currentDate, 30) } : {}),
  })
  return updateGameWorld(world, { contractReviewDecisions: [decision] })
}

describe('BS11C6 AI retention ownership', () => {
  it('opens one nonbinding negotiation for an eligible AI club with a canonical high-priority pursuit', () => {
    const { world, team, contract } = fixture()
    expect(assessContractReviewOutlook(world, team.id).reviews.some((review) => review.contractId === contract.id && review.status === 'REVIEW_REQUIRED')).toBe(true)
    const before = { contracts: world.contractsById, finance: world.financialCommitmentsById, governance: world.governanceDecisionsById }
    const progressed = progressAiRetentionNegotiationsWithEvidence(world)
    const negotiations = Object.values(progressed.world.retentionNegotiationsById).filter((item) => item.teamId === team.id && item.predecessorContractId === contract.id)
    expect(negotiations).toHaveLength(1)
    expect(negotiations[0]).toMatchObject({ openedByCoachId: team.coachId, status: 'ACCEPTED', acceptedTerms: { salary: contract.compensation.annualSalary, years: 1 } })
    expect(progressed.decisions).toEqual(expect.arrayContaining([expect.objectContaining({ teamId: team.id, contractId: contract.id, reviewIntent: 'PURSUE_EXTENSION', action: 'OPEN' })]))
    expect(progressed.world.contractsById).toEqual(before.contracts)
    expect(progressed.world.financialCommitmentsById).toEqual(before.finance)
    expect(progressed.world.governanceDecisionsById).toEqual(before.governance)
    expect(progressed.world.teams[team.id]!.rosterPlayerIds).toEqual(world.teams[team.id]!.rosterPlayerIds)
    expect(progressAiRetentionNegotiations(progressed.world)).toBe(progressed.world)
  })

  it.each(['ALLOW_EXPIRY', 'REVIEW_RELEASE', 'DEFER'] as const)('%s does not open or respond for an AI club', (intent) => {
    const { world, team, contract } = fixture()
    const withIntent = setAiIntent(world, team.id, contract.id, intent)
    const result = progressAiRetentionNegotiationsWithEvidence(withIntent)
    expect(Object.values(result.world.retentionNegotiationsById).filter((item) => item.teamId === team.id && item.predecessorContractId === contract.id)).toHaveLength(0)
    expect(result.decisions.find((item) => item.contractId === contract.id)?.action).toBe('NO_ACTION')
  })

  it('honors a persisted BS11B pursuit and uses the same C2 eligibility before opening', () => {
    const { world, team, contract } = fixture()
    const pursued = setAiIntent(world, team.id, contract.id, 'PURSUE_EXTENSION')
    const opened = progressAiRetentionNegotiations(pursued)
    expect(Object.values(opened.retentionNegotiationsById).some((item) => item.teamId === team.id && item.predecessorContractId === contract.id)).toBe(true)
    const missingRules = { ...pursued, salaryRulesBySeasonId: {} }
    const blocked = progressAiRetentionNegotiationsWithEvidence(missingRules)
    expect(Object.values(blocked.world.retentionNegotiationsById).some((item) => item.teamId === team.id && item.predecessorContractId === contract.id)).toBe(false)
    expect(blocked.decisions.find((item) => item.contractId === contract.id)?.reasons).toContain('EFFECTIVE_CONTRACT_RULES_UNAVAILABLE')
  })

  it('never initiates or responds for a user-controlled club, even with a pursuit decision', () => {
    const { world, team } = fixture()
    const userTeam = Object.values(world.teams).find((candidate) => candidate.coachId === world.userCoachId)!
    const playerId = userTeam.rosterPlayerIds[0]!
    const prior = Object.values(world.contractsById).find((contract) => contract.playerId === playerId)!
    const contract = createPlayerContract({ id: contractIdFromString(`bs11c6-user-retention:${userTeam.id}`), playerId, teamId: userTeam.id, kind: 'standard', term: { startsOn: addDays(world.currentDate, -30), expiresOn: addDays(world.currentDate, 120) }, compensation: { annualSalary: prior.compensation.annualSalary } })
    const position = world.players[playerId]!.basketball.primaryPosition
    const lineup = world.lineupsByTeamId[userTeam.id]!
    const withUserCandidate = updateGameWorld(world, {
      contracts: [...Object.values(world.contractsById).filter((item) => item.playerId !== playerId), contract],
      lineupsByTeamId: { ...world.lineupsByTeamId, [userTeam.id]: { ...lineup, starters: { ...lineup.starters, [position]: playerId } } },
    })
    const pursued = setAiIntent(withUserCandidate, userTeam.id, contract.id, 'PURSUE_EXTENSION')
    const result = progressAiRetentionNegotiationsWithEvidence(pursued)
    expect(result.decisions.some((item) => item.teamId === userTeam.id || item.contractId === contract.id)).toBe(false)
    expect(Object.values(result.world.retentionNegotiationsById).some((item) => item.teamId === userTeam.id || item.predecessorContractId === contract.id)).toBe(false)
    expect(result.world.contractReviewDecisionsById[contractReviewDecisionIdFor(userTeam.id, playerId, contract.id)]).toMatchObject({ intent: 'PURSUE_EXTENSION', decidedByCoachId: world.userCoachId })
    expect(result.world.teams[userTeam.id]!.coachId).toBe(world.userCoachId)
    expect(team.coachId).not.toBe(world.userCoachId)
  })

  it('deterministically accepts an affordable counter in principle and leaves signing to BS11D', () => {
    const { world, team, contract } = fixture()
    const opening = openAiRetentionNegotiation(world, { teamId: team.id, contractId: contract.id, actionId: 'ai-counter-open' })
    if (!opening.ok) throw new Error(opening.reason)
    const submitted = submitAiRetentionOffer(opening.world, { teamId: team.id, negotiationId: opening.negotiation.id, expectedRound: 0, actionId: 'ai-low-offer', terms: { salary: Math.floor(contract.compensation.annualSalary * 0.9), years: 1 } })
    if (!submitted.ok) throw new Error(submitted.reason)
    expect(submitted.negotiation.status).toBe('PLAYER_COUNTERED')
    const progressed = progressAiRetentionNegotiationsWithEvidence(submitted.world)
    expect(progressed.world.retentionNegotiationsById[opening.negotiation.id]).toMatchObject({ status: 'ACCEPTED', rounds: [{ clubAction: { kind: 'ACCEPT_COUNTER' } }] })
    expect(progressed.decisions.find((item) => item.negotiationId === opening.negotiation.id)?.action).toBe('ACCEPT_IN_PRINCIPLE')
    expect(progressed.world.contractsById[contract.id]).toEqual(contract)
  })

  it('withdraws an unaffordable agent counter and never persists AI diagnostic state', () => {
    const { world, team, contract } = fixture()
    const agentId = agentIdFromString('bs11c6-ai-retention-agent')
    const withAgent = updateGameWorld(world, {
      agents: [...Object.values(world.agentsById), { id: agentId, name: 'Agent', reputation: 50, abilities: { negotiation: 90, marketKnowledge: 50, network: 50, clientManagement: 50, mediaInfluence: 50 }, personality: { aggressiveness: 90, loyalty: 50, opportunism: 90, patience: 50, discretion: 50 } }],
      playerRepresentations: [...world.playerRepresentations, { playerId: contract.playerId, agentId, trust: 50, startedOn: world.currentDate }],
    })
    const finance = withAgent.teamFinancesByTeamId[team.id]!
    const limited = updateGameWorld(withAgent, { teamFinances: Object.values(withAgent.teamFinancesByTeamId).map((item) => item.teamId === team.id ? { ...finance, playerSalaryBudget: calculateTeamPlayerPayroll(withAgent, team.id) } : item) })
    const opening = openAiRetentionNegotiation(limited, { teamId: team.id, contractId: contract.id, actionId: 'ai-unaffordable-open' })
    if (!opening.ok) throw new Error(opening.reason)
    const submitted = submitAiRetentionOffer(opening.world, { teamId: team.id, negotiationId: opening.negotiation.id, expectedRound: 0, actionId: 'ai-unaffordable-low-offer', terms: { salary: Math.floor(contract.compensation.annualSalary * 0.9), years: 1 } })
    if (!submitted.ok) throw new Error(submitted.reason)
    expect(submitted.negotiation.currentTerms!.salary).toBeGreaterThan(contract.compensation.annualSalary)
    const progressed = progressAiRetentionNegotiationsWithEvidence(submitted.world)
    expect(progressed.world.retentionNegotiationsById[opening.negotiation.id]?.status).toBe('WITHDRAWN')
    expect(progressed.decisions.find((item) => item.negotiationId === opening.negotiation.id)?.action).toBe('WITHDRAW')
    expect(progressed.world).not.toHaveProperty('aiRetentionNegotiations')
  })

  it('runs AI retention in the daily lifecycle without stopping simulation for an AI-only action', () => {
    const { world, team, contract } = fixture()
    const trace = advanceDayWithTrace(world)
    expect(trace.status).toBe('COMPLETED')
    const phase = trace.phases.find((item) => item.phaseId === 'AI_RETENTION_NEGOTIATIONS')
    expect(phase).toMatchObject({ ran: true })
    expect(phase?.diagnostics.some((item) => item.code === 'AI_RETENTION_OPEN' && item.sourceId !== undefined)).toBe(true)
    expect(Object.values(trace.world.retentionNegotiationsById).some((item) => item.teamId === team.id && item.predecessorContractId === contract.id)).toBe(true)
  })
})
