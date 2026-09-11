import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { updateGameWorld } from '@/domain/world'
import { createGovernanceInstitution } from '@/domain/governance'
import { activeCollectiveParticipants, collectiveLeadership, createCollectiveInstitutionAffiliation, createCollectiveInstitutionalLiaison, createCollectiveInstitutionalStatusEvent, createCollectiveParticipantAffiliation, createSupporterRelationship } from './InstitutionalSupport'
import { createSupportContribution, createSupportFundingPledge, createSupportFundingPledgeEvent, deriveSupportFundingPledgeStatus, remainingPledgeAmount, selectContributionsByContributor, totalPledgeFulfilledAmount } from './SupportFunding'
import { deserializeGameWorldV3, serializeGameWorldV3 } from '@/save/GameWorldSaveV3'

const donor = (id = 'donor') => createSupporterRelationship({ id, actor: { kind: 'EXTERNAL', id: `person:${id}` }, kind: 'DONOR', institutionId: 'university', scope: 'INSTITUTION_WIDE', programTeamIds: [], startedOn: '2032-01-01' as never, donorPattern: 'RECURRING', restricted: false })
const booster = (id = 'booster') => createSupporterRelationship({ id, actor: { kind: 'EXTERNAL', id: `person:${id}` }, kind: 'BOOSTER', institutionId: 'university', scope: 'ATHLETICS_WIDE', programTeamIds: [], startedOn: '2032-01-01' as never, restricted: false })
function fixture() {
  const base = createNewGame(), team = Object.values(base.teams)[0]!, collective = { id: 'collective:foundation', ecosystemId: Object.keys(base.ecosystems)[0] as never, programTeamId: team.id, name: 'Foundation Collective', resourceCapacity: 100, resourcesRemaining: 100 }
  const institution = createGovernanceInstitution({ id: 'university', universe: 'NCAA', name: 'University', teamIds: [team.id] })
  return { base, team, collective, institution }
}

