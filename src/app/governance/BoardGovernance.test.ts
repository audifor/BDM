import { describe, expect, it } from 'vitest'

import { createAcbTestGame, createNewGame, evaluateSimulationBreakpoints } from '@/app/game'
import { completeAcceptedFreeAgentSigning } from '@/app/marketIntelligence/FreeAgentSigningService'
import { addDays } from '@/domain/date'
import { createGovernanceRequestEvent } from '@/domain/governance'
import type { TeamId } from '@/domain/ids'
import { updateGameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'

import { executeClubGovernanceDecision, recordClubGovernanceDecisionEvent } from './BoardGovernanceCommands'
import { buildClubGovernanceModel, governanceDecisionById, governanceDecisionTypeIsExecutable, governanceRequestById } from './BoardGovernanceReadModel'
import { playerContractSigningDecisionId, startUserPlayerContractSigning } from './PlayerContractSigningGovernanceService'
import { createGovernanceClubScenario, withCoachFiring, withIssuedGovernanceRequest, withOtherClubBudgetDecision, withPendingBudgetDecision, withProposedSigning } from './testFixtures'

describe('MX0.7 club Governance read boundary', () => {
  it('scopes bodies to the club institution and marks the user appointments', () => {
    const scenario = createGovernanceClubScenario()
    const model = buildClubGovernanceModel(scenario.world, scenario.teamId)

    expect(model.institutionIds).toEqual([scenario.institutionId])
    expect(model.bodies.map((body) => body.bodyId)).toEqual([scenario.boardBodyId, scenario.executiveBodyId, scenario.ownerBodyId])
    expect(model.bodies.filter((body) => body.userAppointed).map((body) => body.bodyId)).toEqual([scenario.boardBodyId, scenario.executiveBodyId])
    expect(model.bodies.find((body) => body.bodyId === scenario.boardBodyId)).toMatchObject({ kind: 'BOARD', name: 'Board', roles: ['BOARD_MEMBER'] })
    expect(model.bodies.find((body) => body.bodyId === scenario.ownerBodyId)).toMatchObject({ userAppointed: false, roles: [] })
    expect(model.decisions).toEqual([])
    expect(model.requests).toEqual([])
    expect(model.history).toEqual([])
  })

  it('rejects a team the club does not name instead of inventing governance state', () => {
    const scenario = createGovernanceClubScenario()
    expect(() => buildClubGovernanceModel(scenario.world, 'team:mx07:missing' as TeamId)).toThrow(RangeError)
  })

  it('projects a real pending signing decision with canonical rights, ownership and readable subject', () => {
    const scenario = createGovernanceClubScenario()
    const world = withProposedSigning(scenario)
    const model = buildClubGovernanceModel(world, scenario.teamId)
    const decision = model.pendingDecisions[0]!

    expect(decision).toMatchObject({
      decisionType: 'PLAYER_CONTRACT_SIGNING',
      status: 'PROPOSED',
      proposerBodyIds: [scenario.executiveBodyId],
      approverBodyIds: [scenario.boardBodyId],
      vetoBodyIds: [],
      executorBodyIds: [scenario.executiveBodyId],
      approvedBodyIds: [],
      missingApproverBodyIds: [scenario.boardBodyId],
      userApproverBodyIds: [scenario.boardBodyId],
      userExecutorBodyIds: [],
      userOwned: true,
      executableType: false,
    })
    expect(decision.subjectLabel).toContain('Player signing · ')
    expect(decision.subjectLabel).toContain('1234567 × 2y')
    expect(decision.events).toEqual([expect.objectContaining({ kind: 'PROPOSED', bodyId: scenario.executiveBodyId, bodyName: 'Executive' })])
    expect(governanceDecisionById(model, decision.decisionId)?.decisionId).toBe(decision.decisionId)
    expect(governanceDecisionById(model, undefined)).toBeUndefined()
    expect(governanceDecisionTypeIsExecutable('COACH_FIRING')).toBe(true)
    expect(governanceDecisionTypeIsExecutable('PLAYER_CONTRACT_SIGNING')).toBe(false)
  })

  it('keeps another club institution out of the model', () => {
    const scenario = createGovernanceClubScenario()
    const other = withOtherClubBudgetDecision(scenario)
    const model = buildClubGovernanceModel(other.world, scenario.teamId)

    expect(model.institutionIds).toEqual([scenario.institutionId])
    expect(model.decisions).toEqual([])
    expect(buildClubGovernanceModel(other.world, Object.values(other.world.teams).find((team) => team.id !== scenario.teamId)!.id).decisions.map((decision) => decision.decisionId)).toEqual([other.decisionId])
  })

  it('surfaces a user-addressed request as read-only attention until a canonical status resolves it', () => {
    const scenario = createGovernanceClubScenario()
    const issued = withIssuedGovernanceRequest(scenario)
    const model = buildClubGovernanceModel(issued.world, scenario.teamId)

    expect(model.attentionRequests).toEqual([
      expect.objectContaining({
        requestId: issued.requestId,
        summary: issued.summary,
        status: 'ISSUED',
        issuedOn: issued.world.currentDate,
        dueOn: issued.dueOn,
        overdue: false,
        origin: 'STANDALONE',
        addressedToUser: true,
        responseCommandAvailable: false,
      }),
    ])
    expect(governanceRequestById(model, issued.requestId)?.dueOn).toBe(issued.dueOn)
    expect(governanceRequestById(model, undefined)).toBeUndefined()
    expect(model.pendingDecisions).toEqual([])

    const overdue = buildClubGovernanceModel(updateGameWorld(issued.world, { currentDate: addDays(issued.dueOn as never, 1) }), scenario.teamId)
    expect(overdue.attentionRequests[0]).toMatchObject({ overdue: true })
  })

  it('merges decision and request events into one newest-first history', () => {
    const scenario = createGovernanceClubScenario()
    const signing = withProposedSigning(scenario)
    const issued = withIssuedGovernanceRequest({ ...scenario, world: signing })
    const model = buildClubGovernanceModel(issued.world, scenario.teamId)

    expect(model.history).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'DECISION', kind: 'PROPOSED', subjectLabel: expect.stringContaining('Player signing · ') }),
      expect.objectContaining({ source: 'REQUEST', kind: 'ISSUED', subjectLabel: issued.summary }),
    ]))
    expect(model.history.map((row) => row.effectiveOn)).toEqual([...model.history.map((row) => row.effectiveOn)].sort((a, b) => b.localeCompare(a)))
  })
})

