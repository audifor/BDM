import { beforeAll, describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { releasePlayer, signFreeAgent } from '@/app/market'
import { staffPersonIdFromString, teamStaffAssignmentIdFromString } from '@/domain/ids'
import { createNegotiationContact, type ContractNegotiation } from '@/domain/market'
import { responsibilityIdForTeam } from '@/domain/responsibility'
import { createGMPlanState } from '@/domain/gmPlanning'
import { assessRoutedFormalOfferPreparations } from '@/app/marketIntelligence/FormalOfferPreparationService'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import type { GameWorld } from '@/domain/world'
import { canTeamAffordAdditionalSalary, getEcosystemForTeam, getTeamFinancialSnapshot, updateGameWorld } from '@/domain/world'
import type { PlayerId, TeamId } from '@/domain/ids'
import type { ClubNeed } from '@/engine/clubNeeds'
import { assessMarketCandidatesForNeed } from './MarketCandidateIntelligence'
import { assessMarketCandidateFeasibility } from './MarketCandidateFeasibility'
import { selectAcquisitionProposal } from './AcquisitionProposalIntelligence'
import { assessFormalOfferPreparation, assessFreeAgentOfferIntelligence, assessNegotiationOpeningReadiness } from './index'
import { deriveNegotiationAttemptKey, resolveNegotiationContactAuthority } from './NegotiationContactAuthority'

let base: GameWorld
let teamId: TeamId
let playerId: PlayerId
let proposal: ReturnType<typeof selectAcquisitionProposal>

beforeAll(() => {
  const initial = createNewGame()
  const team = Object.values(initial.teams).find((item) => item.coachId !== undefined && item.coachId !== initial.userCoachId)!
  const source = Object.values(initial.teams).find((item) => item.id !== team.id
    && getEcosystemForTeam(initial, item.id)?.kind !== 'ncaaLike'
    && item.rosterPlayerIds.length >= 8)!
  const released = source.rosterPlayerIds.slice(0, 3).reduce((world, id) => releasePlayer(world, source.id, id), initial)
  teamId = team.id
  playerId = source.rosterPlayerIds[0]!
  const organizationId = released.teams[teamId]!.organizationId
  base = updateGameWorld(released, {
    teamFinances: Object.values(released.teamFinancesByTeamId).map((item) => item.teamId === teamId ? { ...item, playerSalaryBudget: Math.max(item.playerSalaryBudget, 100_000_000) } : item),
    marketKnowledge: source.rosterPlayerIds.slice(0, 3).map((candidateId) => ({
      organizationId,
      playerId: candidateId,
      availability: 'OPEN' as const,
      expectedSalary: 650_000,
      expectedYears: 2,
      playerInterest: 61,
      confidence: 75,
      assessedAt: released.currentDate,
      source: 'AGENT' as const,
    })),
  })
  const candidates = assessMarketCandidatesForNeed(base, teamId, makeNeed(), 'CONTEND')
  proposal = selectAcquisitionProposal(base, assessMarketCandidateFeasibility(base, candidates))
  if (proposal.proposalType !== 'FREE_AGENT_APPROACH' || proposal.preferredCandidate?.playerId === undefined) {
    throw new Error('Expected BS10C to produce a free-agent approach fixture')
  }
  playerId = proposal.preferredCandidate.playerId
  const planId = `${teamId}:${makeNeed().id}`
  proposal = { ...proposal, planId, needId: makeNeed().id }
  const eligibleAssignment = Object.values(base.teamStaffAssignmentsById).find((item) => item.teamId === teamId && ['generalManager', 'assistantGeneralManager', 'directorOfBasketballOperations', 'sportingDirector'].includes(item.role))
  const staffId = eligibleAssignment?.staffPersonId ?? staffPersonIdFromString('offer-test:contact-operator')
  base = updateGameWorld(base, {
    gmPlanStates: [createGMPlanState({ id: planId, teamId, needId: makeNeed().id, selectedOptionKind: 'EXTERNAL_ACQUISITION', selectedOn: base.currentDate, lastReviewedOn: base.currentDate, selectionReason: 'INITIAL_SELECTION', executionReadinessAtSelection: 'UNKNOWN_AUTHORITY', strategyAtSelection: 'CONTEND', originalOptionPriority: 1 })],
    ...(eligibleAssignment === undefined ? {
      staffPeople: [...Object.values(base.staffPeopleById), { id: staffId, identity: { firstName: 'Offer', lastName: 'Operator' }, professional: { attributes: Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 70])) as Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number> } }],
      teamStaffAssignments: [...Object.values(base.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString('offer-test:operator-assignment'), staffPersonId: staffId, teamId, role: 'generalManager', assignedOn: base.currentDate }],
    } : {}),
    responsibilities: [...Object.values(base.responsibilitiesById).filter((item) => !(item.teamId === teamId && item.kind === 'initiateNegotiationContact')), { id: `responsibility:${teamId}:initiateNegotiationContact` as never, teamId, kind: 'initiateNegotiationContact', mode: 'delegated', holderStaffId: staffId }],
  })
})