describe('Institutional supporter foundation', () => {
  it('keeps donor and booster statuses explicit and separate', () => { expect(donor()).not.toEqual(booster()); expect(donor()).toHaveProperty('donorPattern'); expect(booster()).not.toHaveProperty('donorPattern') })
  it('supports individual and external-organization donors without a duplicate identity root', () => { expect(donor('alumni').actor).toEqual({ kind: 'EXTERNAL', id: 'person:alumni' }); expect(donor('foundation').actor).toEqual({ kind: 'EXTERNAL', id: 'person:foundation' }) })
  it('supports program, men/women, multi-program and athletics scopes', () => {
    const f = fixture(); expect(() => createSupporterRelationship({ ...donor(), scope: 'PROGRAM_SPECIFIC', programTeamIds: [f.team.id] })).not.toThrow(); expect(() => createSupporterRelationship({ ...donor(), scope: 'MEN_BASKETBALL', programTeamIds: [f.team.id] })).not.toThrow(); expect(() => createSupporterRelationship({ ...donor(), scope: 'MULTI_PROGRAM', programTeamIds: [f.team.id] })).not.toThrow()
  })
  it('represents independent collective alignment and participants without governance authority', () => {
    const f = fixture(), affiliation = createCollectiveInstitutionAffiliation({ id: 'alignment', collectiveId: f.collective.id, institutionId: f.institution.id, kind: 'INDEPENDENT', scope: 'PROGRAM_SPECIFIC', programTeamIds: [f.team.id], startedOn: '2032-01-01' as never }), participant = createCollectiveParticipantAffiliation({ id: 'executive', collectiveId: f.collective.id, actor: { kind: 'EXTERNAL', id: 'person:executive' }, kind: 'COLLECTIVE_EXECUTIVE', startedOn: '2032-01-01' as never })
    const world = updateGameWorld(f.base, { governanceInstitutions: [f.institution], collectives: [...Object.values(f.base.collectivesById), f.collective], supporterRelationships: [donor(), booster()], collectiveInstitutionAffiliations: [affiliation], collectiveParticipantAffiliations: [participant] })
    expect(Object.keys(world.governanceAuthorityGrantsById)).toEqual([]); expect(Object.keys(world.governanceAppointmentsById)).toEqual([]); expect(world.supporterRelationshipsById.donor).toEqual(donor())
  })
  it('allows multiple collectives and historical ending/restarting relationships', () => {
    const f = fixture(), first = createSupporterRelationship({ ...donor('historic'), endedOn: '2032-02-01' as never }), restart = createSupporterRelationship({ ...donor('historic-return'), startedOn: '2032-03-01' as never })
    const world = updateGameWorld(f.base, { governanceInstitutions: [f.institution], supporterRelationships: [first, restart] }); expect(Object.keys(world.supporterRelationshipsById)).toHaveLength(2)
  })
  it('rejects invalid dates, scopes, missing institutions, programs, and collective references', () => {
    const f = fixture(); expect(() => createSupporterRelationship({ ...donor(), endedOn: '2031-01-01' as never })).toThrow(); expect(() => createSupporterRelationship({ ...donor(), scope: 'PROGRAM_SPECIFIC', programTeamIds: [] })).toThrow(); expect(() => updateGameWorld(f.base, { supporterRelationships: [donor()] })).toThrow(); expect(() => updateGameWorld(f.base, { governanceInstitutions: [f.institution], collectiveInstitutionAffiliations: [{ id: 'bad', collectiveId: 'missing', institutionId: f.institution.id, kind: 'INDEPENDENT', scope: 'PROGRAM_SPECIFIC', programTeamIds: [f.team.id], startedOn: '2032-01-01' as never }] })).toThrow()
  })
  it('uses duplicate-ID protection and does not create Staff Politics state', () => { const f = fixture(); expect(() => updateGameWorld(f.base, { governanceInstitutions: [f.institution], supporterRelationships: [donor(), donor()] })).toThrow(); const world = updateGameWorld(f.base, { governanceInstitutions: [f.institution], supporterRelationships: [donor()] }); expect(Object.keys(world.staffPoliticalCasesById)).toEqual([]) })
  it('round-trips through Save V3 and loads legacy V3 with empty BG7A collections', () => {
    const f = fixture(), world = updateGameWorld(f.base, { governanceInstitutions: [f.institution], supporterRelationships: [donor()] }), saved = serializeGameWorldV3(world, '2032-01-01T00:00:00.000Z'), loaded = deserializeGameWorldV3(saved)
    expect(loaded.supporterRelationshipsById).toEqual(world.supporterRelationshipsById)
    const legacy = structuredClone(saved) as any; delete legacy.payload.staffCareerRuntime.supporterRelationships; delete legacy.payload.staffCareerRuntime.collectiveInstitutionAffiliations; delete legacy.payload.staffCareerRuntime.collectiveParticipantAffiliations
    expect(Object.keys(deserializeGameWorldV3(legacy).supporterRelationshipsById)).toEqual([])
  })
})

