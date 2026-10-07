import { describe, expect, it } from 'vitest'

import { createNewGame, createConfiguredGame } from '@/app/game'
import { ACB_TEST_UNIVERSE_ID } from '@/data/acb2026'
import { getUserTeam } from '@/engine/calendar'
import { buildClubFacilitiesWorkspaceModel, resolveClubFacilityAuthority } from '@/app/facilities'

/**
 * MX0.6 closure — shipped-universe Facilities reachability.
 *
 * This suite pins the audited production truth: no shipped universe creation path
 * (`createNewGame` / `createConfiguredGame`, prototype and ACB-test universes; the World DB Spain
 * bootstrap maps no `places`/`facilities` collection at all) creates a single canonical Facility or
 * Place. Facilities gameplay therefore cannot be reached from a real career today, and the product
 * surface must stay honest about it instead of showing a fabricated page. When an approved milestone
 * adds facility generation, this suite is the one that must change.
 */
function assertShippedUniverseHasNoFacilities(label: string, world: ReturnType<typeof createNewGame>) {
  const userTeam = getUserTeam(world)
  expect(userTeam, `${label}: user club`).toBeDefined()
  expect(Object.keys(world.placesById), `${label}: places`).toEqual([])
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
  it('leaves the prototype career with zero canonical Places and Facilities', () => {
    assertShippedUniverseHasNoFacilities('createNewGame', createNewGame())
  })

  it('leaves the configured prototype career with zero canonical Places and Facilities', () => {
    assertShippedUniverseHasNoFacilities('createConfiguredGame(prototype)', createConfiguredGame({ universeId: 'prototype' }))
  })

  it('leaves the ACB test career with zero canonical Places and Facilities', () => {
    assertShippedUniverseHasNoFacilities('createConfiguredGame(acb2026)', createConfiguredGame({ universeId: ACB_TEST_UNIVERSE_ID }))
  })
})