describe('FreeAgentOfferIntelligence', () => {
  it('consumes the exact BS10C player and carries its known salary and interest evidence', () => {
    const result = assessFreeAgentOfferIntelligence(base, proposal)
    expect(result.outcome).toBe('FREE_AGENT_OFFER')
    expect(result.sourceProposalId).toBe(proposal.id)
    expect(result.playerId).toBe(proposal.preferredCandidate?.playerId)
    expect(result.contactReadiness).toBe('READY_TO_CONTACT')
    expect(result.contactAuthority.authorityStatus).toBe('AUTHORIZED')
    expect(result.contactAuthority.governanceRequirement).toBe('NOT_REQUIRED')
    expect(result.actionKey).toBeTruthy()
    expect(result.preparedSalary).toMatchObject({ value: 650_000, source: 'AGENT', confidence: 75, assessedAt: base.currentDate })
    expect(result.playerInterest?.value).toBe(61)
    expect(result.readiness).toBe('MORE_INFORMATION_REQUIRED')
  })

  it('keeps unknown salary unknown even when other candidate data contains no offer authority', () => {
    const unknownSalary = { ...proposal, knownExpectedSalary: undefined }
    const result = assessFreeAgentOfferIntelligence(base, unknownSalary)
    expect(result.preparedSalary).toBeUndefined()
    expect(result.payrollAffordability).toBe('UNKNOWN')
    expect(result.missingInformation).toContain('EXPECTED_SALARY_UNKNOWN')
    expect(result.readiness).toBe('MORE_INFORMATION_REQUIRED')
  })

  it('keeps an expected term distinct from a selected negotiation term', () => {
    const result = assessFreeAgentOfferIntelligence(base, proposal)
    expect(result.expectedTermYears?.value).toBe(2)
    expect(result.proposedTermYears).toBeUndefined()
    expect(result.missingInformation).toContain('SELECTED_NEGOTIATION_TERM_AUTHORITY_UNKNOWN')
  })

  it('does not invent an incoming player role or opening agent fee', () => {
    const result = assessFreeAgentOfferIntelligence(base, proposal)
    expect(result.proposedRole).toBeUndefined()
    expect(result.roleAuthority).toBe('UNKNOWN')
    expect(result.agentFee).toBeUndefined()
    expect(result.agentFeeAuthority).toBe('UNKNOWN')
    expect(result.missingInformation).toEqual(expect.arrayContaining(['INCOMING_CONTRACT_ROLE_AUTHORITY_UNKNOWN', 'OPENING_AGENT_FEE_AUTHORITY_UNKNOWN']))
  })

  it('resolves the real current recommend-signings holder while keeping advisory separate from execution authority', () => {
    const staffId = staffPersonIdFromString('offer-test:general-manager')
    const responsibilityId = `responsibility:${teamId}:recommendSignings`
    const world = updateGameWorld(base, {
      staffPeople: [...Object.values(base.staffPeopleById), {
        id: staffId,
        identity: { firstName: 'Offer', lastName: 'Manager' },
        professional: { attributes: Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 70])) as Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number> },
      }],
      teamStaffAssignments: [...Object.values(base.teamStaffAssignmentsById), {
        id: teamStaffAssignmentIdFromString('offer-test:general-manager-assignment'), staffPersonId: staffId, teamId, role: 'generalManager', assignedOn: base.currentDate,
      }],
      responsibilities: [
      ...Object.values(base.responsibilitiesById).filter((item) => item.id !== responsibilityId),
        { id: responsibilityId as never, teamId, kind: 'recommendSignings', mode: 'advisory', holderStaffId: staffId },
      ],
    })
    const result = assessFreeAgentOfferIntelligence(world, proposal)
    expect(result.transactionResponsibility).toMatchObject({
      kind: 'recommendSignings', mode: 'advisory', status: 'RESOLVED_HOLDER',
      holder: { staffId, role: 'generalManager' }, openingAuthority: 'UNKNOWN',
    })
    expect(result.transactionResponsibility.holder?.name).toBe('Offer Manager')
    expect(result.governanceAuthority).toBe('UNKNOWN')
  })

  it('does not treat an AI team userControlled responsibility as autonomous execution', () => {
    const result = assessFreeAgentOfferIntelligence(base, proposal)
    expect(result.contactAuthority.authorityStatus).toBe('AUTHORIZED')
    const responsibilityId = `responsibility:${teamId}:initiateNegotiationContact`
    const withoutContactDelegation = updateGameWorld(base, { responsibilities: [...Object.values(base.responsibilitiesById).filter((item) => item.id !== responsibilityId), { id: responsibilityId as never, teamId, kind: 'initiateNegotiationContact', mode: 'userControlled' }] })
    expect(resolveNegotiationContactAuthority(withoutContactDelegation, teamId)).toMatchObject({ authorityStatus: 'NO_EXECUTION_OWNER', reasons: ['USER_CONTROLLED_MODE_DOES_NOT_DELEGATE_TO_AI'] })
    const organizational = updateGameWorld(base, { responsibilities: [...Object.values(base.responsibilitiesById).filter((item) => item.id !== responsibilityId), { id: responsibilityId as never, teamId, kind: 'initiateNegotiationContact', mode: 'organizational' }] })
    expect(resolveNegotiationContactAuthority(organizational, teamId)).toMatchObject({ authorityStatus: 'NO_EXECUTION_OWNER', reasons: ['ORGANIZATIONAL_MODE_HAS_NO_CONTACT_EXECUTOR'] })
  })

  it('keeps direct user authority at the application boundary without requiring AI staff authority', () => {
    const contactResponsibilityId = `responsibility:${teamId}:initiateNegotiationContact`
    const userWorld = updateGameWorld(base, { userCoachId: base.teams[teamId]!.coachId!, gmPlanStates: [], responsibilities: Object.values(base.responsibilitiesById).filter((item) => item.id !== contactResponsibilityId) })
    expect(resolveNegotiationContactAuthority(userWorld, teamId)).toMatchObject({ authorityStatus: 'USER_CONTROLLED', governanceRequirement: 'NOT_REQUIRED' })
  })

  it('resolves AI contact only from a valid delegated execution responsibility, never a title', () => {
    const aiWorld = base
    const staffId = Object.values(base.teamStaffAssignmentsById).find((item) => item.teamId === teamId && ['generalManager', 'assistantGeneralManager', 'directorOfBasketballOperations', 'sportingDirector'].includes(item.role))!.staffPersonId
    const responsibilityId = `responsibility:${teamId}:initiateNegotiationContact`
    const world = updateGameWorld(aiWorld, {
      responsibilities: [...Object.values(aiWorld.responsibilitiesById).filter((item) => item.id !== responsibilityId), { id: responsibilityId as never, teamId, kind: 'initiateNegotiationContact', mode: 'delegated', holderStaffId: staffId }],
    })
    expect(resolveNegotiationContactAuthority(world, teamId)).toMatchObject({ authorityStatus: 'AUTHORIZED', executionMode: 'delegated', responsibleStaffId: staffId, responsibleRole: 'generalManager', governanceRequirement: 'NOT_REQUIRED' })
    expect(assessFreeAgentOfferIntelligence(world, proposal).contactReadiness).toBe('READY_TO_CONTACT')
  })

  it('keeps advisory recommendation and organizational contact ownership from authorizing AI contact', () => {
    const aiWorld = base
    const withoutExecution = updateGameWorld(aiWorld, { responsibilities: Object.values(aiWorld.responsibilitiesById).filter((item) => !(item.teamId === teamId && item.kind === 'initiateNegotiationContact')) })
    const staffId = Object.values(base.teamStaffAssignmentsById).find((item) => item.teamId === teamId && ['generalManager', 'assistantGeneralManager', 'directorOfBasketballOperations', 'sportingDirector'].includes(item.role))!.staffPersonId
    const recommendationId = `responsibility:${teamId}:recommendSignings`
    const advisory = updateGameWorld(withoutExecution, { responsibilities: [...Object.values(withoutExecution.responsibilitiesById).filter((item) => item.id !== recommendationId), { id: recommendationId as never, teamId, kind: 'recommendSignings', mode: 'advisory', holderStaffId: staffId }] })
    const result = assessFreeAgentOfferIntelligence(advisory, proposal)
    expect(result.transactionResponsibility.kind).toBe('recommendSignings')
    expect(result.contactAuthority.authorityStatus).toBe('NO_EXECUTION_OWNER')
    expect(result.contactReadiness).toBe('CONTACT_AUTHORITY_UNAVAILABLE')
    expect(result.contactAuthority.responsibleStaffId).toBeUndefined()
  })

  it('blocks an invalid delegated assignment instead of trusting the staff title', () => {
    const aiWorld = base
    const staffId = staffPersonIdFromString('offer-test:invalid-contact-operator')
    const responsibilityId = `responsibility:${teamId}:initiateNegotiationContact`
    const withStaff = updateGameWorld(aiWorld, {
      staffPeople: [...Object.values(aiWorld.staffPeopleById), { id: staffId, identity: { firstName: 'Taylor', lastName: 'Invalid' }, professional: { attributes: Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 70])) as Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number> } }],
      teamStaffAssignments: [...Object.values(aiWorld.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString('offer-test:invalid-contact-assignment'), staffPersonId: staffId, teamId, role: 'generalManager', assignedOn: base.currentDate }],
      responsibilities: [...Object.values(aiWorld.responsibilitiesById).filter((item) => item.id !== responsibilityId), { id: responsibilityId as never, teamId, kind: 'initiateNegotiationContact', mode: 'delegated', holderStaffId: staffId }],
    })
    const assignmentId = teamStaffAssignmentIdFromString('offer-test:invalid-contact-assignment')
    const corrupted = { ...withStaff, teamStaffAssignmentsById: { ...withStaff.teamStaffAssignmentsById, [assignmentId]: { ...withStaff.teamStaffAssignmentsById[assignmentId]!, role: 'analyticsStaff' } } } as GameWorld
    expect(resolveNegotiationContactAuthority(corrupted, teamId)).toMatchObject({ authorityStatus: 'BLOCKED', blockers: [expect.stringContaining('INVALID_CONTACT_EXECUTION_ASSIGNMENT')] })
  })

  it('does not require salary, terms, role, or fee for contact readiness', () => {
    const result = assessFreeAgentOfferIntelligence(base, { ...proposal, knownExpectedSalary: undefined, expectedTermYears: undefined })
    expect(result.contactReadiness).toBe('READY_TO_CONTACT')
    expect(result.readiness).toBe('MORE_INFORMATION_REQUIRED')
    expect(result.missingInformation).toEqual(expect.arrayContaining(['EXPECTED_SALARY_UNKNOWN', 'SELECTED_NEGOTIATION_TERM_AUTHORITY_UNKNOWN', 'INCOMING_CONTRACT_ROLE_AUTHORITY_UNKNOWN', 'OPENING_AGENT_FEE_AUTHORITY_UNKNOWN']))
  })

  it('derives repeatable action keys and advances the key only after the same attempt closes', () => {
    const identity = { teamId, playerId, planId: proposal.planId, proposalId: proposal.id }
    const first = deriveNegotiationAttemptKey(base, identity)
    expect(deriveNegotiationAttemptKey(base, identity)).toBe(first)
    const contact = createNegotiationContact({ organizationId: base.teams[teamId]!.organizationId, teamId, playerId, startedOn: base.currentDate, actionKey: first, sourcePlanId: proposal.planId, sourceProposalId: proposal.id, responsibleActor: { kind: 'USER' } })
    const closedRecord: ContractNegotiation = { id: `${contact.id}:closed-offer`, organizationId: base.teams[teamId]!.organizationId, teamId, playerId, startedOn: base.currentDate, openingKey: contact.openingKey, sourcePlanId: proposal.planId, sourceProposalId: proposal.id, status: 'REJECTED', salary: 650_000, years: 1, role: 'ROTATION', agentFee: 0, round: 1 }
    const closed = updateGameWorld(base, { negotiations: [closedRecord] })
    expect(deriveNegotiationAttemptKey(closed, identity)).not.toBe(first)
    expect(deriveNegotiationAttemptKey(closed, identity)).toBe(deriveNegotiationAttemptKey(closed, identity))
  })

  it('leaves responsibility unknown when no current recommendation row exists', () => {
    const world = updateGameWorld(base, { responsibilities: Object.values(base.responsibilitiesById).filter((item) => !(item.teamId === teamId && item.kind === 'recommendSignings')) })
    const result = assessFreeAgentOfferIntelligence(world, proposal)
    expect(result.transactionResponsibility.status).toBe('UNKNOWN')
    expect(result.blockers).toContain('TRANSACTION_RESPONSIBILITY_UNKNOWN')
  })

  it('keeps a currently affordable BS10B estimate separate from current payroll and Finance V2 context', () => {
    const currentPayroll = getTeamFinancialSnapshot(base, teamId).currentPlayerPayroll
    const tightened = updateGameWorld(base, {
      teamFinances: Object.values(base.teamFinancesByTeamId).map((item) => item.teamId === teamId ? { ...item, playerSalaryBudget: currentPayroll + 100_000 } : item),
    })
    const stressedProposal = { ...proposal, preferredCandidate: { ...proposal.preferredCandidate!, feasibility: { ...proposal.preferredCandidate!.feasibility, financeV2Context: 'STRESSED' as const } } }
    const result = assessFreeAgentOfferIntelligence(tightened, stressedProposal)
    expect(proposal.preferredCandidate?.feasibility.affordability).toBe('AFFORDABLE')
    expect(result.payrollAffordability).toBe('OVER_BUDGET')
    expect(result.readiness).toBe('FINANCIAL_BLOCK')
    expect(result.financeV2Context).toBe('STRESSED')
    expect(canTeamAffordAdditionalSalary(base, teamId, 650_000)).toBe(true)
  })

  it('requires the exact current positive contact and prepares only club-known salary and term values', () => {
    const setup = withPositiveContact()
    const result = assessFormalOfferPreparation(setup.world, setup.offer)
    expect(result).toMatchObject({
      negotiationId: setup.contact.id,
      currentContactResponse: 'OPEN_TO_TALKS',
      salaryExpectation: { value: 650_000, source: 'AGENT', confidence: 75 },
      salaryProposal: { amount: 650_000, policy: 'MATCH_KNOWN_EXPECTATION' },
      salaryAuthority: 'MATCH_KNOWN_EXPECTATION',
      expectedTermYears: { value: 2, source: 'AGENT' },
      termProposalYears: 2,
      termAuthority: 'MATCH_KNOWN_EXPECTED_YEARS',
      roleStatus: 'NOT_YET_PROPOSED',
      roleAuthority: 'NOT_REQUIRED_AT_OPEN',
      agentFeeStatus: 'NOT_YET_PROPOSED',
      agentFeeAuthority: 'NOT_REQUIRED_AT_OPEN',
      payrollAffordability: 'AFFORDABLE',
      readiness: 'NO_EXECUTION_OWNER',
      governanceAuthority: 'NOT_REQUIRED',
      signingGovernanceDecisionType: 'PLAYER_CONTRACT_SIGNING',
    })
    expect(result).not.toHaveProperty('roleProposal')
    expect(result).not.toHaveProperty('agentFeeProposal')
    expect(result.missingInformation).not.toContain('INCOMING_PLAYER_ROLE_AUTHORITY_UNKNOWN')
    expect(result.missingInformation).not.toContain('OPENING_AGENT_FEE_AUTHORITY_UNKNOWN')
    expect(result.deferredInformation).toEqual(expect.arrayContaining(['ROLE_PROPOSAL_DEFERRED_UNTIL_SUPPORTED_OR_AGREED', 'AGENT_FEE_DEFERRED_UNTIL_EXPLICITLY_REVEALED']))
    expect(setup.world.negotiationsById[setup.contact.id]).toEqual(setup.contact)
    expect(setup.world.contractsById).toBe(base.contractsById)
    expect(setup.world.playerTransactionsById).toBe(base.playerTransactionsById)
    expect(setup.world.teams[teamId]!.rosterPlayerIds).toEqual(base.teams[teamId]!.rosterPlayerIds)
  })

  it('keeps explicit role and fee proposals visible without making them OPEN requirements', () => {
    const setup = withPositiveContact()
    const explicitProposal = { ...setup.offer, proposedRole: 'ROTATION' as const, agentFee: 75_000 }
    const result = assessFormalOfferPreparation(setup.world, explicitProposal)
    expect(result).toMatchObject({
      roleProposal: 'ROTATION',
      roleStatus: 'PROPOSED',
      roleAuthority: 'UNKNOWN',
      agentFeeProposal: 75_000,
      agentFeeStatus: 'PROPOSED',
      agentFeeAuthority: 'UNKNOWN',
      readiness: 'NO_EXECUTION_OWNER',
    })
    expect(result.missingInformation).not.toContain('INCOMING_PLAYER_ROLE_AUTHORITY_UNKNOWN')
    expect(result.missingInformation).not.toContain('OPENING_AGENT_FEE_AUTHORITY_UNKNOWN')
  })

  it('rebuilds current GM and BS10C state instead of trusting a historical offer snapshot', () => {
    const setup = withPositiveContact()
    const preparations = assessRoutedFormalOfferPreparations(setup.world, teamId)
    expect(preparations).toHaveLength(1)
    expect(preparations[0]).toMatchObject({ readiness: 'STALE', blockers: expect.arrayContaining(['CURRENT_GM_PLAN_OR_BS10C_PROPOSAL_UNAVAILABLE']) })
    expect(preparations[0]?.negotiationId).toBeUndefined()
    expect(setup.world.negotiationsById[setup.contact.id]).toEqual(setup.contact)
    expect(setup.world.contractsById).toBe(base.contractsById)
    expect(setup.world.playerTransactionsById).toBe(base.playerTransactionsById)
  })

  it('does not proceed from pending/refused contacts or after the player is no longer a free agent', () => {
    const setup = withPositiveContact()
    const pending = updateGameWorld(setup.world, { negotiations: [{ ...setup.contact, contactResponse: undefined }] })
    expect(assessFormalOfferPreparation(pending, setup.offer).readiness).toBe('CONTACT_NOT_POSITIVE')
    const refusedContact = { ...setup.contact, status: 'CLOSED', contactResponse: { ...setup.contact.contactResponse!, outcome: 'NOT_INTERESTED' } } as ContractNegotiation
    const refused = updateGameWorld(setup.world, { negotiations: [refusedContact] })
    expect(assessFormalOfferPreparation(refused, setup.offer).readiness).toBe('CONTACT_NOT_POSITIVE')
    const signed = signFreeAgent(setup.world, teamId, playerId)
    expect(assessFormalOfferPreparation(signed, setup.offer).readiness).toBe('STALE')
  })

  it('leaves salary and term unresolved when current club-known evidence is absent', () => {
    const setup = withPositiveContact()
    const unknownExpectations = { ...setup.offer, preparedSalary: undefined, expectedTermYears: undefined }
    const userWorld = updateGameWorld(setup.world, { userCoachId: setup.world.teams[teamId]!.coachId!, gmPlanStates: [] })
    const result = assessFormalOfferPreparation(userWorld, unknownExpectations)
    expect(result.salaryProposal).toBeUndefined()
    expect(result.termProposalYears).toBeUndefined()
    expect(result.payrollAffordability).toBe('UNKNOWN')
    expect(result.missingInformation).toEqual(expect.arrayContaining(['CLUB_KNOWN_EXPECTED_SALARY_UNKNOWN', 'CLUB_KNOWN_EXPECTED_TERM_UNKNOWN']))
    expect(result.readiness).toBe('MORE_INFORMATION_REQUIRED')
  })

  it('requires an offer-specific delegated owner for AI and keeps user authority separate', () => {
    const setup = withPositiveContact()
    const unresolved = assessFormalOfferPreparation(setup.world, setup.offer)
    expect(setup.offer.contactAuthority.authorityStatus).toBe('AUTHORIZED')
    expect(unresolved.executionResponsibility.kind).toBe('submitPlayerContractOffer')
    expect(unresolved.executionResponsibility.status).toBe('NO_EXECUTION_OWNER')
    expect(unresolved.readiness).toBe('NO_EXECUTION_OWNER')

    const staffId = setup.offer.contactAuthority.responsibleStaffId!
    const responsibilityId = responsibilityIdForTeam(teamId, 'submitPlayerContractOffer')
    const delegated = updateGameWorld(setup.world, { responsibilities: [...Object.values(setup.world.responsibilitiesById).filter((item) => item.id !== responsibilityId), { id: responsibilityId, teamId, kind: 'submitPlayerContractOffer', mode: 'delegated', holderStaffId: staffId }] })
    const delegatedPreparation = assessFormalOfferPreparation(delegated, setup.offer)
    expect(delegatedPreparation.executionResponsibility).toMatchObject({ status: 'RESOLVED_HOLDER', owner: { kind: 'STAFF', staffPersonId: staffId } })
    expect(delegatedPreparation.readiness).toBe('READY_TO_SUBMIT_OFFER')

    const userWorld = updateGameWorld(setup.world, { userCoachId: setup.world.teams[teamId]!.coachId!, gmPlanStates: [] })
    expect(assessFormalOfferPreparation(userWorld, setup.offer).executionResponsibility).toMatchObject({ status: 'USER_AUTHORITY', owner: { kind: 'USER' } })
  })

  it('rechecks salary affordability and ignores hidden external ratings and MarketReality', () => {
    const setup = withPositiveContact()
    const payroll = getTeamFinancialSnapshot(setup.world, teamId).currentPlayerPayroll
    const tightened = updateGameWorld(setup.world, { teamFinances: Object.values(setup.world.teamFinancesByTeamId).map((item) => item.teamId === teamId ? { ...item, playerSalaryBudget: payroll + 100_000 } : item) })
    expect(assessFormalOfferPreparation(tightened, setup.offer).payrollAffordability).toBe('OVER_BUDGET')
    expect(assessFormalOfferPreparation(tightened, setup.offer).readiness).toBe('FINANCIAL_BLOCK')
    const changedTruth = updateGameWorld(setup.world, {
      players: Object.values(setup.world.players).map((player) => player.id === playerId ? { ...player, basketball: { ...player.basketball, ratings: Object.fromEntries(Object.keys(player.basketball.ratings).map((key) => [key, 100])) as typeof player.basketball.ratings } } : player),
      marketReality: Object.values(setup.world.marketRealityByPlayerId).map((item) => item.playerId === playerId ? { ...item, expectedSalary: 90_000_000, expectedYears: 10, playerWillingness: 0 } : item),
    })
    expect(assessFormalOfferPreparation(changedTruth, setup.offer)).toEqual(assessFormalOfferPreparation(setup.world, setup.offer))
  })

  it('detects an active canonical negotiation before indicating readiness', () => {
    const organizationId = base.teams[teamId]!.organizationId
    const id = `negotiation:${organizationId}:${playerId}:${base.currentDate}`
    const world = updateGameWorld(base, { negotiations: [{ id, organizationId, playerId, salary: 650_000, years: 2, role: 'ROTATION', agentFee: 1, status: 'OPEN', round: 0 }] })
    const result = assessFreeAgentOfferIntelligence(world, proposal)
    expect(result.readiness).toBe('NEGOTIATION_ALREADY_EXISTS')
    expect(result.existingNegotiation).toMatchObject({ id, status: 'OPEN', kind: 'ACTIVE' })
  })

  it('does not let a closed historical legacy ID block a later idempotent attempt', () => {
    const organizationId = base.teams[teamId]!.organizationId
    const id = `negotiation:${organizationId}:${playerId}:${base.currentDate}`
    const world = updateGameWorld(base, { negotiations: [{ id, organizationId, playerId, salary: 650_000, years: 2, role: 'ROTATION', agentFee: 1, status: 'REJECTED', round: 1 }] })
    const result = assessFreeAgentOfferIntelligence(world, proposal)
    expect(result.readiness).toBe('MORE_INFORMATION_REQUIRED')
    expect(result.existingNegotiation).toBeUndefined()
  })

  it('treats an existing contact as the one active team/player negotiation', () => {
    const organizationId = base.teams[teamId]!.organizationId
    const actionKey = assessFreeAgentOfferIntelligence(base, proposal).actionKey!
    const contact = createNegotiationContact({ organizationId, teamId, playerId, startedOn: base.currentDate, actionKey, ...(proposal.planId === undefined ? {} : { sourcePlanId: proposal.planId }), sourceProposalId: proposal.id, responsibleActor: { kind: 'USER' } })
    const world = updateGameWorld(base, { negotiations: [contact] })
    const result = assessFreeAgentOfferIntelligence(world, proposal)
    expect(result.contactReadiness).toBe('ACTIVE_NEGOTIATION_EXISTS')
    expect(result.readiness).toBe('NEGOTIATION_ALREADY_EXISTS')
    expect(result.existingNegotiation).toMatchObject({ status: 'CONTACTED', kind: 'ACTIVE' })
  })

  it('blocks contact readiness when the source plan no longer exists or selects external acquisition', () => {
    const stale = { ...proposal, planId: 'missing-plan' }
    expect(assessFreeAgentOfferIntelligence(base, stale)).toMatchObject({ contactReadiness: 'STALE_PLAN_OR_PROPOSAL', readiness: 'STALE_PLAN_OR_PROPOSAL', blockers: expect.arrayContaining(['STALE_GM_PLAN_OR_PROPOSAL']) })
  })

  it('revalidates free-agent status against current world state instead of the BS10C snapshot', () => {
    const newlySigned = updateGameWorld(signFreeAgent(base, teamId, playerId), { gmPlanStates: [base.gmPlanStatesById[proposal.planId!]!] })
    expect(assessFreeAgentOfferIntelligence(newlySigned, proposal)).toMatchObject({ contactReadiness: 'CANDIDATE_NOT_FREE_AGENT', readiness: 'UNSUPPORTED', blockers: expect.arrayContaining(['CANDIDATE_NO_LONGER_FREE_AGENT']) })
  })

  it('keeps player-budget governance separate from transaction authority', () => {
    const result = assessFreeAgentOfferIntelligence(base, proposal)
    expect(result.governanceAuthority).toBe('UNKNOWN')
    expect(result.blockers).toContain('TRANSACTION_GOVERNANCE_AUTHORITY_UNKNOWN')
    expect(result.readiness).toBe('MORE_INFORMATION_REQUIRED')
  })

  it('keeps trade enquiries and no-action proposals out of free-agent offer progression', () => {
    const trade = assessFreeAgentOfferIntelligence(base, { ...proposal, proposalType: 'TRADE_ENQUIRY' })
    expect(trade.outcome).toBe('TRADE_ENQUIRY_ONLY')
    expect(trade.blockers).toContain('TRADE_PACKAGE_INTELLIGENCE_REQUIRED')
    expect(trade.readiness).toBe('UNSUPPORTED')

    const noAction = assessFreeAgentOfferIntelligence(base, { ...proposal, proposalType: 'NO_ACTIONABLE_PROPOSAL', noProposalReason: 'NO_CANONICAL_TRANSFER_MODEL' })
    expect(noAction.outcome).toBe('NO_ACTIONABLE_PROPOSAL')
    expect(noAction.blockers).toContain('NO_CANONICAL_TRANSFER_MODEL')
    expect(noAction.readiness).toBe('UNSUPPORTED')
  })

  it('does not change offer intelligence when hidden ratings or MarketReality changes', () => {
    const before = assessFreeAgentOfferIntelligence(base, proposal)
    const changedTruth = updateGameWorld(base, {
      players: Object.values(base.players).map((player) => player.id === playerId
        ? { ...player, basketball: { ...player.basketball, ratings: Object.fromEntries(Object.keys(player.basketball.ratings).map((key) => [key, 1])) as typeof player.basketball.ratings } }
        : player),
      marketReality: Object.values(base.marketRealityByPlayerId).map((truth) => truth.playerId === playerId
        ? { ...truth, expectedSalary: 99_000_000, expectedYears: 4, playerWillingness: 0 }
        : truth),
    })
    expect(assessFreeAgentOfferIntelligence(changedTruth, proposal)).toEqual(before)
  })

  it('is deterministic and creates no negotiation, contract, transaction, Governance or Finance state', () => {
    const before = {
      negotiations: base.negotiationsById,
      contracts: base.contractsById,
      transactions: base.playerTransactionsById,
      governance: base.governanceRequestsById,
      finance: base.treasuryApplicationsById,
    }
    const first = assessFreeAgentOfferIntelligence(base, proposal)
    const second = assessFreeAgentOfferIntelligence(base, proposal)
    expect(second).toEqual(first)
    expect(base.negotiationsById).toBe(before.negotiations)
    expect(base.contractsById).toBe(before.contracts)
    expect(base.playerTransactionsById).toBe(before.transactions)
    expect(base.governanceRequestsById).toBe(before.governance)
    expect(base.treasuryApplicationsById).toBe(before.finance)
  })

  it('readiness checks each canonical negotiation requirement without a constant fallback', () => {
    expect(assessNegotiationOpeningReadiness({
      isCurrentFreeAgent: true,
      payrollAffordability: 'AFFORDABLE',
      requiredFields: { salary: true, termYears: true, role: true, agentFee: true },
      existingNegotiation: 'NONE',
      governanceAuthority: 'AUTHORIZED',
      responsibilityOpeningAuthority: 'AUTHORIZED',
    })).toMatchObject({ readiness: 'READY_TO_OPEN_NEGOTIATION', missingInformation: [] })
    expect(assessNegotiationOpeningReadiness({
      isCurrentFreeAgent: true,
      payrollAffordability: 'AFFORDABLE',
      requiredFields: { salary: true, termYears: true, role: true, agentFee: false },
      existingNegotiation: 'NONE',
      governanceAuthority: 'AUTHORIZED',
      responsibilityOpeningAuthority: 'AUTHORIZED',
    })).toMatchObject({ readiness: 'MORE_INFORMATION_REQUIRED', missingInformation: ['OPENING_AGENT_FEE_AUTHORITY_UNKNOWN'] })
  })
})

