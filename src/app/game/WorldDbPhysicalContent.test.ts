import { describe, expect, it } from 'vitest'
import { createNewGame } from './createNewGame'
import { projectWorldDbPhysicalContent } from './WorldDbPhysicalContent'
import { getUserTeam } from '@/engine/calendar'
import { updateGameWorld } from '@/domain/world'
import { addDays, parseGameDate } from '@/domain/date'
import { createFacilityDevelopmentProject, createFacilityUsageRight, componentConditionAt } from '@/domain/facilities'
import { startFacilityDevelopmentProject, completeFacilityDevelopmentProject } from '@/engine/facilities'
import { buildClubFacilitiesWorkspaceModel } from '@/app/facilities'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { generateWorld } from '@/engine/world'
import type { WorldDbPhysicalContentV1 } from '@/domain/worldDb/GameBootstrap'

// Source-shape unit scenarios. These are not evidence that the shipped DB contains anatomy.
function scenario() {
  const base = createNewGame()
  const teams = Object.values(base.teams).slice(0, 2)
  const content: WorldDbPhysicalContentV1 = {
    places: [{ placeId: 'source:city', name: 'Source city', placeType: 'CITY', parentPlaceId: null, latitude: null, longitude: null }],
    facilities: [{ facilityId: 'source:venue', name: 'Source venue', placeId: 'source:city', capacity: null }],
    teamUsages: teams.map((team, i) => ({ usageId: `source:use:${i}`, teamId: team.id, facilityId: 'source:venue', usageType: 'home', validFrom: i === 0 ? '2025-26' : '2020-01-01', validTo: null })),
  }
  const physical = projectWorldDbPhysicalContent(content)
  return { base, teams, content, world: updateGameWorld(base, { ...physical, places: [...Object.values(base.placesById), ...physical.places] }) }
}