describe('Canonical supporter funding ledger', () => {
  function fundingFixture() {
    const f = fixture(), relationship = donor('funding'), pledge = createSupportFundingPledge({ id: 'pledge', contributor: relationship.actor, supporterRelationshipId: relationship.id, target: { institutionId: f.institution.id, scope: 'PROGRAM_SPECIFIC', programTeamIds: [f.team.id] }, effectiveOn: '2032-01-01' as never, schedule: 'ONE_TIME', medium: 'CASH', amountMinorUnits: 100_000, currencyCode: 'USD', restriction: 'PROGRAM_ONLY' })
    return { ...f, relationship, pledge }
  }
  it('derives partial and full cash fulfillment without persisting totals or status', () => {
    const f = fundingFixture(), first = createSupportContribution({ id: 'b', contributor: f.relationship.actor, supporterRelationshipId: f.relationship.id, pledgeId: f.pledge.id, target: f.pledge.target, effectiveOn: '2032-01-02' as never, medium: 'CASH', amountMinorUnits: 25_000, currencyCode: 'USD', restriction: 'PROGRAM_ONLY' }), second = createSupportContribution({ ...first, id: 'a', effectiveOn: '2032-01-03' as never, amountMinorUnits: 75_000 })
    expect(totalPledgeFulfilledAmount(f.pledge, [first])).toBe(25_000); expect(remainingPledgeAmount(f.pledge, [first])).toBe(75_000); expect(deriveSupportFundingPledgeStatus(f.pledge, [], [first])).toBe('PARTIALLY_FULFILLED'); expect(deriveSupportFundingPledgeStatus(f.pledge, [], [first, second])).toBe('FULFILLED'); expect(selectContributionsByContributor([first, second], f.relationship.actor.id).map((item) => item.id)).toEqual(['a', 'b'])
  })
  it('keeps unlinked cash and in-kind support distinct from supporter status, authority, and NIL deals', () => {
    const f = fundingFixture(), cash = createSupportContribution({ id: 'cash', contributor: { kind: 'EXTERNAL', id: 'organization:foundation' }, target: { institutionId: f.institution.id, scope: 'ATHLETICS_WIDE', programTeamIds: [] }, effectiveOn: '2032-01-02' as never, medium: 'CASH', amountMinorUnits: 50_000, currencyCode: 'USD', restriction: 'ATHLETICS_ONLY' }), inKind = createSupportContribution({ id: 'kind', contributor: cash.contributor, target: { institutionId: f.institution.id, scope: 'COLLECTIVE_FUNDING', programTeamIds: [], collectiveId: f.collective.id }, effectiveOn: '2032-01-02' as never, medium: 'IN_KIND', inKindDescription: 'Practice facility equipment', declaredValueMinorUnits: 2_000, declaredValueCurrencyCode: 'USD', restriction: 'SPECIFIC_PURPOSE', purpose: 'Equipment' }), world = updateGameWorld(f.base, { governanceInstitutions: [f.institution], collectives: [...Object.values(f.base.collectivesById), f.collective], supportContributions: [cash, inKind] })
    expect(Object.keys(world.supporterRelationshipsById)).toEqual([]); expect(Object.keys(world.governanceAuthorityGrantsById)).toEqual([]); expect(Object.keys(world.nilDealsById)).toEqual([]); expect(Object.keys(world.staffPoliticalCasesById)).toEqual([])
  })
  it('rejects over-fulfillment, chronology, and invalid references while allowing terminal same-day history', () => {
    const f = fundingFixture(), contribution = createSupportContribution({ id: 'contribution', contributor: f.relationship.actor, supporterRelationshipId: f.relationship.id, pledgeId: f.pledge.id, target: f.pledge.target, effectiveOn: '2032-01-02' as never, medium: 'CASH', amountMinorUnits: 100_001, currencyCode: 'USD', restriction: 'PROGRAM_ONLY' }), withdrawn = createSupportFundingPledgeEvent({ id: 'withdrawn', pledgeId: f.pledge.id, kind: 'WITHDRAWN', effectiveOn: '2032-01-02' as never })
    expect(() => updateGameWorld(f.base, { governanceInstitutions: [f.institution], supporterRelationships: [f.relationship], supportFundingPledges: [f.pledge], supportContributions: [contribution] })).toThrow(/over-fulfilled/)
    expect(() => updateGameWorld(f.base, { governanceInstitutions: [f.institution], supporterRelationships: [f.relationship], supportFundingPledges: [f.pledge], supportFundingPledgeEvents: [withdrawn], supportContributions: [{ ...contribution, amountMinorUnits: 100_000, effectiveOn: '2032-01-03' as never }] })).toThrow(/after its terminal/)
    expect(() => updateGameWorld(f.base, { governanceInstitutions: [f.institution], supportFundingPledgeEvents: [withdrawn] })).toThrow(/pledge/)
  })
  it('round-trips strictly through Save V3 and loads legacy V3 with empty BG7B collections', () => {
    const f = fundingFixture(), contribution = createSupportContribution({ id: 'contribution', contributor: f.relationship.actor, supporterRelationshipId: f.relationship.id, pledgeId: f.pledge.id, target: f.pledge.target, effectiveOn: '2032-01-02' as never, medium: 'CASH', amountMinorUnits: 25_000, currencyCode: 'USD', restriction: 'PROGRAM_ONLY' }), world = updateGameWorld(f.base, { governanceInstitutions: [f.institution], supporterRelationships: [f.relationship], supportFundingPledges: [f.pledge], supportContributions: [contribution] }), saved = serializeGameWorldV3(world, '2032-01-01T00:00:00.000Z'), loaded = deserializeGameWorldV3(saved), legacy = structuredClone(saved) as any
    expect(loaded.supportFundingPledgesById).toEqual(world.supportFundingPledgesById); const reserialized = serializeGameWorldV3(loaded, saved.savedAt); expect(reserialized.payload.staffCareerRuntime.supportFundingPledges).toEqual(saved.payload.staffCareerRuntime.supportFundingPledges); expect(reserialized.payload.staffCareerRuntime.supportContributions).toEqual(saved.payload.staffCareerRuntime.supportContributions); delete legacy.payload.staffCareerRuntime.supportFundingPledges; delete legacy.payload.staffCareerRuntime.supportFundingPledgeEvents; delete legacy.payload.staffCareerRuntime.supportContributions; expect(Object.keys(deserializeGameWorldV3(legacy).supportContributionsById)).toEqual([])
  })
})

