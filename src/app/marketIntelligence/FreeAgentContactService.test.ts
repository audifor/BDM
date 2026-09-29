import { beforeAll, describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { releasePlayer } from '@/app/market'
import { staffPersonIdFromString, teamStaffAssignmentIdFromString } from '@/domain/ids'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { negotiationIdForOpening, type ContractNegotiation } from '@/domain/market'
import { createGMPlanState } from '@/domain/gmPlanning'
import { addDays } from '@/domain/date'
import { responsibilityIdForTeam } from '@/domain/responsibility'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { assessGMDecisionContext } from '@/engine/gmDecisionContext'
import { reviewClubManagementPlanning } from '@/app/gmPlanning/GMPlanningLifecycleService'
import { assessRoutedFreeAgentOfferIntelligence } from './FreeAgentOfferIntelligenceService'
import { initiatePreferredFreeAgentContact } from './FreeAgentContactService'
import { assessRoutedFormalOfferPreparations, submitAiOffersAfterPositiveContactResponses, submitPreparedFreeAgentOffer } from './index'
import { progressNegotiationContactResponses } from '@/engine/market'
import { initializeMarketAgents } from '@/engine/market'

let plannedWorld: GameWorld
let teamId: keyof GameWorld['teams']
let proposalId: string

beforeAll(() => {
  const initial = createNewGame()
  const aiTeams = Object.values(initial.teams).filter((item) => item.coachId !== undefined && item.coachId !== initial.userCoachId)
  const team = aiTeams.find((item) => initial.clubStrategicStatesByTeamId[item.id]?.mode === 'CONTEND') ?? aiTeams[0]!
  const source = Object.values(initial.teams).find((item) => item.id !== team.id && item.rosterPlayerIds.length > 5)!
  const released = source.rosterPlayerIds.slice(0, 3).reduce((current, playerId) => releasePlayer(current, source.id, playerId), initial)
  const assignment = Object.values(released.teamStaffAssignmentsById).find((item) => item.teamId === team.id && ['generalManager', 'assistantGeneralManager', 'directorOfBasketballOperations', 'sportingDirector'].includes(item.role))!
  const operatorId = assignment?.staffPersonId ?? staffPersonIdFromString('bs10d-b:contact-operator')
  const contactResponsibilityId = `responsibility:${team.id}:initiateNegotiationContact`
  const shortRoster = updateGameWorld(released, {
    teams: Object.values(released.teams).map((item) => item.id === team.id ? { ...item, rosterPlayerIds: item.rosterPlayerIds.slice(0, 5) } : item),
    marketKnowledge: [...released.marketKnowledge, ...source.rosterPlayerIds.slice(0, 3).map((playerId) => ({ organizationId: team.organizationId, playerId, availability: 'OPEN' as const, expectedSalary: 650_000, expectedYears: 2, playerInterest: 60, confidence: 75, assessedAt: released.currentDate, source: 'AGENT' as const }))],
    organizationKnowledge: [...released.organizationKnowledge, ...source.rosterPlayerIds.slice(0, 3).map((subjectPlayerId) => ({ organizationId: team.organizationId, subjectPlayerId, dimensions: { shooting: { coverage: 0.9, confidence: 0.8, assessedAt: released.currentDate, provenance: 'scoutReport' as const, estimate: 75, uncertainty: 2 }, creation: { coverage: 0.9, confidence: 0.8, assessedAt: released.currentDate, provenance: 'scoutReport' as const, estimate: 75, uncertainty: 2 }, interiorDefense: { coverage: 0.9, confidence: 0.8, assessedAt: released.currentDate, provenance: 'scoutReport' as const, estimate: 70, uncertainty: 2 } } }))],
    ...(assignment === undefined ? {
      staffPeople: [...Object.values(released.staffPeopleById), { id: operatorId, identity: { firstName: 'Contact', lastName: 'Operator' }, professional: { attributes: Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 70])) as Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number> } }],
      teamStaffAssignments: [...Object.values(released.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString('bs10d-b:contact-operator-assignment'), staffPersonId: operatorId, teamId: team.id, role: 'generalManager' as const, assignedOn: released.currentDate }],
    } : {}),
    responsibilities: [...Object.values(released.responsibilitiesById).filter((item) => item.id !== contactResponsibilityId), { id: contactResponsibilityId as never, teamId: team.id, kind: 'initiateNegotiationContact', mode: 'delegated', holderStaffId: operatorId }],
  })
  const reviewed = reviewClubManagementPlanning(shortRoster, team.id, 'EXPLICIT_REVIEW')
  const need = assessGMDecisionContext(reviewed.world, team.id).needsAssessment.needs[0]!
  const planId = `${team.id}:${need.id}`
  const priorStrategy = reviewed.world.clubStrategicStatesByTeamId[team.id]!
  const planWorld = updateGameWorld(reviewed.world, {
    gmPlanStates: [...Object.values(reviewed.world.gmPlanStatesById).filter((plan) => plan.teamId !== team.id), createGMPlanState({ id: planId, teamId: team.id, needId: need.id, selectedOptionKind: 'EXTERNAL_ACQUISITION', selectedOn: reviewed.world.currentDate, lastReviewedOn: reviewed.world.currentDate, selectionReason: 'INITIAL_SELECTION', executionReadinessAtSelection: 'UNKNOWN_AUTHORITY', strategyAtSelection: 'CONTEND', originalOptionPriority: 1 })],
    clubStrategicStatesByTeamId: { ...reviewed.world.clubStrategicStatesByTeamId, [team.id]: { ...priorStrategy, mode: 'CONTEND', horizon: 'NOW', riskTolerance: 'HIGH', developmentEmphasis: 15, acquisitionAggression: 'HIGH' } },
  })
  const ready = assessRoutedFreeAgentOfferIntelligence(planWorld, team.id).find((offer) => offer.outcome === 'FREE_AGENT_OFFER' && offer.contactReadiness === 'READY_TO_CONTACT' && offer.contactAuthority.authorityStatus === 'AUTHORIZED')
  if (ready === undefined) throw new Error(`Expected a current routed and authorized free-agent approach fixture; plans=${JSON.stringify(Object.values(reviewed.world.gmPlanStatesById).filter((plan) => plan.teamId === team.id).map((plan) => ({ needId: plan.needId, option: plan.selectedOptionKind })))} offers=${JSON.stringify(assessRoutedFreeAgentOfferIntelligence(reviewed.world, team.id).map((offer) => ({ outcome: offer.outcome, blockers: offer.blockers, readiness: offer.contactReadiness, id: offer.sourceProposalId })))}`)
  plannedWorld = planWorld
  teamId = team.id
  proposalId = ready.sourceProposalId
}, 120_000)