function makeNeed(): ClubNeed {
  return {
    id: 'test-need', priorityRank: 1, kind: 'POSITIONAL_DEPTH', severity: 'HIGH', urgency: 'SOON', confidence: 'HIGH', strategicFit: 'HIGH',
    affectedArea: 'POSITION', targetPosition: 'PG', relatedPlayerIds: [], evidence: [], temporalScope: 'STRUCTURAL', financialContext: 'HEALTHY',
  }
}

function withPositiveContact(): { world: GameWorld; offer: ReturnType<typeof assessFreeAgentOfferIntelligence>; contact: ContractNegotiation } {
  const offer = assessFreeAgentOfferIntelligence(base, proposal)
  if (offer.actionKey === undefined || offer.sourcePlanId === undefined || offer.contactAuthority.authorityStatus !== 'AUTHORIZED') {
    throw new Error('Expected a current free-agent offer with contact authority')
  }
  const responsibleActor = offer.contactAuthority.responsibleStaffId === undefined
    ? { kind: 'USER' as const }
    : { kind: 'STAFF' as const, staffPersonId: offer.contactAuthority.responsibleStaffId }
  const contact = createNegotiationContact({
    organizationId: base.teams[teamId]!.organizationId,
    teamId,
    playerId,
    startedOn: base.currentDate,
    actionKey: offer.actionKey,
    sourcePlanId: offer.sourcePlanId,
    sourceProposalId: offer.sourceProposalId,
    responsibleActor,
  })
  const positiveContact: ContractNegotiation = {
    ...contact,
    contactResponse: { outcome: 'OPEN_TO_TALKS', respondedOn: base.currentDate, marketSignalId: 'signal:offer-preparation-test' },
  }
  return { world: updateGameWorld(base, { negotiations: [positiveContact] }), offer, contact: positiveContact }
}