describe('MX0.7 club Governance commands', () => {
  it('approves a signing decision through the canonical service and lets the club sign afterwards', () => {
    const scenario = createGovernanceClubScenario()
    const world = withProposedSigning(scenario)
    const decisionId = playerContractSigningDecisionId(scenario.institutionId, scenario.negotiation.id)

    const approved = recordClubGovernanceDecisionEvent(world, { teamId: scenario.teamId, decisionId, kind: 'APPROVED', bodyId: scenario.boardBodyId })
    expect(approved.status).toBe('APPLIED')
    expect(approved.canonicalStatus).toBe('APPROVED')
    expect(approved.decisionStatus).toBe('APPROVED')
    expect(approved.world).not.toBe(world)
    expect(buildClubGovernanceModel(approved.world, scenario.teamId).pendingDecisions[0]).toMatchObject({ status: 'APPROVED', approvedBodyIds: [scenario.boardBodyId], missingApproverBodyIds: [] })

    // Portfolio consequence: the canonical Market signing is the command the approval unblocks.
    const signing = completeAcceptedFreeAgentSigning(approved.world, { teamId: scenario.teamId, negotiationId: scenario.negotiation.id, expectedProposalId: scenario.negotiation.sourceProposalId! })
    expect(signing.status).toBe('SIGNED')
    expect(signing.world.teams[scenario.teamId]!.rosterPlayerIds).toContain(scenario.playerId)
  })

  it('records a real rejection and refuses every later decision event', () => {
    const scenario = createGovernanceClubScenario()
    const world = withProposedSigning(scenario)
    const decisionId = playerContractSigningDecisionId(scenario.institutionId, scenario.negotiation.id)

    const rejected = recordClubGovernanceDecisionEvent(world, { teamId: scenario.teamId, decisionId, kind: 'REJECTED', bodyId: scenario.boardBodyId })
    expect(rejected.status).toBe('APPLIED')
    expect(rejected.canonicalStatus).toBe('REJECTED')
    expect(rejected.decisionStatus).toBe('REJECTED')
    expect(completeAcceptedFreeAgentSigning(rejected.world, { teamId: scenario.teamId, negotiationId: scenario.negotiation.id, expectedProposalId: scenario.negotiation.sourceProposalId! }).status).toBe('BLOCKED')

    const after = recordClubGovernanceDecisionEvent(rejected.world, { teamId: scenario.teamId, decisionId, kind: 'APPROVED', bodyId: scenario.boardBodyId })
    expect(after.status).toBe('BLOCKED')
    expect(after.reasons).toEqual(['DECISION_ALREADY_TERMINAL'])
    expect(after.world).toBe(rejected.world)
  })

  it('refuses every club, body and decision the user does not actually own', () => {
    const scenario = createGovernanceClubScenario()
    const world = withProposedSigning(scenario)
    const decisionId = playerContractSigningDecisionId(scenario.institutionId, scenario.negotiation.id)
    const attempt = (input: Parameters<typeof recordClubGovernanceDecisionEvent>[1]) => recordClubGovernanceDecisionEvent(world, input)

    expect(attempt({ teamId: 'team:mx07:missing' as TeamId, decisionId, kind: 'APPROVED', bodyId: scenario.boardBodyId })).toMatchObject({ status: 'BLOCKED', reasons: ['UNKNOWN_TEAM'], world })
    expect(attempt({ teamId: scenario.teamId, decisionId: 'decision:mx07:missing', kind: 'APPROVED', bodyId: scenario.boardBodyId })).toMatchObject({ status: 'BLOCKED', reasons: ['DECISION_NOT_FOUND'] })
    expect(attempt({ teamId: scenario.teamId, decisionId, kind: 'APPROVED', bodyId: scenario.ownerBodyId })).toMatchObject({ status: 'BLOCKED', reasons: ['BODY_NOT_USER_APPOINTED'] })
    expect(attempt({ teamId: scenario.teamId, decisionId, kind: 'APPROVED', bodyId: 'body:mx07:unknown' })).toMatchObject({ status: 'BLOCKED', reasons: ['BODY_NOT_USER_APPOINTED'] })
  })

  it('never invents a command for a decision type canon has none for', () => {
    const scenario = createGovernanceClubScenario()
    const budget = withPendingBudgetDecision(scenario)
    const result = recordClubGovernanceDecisionEvent(budget.world, { teamId: scenario.teamId, decisionId: budget.decisionId, kind: 'APPROVED', bodyId: scenario.executiveBodyId })

    expect(result).toMatchObject({ status: 'BLOCKED', reasons: ['DECISION_TYPE_NOT_ACTIONABLE'], world: budget.world })
    expect(executeClubGovernanceDecision(budget.world, { teamId: scenario.teamId, decisionId: budget.decisionId, executorBodyId: scenario.executiveBodyId })).toMatchObject({ status: 'BLOCKED', reasons: ['DECISION_TYPE_NOT_ACTIONABLE'] })
  })

  it('refuses a decision that belongs to another club institution', () => {
    const scenario = createGovernanceClubScenario()
    const other = withOtherClubBudgetDecision(scenario)

    expect(recordClubGovernanceDecisionEvent(other.world, { teamId: scenario.teamId, decisionId: other.decisionId, kind: 'APPROVED', bodyId: other.executiveBodyId })).toMatchObject({ status: 'BLOCKED', reasons: ['NOT_CLUB_DECISION'] })
    expect(executeClubGovernanceDecision(other.world, { teamId: scenario.teamId, decisionId: other.decisionId, executorBodyId: other.executiveBodyId })).toMatchObject({ status: 'BLOCKED', reasons: ['NOT_CLUB_DECISION'] })
  })

  it('executes an approved coach firing and reports the consequence once', () => {
    const scenario = createGovernanceClubScenario()
    const firing = withCoachFiring(scenario, { approved: true })

    const executed = executeClubGovernanceDecision(firing.world, { teamId: scenario.teamId, decisionId: firing.decisionId, executorBodyId: scenario.executiveBodyId })
    expect(executed).toMatchObject({ status: 'APPLIED', canonicalStatus: 'EXECUTED', decisionStatus: 'EXECUTED' })
    expect(executed.world.teams[scenario.teamId]!.coachId).toBeUndefined()
    expect(executed.world.coachEmploymentByCoachId[scenario.world.userCoachId]!.status).toBe('unemployed')
    expect(Object.values(executed.world.governanceDecisionEventsById).filter((event) => event.decisionId === firing.decisionId && event.kind === 'EXECUTED')).toHaveLength(1)

    const again = executeClubGovernanceDecision(executed.world, { teamId: scenario.teamId, decisionId: firing.decisionId, executorBodyId: scenario.executiveBodyId })
    expect(again).toMatchObject({ status: 'BLOCKED', reasons: ['DECISION_ALREADY_TERMINAL'] })
    expect(again.world).toBe(executed.world)
  })

  it('passes the canonical refusal through when an execution lacks its board approval', () => {
    const scenario = createGovernanceClubScenario()
    const firing = withCoachFiring(scenario, { approved: false })
    const before = structuredClone(firing.world)

    const refused = executeClubGovernanceDecision(firing.world, { teamId: scenario.teamId, decisionId: firing.decisionId, executorBodyId: scenario.executiveBodyId })
    expect(refused.status).toBe('BLOCKED')
    expect(refused.reasons).toEqual(['CANONICAL_COMMAND_REFUSED'])
    expect(refused.canonicalReasons.join(' ')).toContain('required approvals')
    expect(refused.world).toBe(firing.world)
    expect(firing.world).toEqual(before)
  })
})

