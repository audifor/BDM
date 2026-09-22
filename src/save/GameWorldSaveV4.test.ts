import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { advanceDay } from '@/engine/calendar'
import { parseGameDate } from '@/domain/date'
import { createGovernanceInstitution } from '@/domain/governance'
import { createOrganization } from '@/domain/organization'
import { organizationIdFromString, personIdFromString } from '@/domain/ids'
import { createPerson } from '@/domain/person'
import { createOrganizationControl, createOrganizationOwnership } from '@/domain/ownership/OrganizationOwnership'
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

describe('GameWorldSaveV4 competition runtime', () => {
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
    const { worldDbCompetitionRuntime, worldAnnualDevelopmentCycle, organizations, organizationSections, organizationOwnership, organizationControl, organizationOwnershipTransactions, organizationOwnershipTransactionEvents, organizationInvestorInterests, organizationCapitalRaises, organizationCapitalRaiseEvents, organizationInvestmentProposals, organizationInvestmentProposalEvents, multiClubOwnershipPolicies, organizationStructuralChanges, organizationLifecycleStates, organizationSuccessions, regulatoryOrders, regulatoryRemediationPlans, organizationLicenses, places, facilities, facilityComponents, facilityNameRecords, facilityOwnershipInterests, facilityControlRights, facilityOperatorAssignments, facilityOrganizationRelationships, facilityTeamRelationships, facilityUsageRights, facilityCompetitionApprovals, facilityStatusRecords, facilityComponentConditionRecords, facilityConditionRecords, facilityMaintenanceNeeds, facilityMaintenanceActions, facilityInspections, facilityOperationalIncidents, ...v4CompatibilityPayload } = v4.payload

    expect(v4.schemaVersion).toBe(4)
    expect(v4CompatibilityPayload).toEqual(v3.payload)
    expect(worldDbCompetitionRuntime).toEqual({
      competitionRuntimeBundle: null,
      competitionPlanIds: [],
      competitionSeasonIds: [],
    })
    expect(worldAnnualDevelopmentCycle).toEqual({ lastAppliedCycleId: null })
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
    // A fresh V3 load must never carry over another world's annual development cycle: both
    // transitional V4-owned fields are stripped before comparing against a bare pre-V4 world.
    const { worldDbCompetitionRuntime: _runtime, worldAnnualDevelopmentCycle: _cycle, ...legacyCompatibleWorld } = restored
    expect(legacyCompatibleWorld).toEqual(world)
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
