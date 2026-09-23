import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { parseGameDate } from '@/domain/date'
import { updateGameWorld, GameWorldValidationError } from '@/domain/world'
import { personIdFromString } from '@/domain/ids'
import {
  createFacility,
  createFacilityComponent,
  createFacilityControlRight,
  createFacilityOperatorAssignment,
  createFacilityOwnershipInterest,
  createFacilityUsageRight,
  createPlace,
  controllersOfFacilityAt,
  facilitiesOperatedByOrganizationAt,
  facilitiesOwnedByOrganizationAt,
  facilityComponentsUsableByTeamAt,
  facilityRightsConflictsAt,
  homeFacilitiesForTeamAt,
  operatorsOfFacilityAt,
  organizationsUsingFacilityAt,
  ownershipShareOfAt,
  ownersOfFacilityAt,
  teamsUsingFacilityAt,
  trainingFacilitiesForTeamAt,
  usageRightsForOrganizationAt,
  usageRightsForTeamAt,
} from './index'

function fixture() {
  const world = createNewGame()
  const teams = Object.values(world.teams)
  const teamA = teams[0]!
  const teamB = teams.find((team) => team.id !== teamA.id)!
  const organizationA = teamA.organizationId
  const organizationB = teamB.organizationId
  const municipalOrg = Object.values(world.organizationsById).find((organization) => organization.id !== organizationA && organization.id !== organizationB)!
  return { world, teamA, teamB, organizationA, organizationB, municipalOrg: municipalOrg.id }
}

function arenaAt(id: string, placeId: string) {
  return createFacility({ id, placeId, type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'ACTIVE', canonicalName: id })
}