describe('MX0.7 Governance production reachability', () => {  const governanceStateCounts = (world: ReturnType<typeof createNewGame>) => [world.governanceInstitutionsById, world.governanceBodiesById, world.governanceAppointmentsById, world.governanceDecisionsById, world.governanceRequestsById].map((collection) => Object.keys(collection).length)

  it('has no Governance institution in any shipped universe, so no shipped career can raise a matter', () => {
    for (const world of [createNewGame(), createAcbTestGame()]) {
      const team = getUserTeam(world)!
      expect(governanceStateCounts(world)).toEqual([0, 0, 0, 0, 0])
      expect(Object.keys(world.governanceUniverseProfilesById)).toEqual([])

      const model = buildClubGovernanceModel(world, team.id)
      expect(model).toMatchObject({ institutionIds: [], bodies: [], decisions: [], pendingDecisions: [], requests: [], attentionRequests: [], history: [] })
    }
  })

  it('reports the missing institution instead of inventing one when a real accepted agreement needs governance', () => {
    const scenario = createGovernanceClubScenario()
    // The same club and the same real accepted agreement, but with the shipped universe's Governance state (none).
    const shipped = updateGameWorld(scenario.world, { governanceInstitutions: [], governanceBodies: [], governanceAppointments: [], governanceAuthorityGrants: [], governanceDecisionParticipationGrants: [] })

    const signing = startUserPlayerContractSigning(shipped, { teamId: scenario.teamId, negotiationId: scenario.negotiation.id, expectedProposalId: scenario.negotiation.sourceProposalId! })
    expect(signing.status).toBe('UNKNOWN')
    expect(signing.reason).toBe('GOVERNANCE_INSTITUTION_UNAVAILABLE')
    expect(signing.decision).toBeUndefined()
    expect(governanceStateCounts(signing.world)).toEqual([0, 0, 0, 0, 0])
  })
})