describe('Collective institutional governance boundaries', () => {
  it('records independent institutional status and liaisons without creating university authority or NIL deals', () => {
    const f = fixture(), status = createCollectiveInstitutionalStatusEvent({ id: 'status', collectiveId: f.collective.id, institutionId: f.institution.id, status: 'INSTITUTION_RECOGNIZED', legalIndependent: true, financialIndependent: true, operationalIndependent: true, effectiveOn: '2032-01-01' as never }), liaison = createCollectiveInstitutionalLiaison({ id: 'liaison', collectiveId: f.collective.id, institutionId: f.institution.id, actor: { kind: 'EXTERNAL', id: 'person:director' }, kind: 'ATHLETICS_LIAISON', programTeamId: f.team.id, startedOn: '2032-01-01' as never }), executive = createCollectiveParticipantAffiliation({ id: 'executive', collectiveId: f.collective.id, actor: liaison.actor, kind: 'DIRECTOR', startedOn: '2032-01-01' as never }), world = updateGameWorld(f.base, { governanceInstitutions: [f.institution], collectives: [...Object.values(f.base.collectivesById), f.collective], collectiveInstitutionalStatusEvents: [status], collectiveInstitutionalLiaisons: [liaison], collectiveParticipantAffiliations: [executive] })
    expect(Object.keys(world.governanceAuthorityGrantsById)).toEqual([]); expect(Object.keys(world.governanceAppointmentsById)).toEqual([]); expect(Object.keys(world.nilDealsById)).toEqual([]); expect(Object.keys(world.staffPoliticalCasesById)).toEqual([]); expect(collectiveLeadership([executive], f.collective.id, '2032-01-01' as never)).toEqual([executive]); expect(activeCollectiveParticipants([executive], f.collective.id, '2032-01-01' as never)).toEqual([executive])
  })
  it('round-trips BG7C records through V3 and loads legacy V3 empty', () => {
    const f = fixture(), status = createCollectiveInstitutionalStatusEvent({ id: 'status', collectiveId: f.collective.id, institutionId: f.institution.id, status: 'ATHLETICS_ALIGNED', legalIndependent: true, financialIndependent: true, operationalIndependent: true, effectiveOn: '2032-01-01' as never }), world = updateGameWorld(f.base, { governanceInstitutions: [f.institution], collectives: [...Object.values(f.base.collectivesById), f.collective], collectiveInstitutionalStatusEvents: [status] }), saved = serializeGameWorldV3(world, '2032-01-01T00:00:00.000Z'), legacy = structuredClone(saved) as any
    expect(deserializeGameWorldV3(saved).collectiveInstitutionalStatusEventsById.status).toEqual(status); delete legacy.payload.staffCareerRuntime.collectiveInstitutionalStatusEvents; delete legacy.payload.staffCareerRuntime.collectiveInstitutionalLiaisons; expect(Object.keys(deserializeGameWorldV3(legacy).collectiveInstitutionalStatusEventsById)).toEqual([])
  })
})