describe('Club Facilities & Infrastructure V2 — Ownership, Control & Access Rights (CFI2)', () => {
  it('1. club owns and operates its arena', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:1', kind: 'CITY', name: 'City 1' })
    const arena = arenaAt('facility:1', place.id)
    const world = updateGameWorld(f.world, {
      places: [place],
      facilities: [arena],
      facilityOwnershipInterests: [createFacilityOwnershipInterest({ id: 'own:1', facilityId: arena.id, owner: { kind: 'ORGANIZATION', organizationId: f.organizationA }, ownershipPercentage: 100, validFrom: '2000-01-01' })],
      facilityOperatorAssignments: [createFacilityOperatorAssignment({ id: 'op:1', facilityId: arena.id, operatorOrganizationId: f.organizationA, validFrom: '2000-01-01' })],
    })
    const onDate = parseGameDate('2030-01-01')
    expect(ownersOfFacilityAt(Object.values(world.facilityOwnershipInterestsById), arena.id, onDate).map((o) => o.owner)).toEqual([{ kind: 'ORGANIZATION', organizationId: f.organizationA }])
    expect(operatorsOfFacilityAt(Object.values(world.facilityOperatorAssignmentsById), arena.id, onDate).map((o) => o.operatorOrganizationId)).toEqual([f.organizationA])
  })

  it('2. municipality owns, third party operates, club uses', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:2', kind: 'CITY', name: 'City 2' })
    const arena = arenaAt('facility:2', place.id)
    const thirdPartyOperator = f.organizationB
    const world = updateGameWorld(f.world, {
      places: [place],
      facilities: [arena],
      facilityOwnershipInterests: [createFacilityOwnershipInterest({ id: 'own:2', facilityId: arena.id, owner: { kind: 'ORGANIZATION', organizationId: f.municipalOrg }, ownershipPercentage: 100, validFrom: '2000-01-01' })],
      facilityOperatorAssignments: [createFacilityOperatorAssignment({ id: 'op:2', facilityId: arena.id, operatorOrganizationId: thirdPartyOperator, validFrom: '2000-01-01' })],
      facilityUsageRights: [createFacilityUsageRight({ id: 'usage:2', facilityId: arena.id, teamId: f.teamA.id, purpose: 'HOME_VENUE', validFrom: '2000-01-01' })],
    })
    const onDate = parseGameDate('2030-01-01')
    expect(ownersOfFacilityAt(Object.values(world.facilityOwnershipInterestsById), arena.id, onDate).map((o) => o.owner)).toEqual([{ kind: 'ORGANIZATION', organizationId: f.municipalOrg }])
    expect(operatorsOfFacilityAt(Object.values(world.facilityOperatorAssignmentsById), arena.id, onDate).map((o) => o.operatorOrganizationId)).toEqual([thirdPartyOperator])
    expect(usageRightsForTeamAt(Object.values(world.facilityUsageRightsById), f.teamA.id, onDate).map((r) => r.facilityId)).toEqual([arena.id])
    // The club owns nothing here.
    expect(ownershipShareOfAt(Object.values(world.facilityOwnershipInterestsById), arena.id, f.organizationA, onDate)).toBeUndefined()
  })

  it('3. ownership 60/40', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:3', kind: 'CITY', name: 'City 3' })
    const arena = arenaAt('facility:3', place.id)
    const world = updateGameWorld(f.world, {
      places: [place],
      facilities: [arena],
      facilityOwnershipInterests: [
        createFacilityOwnershipInterest({ id: 'own:3a', facilityId: arena.id, owner: { kind: 'ORGANIZATION', organizationId: f.organizationA }, ownershipPercentage: 60, validFrom: '2020-01-01' }),
        createFacilityOwnershipInterest({ id: 'own:3b', facilityId: arena.id, owner: { kind: 'ORGANIZATION', organizationId: f.organizationB }, ownershipPercentage: 40, validFrom: '2020-01-01' }),
      ],
    })
    const onDate = parseGameDate('2030-01-01')
    expect(ownershipShareOfAt(Object.values(world.facilityOwnershipInterestsById), arena.id, f.organizationA, onDate)).toBe(60)
    expect(ownershipShareOfAt(Object.values(world.facilityOwnershipInterestsById), arena.id, f.organizationB, onDate)).toBe(40)
  })

  it('4. ownership changes historically', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:4', kind: 'CITY', name: 'City 4' })
    const arena = arenaAt('facility:4', place.id)
    const world = updateGameWorld(f.world, {
      places: [place],
      facilities: [arena],
      facilityOwnershipInterests: [
        createFacilityOwnershipInterest({ id: 'own:4-old', facilityId: arena.id, owner: { kind: 'ORGANIZATION', organizationId: f.organizationA }, ownershipPercentage: 100, validFrom: '2000-01-01', validTo: '2019-12-31' }),
        createFacilityOwnershipInterest({ id: 'own:4-new', facilityId: arena.id, owner: { kind: 'ORGANIZATION', organizationId: f.organizationB }, ownershipPercentage: 100, validFrom: '2020-01-01' }),
      ],
    })
    expect(ownersOfFacilityAt(Object.values(world.facilityOwnershipInterestsById), arena.id, parseGameDate('2010-01-01')).map((o) => o.owner)).toEqual([{ kind: 'ORGANIZATION', organizationId: f.organizationA }])
    expect(ownersOfFacilityAt(Object.values(world.facilityOwnershipInterestsById), arena.id, parseGameDate('2025-01-01')).map((o) => o.owner)).toEqual([{ kind: 'ORGANIZATION', organizationId: f.organizationB }])
  })

  it('5. unknown ownership share', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:5', kind: 'CITY', name: 'City 5' })
    const arena = arenaAt('facility:5', place.id)
    const world = updateGameWorld(f.world, {
      places: [place],
      facilities: [arena],
      facilityOwnershipInterests: [createFacilityOwnershipInterest({ id: 'own:5', facilityId: arena.id, owner: { kind: 'ORGANIZATION', organizationId: f.organizationA }, ownershipPercentage: null, validFrom: '2020-01-01' })],
    })
    expect(ownershipShareOfAt(Object.values(world.facilityOwnershipInterestsById), arena.id, f.organizationA, parseGameDate('2030-01-01'))).toBeNull()
  })

  it('6. two teams share HOME_VENUE without conflict (both non-exclusive)', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:6', kind: 'CITY', name: 'City 6' })
    const arena = arenaAt('facility:6', place.id)
    const world = updateGameWorld(f.world, {
      places: [place],
      facilities: [arena],
      facilityUsageRights: [
        createFacilityUsageRight({ id: 'usage:6a', facilityId: arena.id, teamId: f.teamA.id, purpose: 'HOME_VENUE', exclusivity: 'SHARED', validFrom: '2020-01-01' }),
        createFacilityUsageRight({ id: 'usage:6b', facilityId: arena.id, teamId: f.teamB.id, purpose: 'HOME_VENUE', exclusivity: 'SHARED', validFrom: '2020-01-01' }),
      ],
    })
    const onDate = parseGameDate('2030-01-01')
    expect([...teamsUsingFacilityAt(Object.values(world.facilityUsageRightsById), arena.id, onDate)].sort()).toEqual([f.teamA.id, f.teamB.id].sort())
    expect(facilityRightsConflictsAt(Object.values(world.facilityUsageRightsById), arena.id, onDate)).toEqual([])
  })

  it('7. exclusive rights conflicting are rejected at construction time', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:7', kind: 'CITY', name: 'City 7' })
    const arena = arenaAt('facility:7', place.id)
    expect(() => updateGameWorld(f.world, {
      places: [place],
      facilities: [arena],
      facilityUsageRights: [
        createFacilityUsageRight({ id: 'usage:7a', facilityId: arena.id, teamId: f.teamA.id, purpose: 'HOME_VENUE', exclusivity: 'EXCLUSIVE', validFrom: '2020-01-01' }),
        createFacilityUsageRight({ id: 'usage:7b', facilityId: arena.id, teamId: f.teamB.id, purpose: 'HOME_VENUE', exclusivity: 'EXCLUSIVE', validFrom: '2020-01-01' }),
      ],
    })).toThrow(GameWorldValidationError)
  })

  it('8. shared rights are non-conflicting even over the same purpose and scope', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:8', kind: 'CITY', name: 'City 8' })
    const facility = arenaAt('facility:8', place.id)
    const rights = [
      createFacilityUsageRight({ id: 'usage:8a', facilityId: facility.id, teamId: f.teamA.id, purpose: 'TRAINING', exclusivity: 'SHARED', validFrom: '2020-01-01' }),
      createFacilityUsageRight({ id: 'usage:8b', facilityId: facility.id, teamId: f.teamB.id, purpose: 'TRAINING', exclusivity: 'SHARED', validFrom: '2020-01-01' }),
    ]
    const world = updateGameWorld(f.world, { places: [place], facilities: [facility], facilityUsageRights: rights })
    expect(facilityRightsConflictsAt(Object.values(world.facilityUsageRightsById), facility.id, parseGameDate('2030-01-01'))).toEqual([])
  })

  it("9. men's and women's teams share a training center", () => {
    const f = fixture()
    const place = createPlace({ id: 'place:9', kind: 'CAMPUS', name: 'Campus 9' })
    const trainingCenter = createFacility({ id: 'facility:9', placeId: place.id, type: 'TRAINING_CENTER', purposes: ['TRAINING'], status: 'ACTIVE', canonicalName: 'Training Center 9' })
    const world = updateGameWorld(f.world, {
      places: [place],
      facilities: [trainingCenter],
      facilityUsageRights: [
        createFacilityUsageRight({ id: 'usage:9a', facilityId: trainingCenter.id, teamId: f.teamA.id, purpose: 'TRAINING', exclusivity: 'SHARED', validFrom: '2020-01-01' }),
        createFacilityUsageRight({ id: 'usage:9b', facilityId: trainingCenter.id, teamId: f.teamB.id, purpose: 'TRAINING', exclusivity: 'SHARED', validFrom: '2020-01-01' }),
      ],
    })
    expect(trainingFacilitiesForTeamAt(Object.values(world.facilityUsageRightsById), f.teamA.id, parseGameDate('2030-01-01'))).toHaveLength(1)
    expect(trainingFacilitiesForTeamAt(Object.values(world.facilityUsageRightsById), f.teamB.id, parseGameDate('2030-01-01'))).toHaveLength(1)
  })

  it('10. different teams use different components of the same facility', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:10', kind: 'CAMPUS', name: 'Campus 10' })
    const trainingCenter = createFacility({ id: 'facility:10', placeId: place.id, type: 'TRAINING_CENTER', purposes: ['TRAINING'], status: 'ACTIVE', canonicalName: 'Training Center 10' })
    const courtA = createFacilityComponent({ id: 'component:10a', facilityId: trainingCenter.id, type: 'PRACTICE_COURT', status: 'ACTIVE' })
    const courtB = createFacilityComponent({ id: 'component:10b', facilityId: trainingCenter.id, type: 'PRACTICE_COURT', status: 'ACTIVE' })
    const world = updateGameWorld(f.world, {
      places: [place],
      facilities: [trainingCenter],
      facilityComponents: [courtA, courtB],
      facilityUsageRights: [
        createFacilityUsageRight({ id: 'usage:10a', facilityId: trainingCenter.id, componentIds: [courtA.id], teamId: f.teamA.id, purpose: 'TRAINING', exclusivity: 'EXCLUSIVE', validFrom: '2020-01-01' }),
        createFacilityUsageRight({ id: 'usage:10b', facilityId: trainingCenter.id, componentIds: [courtB.id], teamId: f.teamB.id, purpose: 'TRAINING', exclusivity: 'EXCLUSIVE', validFrom: '2020-01-01' }),
      ],
    })
    const onDate = parseGameDate('2030-01-01')
    expect(facilityComponentsUsableByTeamAt(Object.values(world.facilityUsageRightsById), Object.values(world.facilityComponentsById), f.teamA.id, onDate)).toEqual([courtA.id])
    expect(facilityComponentsUsableByTeamAt(Object.values(world.facilityUsageRightsById), Object.values(world.facilityComponentsById), f.teamB.id, onDate)).toEqual([courtB.id])
    // Exclusive but non-overlapping component scopes: no conflict.
    expect(facilityRightsConflictsAt(Object.values(world.facilityUsageRightsById), trainingCenter.id, onDate)).toEqual([])
  })

  it('11. organization has rights without owning the facility', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:11', kind: 'CITY', name: 'City 11' })
    const arena = arenaAt('facility:11', place.id)
    const world = updateGameWorld(f.world, {
      places: [place],
      facilities: [arena],
      facilityUsageRights: [createFacilityUsageRight({ id: 'usage:11', facilityId: arena.id, organizationId: f.organizationA, purpose: 'ADMINISTRATION', validFrom: '2020-01-01' })],
    })
    const onDate = parseGameDate('2030-01-01')
    expect(usageRightsForOrganizationAt(Object.values(world.facilityUsageRightsById), f.organizationA, onDate)).toHaveLength(1)
    expect(ownersOfFacilityAt(Object.values(world.facilityOwnershipInterestsById), arena.id, onDate)).toEqual([])
  })

  it('12. owner has no automatic usage rights', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:12', kind: 'CITY', name: 'City 12' })
    const arena = arenaAt('facility:12', place.id)
    const world = updateGameWorld(f.world, {
      places: [place],
      facilities: [arena],
      facilityOwnershipInterests: [createFacilityOwnershipInterest({ id: 'own:12', facilityId: arena.id, owner: { kind: 'ORGANIZATION', organizationId: f.organizationA }, ownershipPercentage: 100, validFrom: '2020-01-01' })],
    })
    expect(usageRightsForOrganizationAt(Object.values(world.facilityUsageRightsById), f.organizationA, parseGameDate('2030-01-01'))).toEqual([])
  })

  it('13. operator has no automatic ownership', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:13', kind: 'CITY', name: 'City 13' })
    const arena = arenaAt('facility:13', place.id)
    const world = updateGameWorld(f.world, {
      places: [place],
      facilities: [arena],
      facilityOperatorAssignments: [createFacilityOperatorAssignment({ id: 'op:13', facilityId: arena.id, operatorOrganizationId: f.organizationA, validFrom: '2020-01-01' })],
    })
    expect(ownersOfFacilityAt(Object.values(world.facilityOwnershipInterestsById), arena.id, parseGameDate('2030-01-01'))).toEqual([])
  })

  it('14. NCAA university ownership with team usage', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:14', kind: 'CAMPUS', name: 'University Campus 14' })
    const fieldhouse = createFacility({ id: 'facility:14', placeId: place.id, type: 'MULTI_SPORT_COMPLEX', purposes: ['MATCH_HOSTING', 'TRAINING'], status: 'ACTIVE', canonicalName: 'Fieldhouse 14' })
    const athleticDept = f.organizationB
    const world = updateGameWorld(f.world, {
      places: [place],
      facilities: [fieldhouse],
      facilityOwnershipInterests: [createFacilityOwnershipInterest({ id: 'own:14', facilityId: fieldhouse.id, owner: { kind: 'ORGANIZATION', organizationId: f.organizationA }, ownershipPercentage: 100, validFrom: '1990-01-01' })],
      facilityControlRights: [createFacilityControlRight({ id: 'control:14', facilityId: fieldhouse.id, controller: { kind: 'ORGANIZATION', organizationId: athleticDept }, validFrom: '1990-01-01' })],
      facilityUsageRights: [
        createFacilityUsageRight({ id: 'usage:14a', facilityId: fieldhouse.id, teamId: f.teamA.id, purpose: 'HOME_VENUE', exclusivity: 'SHARED', validFrom: '1990-01-01' }),
        createFacilityUsageRight({ id: 'usage:14b', facilityId: fieldhouse.id, teamId: f.teamB.id, purpose: 'HOME_VENUE', exclusivity: 'SHARED', validFrom: '1990-01-01' }),
      ],
    })
    const onDate = parseGameDate('2030-01-01')
    expect(ownersOfFacilityAt(Object.values(world.facilityOwnershipInterestsById), fieldhouse.id, onDate).map((o) => o.owner)).toEqual([{ kind: 'ORGANIZATION', organizationId: f.organizationA }])
    expect(controllersOfFacilityAt(Object.values(world.facilityControlRightsById), fieldhouse.id, onDate).map((c) => c.controller)).toEqual([{ kind: 'ORGANIZATION', organizationId: athleticDept }])
    expect(teamsUsingFacilityAt(Object.values(world.facilityUsageRightsById), fieldhouse.id, onDate)).toHaveLength(2)
  })

  it('15. temporary home venue does not delete the primary home venue history', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:15', kind: 'CITY', name: 'City 15' })
    const mainArena = arenaAt('facility:15-main', place.id)
    const tempArena = arenaAt('facility:15-temp', place.id)
    const world = updateGameWorld(f.world, {
      places: [place],
      facilities: [mainArena, tempArena],
      facilityUsageRights: [
        createFacilityUsageRight({ id: 'usage:15-main', facilityId: mainArena.id, teamId: f.teamA.id, purpose: 'HOME_VENUE', validFrom: '2026-07-01' }),
        createFacilityUsageRight({ id: 'usage:15-temp', facilityId: tempArena.id, teamId: f.teamA.id, purpose: 'TEMPORARY_HOME', validFrom: '2028-01-01', validTo: '2028-04-30' }),
      ],
    })
    expect(usageRightsForFacilityAtExists(world, mainArena.id, 'usage:15-main')).toBe(true)
  })

  it('16. primary + temporary venue resolution distinguishes the two at overlapping dates', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:16', kind: 'CITY', name: 'City 16' })
    const mainArena = arenaAt('facility:16-main', place.id)
    const tempArena = arenaAt('facility:16-temp', place.id)
    const world = updateGameWorld(f.world, {
      places: [place],
      facilities: [mainArena, tempArena],
      facilityUsageRights: [
        createFacilityUsageRight({ id: 'usage:16-main', facilityId: mainArena.id, teamId: f.teamA.id, purpose: 'HOME_VENUE', validFrom: '2026-07-01' }),
        createFacilityUsageRight({ id: 'usage:16-temp', facilityId: tempArena.id, teamId: f.teamA.id, purpose: 'TEMPORARY_HOME', validFrom: '2028-01-01', validTo: '2028-04-30' }),
      ],
    })
    const duringRelocation = homeFacilitiesForTeamAt(Object.values(world.facilityUsageRightsById), f.teamA.id, parseGameDate('2028-02-01'))
    expect(duringRelocation.map((r) => r.purpose).sort()).toEqual(['HOME_VENUE', 'TEMPORARY_HOME'].sort())
    const afterReturn = homeFacilitiesForTeamAt(Object.values(world.facilityUsageRightsById), f.teamA.id, parseGameDate('2028-06-01'))
    expect(afterReturn.map((r) => r.facilityId)).toEqual([mainArena.id])
  })

  it('17. invalid team reference is rejected', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:17', kind: 'CITY', name: 'City 17' })
    const arena = arenaAt('facility:17', place.id)
    expect(() => updateGameWorld(f.world, {
      places: [place],
      facilities: [arena],
      facilityUsageRights: [createFacilityUsageRight({ id: 'usage:17', facilityId: arena.id, teamId: 'team:does-not-exist', purpose: 'HOME_VENUE', validFrom: '2020-01-01' })],
    })).toThrow(GameWorldValidationError)
  })

  it('18. invalid organization reference is rejected', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:18', kind: 'CITY', name: 'City 18' })
    const arena = arenaAt('facility:18', place.id)
    expect(() => updateGameWorld(f.world, {
      places: [place],
      facilities: [arena],
      facilityOwnershipInterests: [createFacilityOwnershipInterest({ id: 'own:18', facilityId: arena.id, owner: { kind: 'ORGANIZATION', organizationId: 'organization:does-not-exist' as never }, ownershipPercentage: 50, validFrom: '2020-01-01' })],
    })).toThrow(GameWorldValidationError)
    expect(() => updateGameWorld(f.world, {
      places: [place],
      facilities: [arena],
      facilityControlRights: [createFacilityControlRight({ id: 'control:18', facilityId: arena.id, controller: { kind: 'ORGANIZATION', organizationId: 'organization:does-not-exist' as never }, validFrom: '2020-01-01' })],
    })).toThrow(GameWorldValidationError)
    expect(() => updateGameWorld(f.world, {
      places: [place],
      facilities: [arena],
      facilityOperatorAssignments: [createFacilityOperatorAssignment({ id: 'op:18', facilityId: arena.id, operatorOrganizationId: 'organization:does-not-exist' as never, validFrom: '2020-01-01' })],
    })).toThrow(GameWorldValidationError)
  })

  it('19. invalid facility reference is rejected', () => {
    const f = fixture()
    expect(() => updateGameWorld(f.world, {
      facilityOwnershipInterests: [createFacilityOwnershipInterest({ id: 'own:19', facilityId: 'facility:does-not-exist', owner: { kind: 'ORGANIZATION', organizationId: f.organizationA }, ownershipPercentage: 50, validFrom: '2020-01-01' })],
    })).toThrow(GameWorldValidationError)
    expect(() => updateGameWorld(f.world, {
      facilityControlRights: [createFacilityControlRight({ id: 'control:19', facilityId: 'facility:does-not-exist', controller: { kind: 'ORGANIZATION', organizationId: f.organizationA }, validFrom: '2020-01-01' })],
    })).toThrow(GameWorldValidationError)
    expect(() => updateGameWorld(f.world, {
      facilityOperatorAssignments: [createFacilityOperatorAssignment({ id: 'op:19', facilityId: 'facility:does-not-exist', operatorOrganizationId: f.organizationA, validFrom: '2020-01-01' })],
    })).toThrow(GameWorldValidationError)
  })

  it('20. invalid component scope is rejected (missing component)', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:20', kind: 'CITY', name: 'City 20' })
    const arena = arenaAt('facility:20', place.id)
    expect(() => updateGameWorld(f.world, {
      places: [place],
      facilities: [arena],
      facilityUsageRights: [createFacilityUsageRight({ id: 'usage:20', facilityId: arena.id, componentIds: ['component:does-not-exist'], teamId: f.teamA.id, purpose: 'TRAINING', validFrom: '2020-01-01' })],
    })).toThrow(GameWorldValidationError)
  })

  it('21. component belongs to a different facility is rejected', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:21', kind: 'CITY', name: 'City 21' })
    const arenaOne = arenaAt('facility:21-one', place.id)
    const arenaTwo = arenaAt('facility:21-two', place.id)
    const componentOfTwo = createFacilityComponent({ id: 'component:21', facilityId: arenaTwo.id, type: 'MAIN_COURT', status: 'ACTIVE' })
    expect(() => updateGameWorld(f.world, {
      places: [place],
      facilities: [arenaOne, arenaTwo],
      facilityComponents: [componentOfTwo],
      facilityUsageRights: [createFacilityUsageRight({ id: 'usage:21', facilityId: arenaOne.id, componentIds: [componentOfTwo.id], teamId: f.teamA.id, purpose: 'TRAINING', validFrom: '2020-01-01' })],
    })).toThrow(GameWorldValidationError)
  })

  it('22. temporal overlap conflict between two EXCLUSIVE rights over the same scope is rejected', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:22', kind: 'CITY', name: 'City 22' })
    const arena = arenaAt('facility:22', place.id)
    expect(() => updateGameWorld(f.world, {
      places: [place],
      facilities: [arena],
      facilityUsageRights: [
        createFacilityUsageRight({ id: 'usage:22a', facilityId: arena.id, teamId: f.teamA.id, purpose: 'TRAINING', exclusivity: 'EXCLUSIVE', validFrom: '2020-01-01', validTo: '2025-12-31' }),
        createFacilityUsageRight({ id: 'usage:22b', facilityId: arena.id, teamId: f.teamB.id, purpose: 'TRAINING', exclusivity: 'EXCLUSIVE', validFrom: '2024-01-01' }),
      ],
    })).toThrow(GameWorldValidationError)
    // No overlap: sequential exclusive periods are fine.
    const world = updateGameWorld(f.world, {
      places: [place],
      facilities: [arena],
      facilityUsageRights: [
        createFacilityUsageRight({ id: 'usage:22c', facilityId: arena.id, teamId: f.teamA.id, purpose: 'TRAINING', exclusivity: 'EXCLUSIVE', validFrom: '2020-01-01', validTo: '2023-12-31' }),
        createFacilityUsageRight({ id: 'usage:22d', facilityId: arena.id, teamId: f.teamB.id, purpose: 'TRAINING', exclusivity: 'EXCLUSIVE', validFrom: '2024-01-01' }),
      ],
    })
    expect(Object.keys(world.facilityUsageRightsById)).toHaveLength(2)
  })

  it('23. historical resolver correctness across ownership, control and operator changes', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:23', kind: 'CITY', name: 'City 23' })
    const arena = arenaAt('facility:23', place.id)
    const world = updateGameWorld(f.world, {
      places: [place],
      facilities: [arena],
      facilityOwnershipInterests: [
        createFacilityOwnershipInterest({ id: 'own:23-old', facilityId: arena.id, owner: { kind: 'ORGANIZATION', organizationId: f.organizationA }, ownershipPercentage: 100, validFrom: '2000-01-01', validTo: '2014-12-31' }),
        createFacilityOwnershipInterest({ id: 'own:23-new', facilityId: arena.id, owner: { kind: 'ORGANIZATION', organizationId: f.organizationB }, ownershipPercentage: 100, validFrom: '2015-01-01' }),
      ],
    })
    expect(ownersOfFacilityAt(Object.values(world.facilityOwnershipInterestsById), arena.id, parseGameDate('2005-01-01')).map((o) => o.owner)).toEqual([{ kind: 'ORGANIZATION', organizationId: f.organizationA }])
    expect(ownersOfFacilityAt(Object.values(world.facilityOwnershipInterestsById), arena.id, parseGameDate('2020-01-01')).map((o) => o.owner)).toEqual([{ kind: 'ORGANIZATION', organizationId: f.organizationB }])
  })

  it('24. deterministic ordering across differently-ordered input and repeated calls', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:24', kind: 'CITY', name: 'City 24' })
    const arena = arenaAt('facility:24', place.id)
    const ownershipA = createFacilityOwnershipInterest({ id: 'own:24-a', facilityId: arena.id, owner: { kind: 'ORGANIZATION', organizationId: f.organizationA }, ownershipPercentage: 55, validFrom: '2020-01-01' })
    const ownershipB = createFacilityOwnershipInterest({ id: 'own:24-b', facilityId: arena.id, owner: { kind: 'ORGANIZATION', organizationId: f.organizationB }, ownershipPercentage: 45, validFrom: '2020-01-01' })
    const worldA = updateGameWorld(f.world, { places: [place], facilities: [arena], facilityOwnershipInterests: [ownershipA, ownershipB] })
    const worldB = updateGameWorld(f.world, { places: [place], facilities: [arena], facilityOwnershipInterests: [ownershipB, ownershipA] })
    const onDate = parseGameDate('2030-01-01')
    const resultA = ownersOfFacilityAt(Object.values(worldA.facilityOwnershipInterestsById), arena.id, onDate).map((o) => o.id)
    const resultB = ownersOfFacilityAt(Object.values(worldB.facilityOwnershipInterestsById), arena.id, onDate).map((o) => o.id)
    expect(resultA).toEqual(resultB)
    expect(resultA).toEqual([...resultA].sort())
    expect(ownersOfFacilityAt(Object.values(worldA.facilityOwnershipInterestsById), arena.id, onDate).map((o) => o.id)).toEqual(resultA)
  })

  it('25. exact duplicate right detection', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:25', kind: 'CITY', name: 'City 25' })
    const arena = arenaAt('facility:25', place.id)
    expect(() => updateGameWorld(f.world, {
      places: [place],
      facilities: [arena],
      facilityUsageRights: [
        createFacilityUsageRight({ id: 'usage:25a', facilityId: arena.id, teamId: f.teamA.id, purpose: 'TRAINING', validFrom: '2020-01-01' }),
        createFacilityUsageRight({ id: 'usage:25b', facilityId: arena.id, teamId: f.teamA.id, purpose: 'TRAINING', validFrom: '2020-01-01' }),
      ],
    })).toThrow(GameWorldValidationError)
  })

  it('26. facility used by multiple organizations', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:26', kind: 'CAMPUS', name: 'Campus 26' })
    const facility = createFacility({ id: 'facility:26', placeId: place.id, type: 'MULTI_SPORT_COMPLEX', purposes: ['ADMINISTRATION'], status: 'ACTIVE', canonicalName: 'Shared Complex 26' })
    const world = updateGameWorld(f.world, {
      places: [place],
      facilities: [facility],
      facilityUsageRights: [
        createFacilityUsageRight({ id: 'usage:26a', facilityId: facility.id, organizationId: f.organizationA, purpose: 'ADMINISTRATION', exclusivity: 'NON_EXCLUSIVE', validFrom: '2020-01-01' }),
        createFacilityUsageRight({ id: 'usage:26b', facilityId: facility.id, organizationId: f.organizationB, purpose: 'ADMINISTRATION', exclusivity: 'NON_EXCLUSIVE', validFrom: '2020-01-01' }),
      ],
    })
    expect([...organizationsUsingFacilityAt(Object.values(world.facilityUsageRightsById), facility.id, parseGameDate('2030-01-01'))].sort()).toEqual([f.organizationA, f.organizationB].sort())
  })

  it('27. open-ended interval resolves for any future date', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:27', kind: 'CITY', name: 'City 27' })
    const arena = arenaAt('facility:27', place.id)
    const world = updateGameWorld(f.world, {
      places: [place],
      facilities: [arena],
      facilityOwnershipInterests: [createFacilityOwnershipInterest({ id: 'own:27', facilityId: arena.id, owner: { kind: 'ORGANIZATION', organizationId: f.organizationA }, ownershipPercentage: 100, validFrom: '2020-01-01' })],
    })
    expect(ownersOfFacilityAt(Object.values(world.facilityOwnershipInterestsById), arena.id, parseGameDate('2099-01-01'))).toHaveLength(1)
  })

  it('28. right expires correctly', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:28', kind: 'CITY', name: 'City 28' })
    const arena = arenaAt('facility:28', place.id)
    const world = updateGameWorld(f.world, {
      places: [place],
      facilities: [arena],
      facilityUsageRights: [createFacilityUsageRight({ id: 'usage:28', facilityId: arena.id, teamId: f.teamA.id, purpose: 'TRAINING', validFrom: '2020-01-01', validTo: '2024-12-31' })],
    })
    expect(usageRightsForTeamAt(Object.values(world.facilityUsageRightsById), f.teamA.id, parseGameDate('2023-01-01'))).toHaveLength(1)
    expect(usageRightsForTeamAt(Object.values(world.facilityUsageRightsById), f.teamA.id, parseGameDate('2026-01-01'))).toHaveLength(0)
  })

  it('29. operator changes historically', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:29', kind: 'CITY', name: 'City 29' })
    const arena = arenaAt('facility:29', place.id)
    const world = updateGameWorld(f.world, {
      places: [place],
      facilities: [arena],
      facilityOperatorAssignments: [
        createFacilityOperatorAssignment({ id: 'op:29-old', facilityId: arena.id, operatorOrganizationId: f.organizationA, validFrom: '2000-01-01', validTo: '2014-12-31' }),
        createFacilityOperatorAssignment({ id: 'op:29-new', facilityId: arena.id, operatorOrganizationId: f.organizationB, validFrom: '2015-01-01' }),
      ],
    })
    expect(operatorsOfFacilityAt(Object.values(world.facilityOperatorAssignmentsById), arena.id, parseGameDate('2005-01-01')).map((o) => o.operatorOrganizationId)).toEqual([f.organizationA])
    expect(operatorsOfFacilityAt(Object.values(world.facilityOperatorAssignmentsById), arena.id, parseGameDate('2020-01-01')).map((o) => o.operatorOrganizationId)).toEqual([f.organizationB])
    expect(facilitiesOperatedByOrganizationAt(Object.values(world.facilityOperatorAssignmentsById), f.organizationA, parseGameDate('2005-01-01'))).toEqual([arena.id])
    expect(facilitiesOperatedByOrganizationAt(Object.values(world.facilityOperatorAssignmentsById), f.organizationA, parseGameDate('2020-01-01'))).toEqual([])
  })

  it('30. controller changes historically', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:30', kind: 'CITY', name: 'City 30' })
    const arena = arenaAt('facility:30', place.id)
    const world = updateGameWorld(f.world, {
      places: [place],
      facilities: [arena],
      facilityControlRights: [
        createFacilityControlRight({ id: 'control:30-old', facilityId: arena.id, controller: { kind: 'ORGANIZATION', organizationId: f.organizationA }, validFrom: '2000-01-01', validTo: '2014-12-31' }),
        createFacilityControlRight({ id: 'control:30-new', facilityId: arena.id, controller: { kind: 'ORGANIZATION', organizationId: f.organizationB }, validFrom: '2015-01-01' }),
      ],
    })
    expect(controllersOfFacilityAt(Object.values(world.facilityControlRightsById), arena.id, parseGameDate('2005-01-01')).map((c) => c.controller)).toEqual([{ kind: 'ORGANIZATION', organizationId: f.organizationA }])
    expect(controllersOfFacilityAt(Object.values(world.facilityControlRightsById), arena.id, parseGameDate('2020-01-01')).map((c) => c.controller)).toEqual([{ kind: 'ORGANIZATION', organizationId: f.organizationB }])
  })

  it('duplicate active operator assignments for the same facility are rejected', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:31', kind: 'CITY', name: 'City 31' })
    const arena = arenaAt('facility:31', place.id)
    expect(() => updateGameWorld(f.world, {
      places: [place],
      facilities: [arena],
      facilityOperatorAssignments: [
        createFacilityOperatorAssignment({ id: 'op:31a', facilityId: arena.id, operatorOrganizationId: f.organizationA, validFrom: '2020-01-01' }),
        createFacilityOperatorAssignment({ id: 'op:31b', facilityId: arena.id, operatorOrganizationId: f.organizationB, validFrom: '2021-01-01' }),
      ],
    })).toThrow(GameWorldValidationError)
  })

  it('facilitiesOwnedByOrganizationAt aggregates across multiple facilities deterministically', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:32', kind: 'CITY', name: 'City 32' })
    const arenaOne = arenaAt('facility:32-one', place.id)
    const arenaTwo = arenaAt('facility:32-two', place.id)
    const world = updateGameWorld(f.world, {
      places: [place],
      facilities: [arenaOne, arenaTwo],
      facilityOwnershipInterests: [
        createFacilityOwnershipInterest({ id: 'own:32-one', facilityId: arenaOne.id, owner: { kind: 'ORGANIZATION', organizationId: f.organizationA }, ownershipPercentage: 100, validFrom: '2020-01-01' }),
        createFacilityOwnershipInterest({ id: 'own:32-two', facilityId: arenaTwo.id, owner: { kind: 'ORGANIZATION', organizationId: f.organizationA }, ownershipPercentage: 50, validFrom: '2020-01-01' }),
      ],
    })
    expect([...facilitiesOwnedByOrganizationAt(Object.values(world.facilityOwnershipInterestsById), f.organizationA, parseGameDate('2030-01-01'))].sort()).toEqual([arenaOne.id, arenaTwo.id].sort())
  })

  it('rejects an unrecognized usage-right purpose at the factory boundary', () => {
    expect(() => createFacilityUsageRight({ id: 'usage:invalid-purpose', facilityId: 'facility:x', teamId: 'team:x', purpose: 'NOT_A_REAL_PURPOSE' as never, validFrom: '2020-01-01' })).toThrow(TypeError)
  })

  it('rejects an empty component scope at the factory boundary', () => {
    expect(() => createFacilityUsageRight({ id: 'usage:empty-scope', facilityId: 'facility:x', componentIds: [], teamId: 'team:x', purpose: 'TRAINING', validFrom: '2020-01-01' })).toThrow(RangeError)
  })

  it('rejects invalid control/operator temporal ranges at the factory boundary', () => {
    expect(() => createFacilityControlRight({ id: 'control:invalid', facilityId: 'facility:x', controller: { kind: 'PERSON', personId: personIdFromString('person:x') }, validFrom: '2025-01-01', validTo: '2024-01-01' })).toThrow(RangeError)
    expect(() => createFacilityOperatorAssignment({ id: 'op:invalid', facilityId: 'facility:x', operatorOrganizationId: 'organization:x' as never, validFrom: '2025-01-01', validTo: '2024-01-01' })).toThrow(RangeError)
  })
})

function usageRightsForFacilityAtExists(world: ReturnType<typeof createNewGame>, facilityId: string, rightId: string): boolean {
  return Object.values(world.facilityUsageRightsById).some((right) => right.facilityId === facilityId && right.id === rightId)
}
