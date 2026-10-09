import { describe, expect, it } from 'vitest'
import { addDays } from '@/domain/date'
import type { RecruitingFacilitySelection } from '@/domain/recruiting'
import { createFacilityComponent, createFacilityComponentConditionRecord, createFacilityDevelopmentProject, createFacilityUsageRight } from '@/domain/facilities'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { demonstrationFixture } from '@/app/youth/recruitingTestFixtures'
import { performRecruitingAction } from './RecruitingEngine'
import { retryRecruitingFacilityDemonstration } from './RecruitingFacilityDemonstration'
import { advanceDayWithTrace } from '@/engine/calendar'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'

const save = (world: GameWorld) => serializeGameWorldV4(world, '2032-10-01T00:00:00.000Z')

function visit(world: GameWorld, selected?: RecruitingFacilitySelection, requestId = 't1:confirm', official = false) {
  const fixture = Object.values(world.recruitProfilesById)[0]!
  const teamId = Object.values(world.teams).find(team => team.coachId === world.userCoachId)!.id
  const result = performRecruitingAction(world, fixture.cycleId, fixture.id, teamId, 'visit', {
    requestId, type: official ? 'official' : 'unofficial', startsOn: world.currentDate, endsOn: world.currentDate, lodgingNights: 0,
    ...(selected === undefined ? {} : { facilityDemonstration: selected }),
  })
  if (!result.ok) throw new Error(result.reason)
  return result.value
}
function demo(world: GameWorld) { return Object.values(world.recruitingVisitsById)[0]!.facilityDemonstration! }
function condition(world: GameWorld, serviceability: 'FULL' | 'LIMITED' | 'OUT_OF_SERVICE') {
  return updateGameWorld(world, { facilityComponentConditionRecords: Object.values(world.facilityComponentConditionRecordsById).map(record => createFacilityComponentConditionRecord({ ...record, serviceability })) })
}
function businessFacts(world: GameWorld) {
  return Object.fromEntries(Object.entries(world).filter(([key]) => !/^(facilit|placesById|recruitingVisitsById)/.test(key)))
}
function visitFacts(world: GameWorld) { return Object.values(world.recruitingVisitsById).map(({ facilityDemonstration: _demo, ...fact }) => fact) }

