import { describe, expect, it } from 'vitest'

import { createNewGame, createConfiguredGame } from '@/app/game'
import { ACB_TEST_UNIVERSE_ID } from '@/data/acb2026'
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

  it('leaves the configured prototype career with only Talent origin Places and no Facilities', () => {
    assertShippedUniverseHasNoFacilities('createConfiguredGame(prototype)', createConfiguredGame({ universeId: 'prototype' }))
  })

  it('leaves the ACB test career with only Talent origin Places and no Facilities', () => {
    assertShippedUniverseHasNoFacilities('createConfiguredGame(acb2026)', createConfiguredGame({ universeId: ACB_TEST_UNIVERSE_ID }))
  })
})