describe('initiatePreferredFreeAgentContact', () => {
  it('recomputes the live routed proposal and creates exactly one canonical term-free AI contact', () => {
    const before = plannedWorld
    const expected = assessRoutedFreeAgentOfferIntelligence(before, teamId).find((offer) => offer.sourceProposalId === proposalId)!
    const result = initiatePreferredFreeAgentContact(before, teamId, proposalId)
    expect(result.status).toBe('CREATED')
    expect(Object.keys(result.world.negotiationsById)).toHaveLength(Object.keys(before.negotiationsById).length + 1)
    const contact = result.world.negotiationsById[negotiationIdForOpening({ organizationId: before.teams[teamId]!.organizationId, teamId, playerId: expected.playerId!, actionKey: expected.actionKey! })]!
    expect(contact).toMatchObject({ status: 'CONTACTED', teamId, playerId: expected.playerId, sourcePlanId: expected.sourcePlanId, sourceProposalId: proposalId, contactResponsibleActor: { kind: 'STAFF', staffPersonId: expected.contactAuthority.responsibleStaffId } })
    expect(contact.actionKey).toBe(expected.actionKey)
    expect(contact.openingKey).toContain(encodeURIComponent(expected.actionKey!))
    for (const term of ['salary', 'years', 'role', 'agentFee']) expect(contact).not.toHaveProperty(term)
    expect(result.world.contractsById).toBe(before.contractsById)
    expect(result.world.playerTransactionsById).toBe(before.playerTransactionsById)
    expect(result.world.marketKnowledge).toBe(before.marketKnowledge)
    const retry = initiatePreferredFreeAgentContact(result.world, teamId, proposalId)
    expect(retry.status).toBe('ALREADY_EXISTS')
    expect(retry.world).toBe(result.world)
  })

  it('returns stale without mutation when the caller presents an obsolete proposal identifier', () => {
    const result = initiatePreferredFreeAgentContact(plannedWorld, teamId, 'obsolete-proposal-id')
    expect(result.status).toBe('STALE_PLAN_OR_PROPOSAL')
    expect(result.world).toBe(plannedWorld)
  })

  it('rechecks current delegated authority and current external-acquisition plan before mutation', () => {
    const noDelegation = updateGameWorld(plannedWorld, { responsibilities: Object.values(plannedWorld.responsibilitiesById).filter((item) => !(item.teamId === teamId && item.kind === 'initiateNegotiationContact')) })
    const unauthorized = initiatePreferredFreeAgentContact(noDelegation, teamId, proposalId)
    expect(unauthorized.status).toBe('NO_EXECUTION_OWNER')
    expect(unauthorized.world).toBe(noDelegation)

    const noPlan = updateGameWorld(plannedWorld, { gmPlanStates: Object.values(plannedWorld.gmPlanStatesById).filter((plan) => plan.teamId !== teamId) })
    const stale = initiatePreferredFreeAgentContact(noPlan, teamId, proposalId)
    expect(stale.status).toBe('STALE_PLAN_OR_PROPOSAL')
    expect(stale.world).toBe(noPlan)
  })

  it('creates one AI contact at a material planning checkpoint and does not duplicate it on retry', () => {
    const checkpoint = reviewClubManagementPlanning(plannedWorld, teamId, 'EXPLICIT_REVIEW')
    const contactCount = Object.values(checkpoint.world.negotiationsById).filter((item) => item.teamId === teamId && item.status === 'CONTACTED').length
    expect(contactCount, `checkpoint plan state: ${JSON.stringify(Object.values(checkpoint.world.gmPlanStatesById).filter((plan) => plan.teamId === teamId).map((plan) => ({ needId: plan.needId, option: plan.selectedOptionKind })))}; options: ${JSON.stringify(assessGMDecisionContext(plannedWorld, teamId).options.map((option) => ({ needId: option.needId, kind: option.kind, feasibility: option.feasibility, knowledge: option.knowledgeReadiness })))}; live: ${JSON.stringify(assessRoutedFreeAgentOfferIntelligence(checkpoint.world, teamId).map((offer) => ({ outcome: offer.outcome, readiness: offer.contactReadiness, blockers: offer.blockers })))}`).toBeGreaterThanOrEqual(1)
    const repeated = reviewClubManagementPlanning(checkpoint.world, teamId, 'EXPLICIT_REVIEW')
    const repeatedCount = Object.values(repeated.world.negotiationsById).filter((item) => item.teamId === teamId && item.status === 'CONTACTED').length
    expect(repeatedCount).toBe(contactCount)
  })

  it('keeps a user club out of autonomous planning contact', () => {
    const userWorld = updateGameWorld(plannedWorld, { userCoachId: plannedWorld.teams[teamId]!.coachId!, gmPlanStates: Object.values(plannedWorld.gmPlanStatesById).filter((plan) => plan.teamId !== teamId) })
    const result = reviewClubManagementPlanning(userWorld, teamId, 'EXPLICIT_REVIEW')
    expect(result.kind).toBe('USER_RECOMMENDED_WORKFLOW')
    expect(result.world.negotiationsById).toBe(userWorld.negotiationsById)
  })

  it('allows an explicit user application call when the current recommendation is ready', () => {
    const userWorld = updateGameWorld(plannedWorld, { userCoachId: plannedWorld.teams[teamId]!.coachId!, gmPlanStates: Object.values(plannedWorld.gmPlanStatesById).filter((plan) => plan.teamId !== teamId) })
    const ready = assessRoutedFreeAgentOfferIntelligence(userWorld, teamId).find((offer) => offer.outcome === 'FREE_AGENT_OFFER' && offer.contactReadiness === 'READY_TO_CONTACT' && offer.contactAuthority.authorityStatus === 'USER_CONTROLLED')
    if (ready === undefined) throw new Error(`Expected an explicit user recommendation to be contact-ready: ${JSON.stringify(assessRoutedFreeAgentOfferIntelligence(userWorld, teamId).map((offer) => ({ outcome: offer.outcome, readiness: offer.contactReadiness, blockers: offer.blockers })))}`)
    const result = initiatePreferredFreeAgentContact(userWorld, teamId, ready.sourceProposalId)
    expect(result.status).toBe('CREATED')
    expect(result.contact?.contactResponsibleActor).toEqual({ kind: 'USER' })
  })

  it('submits a READY AI offer from recomputed current preparation and preserves the canonical attempt', () => {
    const setup = withPositiveDelegatedContact()
    const beforeNegotiation = setup.world.negotiationsById[setup.contact.id]!
    const preparation = assessRoutedFormalOfferPreparations(setup.world, teamId)[0]!
    expect(preparation.readiness).toBe('READY_TO_SUBMIT_OFFER')
    const result = submitPreparedFreeAgentOffer(setup.world, { teamId, negotiationId: setup.contact.id, expectedProposalId: proposalId })
    expect(result.status).toBe('SUBMITTED')
    expect(result.negotiation).toMatchObject({
      id: beforeNegotiation.id,
      status: 'OPEN',
      salary: preparation.salaryProposal!.amount,
      years: preparation.termProposalYears,
      contactResponsibleActor: beforeNegotiation.contactResponsibleActor,
      offerResponsibleActor: { kind: 'STAFF', staffPersonId: setup.offerOwnerId },
      actionKey: beforeNegotiation.actionKey,
      openingKey: beforeNegotiation.openingKey,
      sourcePlanId: beforeNegotiation.sourcePlanId,
      sourceProposalId: beforeNegotiation.sourceProposalId,
      offerSubmittedOn: setup.world.currentDate,
      round: 0,
      contactResponse: beforeNegotiation.contactResponse,
    })
    expect(result.negotiation).not.toHaveProperty('role')
    expect(result.negotiation).not.toHaveProperty('agentFee')
    expect(result.world.contractsById).toBe(setup.world.contractsById)
    expect(result.world.playerTransactionsById).toBe(setup.world.playerTransactionsById)
    expect(result.world.teams[teamId]!.rosterPlayerIds).toEqual(setup.world.teams[teamId]!.rosterPlayerIds)
    expect(result.world.governanceRequestsById).toBe(setup.world.governanceRequestsById)
    expect(result.world.treasuryApplicationsById).toBe(setup.world.treasuryApplicationsById)
    expect(result.world.marketKnowledge).toBe(setup.world.marketKnowledge)

    const retry = submitPreparedFreeAgentOffer(result.world, { teamId, negotiationId: setup.contact.id, expectedProposalId: proposalId })
    expect(retry.status).toBe('ALREADY_SUBMITTED')
    expect(retry.world).toBe(result.world)
  })

  it('submits an explicit READY user offer but does not autonomously submit user contacts', () => {
    const userWorld = updateGameWorld(plannedWorld, { userCoachId: plannedWorld.teams[teamId]!.coachId!, gmPlanStates: [] })
    const current = assessRoutedFreeAgentOfferIntelligence(userWorld, teamId).find((offer) => offer.outcome === 'FREE_AGENT_OFFER' && offer.contactReadiness === 'READY_TO_CONTACT' && offer.contactAuthority.authorityStatus === 'USER_CONTROLLED')
    if (current === undefined) throw new Error('Expected a current user-authorized proposal')
    const created = initiatePreferredFreeAgentContact(userWorld, teamId, current.sourceProposalId)
    if (created.status !== 'CREATED' || created.contact === undefined) throw new Error('Expected explicit user contact')
    const setup = withPositiveUserContact(created.world, created.contact)
    const automatic = submitAiOffersAfterPositiveContactResponses(setup.world)
    expect(automatic.results).toEqual([])
    expect(automatic.world).toBe(setup.world)
    const result = submitPreparedFreeAgentOffer(setup.world, { teamId, negotiationId: setup.contact.id, expectedProposalId: current.sourceProposalId })
    expect(result.status).toBe('SUBMITTED')
    expect(result.negotiation?.offerResponsibleActor).toEqual({ kind: 'USER' })
    expect(result.negotiation?.contactResponsibleActor).toEqual(setup.contact.contactResponsibleActor)
  })

  it('rejects stale plans, missing delegation, incomplete preparation, and conflicts without mutation', () => {
    const setup = withPositiveDelegatedContact()
    const request = { teamId, negotiationId: setup.contact.id, expectedProposalId: proposalId }
    const stale = updateGameWorld(setup.world, { gmPlanStates: Object.values(setup.world.gmPlanStatesById).filter((plan) => plan.teamId !== teamId) })
    expect(submitPreparedFreeAgentOffer(stale, request)).toMatchObject({ status: 'STALE_PLAN_OR_PROPOSAL', world: stale })
    const noOfferAuthority = updateGameWorld(setup.world, { responsibilities: Object.values(setup.world.responsibilitiesById).filter((item) => !(item.teamId === teamId && item.kind === 'submitPlayerContractOffer')) })
    expect(submitPreparedFreeAgentOffer(noOfferAuthority, request)).toMatchObject({ status: 'NO_EXECUTION_OWNER', world: noOfferAuthority })
    const pendingContact = { ...setup.contact, contactResponse: undefined }
    const pending = updateGameWorld(setup.world, { negotiations: [pendingContact] })
    expect(submitPreparedFreeAgentOffer(pending, request)).toMatchObject({ status: 'CONTACT_NOT_POSITIVE', world: pending })

    const submitted = submitPreparedFreeAgentOffer(setup.world, request)
    if (submitted.status !== 'SUBMITTED') throw new Error('Expected first offer submission')
    const changedRetry = submitPreparedFreeAgentOffer(submitted.world, request)
    expect(changedRetry.status).toBe('ALREADY_SUBMITTED')
    if (submitted.negotiation?.status !== 'OPEN') throw new Error('Expected submitted OPEN negotiation')
    const counteredContact = { ...submitted.negotiation, status: 'COUNTERED' as const, round: 1 }
    const countered = updateGameWorld(submitted.world, { negotiations: [counteredContact] })
    expect(submitPreparedFreeAgentOffer(countered, request)).toMatchObject({ status: 'LIFECYCLE_CONFLICT', world: countered })
  })

  it('submits exactly once at the AI checkpoint immediately after a positive contact response', () => {
    const setup = withDelegatedAiContact()
    const due = updateGameWorld(setup.world, { currentDate: addDays(setup.world.currentDate, 1) })
    const responded = progressNegotiationContactResponses(due)
    expect(responded.negotiationsById[setup.contact.id]).toMatchObject({ status: 'CONTACTED', contactResponse: { outcome: 'OPEN_TO_TALKS', respondedOn: due.currentDate } })
    const result = submitAiOffersAfterPositiveContactResponses(responded)
    expect(result.results.map((item) => item.status)).toEqual(['SUBMITTED'])
    const negotiation = result.world.negotiationsById[setup.contact.id]!
    expect(negotiation).toMatchObject({ status: 'OPEN', contactResponse: { outcome: 'OPEN_TO_TALKS' }, offerResponsibleActor: { kind: 'STAFF', staffPersonId: setup.offerOwnerId }, offerSubmittedOn: responded.currentDate })
    expect(Object.values(result.world.negotiationsById).filter((item) => item.id === setup.contact.id)).toHaveLength(1)
    expect(result.world.contractsById).toBe(setup.world.contractsById)
    expect(result.world.playerTransactionsById).toBe(setup.world.playerTransactionsById)
    expect(submitAiOffersAfterPositiveContactResponses(result.world).results).toEqual([])
  })
})

