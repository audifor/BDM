import { beforeAll, describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { releasePlayer } from '@/app/market'
import { staffPersonIdFromString, teamStaffAssignmentIdFromString } from '@/domain/ids'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { negotiationIdForOpening } from '@/domain/market'
import { createGMPlanState } from '@/domain/gmPlanning'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { assessGMDecisionContext } from '@/engine/gmDecisionContext'
import { reviewClubManagementPlanning } from '@/app/gmPlanning/GMPlanningLifecycleService'
import { assessRoutedFreeAgentOfferIntelligence } from './FreeAgentOfferIntelligenceService'
import { initiatePreferredFreeAgentContact } from './FreeAgentContactService'

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
    expect(contact).toMatchObject({ status: 'CONTACTED', teamId, playerId: expected.playerId, sourcePlanId: expected.sourcePlanId, sourceProposalId: proposalId, responsibleActor: { kind: 'STAFF', staffPersonId: expected.contactAuthority.responsibleStaffId } })
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
    expect(result.contact?.responsibleActor).toEqual({ kind: 'USER' })
  })
})
