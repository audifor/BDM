import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { advanceDay } from '@/engine/calendar'
import { parseGameDate } from '@/domain/date'
import { addDays } from '@/domain/date'
import { createContractReviewDecision, contractReviewDecisionIdFor, createRetentionNegotiation, retentionNegotiationIdFor } from '@/domain/contract'
import { createGMPlanState } from '@/domain/gmPlanning'
import { createGovernanceInstitution } from '@/domain/governance'
import { createOrganization } from '@/domain/organization'
import { organizationIdFromString, personIdFromString } from '@/domain/ids'
import { createPerson } from '@/domain/person'
import { createOrganizationControl, createOrganizationOwnership } from '@/domain/ownership/OrganizationOwnership'
import { createScheduledTrainingSession } from '@/domain/training'
import { createOrganizationOwnershipTransaction, createOrganizationOwnershipTransactionEvent } from '@/domain/ownership/OrganizationOwnershipTransaction'
import { executeOrganizationOwnershipTransaction } from '@/domain/ownership/OrganizationOwnershipTransactionExecution'
import { createOrganizationInvestorInterest } from '@/domain/investment/OrganizationInvestorInterest'
import { createOrganizationCapitalRaise, createOrganizationCapitalRaiseEvent } from '@/domain/investment/OrganizationCapitalRaise'
import { createOrganizationInvestmentProposal, createOrganizationInvestmentProposalEvent } from '@/domain/investment/OrganizationInvestmentProposal'
import { executeOrganizationInvestmentProposal } from '@/domain/investment/OrganizationInvestmentExecution'
import { createSupporterRelationship } from '@/domain/supporters'
import { attachWorldDbCompetitionRuntime, hasAppliedAnnualDevelopmentCycle, markAnnualDevelopmentCycleApplied, updateGameWorld } from '@/domain/world'
import { serializeGameWorldV3 } from './GameWorldSaveV3'
import { deserializeGameWorldSaveV4, deserializeGameWorldV4, migrateGameWorldSaveV3ToV4, serializeGameWorldV4 } from './GameWorldSaveV4'

const savedAt = '2032-10-01T00:00:00.000Z'

describe('BS14B OrganizationKnowledge persistence', () => {
  it('retains current scouting knowledge through Save V4', () => {
    const base = createNewGame()
    const team = Object.values(base.teams).find((item) => item.coachId === base.userCoachId)!
    const player = Object.values(base.players)[0]!
    const world = updateGameWorld(base, { organizationKnowledge: [{ organizationId: team.organizationId, subjectPlayerId: player.id, dimensions: { shooting: { coverage: 0.7, confidence: 0.6, assessedAt: base.currentDate, provenance: 'scoutReport', estimate: 72, uncertainty: 7 } } }] })
    expect(deserializeGameWorldV4(serializeGameWorldV4(world, savedAt)).organizationKnowledge).toEqual(world.organizationKnowledge)
  })
})

describe('BS15F transfer rules persistence', () => {
  it('round-trips NCAA carry-forward rules and defaults pre-BS15F Save V4 payloads to empty', () => {
    const world = createNewGame()
    const ncaaEcosystemIds = new Set(Object.values(world.ecosystems).filter((ecosystem) => ecosystem.kind === 'ncaaLike').map((ecosystem) => ecosystem.id))
    const rulesets = Object.values(world.transferPortalRulesetsById)
    expect(rulesets.length).toBeGreaterThanOrEqual(ncaaEcosystemIds.size)
    expect(rulesets.every((ruleset) => ncaaEcosystemIds.has(ruleset.ecosystemId))).toBe(true)
    expect(rulesets.filter((ruleset) => ruleset.provenance === 'OFFICIAL_SOURCE')).toHaveLength(ncaaEcosystemIds.size)
    expect(rulesets.filter((ruleset) => ruleset.provenance === 'SIMULATED_CARRY_FORWARD').every((ruleset) => rulesets.some((source) => source.id === ruleset.basedOnRulesetId))).toBe(true)
    expect(deserializeGameWorldV4(serializeGameWorldV4(world, savedAt)).transferPortalRulesetsById).toEqual(world.transferPortalRulesetsById)

    const { transferPortalRulesets: _rulesets, transferPortalEntries: _entries, ...oldPayload } = serializeGameWorldV4(world, savedAt).payload
    const legacy = deserializeGameWorldV4({ ...serializeGameWorldV4(world, savedAt), payload: oldPayload })
    expect(legacy.transferPortalRulesetsById).toEqual({})
    expect(legacy.transferPortalEntriesById).toEqual({})
  })
})