describe('MX0.7 Governance save/load continuity', () => {
  const roundTrip = (world: ReturnType<typeof createNewGame>) => deserializeGameWorldV4(serializeGameWorldV4(world, '2032-01-02T00:00:00.000Z'))

  it('keeps a pending matter, its breakpoint and its deep-link target across a reload', () => {
    const scenario = createGovernanceClubScenario()
    const world = withProposedSigning(scenario)
    const decisionId = playerContractSigningDecisionId(scenario.institutionId, scenario.negotiation.id)

    expect(evaluateSimulationBreakpoints(world).candidates).toContainEqual(expect.objectContaining({ reason: 'governanceApproval', sourceId: decisionId, route: 'governance', actionTarget: { decisionId, bodyId: scenario.boardBodyId } }))

    const loaded = roundTrip(world)
    expect(loaded.governanceDecisionsById[decisionId]).toEqual(world.governanceDecisionsById[decisionId])
    expect(loaded.governanceAuthorityGrantsById).toEqual(world.governanceAuthorityGrantsById)
    expect(loaded.governanceDecisionParticipationGrantsById).toEqual(world.governanceDecisionParticipationGrantsById)
    expect(buildClubGovernanceModel(loaded, scenario.teamId)).toEqual(buildClubGovernanceModel(world, scenario.teamId))
    expect(evaluateSimulationBreakpoints(loaded).candidates).toEqual(evaluateSimulationBreakpoints(world).candidates)
  })

  it('keeps an approved matter resolved after a reload and never resurfaces it as attention', () => {
    const scenario = createGovernanceClubScenario()
    const world = withProposedSigning(scenario)
    const decisionId = playerContractSigningDecisionId(scenario.institutionId, scenario.negotiation.id)
    const approved = recordClubGovernanceDecisionEvent(world, { teamId: scenario.teamId, decisionId, kind: 'APPROVED', bodyId: scenario.boardBodyId })

    const loaded = roundTrip(approved.world)
    expect(buildClubGovernanceModel(loaded, scenario.teamId).decisions[0]).toMatchObject({ status: 'APPROVED', approvedBodyIds: [scenario.boardBodyId], userApproverBodyIds: [] })
    expect(evaluateSimulationBreakpoints(loaded).candidates.some((candidate) => candidate.reason === 'governanceApproval')).toBe(false)
  })

  it('never resurrects a resolved request after a reload', () => {
    const scenario = createGovernanceClubScenario()
    const issued = withIssuedGovernanceRequest(scenario)
    expect(evaluateSimulationBreakpoints(issued.world).candidates).toContainEqual(expect.objectContaining({ reason: 'governanceRequest', sourceId: issued.requestId, route: 'governance', actionTarget: { requestId: issued.requestId } }))

    const declined = updateGameWorld(issued.world, { governanceRequestEvents: [...Object.values(issued.world.governanceRequestEventsById), createGovernanceRequestEvent({ id: `${issued.requestId}:2-declined`, requestId: issued.requestId, kind: 'DECLINED', effectiveOn: issued.world.currentDate, actor: issued.world.governanceRequestsById[issued.requestId]!.recipient })] })
    const loaded = roundTrip(declined)

    expect(buildClubGovernanceModel(loaded, scenario.teamId).attentionRequests).toEqual([])
    expect(evaluateSimulationBreakpoints(loaded).candidates.some((candidate) => candidate.reason === 'governanceRequest')).toBe(false)
  })

  it('round-trips an executed coach firing without allowing a second one', () => {
    const scenario = createGovernanceClubScenario()
    const firing = withCoachFiring(scenario, { approved: true })
    const executed = executeClubGovernanceDecision(firing.world, { teamId: scenario.teamId, decisionId: firing.decisionId, executorBodyId: scenario.executiveBodyId })

    const loaded = roundTrip(executed.world)
    expect(loaded.teams[scenario.teamId]!.coachId).toBeUndefined()
    expect(Object.values(loaded.governanceDecisionEventsById).filter((event) => event.decisionId === firing.decisionId && event.kind === 'EXECUTED')).toHaveLength(1)
    expect(executeClubGovernanceDecision(loaded, { teamId: scenario.teamId, decisionId: firing.decisionId, executorBodyId: scenario.executiveBodyId })).toMatchObject({ status: 'BLOCKED', reasons: ['DECISION_ALREADY_TERMINAL'] })
  })
})