describe('BS17B source-backed physical projection', () => {
  it('distinguishes absent content from a known asset with unknown properties and no access', () => {
    expect(projectWorldDbPhysicalContent().facilities).toEqual([])
    const { world, base, teams } = scenario()
    const facility = Object.values(world.facilitiesById)[0]!
    expect(facility).toMatchObject({ id: 'source:venue', type: 'OTHER', status: 'UNKNOWN', purposes: ['MATCH_HOSTING'], capabilities: [] })
    expect(Object.values(facility.physical).every((value) => value === null)).toBe(true)
    for (const key of ['facilityComponentsById', 'facilityOwnershipInterestsById', 'facilityUsageRightsById', 'facilityComponentConditionRecordsById', 'facilityFinancialBindingsById'] as const) expect(world[key]).toEqual({})
    const model = buildClubFacilitiesWorkspaceModel(world, teams[0]!.id)
    expect(model.facilities).toHaveLength(1)
    expect(model.facilities[0]!.accessKinds).toEqual(['RELATED'])
    expect(model.sporting.basketball.usablePracticeCourtCount).toBe(0)
    // All nonphysical state, including Finance/Governance/Players/Training/Medical/Match, is identical.
    for (const key of Object.keys(base) as (keyof typeof base)[]) if (!key.startsWith('facility') && key !== 'facilitiesById' && key !== 'placesById') expect(JSON.stringify(world[key])).toBe(JSON.stringify(base[key]))
  })

  it('keeps shared source identities stable regardless of iteration order and preserves exact versus unknown dates', () => {
    const { base, world, content, teams } = scenario()
    const reversedPhysical = projectWorldDbPhysicalContent({ ...content, teamUsages: [...content.teamUsages].reverse() })
    const reversed = updateGameWorld(base, { ...reversedPhysical, places: [...Object.values(base.placesById), ...reversedPhysical.places] })
    expect(reversed.facilitiesById).toEqual(world.facilitiesById)
    expect(reversed.facilityTeamRelationshipsById).toEqual(world.facilityTeamRelationshipsById)
    expect(Object.values(world.facilityTeamRelationshipsById).map((r) => r.validFrom)).toEqual([null, '2020-01-01'])
    for (const team of teams) expect(buildClubFacilitiesWorkspaceModel(world, team.id).facilities.map((f) => f.facilityId)).toEqual(['source:venue'])
    expect(() => updateGameWorld(base, projectWorldDbPhysicalContent({ ...content, facilities: [...content.facilities, content.facilities[0]!] }))).toThrow(/Duplicate/)
    expect(() => updateGameWorld(base, projectWorldDbPhysicalContent({ ...content, places: [...content.places, content.places[0]!] }))).toThrow(/Duplicate/)
    expect(() => updateGameWorld(base, projectWorldDbPhysicalContent({ ...content, teamUsages: [...content.teamUsages, content.teamUsages[0]!] }))).toThrow(/Duplicate/)
  })

  it('round-trips physical identity, unknown state, source associations and separately explicit rights', () => {
    const { world, teams } = scenario()
    const right = createFacilityUsageRight({ id: 'explicit:source:right', facilityId: 'source:venue', teamId: teams[0]!.id, purpose: 'HOME_VENUE', validFrom: '2032-10-01', validTo: '2032-10-31', exclusivity: 'SHARED' })
    const supplied = updateGameWorld(world, { facilityUsageRights: [right] })
    const loaded = deserializeGameWorldV4(serializeGameWorldV4(supplied, '2026-10-09T12:00:00.000Z'))
    for (const key of ['placesById', 'facilitiesById', 'facilityComponentsById', 'facilityTeamRelationshipsById', 'facilityUsageRightsById'] as const) expect(loaded[key]).toEqual(supplied[key])
    expect(buildClubFacilitiesWorkspaceModel(loaded, teams[0]!.id)).toEqual(buildClubFacilitiesWorkspaceModel(supplied, teams[0]!.id))
  })

  it('honors explicit medical purpose and legacy unknown purpose without inventing commissioning, money, ownership or players', () => {
    const { base, world } = scenario()
    for (const purposes of [undefined, ['MEDICAL_TREATMENT'] as const]) {
      const project = createFacilityDevelopmentProject({ id: 'project:bs17b:medical', organizationId: getUserTeam(base)!.organizationId,
        projectType: 'NEW_FACILITY', createdAt: world.currentDate, plannedStartDate: world.currentDate, plannedCompletionDate: addDays(world.currentDate, 10),
        scope: { kind: 'CREATE_FACILITY', placeId: 'source:city', facilityType: 'MEDICAL_CENTER', canonicalName: 'Explicit medical asset', purposes, initialComponents: [{ type: 'MEDICAL_ROOM' }] } })
      const staged = updateGameWorld(world, { facilityDevelopmentProjects: [project] })
      const started = startFacilityDevelopmentProject(staged, project.id, staged.currentDate).world
      const finished = completeFacilityDevelopmentProject(started, project.id, addDays(staged.currentDate, 1)).world
      const created = Object.values(finished.facilitiesById).find((f) => f.type === 'MEDICAL_CENTER')!
      expect(created.purposes).toEqual(purposes ?? ['OTHER'])
      expect(created.physical.openedOn).toBeNull()
      const component = Object.values(finished.facilityComponentsById)[0]!
      expect(componentConditionAt(Object.values(finished.facilityComponentConditionRecordsById), component.id, addDays(staged.currentDate, 1))).toBeUndefined()
      expect(finished.facilityOwnershipInterestsById).toEqual({})
      expect(finished.facilityUsageRightsById).toEqual({})
      expect(finished.players).toEqual(world.players)
      expect(finished.financialAccountsById).toEqual(world.financialAccountsById)
      expect(finished.financialTransactionsById).toEqual(world.financialTransactionsById)
      expect(finished.financialCommitmentsById).toEqual(world.financialCommitmentsById)
      const loaded = deserializeGameWorldV4(serializeGameWorldV4(finished, '2026-10-09T12:00:00.000Z'))
      expect(loaded.facilityDevelopmentProjectsById[project.id]!.scope).toEqual(finished.facilityDevelopmentProjectsById[project.id]!.scope)
      expect(loaded.facilityComponentsById).toEqual(finished.facilityComponentsById)
    }
  })

  it('rejects fabricated purpose vocabulary instead of silently defaulting to training', () => {
    const { world } = scenario()
    expect(() => createFacilityDevelopmentProject({ id: 'p:invalid', organizationId: getUserTeam(world)!.organizationId, projectType: 'NEW_FACILITY', createdAt: world.currentDate,
      plannedStartDate: world.currentDate, plannedCompletionDate: world.currentDate,
      scope: { kind: 'CREATE_FACILITY', placeId: 'source:city', facilityType: 'ARENA', canonicalName: 'Arena', purposes: [] , initialComponents: [] } })).toThrow(/purposes/)
  })

  it.each(['male', 'female'] as const)('keeps shared %s NBA/NCAA generation empty when no physical source exists', (gender) => {
    const world = generateWorld({ seed: 12345, gender, startDate: parseGameDate('2032-10-01'), includeNbaLike: true, includeNcaaLike: true })
    expect(Object.values(world.ecosystems).some((e) => e.kind === 'nbaLike')).toBe(true)
    expect(world.facilitiesById).toEqual({})
    expect(world.placesById).toEqual({})
  })
})