describe('GameWorldSaveV4 competition runtime', () => {
  it('round-trips immutable Training Staff role and planned module evidence', () => {
    const base = createNewGame()
    const team = Object.values(base.teams).find((item) => item.coachId === base.userCoachId)!
    const assignment = Object.values(base.teamStaffAssignmentsById).find((item) => item.teamId === team.id)!
    const session = createScheduledTrainingSession({
      id: 'save-training-evidence', teamId: team.id, date: base.currentDate, startTime: '09:00', durationMinutes: 60,
      scope: 'team', definitionId: 'threePoint', intensity: 'normal', status: 'completed',
      execution: {
        completedOn: base.currentDate, moduleName: 'Three-Point Shooting', plannedModuleName: 'Custom shooting plan',
        category: 'shooting', effectiveIntensity: 'high', executingStaffPersonIds: [assignment.staffPersonId],
        executingStaffRoles: [{ staffId: assignment.staffPersonId, roleId: assignment.role }], executionQualityMultiplier: 1.04,
        participants: [], cohesionDelta: 0,
      },
    })
    const world = updateGameWorld(base, { scheduledTrainingSessionsById: { ...base.scheduledTrainingSessionsById, [session.id]: session } })
    const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world, savedAt))))
    expect(restored.scheduledTrainingSessionsById[session.id]!.execution).toMatchObject({
      plannedModuleName: 'Custom shooting plan',
      executingStaffRoles: [{ staffId: assignment.staffPersonId, roleId: assignment.role }],
      effectiveIntensity: 'high',
    })
  })

  it('round-trips nonbinding retention incentive proposal terms', () => {
    const base = createNewGame()
    const team = Object.values(base.teams).find((item) => item.coachId === base.userCoachId)!
    const contract = Object.values(base.contractsById).find((item) => item.teamId === team.id && team.rosterPlayerIds.includes(item.playerId))!
    const competition = Object.values(base.competitions).find((item) => item.participantTeamIds.includes(team.id))!
    const openingActionId = 'save-c4-open'
    const id = retentionNegotiationIdFor(team.id, contract.playerId, contract.id, openingActionId)
    const terms = { salary: contract.compensation.annualSalary, years: 1, incentives: [{ type: 'GAMES_PLAYED' as const, competitionId: competition.id, contractYear: 1, minimumGamesPlayed: 50, amount: 75_000 }], clauses: [{ type: 'TRADE_CONSENT_REQUIRED' as const, decisionAuthority: 'PLAYER' as const }] }
    const negotiation = createRetentionNegotiation({
      id, openingActionId, teamId: team.id, organizationId: team.organizationId, playerId: contract.playerId, predecessorContractId: contract.id,
      openedOn: base.currentDate, openedByCoachId: base.userCoachId!, status: 'ACCEPTED', acceptedTerms: terms,
      rounds: [{ round: 1, actionId: 'save-c4-offer', offer: terms, submittedOn: base.currentDate, playerResponse: { outcome: 'ACCEPTED', respondedOn: base.currentDate, origin: 'PLAYER', reasonCodes: ['SALARY_ACCEPTABLE'] } }],
    })
    const world = updateGameWorld(base, { retentionNegotiations: [negotiation] })
    const saved = serializeGameWorldV4(world, savedAt)
    const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(saved)))
    expect(restored.retentionNegotiationsById[id]!.acceptedTerms?.incentives).toEqual(terms.incentives)
    expect(restored.retentionNegotiationsById[id]!.rounds[0]!.offer.incentives).toEqual(terms.incentives)
    expect(restored.retentionNegotiationsById[id]!.acceptedTerms?.clauses).toEqual(terms.clauses)
    expect(restored.retentionNegotiationsById[id]!.rounds[0]!.offer.clauses).toEqual(terms.clauses)
  })

  it('round-trips explicit contract review intent and defaults old V4 saves to none', () => {
    const base = createNewGame()
    const team = Object.values(base.teams).find((item) => item.coachId === base.userCoachId)!
    const playerId = team.rosterPlayerIds[0]!
    const contract = Object.values(base.contractsById).find((item) => item.teamId === team.id && item.playerId === playerId)!
    const decision = createContractReviewDecision({
      id: contractReviewDecisionIdFor(team.id, playerId, contract.id), teamId: team.id, playerId, contractId: contract.id,
      intent: 'DEFER', decidedOn: base.currentDate, decidedByCoachId: base.userCoachId,
      reviewAgainOn: addDays(base.currentDate, 30),
    })
    const world = updateGameWorld(base, { contractReviewDecisions: [decision] })
    const saved = serializeGameWorldV4(world, savedAt)
    expect(saved.payload.contractReviewDecisions).toEqual([decision])
    const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(saved)))
    expect(restored.contractReviewDecisionsById).toEqual({ [decision.id]: decision })

    const { contractReviewDecisions: _decisions, ...legacyPayload } = saved.payload
    const legacy = deserializeGameWorldV4({ ...saved, payload: legacyPayload })
    expect(legacy.contractReviewDecisionsById).toEqual({})
  })

  it('writes the required empty runtime for a world created before V4 runtime exists', () => {
    const world = createNewGame()
    const v4 = serializeGameWorldV4(world, savedAt)

    expect(v4.schemaVersion).toBe(4)
    expect(v4.payload.worldDbCompetitionRuntime).toEqual({
      competitionRuntimeBundle: null,
      competitionPlanIds: [],
      competitionSeasonIds: [],
    })

    const restored = deserializeGameWorldV4(v4)
    expect(restored.worldDbCompetitionRuntime).toEqual({
      competitionRuntimeBundle: null,
      competitionPlanIds: [],
      competitionSeasonIds: [],
    })
  })

  it('continues to read pre-91 V4 runtime payloads without a bundle pin', () => {
    const current = serializeGameWorldV4(createNewGame(), savedAt)
    const { competitionRuntimeBundle: _pin, ...pre91Runtime } = current.payload.worldDbCompetitionRuntime
    const restored = deserializeGameWorldV4({
      ...current,
      payload: {
        ...current.payload,
        worldDbCompetitionRuntime: pre91Runtime,
      },
    })

    expect(restored.worldDbCompetitionRuntime).toEqual({
      competitionRuntimeBundle: null,
      competitionPlanIds: [],
      competitionSeasonIds: [],
    })
  })

  it('round-trips populated competition runtime identities and bundle pin', () => {
    const world = attachWorldDbCompetitionRuntime(createNewGame(), {
      competitionRuntimeBundle: {
        contentId: 'bdm-phase1-competition-runtime-v1',
        contentHash: 'a'.repeat(64),
        worldDbSchema: 'DDL-PHASE1-A',
      },
      competitionPlanIds: ['plan:liga-acb:2032', 'plan:euroleague:2032'],
      competitionSeasonIds: ['competition-season:acb:2032', 'competition-season:euroleague:2032'],
    })

    const restored = deserializeGameWorldV4(serializeGameWorldV4(world, savedAt))

    expect(restored.worldDbCompetitionRuntime).toEqual(world.worldDbCompetitionRuntime)
  })

  it('round-trips a world with an already-applied annual development cycle, and never leaks it onto an unrelated fresh world', () => {
    const withCycleA = markAnnualDevelopmentCycleApplied(createNewGame(), 'annual-development:2032')

    const restored = deserializeGameWorldV4(serializeGameWorldV4(withCycleA, savedAt))
    expect(restored.worldAnnualDevelopmentCycle).toEqual({ lastAppliedCycleId: 'annual-development:2032' })
    expect(hasAppliedAnnualDevelopmentCycle(restored, 'annual-development:2032')).toBe(true)

    // A completely separate world, freshly created and never marked, must load clean: no phantom
    // cycle carried over from any other instance's save/load path.
    const freshWorld = createNewGame()
    const freshRestored = deserializeGameWorldV4(serializeGameWorldV4(freshWorld, savedAt))
    expect(freshRestored.worldAnnualDevelopmentCycle).toEqual({ lastAppliedCycleId: null })
    expect(hasAppliedAnnualDevelopmentCycle(freshRestored, 'annual-development:2032')).toBe(false)
  })

  it('save/load around the 1 July annual development trigger never re-applies development on reload', () => {
    // recruitingCyclesById is stripped to isolate this test from a separate, unrelated recruiting
    // pool generation concern (see the same idiom in simulateUntilDate.test.ts's withNoRecruiting).
    let world = { ...createNewGame(), recruitingCyclesById: {} }
    while (world.currentDate.slice(5) !== '06-30') world = advanceDay(world)
    const beforeTrigger = world
    expect(hasAppliedAnnualDevelopmentCycle(beforeTrigger, 'annual-development:2033')).toBe(false)

    // Save right before the trigger, reload, then advance past 1 July: development must apply
    // exactly once, driven by the reloaded world's own state, not a phantom prior cycle.
    const reloadedBeforeTrigger = deserializeGameWorldV4(serializeGameWorldV4(beforeTrigger, savedAt))
    const afterTrigger = advanceDay(reloadedBeforeTrigger)
    expect(afterTrigger.currentDate.slice(5)).toBe('07-01')
    expect(hasAppliedAnnualDevelopmentCycle(afterTrigger, 'annual-development:2033')).toBe(true)
    const developedRatings = Object.values(afterTrigger.players).map((player) => player.basketball.ratings)

    // Save right after the trigger and reload: the applied cycle marker persists, so advancing
    // through more of the same calendar year must never re-apply development a second time.
    const reloadedAfterTrigger = deserializeGameWorldV4(serializeGameWorldV4(afterTrigger, savedAt))
    expect(hasAppliedAnnualDevelopmentCycle(reloadedAfterTrigger, 'annual-development:2033')).toBe(true)
    let current = reloadedAfterTrigger
    for (let day = 0; day < 30; day += 1) current = advanceDay(current)
    expect(Object.values(current.players).map((player) => player.basketball.ratings)).toEqual(developedRatings)
  }, 120_000)

  it('preserves CORE-ORG1 records and BG7 canonical runtime through Save V4', () => {
    const base = createNewGame()
    const team = Object.values(base.teams)[0]!
    const institution = createGovernanceInstitution({ id: 'university:save-v4', universe: 'NCAA', name: 'Save V4 University', teamIds: [team.id] })
    const relationship = createSupporterRelationship({ id: 'donor:save-v4', actor: { kind: 'EXTERNAL', id: 'person:save-v4-donor' }, kind: 'DONOR', institutionId: institution.id, scope: 'INSTITUTION_WIDE', programTeamIds: [], startedOn: '2032-01-01' as never, donorPattern: 'RECURRING', restricted: false })
    const world = updateGameWorld(base, { governanceInstitutions: [institution], supporterRelationships: [relationship] })
    const v3 = serializeGameWorldV3(world, savedAt)
    const v4 = serializeGameWorldV4(world, savedAt)
    expect(v4.payload.staffCareerRuntime).toEqual(v3.payload.staffCareerRuntime)
    const restored = deserializeGameWorldV4(v4)
    expect(restored.organizationsById).toEqual(world.organizationsById)
    expect(restored.organizationSectionsById).toEqual(world.organizationSectionsById)
    expect(restored.supporterRelationshipsById).toEqual(world.supporterRelationshipsById)
    expect(restored.governanceInstitutionsById).toEqual(world.governanceInstitutionsById)
  })

  it('round-trips BG8A ownership and independent control records through Save V4', () => {
    const base = createNewGame()
    const target = Object.values(base.teams)[0]!.organizationId
    const holding = createOrganization({ id: organizationIdFromString('organization:save-v4-holding'), entityId: null, legalName: 'Save V4 Holding', foundedYear: 2000, dissolvedYear: null, primaryPlaceId: null, website: null })
    const owner = createPerson({ id: personIdFromString('person:save-v4-owner'), firstName: 'Save', lastName: 'Owner', profileRefs: [] })
    const ownership = createOrganizationOwnership({ id: 'ownership:save-v4', organizationId: target, owner: { kind: 'ORGANIZATION', organizationId: holding.id }, ownershipPercentage: null, validFrom: '2030-01-01', validTo: null })
    const control = createOrganizationControl({ id: 'control:save-v4', organizationId: target, controller: { kind: 'PERSON', personId: owner.id }, validFrom: '2030-01-01', validTo: null })
    const world = updateGameWorld(base, {
      organizations: [...Object.values(base.organizationsById), holding],
      persons: [...Object.values(base.personsById), owner],
      organizationOwnership: [ownership],
      organizationControl: [control],
    })

    const saved = serializeGameWorldV4(world, savedAt)
    expect(saved.payload.organizationOwnership).toEqual([ownership])
    expect(saved.payload.organizationControl).toEqual([control])
    const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(saved)))
    expect(restored.organizationOwnershipById).toEqual({ [ownership.id]: ownership })
    expect(restored.organizationControlById).toEqual({ [control.id]: control })
  })

  it('round-trips BG8B ownership transactions and defaults missing transaction collections to empty', () => {
    const base = createNewGame()
    const target = Object.values(base.teams)[0]!
    const people = Object.values(base.personsById).slice(0, 2)
    const transaction = createOrganizationOwnershipTransaction({
      id: 'transaction:save-v4',
      organizationId: target.organizationId,
      seller: { kind: 'PERSON', personId: people[0]!.id },
      buyer: { kind: 'PERSON', personId: people[1]!.id },
      transferredPercentage: 25,
      agreedOn: '2030-01-01',
      consideration: null,
    })
    const events = [
      createOrganizationOwnershipTransactionEvent({ id: 'event:save-v4-proposed', transactionId: transaction.id, kind: 'PROPOSED', effectiveOn: '2030-01-01' }),
      createOrganizationOwnershipTransactionEvent({ id: 'event:save-v4-approved', transactionId: transaction.id, kind: 'APPROVED', effectiveOn: '2030-01-02' }),
    ]
    const world = updateGameWorld(base, {
      organizationOwnership: [createOrganizationOwnership({ id: 'ownership:save-v4-seller', organizationId: target.organizationId, owner: { kind: 'PERSON', personId: people[0]!.id }, ownershipPercentage: 100, validFrom: '2020-01-01', validTo: null })],
      organizationOwnershipTransactions: [transaction], organizationOwnershipTransactionEvents: events,
    })
    const executed = executeOrganizationOwnershipTransaction(world, transaction.id, parseGameDate('2030-01-03'))
    const saved = serializeGameWorldV4(executed, savedAt)
    expect(saved.payload.organizationOwnershipTransactions).toEqual([transaction])
    expect(saved.payload.organizationOwnershipTransactionEvents).toHaveLength(3)
    expect(saved.payload.organizationOwnershipTransactionEvents.at(-1)?.kind).toBe('EXECUTED')
    const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(saved)))
    expect(restored.organizationOwnershipTransactionsById).toEqual({ [transaction.id]: transaction })
    expect(restored.organizationOwnershipTransactionEventsById).toEqual(Object.fromEntries(saved.payload.organizationOwnershipTransactionEvents.map((event) => [event.id, event])))
    expect(restored.organizationOwnershipById).toEqual(executed.organizationOwnershipById)

    const { organizationOwnershipTransactions: _transactions, organizationOwnershipTransactionEvents: _events, ...legacyPayload } = saved.payload
    const legacyRestored = deserializeGameWorldV4({ ...saved, payload: legacyPayload })
    expect(legacyRestored.organizationOwnershipTransactionsById).toEqual({})
    expect(legacyRestored.organizationOwnershipTransactionEventsById).toEqual({})
  })

  it('round-trips BG8C interest, capital raise, proposal, execution history and old-V4 defaults', () => {
    const base = createNewGame()
    const target = Object.values(base.teams)[0]!
    const people = Object.values(base.personsById).slice(0, 2)
    const interest = createOrganizationInvestorInterest({ id: 'interest:save-v4', organizationId: target.organizationId, investor: { kind: 'PERSON', personId: people[1]!.id }, interestType: 'ACQUISITION', status: 'OPEN', openedOn: '2029-01-01', closedOn: null })
    const raise = createOrganizationCapitalRaise({ id: 'raise:save-v4', organizationId: target.organizationId, openedOn: '2030-01-01', targetAmount: 100, currencyCode: 'EUR', maximumEquityPercentage: 40 })
    const raiseEvents = [createOrganizationCapitalRaiseEvent({ id: 'raise-event:save-v4-opened', capitalRaiseId: raise.id, kind: 'OPENED', effectiveOn: '2030-01-01' })]
    const proposal = createOrganizationInvestmentProposal({ id: 'proposal:save-v4', capitalRaiseId: raise.id, investor: { kind: 'PERSON', personId: people[1]!.id }, amount: 20, currencyCode: 'EUR', requestedEquityPercentage: 20, proposedOn: '2030-01-02' })
    const proposalEvents = [
      createOrganizationInvestmentProposalEvent({ id: 'proposal-event:save-v4-proposed', proposalId: proposal.id, kind: 'PROPOSED', effectiveOn: '2030-01-02' }),
      createOrganizationInvestmentProposalEvent({ id: 'proposal-event:save-v4-accepted', proposalId: proposal.id, kind: 'ACCEPTED', effectiveOn: '2030-01-03' }),
    ]
    const world = updateGameWorld(base, {
      organizationOwnership: [createOrganizationOwnership({ id: 'ownership:save-v4-primary', organizationId: target.organizationId, owner: { kind: 'PERSON', personId: people[0]!.id }, ownershipPercentage: 100, validFrom: '2020-01-01', validTo: null })],
      organizationInvestorInterests: [interest], organizationCapitalRaises: [raise], organizationCapitalRaiseEvents: raiseEvents, organizationInvestmentProposals: [proposal], organizationInvestmentProposalEvents: proposalEvents,
    })
    const executed = executeOrganizationInvestmentProposal(world, proposal.id, parseGameDate('2030-01-04'))
    const saved = serializeGameWorldV4(executed, savedAt)
    const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(saved)))
    expect(restored.organizationInvestorInterestsById).toEqual({ [interest.id]: interest })
    expect(restored.organizationCapitalRaisesById).toEqual({ [raise.id]: raise })
    expect(restored.organizationCapitalRaiseEventsById).toEqual({ [raiseEvents[0]!.id]: raiseEvents[0] })
    expect(restored.organizationInvestmentProposalsById).toEqual({ [proposal.id]: proposal })
    expect(Object.values(restored.organizationInvestmentProposalEventsById).at(-1)?.kind).toBe('EXECUTED')
    expect(restored.organizationOwnershipById).toEqual(executed.organizationOwnershipById)

    const { organizationInvestorInterests: _interests, organizationCapitalRaises: _raises, organizationCapitalRaiseEvents: _raiseEvents, organizationInvestmentProposals: _proposals, organizationInvestmentProposalEvents: _proposalEvents, ...legacyPayload } = saved.payload
    const legacyRestored = deserializeGameWorldV4({ ...saved, payload: legacyPayload })
    expect(legacyRestored.organizationInvestorInterestsById).toEqual({})
    expect(legacyRestored.organizationCapitalRaisesById).toEqual({})
    expect(legacyRestored.organizationInvestmentProposalsById).toEqual({})
  })

  it('defaults ownership and control to empty when loading a pre-BG8A V4 payload', () => {
    const current = serializeGameWorldV4(createNewGame(), savedAt)
    const { organizationOwnership: _ownership, organizationControl: _control, ...legacyPayload } = current.payload
    const restored = deserializeGameWorldV4({ ...current, payload: legacyPayload })
    expect(restored.organizationOwnershipById).toEqual({})
    expect(restored.organizationControlById).toEqual({})
  })

  it('migrates canonical V3 by preserving V3 fields and adding empty runtime state', () => {
    const v3 = serializeGameWorldV3(createNewGame(), savedAt)
    const v4 = migrateGameWorldSaveV3ToV4(v3)
    const { worldDbCompetitionRuntime, worldAnnualDevelopmentCycle, clubStrategicStates, gmPlanStates, organizations, organizationSections, organizationOwnership, organizationControl, organizationOwnershipTransactions, organizationOwnershipTransactionEvents, organizationInvestorInterests, organizationCapitalRaises, organizationCapitalRaiseEvents, organizationInvestmentProposals, organizationInvestmentProposalEvents, multiClubOwnershipPolicies, organizationStructuralChanges, organizationLifecycleStates, organizationSuccessions, regulatoryOrders, regulatoryRemediationPlans, organizationLicenses, places, facilities, facilityComponents, facilityNameRecords, facilityOwnershipInterests, facilityControlRights, facilityOperatorAssignments, facilityOrganizationRelationships, facilityTeamRelationships, facilityUsageRights, facilityCompetitionApprovals, facilityStatusRecords, facilityComponentConditionRecords, facilityConditionRecords, facilityMaintenanceNeeds, facilityMaintenanceActions, facilityInspections, facilityOperationalIncidents, facilityDevelopmentProjects, facilityDevelopmentProjectPhases, facilityFinancialBindings, ...v4CompatibilityPayload } = v4.payload

    expect(v4.schemaVersion).toBe(4)
    expect(v4CompatibilityPayload).toEqual(v3.payload)
    expect(worldDbCompetitionRuntime).toEqual({
      competitionRuntimeBundle: null,
      competitionPlanIds: [],
      competitionSeasonIds: [],
    })
    expect(worldAnnualDevelopmentCycle).toEqual({ lastAppliedCycleId: null })
    expect(clubStrategicStates).toEqual([])
    expect(gmPlanStates).toBeUndefined()
    expect(organizationOwnership).toEqual([])
    expect(organizationControl).toEqual([])
    expect(organizationOwnershipTransactions).toEqual([])
    expect(organizationOwnershipTransactionEvents).toEqual([])
    expect(organizationInvestorInterests).toEqual([])
    expect(organizationCapitalRaises).toEqual([])
    expect(organizationCapitalRaiseEvents).toEqual([])
    expect(organizationInvestmentProposals).toEqual([])
    expect(organizationInvestmentProposalEvents).toEqual([])
    expect(multiClubOwnershipPolicies).toEqual([])
    expect(organizationStructuralChanges).toEqual([])
    expect(organizationLifecycleStates).toEqual([])
    expect(organizationSuccessions).toEqual([])
    expect(regulatoryOrders).toEqual([])
    expect(regulatoryRemediationPlans).toEqual([])
    expect(organizationLicenses).toEqual([])
    expect(places).toEqual([])
    expect(facilities).toEqual([])
    expect(facilityComponents).toEqual([])
    expect(facilityNameRecords).toEqual([])
    expect(facilityOwnershipInterests).toEqual([])
    expect(facilityControlRights).toEqual([])
    expect(facilityOperatorAssignments).toEqual([])
    expect(facilityOrganizationRelationships).toEqual([])
    expect(facilityTeamRelationships).toEqual([])
    expect(facilityUsageRights).toEqual([])
    expect(facilityCompetitionApprovals).toEqual([])
    expect(facilityStatusRecords).toEqual([])
    expect(facilityComponentConditionRecords).toEqual([])
    expect(facilityConditionRecords).toEqual([])
    expect(facilityMaintenanceNeeds).toEqual([])
    expect(facilityMaintenanceActions).toEqual([])
    expect(facilityInspections).toEqual([])
    expect(facilityOperationalIncidents).toEqual([])
    expect(facilityDevelopmentProjects).toEqual([])
    expect(facilityDevelopmentProjectPhases).toEqual([])
    expect(organizations.length).toBeGreaterThan(0)
    expect(organizationSections.length).toBeGreaterThan(0)
  })

  it('continues to read V3 through the V4 reader with an empty runtime projection', () => {
    const world = createNewGame()
    const legacy = serializeGameWorldV3(world, savedAt)
    const restored = deserializeGameWorldSaveV4(legacy)

    expect(restored.worldDbCompetitionRuntime).toEqual({
      competitionRuntimeBundle: null,
      competitionPlanIds: [],
      competitionSeasonIds: [],
    })
    expect(restored.worldAnnualDevelopmentCycle).toEqual({ lastAppliedCycleId: null })
    expect(restored.gmPlanStatesById).toEqual({})
  })

  it('rejects malformed canonical V4 runtime payloads', () => {
    const valid = serializeGameWorldV4(createNewGame(), savedAt)

    expect(() => deserializeGameWorldV4({
      ...valid,
      payload: { ...valid.payload, worldDbCompetitionRuntime: undefined },
    })).toThrow(/must be an object/)
    expect(() => deserializeGameWorldV4({
      ...valid,
      payload: {
        ...valid.payload,
        worldDbCompetitionRuntime: {
          competitionRuntimeBundle: null,
          competitionPlanIds: ['duplicate', 'duplicate'],
          competitionSeasonIds: [],
        },
      },
    })).toThrow(/duplicates/)
    expect(() => deserializeGameWorldV4({
      ...valid,
      payload: {
        ...valid.payload,
        worldDbCompetitionRuntime: {
          competitionRuntimeBundle: null,
          competitionPlanIds: [],
          competitionSeasonIds: [42],
        },
      },
    })).toThrow(/non-empty strings/)
    expect(() => deserializeGameWorldV4({
      ...valid,
      payload: {
        ...valid.payload,
        worldDbCompetitionRuntime: {
          competitionRuntimeBundle: {
            contentId: 'bdm-phase1-competition-runtime-v1',
            contentHash: 'not-a-hash',
            worldDbSchema: 'DDL-PHASE1-A',
          },
          competitionPlanIds: [],
          competitionSeasonIds: [],
        },
      },
    })).toThrow(/64-character lowercase hex digest/)
  })

  it('rejects malformed canonical V4 envelopes', () => {
    const valid = serializeGameWorldV4(createNewGame(), savedAt)
    expect(() => deserializeGameWorldV4({ ...valid, extra: true })).toThrow(/unexpected fields/)
    expect(() => deserializeGameWorldV4({ ...valid, savedAt: 'not-a-date' })).toThrow(/ISO-8601/)
    expect(() => deserializeGameWorldV4({ ...valid, schemaVersion: 5 })).toThrow(/Unsupported save version/)
  })
})

describe('GameWorldSaveV4 GM plan memory', () => {
  it('round-trips minimal per-need GM plan memory', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams).find((team) => team.coachId !== undefined && team.coachId !== world.userCoachId)!.id
    const state = createGMPlanState({ id: `${teamId}:need:depth`, teamId, needId: 'need:depth', selectedOptionKind: 'EXTERNAL_ACQUISITION', selectedOn: world.currentDate, lastReviewedOn: world.currentDate, selectionReason: 'INITIAL_SELECTION', executionReadinessAtSelection: 'UNKNOWN_AUTHORITY', strategyAtSelection: 'CONTEND', originalOptionPriority: 1 })
    const savedWorld = updateGameWorld(world, { gmPlanStates: [state] })
    const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(savedWorld, savedAt))))
    expect(Object.values(restored.gmPlanStatesById)).toEqual([state])
  })

  it('defaults a pre-plan V4 save to an empty plan collection', () => {
    const saved = serializeGameWorldV4(createNewGame(), savedAt)
    const { gmPlanStates: _oldField, ...oldPayload } = saved.payload
    const restored = deserializeGameWorldV4({ ...saved, payload: oldPayload })
    expect(restored.gmPlanStatesById).toEqual({})
  })
})