function withPositiveDelegatedContact() {
  const initial = initiatePreferredFreeAgentContact(plannedWorld, teamId, proposalId)
  if (initial.status !== 'CREATED' || initial.contact === undefined) throw new Error('Expected canonical AI contact')
  const contact = initial.contact
  const actor = contact.contactResponsibleActor
  if (actor?.kind !== 'STAFF') throw new Error('Expected delegated AI contact actor')
  const positive = { ...contact, contactResponse: { outcome: 'OPEN_TO_TALKS' as const, respondedOn: initial.world.currentDate, marketSignalId: `market-signal:test:${contact.id}` } }
  const responsibilityId = responsibilityIdForTeam(teamId, 'submitPlayerContractOffer')
  const world = updateGameWorld(initial.world, {
    negotiations: [positive],
    responsibilities: [...Object.values(initial.world.responsibilitiesById).filter((item) => item.id !== responsibilityId), { id: responsibilityId, teamId, kind: 'submitPlayerContractOffer', mode: 'delegated', holderStaffId: actor.staffPersonId }],
  })
  return { world, contact: positive, offerOwnerId: actor.staffPersonId }
}

function withDelegatedAiContact() {
  const setup = withPositiveDelegatedContact()
  const worldWithReality = initializeMarketAgents(setup.world)
  const current = assessRoutedFreeAgentOfferIntelligence(worldWithReality, teamId).find((offer) => offer.sourceProposalId === proposalId)
  if (current?.preparedSalary === undefined || current.expectedTermYears === undefined) throw new Error('Expected current known salary and term')
  const reality = worldWithReality.marketRealityByPlayerId[setup.contact.playerId]!
  const world = updateGameWorld(worldWithReality, {
    marketReality: [...Object.values(worldWithReality.marketRealityByPlayerId).filter((item) => item.playerId !== setup.contact.playerId), { ...reality, playerWillingness: 75, expectedSalary: current.preparedSalary.value }],
    negotiations: [{ ...setup.contact, contactResponse: undefined }],
  })
  return { ...setup, world }
}

function withPositiveUserContact(world: GameWorld, contact: ContractNegotiation) {
  const positive = { ...contact, contactResponse: { outcome: 'OPEN_TO_TALKS' as const, respondedOn: world.currentDate, marketSignalId: `market-signal:user-test:${contact.id}` } }
  return { world: updateGameWorld(world, { negotiations: [positive] }), contact: positive }
}
