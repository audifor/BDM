import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { updateGameWorld } from '@/domain/world'
import { createGovernanceInstitution } from '@/domain/governance'
import { createCollectiveInstitutionAffiliation, createCollectiveParticipantAffiliation, createSupporterRelationship } from './InstitutionalSupport'
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
