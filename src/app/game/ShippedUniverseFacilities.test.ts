import { describe, expect, it } from 'vitest'

import { createNewGame, createConfiguredGame } from '@/app/game'
import { ACB_TEST_UNIVERSE_ID } from '@/data/acb2026'
import { createAcbTestGame } from './createAcbTestGame'
import { getUserTeam } from '@/engine/calendar'
import { buildClubFacilitiesWorkspaceModel, resolveClubFacilityAuthority } from '@/app/facilities'

/** BS17B: sources without physical content remain empty. World DB physical
 * reachability is separately tested using the actual read-only native source export. */
function assertShippedUniverseHasNoFacilities(label: string, world: ReturnType<typeof createNewGame>) {
  const userTeam = getUserTeam(world)
  expect(userTeam, `${label}: user club`).toBeDefined()
  const talentPlaces = [...new Set(Object.values(world.talentCohortsById).map(cohort => String(cohort.placeId)))].sort()
  expect(Object.keys(world.placesById).sort(), `${label}: only Talent origin Places`).toEqual(talentPlaces)
  expect(Object.keys(world.facilitiesById), `${label}: facilities`).toEqual([])
  expect(Object.keys(world.facilityComponentsById), `${label}: components`).toEqual([])
  expect(Object.keys(world.facilityUsageRightsById), `${label}: usage rights`).toEqual([])
  expect(Object.keys(world.facilityMaintenanceNeedsById), `${label}: maintenance needs`).toEqual([])
  expect(Object.keys(world.facilityDevelopmentProjectsById), `${label}: development projects`).toEqual([])

  const authority = resolveClubFacilityAuthority(world, userTeam!.id)
  expect([...authority.facilityIds], `${label}: club authority`).toEqual([])
  expect([...authority.projectIds], `${label}: club projects`).toEqual([])

  const model = buildClubFacilitiesWorkspaceModel(world, userTeam!.id)
  expect(model.facilities, `${label}: workspace facilities`).toEqual([])
  expect(model.components, `${label}: workspace components`).toEqual([])
  expect(model.openNeeds, `${label}: workspace open needs`).toEqual([])
  expect(model.projects, `${label}: workspace projects`).toEqual([])
  expect(model.costs, `${label}: workspace costs`).toEqual([])
  expect(model.organizationId).toBe(userTeam!.organizationId)

  // The club Organization and its teams are real canonical state: it is only infrastructure content
  // that has no generation authority, never club identity.
  expect(world.organizationsById[userTeam!.organizationId]).toBeDefined()
}

describe('MX0.6 closure — shipped universes contain no canonical Facility (audited truth)', () => {
  it('leaves the prototype career with only Talent origin Places and no Facilities', () => {
    assertShippedUniverseHasNoFacilities('createNewGame', createNewGame())
  })

  /**
   * BS17 GLOBAL: the production new-game entry applies BDM_GAME_BALANCE_V1. Everything it adds is labeled simulated and
   * carries the preset id prefix; no documented Facility exists, so the audited truth about the SOURCES is unchanged
   * (the creators without the preset, asserted above and below, remain empty).
   */
  function assertOnlyPresetSimulatedFacilities(label: string, world: ReturnType<typeof createNewGame>) {
    const prefix = 'bdm-balance-v1:'
    const facilities = Object.values(world.facilitiesById)
    expect(facilities.length, `${label}: simulated facilities exist`).toBeGreaterThan(0)
    expect(facilities.every((facility) => String(facility.id).startsWith(prefix) && facility.canonicalName.endsWith('(simulated)')), `${label}: every facility is preset-labeled simulated`).toBe(true)
    expect(Object.values(world.facilityComponentsById).every((component) => String(component.id).startsWith(prefix) && (component.name ?? '').endsWith('(simulated)')), `${label}: every component is simulated`).toBe(true)
    expect(Object.values(world.placesById).filter((place) => !String(place.id).startsWith(prefix)).map((place) => String(place.id)).sort(), `${label}: non-preset Places are only Talent origins`).toEqual([...new Set(Object.values(world.talentCohortsById).map((cohort) => String(cohort.placeId)))].sort())
    expect(Object.values(world.governanceInstitutionsById).every((institution) => institution.id.startsWith(prefix) && institution.name.endsWith('(simulated)')), `${label}: every institution is simulated`).toBe(true)
    expect(Object.values(world.facilityUsageRightsById).every((right) => String(right.id).startsWith(prefix)), `${label}: every usage right is preset`).toBe(true)
    expect(Object.keys(world.facilityDevelopmentProjectsById), `${label}: development projects`).toEqual([])
    const userTeam = getUserTeam(world)!
    expect(resolveClubFacilityAuthority(world, userTeam.id).facilityIds.length, `${label}: the user club owns one simulated facility`).toBe(1)
  }

  it('gives the configured prototype career only preset-labeled simulated Facilities', () => {
    assertOnlyPresetSimulatedFacilities('createConfiguredGame(prototype)', createConfiguredGame({ universeId: 'prototype' }))
  })

  it('gives the ACB test career only preset-labeled simulated Facilities, while its own creator stays empty without the preset', () => {
    assertOnlyPresetSimulatedFacilities('createConfiguredGame(acb2026)', createConfiguredGame({ universeId: ACB_TEST_UNIVERSE_ID }))
    assertShippedUniverseHasNoFacilities('createAcbTestGame()', createAcbTestGame())
  })
})