describe('BS17D-T1 subordinate recruiting facility activity', () => {
  it.each(['FULL', 'LIMITED', 'OUT_OF_SERVICE'] as const)('records %s execution evidence without changing the canonical visit or any RPG/economic/talent consequence', serviceability => {
    const fixture = demonstrationFixture()
    const input = condition(fixture.world, serviceability)
    const before = save(input)
    const baseline = visit(input)
    const selected = visit(input, fixture.selection)
    expect(demo(selected).attempts[0]).toMatchObject({ result: serviceability === 'OUT_OF_SERVICE' ? 'NOT_EXECUTED' : 'COMPLETED', physical: { status: serviceability === 'OUT_OF_SERVICE' ? 'VERIFIED_UNAVAILABLE' : serviceability === 'LIMITED' ? 'VERIFIED_LIMITED' : 'VERIFIED_AVAILABLE' } })
    expect(visitFacts(selected)).toEqual(visitFacts(baseline))
    expect(businessFacts(selected)).toEqual(businessFacts(baseline))
    expect(selected.players).toEqual(input.players)
    expect(selected.talentMaterializationsByCandidateKey).toEqual(input.talentMaterializationsByCandidateKey)
    expect(save(input)).toEqual(before)
    expect(Object.values(selected.recruitingActionHistoryById)).toHaveLength(1)
    expect(save(deserializeGameWorldV4(save(selected)))).toEqual(save(selected))
  })
  it('causally changes only the demonstration when the same court goes out of service', () => {
    const fixture = demonstrationFixture()
    const available = visit(fixture.world, fixture.selection)
    const unavailable = visit(condition(fixture.world, 'OUT_OF_SERVICE'), fixture.selection)
    expect(demo(available).attempts[0]?.result).toBe('COMPLETED')
    expect(demo(unavailable).attempts[0]?.result).toBe('NOT_EXECUTED')
    expect(businessFacts(available)).toEqual(businessFacts(unavailable))
    expect(visitFacts(available)).toEqual(visitFacts(unavailable))
  })
  it.each(['DENIED', 'EXPIRED'] as const)('does not turn Organization ownership or %s Team rights into usable access', variant => {
    const fixture = demonstrationFixture()
    const input = updateGameWorld(fixture.world, { facilityUsageRights: Object.values(fixture.world.facilityUsageRightsById).flatMap(right => right.teamId === fixture.senior.id ? variant === 'DENIED' ? [] : [createFacilityUsageRight({ ...right, validFrom: addDays(fixture.world.currentDate, -2), validTo: addDays(fixture.world.currentDate, -1) })] : [right]) })
    const denied = visit(input, fixture.selection)
    expect(demo(denied).attempts[0]).toMatchObject({ result: 'NOT_EXECUTED', physical: { status: 'VERIFIED_UNAVAILABLE', resources: [expect.objectContaining({ reason: 'NO_ACCESS' })] } })
    expect(visitFacts(denied)).toEqual(visitFacts(visit(fixture.world, fixture.selection)))
  })
  it('LIMITED full-court demonstration rejects a known half-court specification without blocking the visit', () => {
    const fixture = demonstrationFixture()
    const main = createFacilityComponent({ ...fixture.component, type: 'MAIN_COURT', specification: { kind: 'COURT', isFullCourt: true, isIndoor: true } })
    const compatible = condition(updateGameWorld(fixture.world, { facilityComponents: [main] }), 'LIMITED')
    const incompatible = updateGameWorld(compatible, { facilityComponents: [createFacilityComponent({ ...main, specification: { kind: 'COURT', isFullCourt: false, isIndoor: true } })] })
    const selection = { componentId: main.id, capability: 'BASKETBALL_FULL_COURT' } as const
    const accepted = visit(compatible, selection), blocked = visit(incompatible, selection)
    expect(demo(accepted).attempts[0]?.result).toBe('COMPLETED')
    expect(demo(blocked).attempts[0]?.physical.status).toBe('VERIFIED_UNAVAILABLE')
    expect(businessFacts(accepted)).toEqual(businessFacts(blocked))
    expect(visitFacts(accepted)).toEqual(visitFacts(blocked))
  })
  it('known incompatible capability is blocked, not misclassified as missing context', () => {
    const fixture = demonstrationFixture()
    const result = visit(fixture.world, { ...fixture.selection, capability: 'MEDICAL_IMAGING' })
    expect(demo(result).attempts[0]).toMatchObject({ result: 'NOT_EXECUTED', physical: { status: 'VERIFIED_UNAVAILABLE', resources: [expect.objectContaining({ reason: 'INCOMPATIBLE_CAPABILITY' })] } })
    expect(businessFacts(result)).toEqual(businessFacts(visit(fixture.world)))
  })
  it('unknown service evidence cannot certify a demonstration and actual BS17C component work prevents it', () => {
    const fixture = demonstrationFixture()
    const unknown = updateGameWorld(fixture.world, { facilityComponentConditionRecords: [] })
    expect(demo(visit(unknown, fixture.selection)).attempts[0]).toMatchObject({ result: 'NOT_EXECUTED', physical: { status: 'UNVERIFIED_PHYSICAL_CONTEXT' } })
    const project = createFacilityDevelopmentProject({ id: 't1:project', organizationId: fixture.senior.organizationId, facilityId: fixture.facility.id, projectType: 'RECONFIGURATION', createdAt: fixture.world.currentDate, plannedStartDate: fixture.world.currentDate, plannedCompletionDate: addDays(fixture.world.currentDate, 10), status: 'IN_PROGRESS', actualStartDate: fixture.world.currentDate, scope: { kind: 'RENOVATE_COMPONENT', componentId: fixture.component.id, resultingCondition: 90 } })
    const work = updateGameWorld(fixture.world, { facilityDevelopmentProjects: [project] })
    const blocked = visit(work, fixture.selection)
    expect(demo(blocked).attempts[0]).toMatchObject({ result: 'NOT_EXECUTED', physical: { resources: [expect.objectContaining({ reason: 'PHYSICAL_WORK' })] } })
    expect(businessFacts(blocked)).toEqual(businessFacts(visit(fixture.world)))
    expect(visitFacts(blocked)).toEqual(visitFacts(visit(fixture.world)))
  })
  it('offers a legitimate alternative through a retry of one activity, then never completes it twice', () => {
    const fixture = demonstrationFixture()
    const blocked = visit(condition(fixture.world, 'OUT_OF_SERVICE'), fixture.selection)
    const alternative = createFacilityComponent({ ...fixture.component, id: 't1:alternative' })
    const input = updateGameWorld(blocked, { facilityComponents: [...Object.values(blocked.facilityComponentsById), alternative], facilityComponentConditionRecords: [...Object.values(blocked.facilityComponentConditionRecordsById), createFacilityComponentConditionRecord({ id: 't1:alternative-condition', componentId: alternative.id, effectiveFrom: blocked.currentDate, serviceability: 'FULL', physicalCondition: 80 })] })
    const visitId = Object.keys(input.recruitingVisitsById)[0]!
    const retried = retryRecruitingFacilityDemonstration(input, visitId, fixture.senior.id, { ...fixture.selection, componentId: alternative.id })
    expect(retried.ok).toBe(true)
    if (!retried.ok) return
    expect(demo(retried.value).attempts).toHaveLength(2)
    expect(demo(retried.value).attempts[1]).toMatchObject({ result: 'COMPLETED', selectedComponentId: alternative.id })
    expect(businessFacts(retried.value)).toEqual(businessFacts(input))
    expect(Object.keys(retried.value.recruitingVisitsById)).toHaveLength(1)
    expect(retryRecruitingFacilityDemonstration(retried.value, visitId, fixture.senior.id, fixture.selection)).toEqual({ ok: true, value: retried.value })
  })
  it('UNKNOWN keeps the visit result and records no verified demonstration; not selected keeps the old payload', () => {
    const fixture = demonstrationFixture()
    const input = updateGameWorld(fixture.world, { facilities: [], facilityComponents: [], facilityUsageRights: [], facilityComponentConditionRecords: [] })
    const unknown = visit(input, fixture.selection)
    const baseline = visit(input)
    expect(demo(unknown).attempts[0]).toMatchObject({ result: 'NOT_EXECUTED', physical: { status: 'UNVERIFIED_PHYSICAL_CONTEXT', resources: [] } })
    expect(businessFacts(unknown)).toEqual(businessFacts(baseline))
    expect(Object.values(baseline.recruitingVisitsById)[0]).not.toHaveProperty('facilityDemonstration')
    const legacy = performRecruitingAction(input, fixture.recruit.cycleId, fixture.recruit.id, fixture.senior.id, 'visit')
    expect(legacy.ok).toBe(true)
    if (legacy.ok) expect(Object.values(legacy.value.recruitingVisitsById)[0]).not.toHaveProperty('requestId')
  })
  it('restoration and reload replay no visit or activity; Calendar cannot automatically complete a blocked demonstration', () => {
    const fixture = demonstrationFixture()
    const blocked = visit(condition(fixture.world, 'OUT_OF_SERVICE'), fixture.selection)
    const loaded = deserializeGameWorldV4(save(blocked))
    expect(visit(loaded, fixture.selection)).toBe(loaded)
    const id = Object.keys(loaded.recruitingVisitsById)[0]!
    expect(retryRecruitingFacilityDemonstration(loaded, id, fixture.senior.id, fixture.selection)).toEqual({ ok: true, value: loaded })
    const restored = condition(loaded, 'FULL')
    const retried = retryRecruitingFacilityDemonstration(restored, id, fixture.senior.id, fixture.selection)
    expect(retried.ok).toBe(true)
    if (!retried.ok) return
    expect(demo(retried.value).attempts.at(-1)?.result).toBe('COMPLETED')
    const day = advanceDayWithTrace(restored)
    expect(day.status).not.toBe('FAILED')
    expect(day.phases.filter(phase => phase.phaseId === 'RECRUITING')).toHaveLength(1)
    expect(day.world.recruitingVisitsById[id]).toEqual(restored.recruitingVisitsById[id])
    expect(retryRecruitingFacilityDemonstration(day.world, id, fixture.senior.id, fixture.selection)).toEqual({ ok: false, reason: 'VISIT_ACTIVITY_NOT_ACTIVE' })
    const completed = deserializeGameWorldV4(save(retried.value))
    expect(visit(completed, fixture.selection)).toBe(completed)
    expect(retryRecruitingFacilityDemonstration(completed, id, fixture.senior.id, fixture.selection)).toEqual({ ok: true, value: completed })
  })
  it.each(['official', 'unofficial'] as const)('preserves %s NCAA permission and count rules, including a dead-period rejection with no partial activity', kind => {
    const fixture = demonstrationFixture(true)
    const selected = visit(fixture.world, fixture.selection, 'ncaa:confirm', kind === 'official')
    expect(businessFacts(selected)).toEqual(businessFacts(visit(fixture.world, undefined, 'ncaa:confirm', kind === 'official')))
    const cycle = Object.values(fixture.world.recruitingCyclesById)[0]!
    const dead = updateGameWorld(fixture.world, { recruitingCycles: [{ ...cycle, calendar: { ...cycle.calendar!, windows: cycle.calendar!.windows.map(window => ({ ...window, period: 'dead' as const })) } }] })
    const before = save(dead)
    const rejected = performRecruitingAction(dead, fixture.recruit.cycleId, fixture.recruit.id, fixture.senior.id, 'visit', { type: kind, startsOn: dead.currentDate, endsOn: dead.currentDate, lodgingNights: 0, facilityDemonstration: fixture.selection })
    expect(rejected).toMatchObject({ ok: false })
    expect(save(dead)).toEqual(before)
    expect(Object.keys(dead.recruitingVisitsById)).toHaveLength(0)
    if (kind === 'official') expect(() => visit(selected, fixture.selection, 'ncaa:second', true)).toThrow('OFFICIAL_VISIT_COUNT_LIMIT')
  })
})
