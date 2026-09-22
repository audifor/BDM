import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { parseGameDate } from '@/domain/date'
import { updateGameWorld, GameWorldValidationError } from '@/domain/world'
import { personIdFromString } from '@/domain/ids'
import {
  createFacility,
  createFacilityComponent,
  createFacilityCompetitionApproval,
  createFacilityNameRecord,
  createFacilityOrganizationRelationship,
  createFacilityOwnershipInterest,
  createFacilityStatusRecord,
  createFacilityTeamRelationship,
  createFacilityUsageRight,
  createPlace,
  activeFacilityComponentsAt,
  facilitiesUsedByTeamAt,
  facilityNameAt,
  facilityStatusAt,
  ownershipShareOfAt,
  ownersOfFacilityAt,
  usersOfFacilityAt,
} from './index'

/** Test convenience: CFI2 moved OWNER out of FacilityOrganizationRelationship into FacilityOwnershipInterest. */
function ownerInterest(id: string, facilityId: string, organizationId: string, validFrom: string) {
  return createFacilityOwnershipInterest({ id, facilityId, owner: { kind: 'ORGANIZATION', organizationId: organizationId as never }, ownershipPercentage: 100, validFrom })
}

function fixture() {
  const world = createNewGame()
  const teams = Object.values(world.teams)
  const teamA = teams[0]!
  const teamB = teams.find((team) => team.id !== teamA.id)!
  const organizationA = teamA.organizationId
  const organizationB = teamB.organizationId
  return { world, teamA, teamB, organizationA, organizationB }
}

describe('Facilities & Infrastructure V2 domain foundation (CFI1)', () => {
  it('1. models a club that owns and uses its own arena', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:city-a', kind: 'CITY', name: 'City A' })
    const arena = createFacility({ id: 'facility:club-arena', placeId: place.id, type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'ACTIVE', canonicalName: 'Club Arena', physical: { openedOn: '2000-01-01', totalCapacity: 12000 } })
    const world = updateGameWorld(f.world, {
      places: [place],
      facilities: [arena],
      facilityOwnershipInterests: [ownerInterest('own:club', arena.id, f.organizationA, '2000-01-01')],
      facilityTeamRelationships: [createFacilityTeamRelationship({ id: 'rel:home', facilityId: arena.id, teamId: f.teamA.id, kind: 'HOME_VENUE', validFrom: '2000-01-01' })],
    })
    const onDate = parseGameDate('2030-01-01')
    expect(usersOfFacilityAt(Object.values(world.facilityTeamRelationshipsById), arena.id, onDate).map((r) => r.teamId)).toEqual([f.teamA.id])
    expect(facilitiesUsedByTeamAt(Object.values(world.facilityTeamRelationshipsById), f.teamA.id, onDate).map((r) => r.facilityId)).toEqual([arena.id])
  })

  it('2. models a club that rents a municipal arena it does not own', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:city-b', kind: 'CITY', name: 'City B' })
    const municipalArena = createFacility({ id: 'facility:municipal-arena', placeId: place.id, type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'ACTIVE', canonicalName: 'Municipal Arena' })
    const municipalOrg = Object.values(f.world.organizationsById).find((organization) => organization.id !== f.organizationA)!
    const world = updateGameWorld(f.world, {
      places: [place],
      facilities: [municipalArena],
      facilityOwnershipInterests: [ownerInterest('own:municipality', municipalArena.id, municipalOrg.id, '2010-01-01')],
      facilityTeamRelationships: [createFacilityTeamRelationship({ id: 'rel:lease', facilityId: municipalArena.id, teamId: f.teamA.id, kind: 'HOME_VENUE', validFrom: '2010-01-01' })],
      facilityUsageRights: [createFacilityUsageRight({ id: 'usage:lease', facilityId: municipalArena.id, teamId: f.teamA.id, purpose: 'HOME_VENUE', validFrom: '2010-01-01', exclusivity: 'NON_EXCLUSIVE' })],
    })
    // The municipality owns; the club has NO ownership interest recorded — usage does not imply ownership.
    const onDate = parseGameDate('2030-01-01')
    expect(ownersOfFacilityAt(Object.values(world.facilityOwnershipInterestsById), municipalArena.id, onDate).map((o) => o.owner)).toEqual([{ kind: 'ORGANIZATION', organizationId: municipalOrg.id }])
    expect(ownershipShareOfAt(Object.values(world.facilityOwnershipInterestsById), municipalArena.id, f.organizationA, onDate)).toBeUndefined()
    expect(usersOfFacilityAt(Object.values(world.facilityTeamRelationshipsById), municipalArena.id, onDate).map((r) => r.teamId)).toEqual([f.teamA.id])
  })

  it('3. models two teams sharing one arena', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:city-c', kind: 'CITY', name: 'City C' })
    const sharedArena = createFacility({ id: 'facility:shared-arena', placeId: place.id, type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'ACTIVE', canonicalName: 'Shared Arena' })
    const world = updateGameWorld(f.world, {
      places: [place],
      facilities: [sharedArena],
      facilityTeamRelationships: [
        createFacilityTeamRelationship({ id: 'rel:home-a', facilityId: sharedArena.id, teamId: f.teamA.id, kind: 'HOME_VENUE', validFrom: '2015-01-01' }),
        createFacilityTeamRelationship({ id: 'rel:home-b', facilityId: sharedArena.id, teamId: f.teamB.id, kind: 'HOME_VENUE', validFrom: '2015-01-01' }),
      ],
    })
    const users = usersOfFacilityAt(Object.values(world.facilityTeamRelationshipsById), sharedArena.id, parseGameDate('2030-01-01'))
    expect(users.map((r) => r.teamId).sort()).toEqual([f.teamA.id, f.teamB.id].sort())
  })

  it('4. models an Organization owning a facility used by several Teams (multi-team org)', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:campus', kind: 'CAMPUS', name: 'Campus' })
    const trainingCenter = createFacility({ id: 'facility:training', placeId: place.id, type: 'TRAINING_CENTER', purposes: ['TRAINING'], status: 'ACTIVE', canonicalName: 'Training Center' })
    const world = updateGameWorld(f.world, {
      places: [place],
      facilities: [trainingCenter],
      facilityOwnershipInterests: [ownerInterest('own:multi-team-org', trainingCenter.id, f.organizationA, '2018-01-01')],
      facilityTeamRelationships: [
        createFacilityTeamRelationship({ id: 'rel:train-a', facilityId: trainingCenter.id, teamId: f.teamA.id, kind: 'TRAINING', validFrom: '2018-01-01' }),
        createFacilityTeamRelationship({ id: 'rel:train-b', facilityId: trainingCenter.id, teamId: f.teamB.id, kind: 'TRAINING', validFrom: '2018-01-01' }),
      ],
    })
    expect(usersOfFacilityAt(Object.values(world.facilityTeamRelationshipsById), trainingCenter.id, parseGameDate('2030-01-01'))).toHaveLength(2)
  })

  it('5. models a Team temporarily relocating to a different venue', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:city-d', kind: 'CITY', name: 'City D' })
    const mainArena = createFacility({ id: 'facility:main-arena', placeId: place.id, type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'UNDER_RENOVATION', canonicalName: 'Main Arena' })
    const tempArena = createFacility({ id: 'facility:temp-arena', placeId: place.id, type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'ACTIVE', canonicalName: 'Temporary Arena' })
    const world = updateGameWorld(f.world, {
      places: [place],
      facilities: [mainArena, tempArena],
      facilityTeamRelationships: [
        createFacilityTeamRelationship({ id: 'rel:home-main', facilityId: mainArena.id, teamId: f.teamA.id, kind: 'HOME_VENUE', validFrom: '2020-01-01', validTo: '2023-12-31' }),
        createFacilityTeamRelationship({ id: 'rel:home-temp', facilityId: tempArena.id, teamId: f.teamA.id, kind: 'TEMPORARY_HOME', validFrom: '2024-01-01', validTo: '2024-12-31' }),
        createFacilityTeamRelationship({ id: 'rel:home-main-2', facilityId: mainArena.id, teamId: f.teamA.id, kind: 'HOME_VENUE', validFrom: '2025-01-01' }),
      ],
    })
    expect(facilitiesUsedByTeamAt(Object.values(world.facilityTeamRelationshipsById), f.teamA.id, parseGameDate('2022-06-01')).map((r) => r.facilityId)).toEqual([mainArena.id])
    expect(facilitiesUsedByTeamAt(Object.values(world.facilityTeamRelationshipsById), f.teamA.id, parseGameDate('2024-06-01')).map((r) => r.facilityId)).toEqual([tempArena.id])
    expect(facilitiesUsedByTeamAt(Object.values(world.facilityTeamRelationshipsById), f.teamA.id, parseGameDate('2026-06-01')).map((r) => r.facilityId)).toEqual([mainArena.id])
  })

  it('6. models an NCAA-like university facility shared by different programs/teams', () => {
    const f = fixture()
    const university = createPlace({ id: 'place:university', kind: 'CAMPUS', name: 'University Campus' })
    const fieldhouse = createFacility({ id: 'facility:fieldhouse', placeId: university.id, type: 'MULTI_SPORT_COMPLEX', purposes: ['MATCH_HOSTING', 'TRAINING'], status: 'ACTIVE', canonicalName: 'University Fieldhouse' })
    const world = updateGameWorld(f.world, {
      places: [university],
      facilities: [fieldhouse],
      facilityOwnershipInterests: [ownerInterest('own:university', fieldhouse.id, f.organizationA, '1990-01-01')],
      facilityTeamRelationships: [
        createFacilityTeamRelationship({ id: 'rel:men', facilityId: fieldhouse.id, teamId: f.teamA.id, kind: 'HOME_VENUE', validFrom: '1990-01-01' }),
        createFacilityTeamRelationship({ id: 'rel:women', facilityId: fieldhouse.id, teamId: f.teamB.id, kind: 'HOME_VENUE', validFrom: '1990-01-01' }),
      ],
    })
    expect(usersOfFacilityAt(Object.values(world.facilityTeamRelationshipsById), fieldhouse.id, parseGameDate('2030-01-01'))).toHaveLength(2)
  })

  it('7. facility changes commercial name without changing identity', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:city-e', kind: 'CITY', name: 'City E' })
    const arena = createFacility({ id: 'facility:naming-arena', placeId: place.id, type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'ACTIVE', canonicalName: 'City Arena' })
    const world = updateGameWorld(f.world, {
      places: [place],
      facilities: [arena],
      facilityNameRecords: [
        createFacilityNameRecord({ id: 'name:canonical', facilityId: arena.id, name: 'City Arena', isCanonical: true, validFrom: '2000-01-01' }),
        createFacilityNameRecord({ id: 'name:sponsor-1', facilityId: arena.id, name: 'FirstBank Arena', isCanonical: false, validFrom: '2000-01-01', validTo: '2019-12-31' }),
        createFacilityNameRecord({ id: 'name:sponsor-2', facilityId: arena.id, name: 'MegaCorp Arena', isCanonical: false, validFrom: '2020-01-01' }),
      ],
    })
    expect(Object.keys(world.facilitiesById)).toContain(arena.id)
    expect(facilityNameAt(Object.values(world.facilityNameRecordsById), arena.id, parseGameDate('2010-01-01'), arena.canonicalName)).toBe('FirstBank Arena')
    expect(facilityNameAt(Object.values(world.facilityNameRecordsById), arena.id, parseGameDate('2025-01-01'), arena.canonicalName)).toBe('MegaCorp Arena')
    // Identity (Facility ID) never changed across the naming-rights transition.
    expect(world.facilitiesById[arena.id]!.id).toBe(arena.id)
  })

  it('8. facility is partially closed while some components remain active', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:city-f', kind: 'CITY', name: 'City F' })
    const arena = createFacility({ id: 'facility:partial-arena', placeId: place.id, type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'PARTIALLY_CLOSED', canonicalName: 'Partial Arena' })
    const world = updateGameWorld(f.world, {
      places: [place],
      facilities: [arena],
      facilityComponents: [
        createFacilityComponent({ id: 'component:main-court', facilityId: arena.id, type: 'MAIN_COURT', status: 'ACTIVE' }),
        createFacilityComponent({ id: 'component:vip', facilityId: arena.id, type: 'VIP_BOX', status: 'CLOSED', closedAt: '2024-01-01' }),
      ],
    })
    const active = activeFacilityComponentsAt(Object.values(world.facilityComponentsById), arena.id, parseGameDate('2030-01-01'))
    expect(active.map((c) => c.id)).toEqual(['component:main-court'])
  })

  it('9. facility has multiple owners at 60/40', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:city-g', kind: 'CITY', name: 'City G' })
    const arena = createFacility({ id: 'facility:split-arena', placeId: place.id, type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'ACTIVE', canonicalName: 'Split Arena' })
    const world = updateGameWorld(f.world, {
      places: [place],
      facilities: [arena],
      facilityOwnershipInterests: [
        createFacilityOwnershipInterest({ id: 'own:a', facilityId: arena.id, owner: { kind: 'ORGANIZATION', organizationId: f.organizationA }, ownershipPercentage: 60, validFrom: '2020-01-01' }),
        createFacilityOwnershipInterest({ id: 'own:b', facilityId: arena.id, owner: { kind: 'ORGANIZATION', organizationId: f.organizationB }, ownershipPercentage: 40, validFrom: '2020-01-01' }),
      ],
    })
    const owners = ownersOfFacilityAt(Object.values(world.facilityOwnershipInterestsById), arena.id, parseGameDate('2030-01-01'))
    expect(owners.reduce((sum, o) => sum + (o.ownershipPercentage ?? 0), 0)).toBe(100)
  })

  it('10. facility ownership with unknown percentage is representable and does not falsify precision', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:city-h', kind: 'CITY', name: 'City H' })
    const arena = createFacility({ id: 'facility:unknown-arena', placeId: place.id, type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'ACTIVE', canonicalName: 'Unknown Ownership Arena' })
    const world = updateGameWorld(f.world, {
      places: [place],
      facilities: [arena],
      facilityOwnershipInterests: [createFacilityOwnershipInterest({ id: 'own:unknown', facilityId: arena.id, owner: { kind: 'ORGANIZATION', organizationId: f.organizationA }, ownershipPercentage: null, validFrom: '2020-01-01' })],
    })
    const owners = ownersOfFacilityAt(Object.values(world.facilityOwnershipInterestsById), arena.id, parseGameDate('2030-01-01'))
    expect(owners[0]!.ownershipPercentage).toBeNull()
  })

  it('11. distinct components inside one training center have independent identity', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:campus-2', kind: 'CAMPUS', name: 'Campus 2' })
    const trainingCenter = createFacility({ id: 'facility:multi-component-training', placeId: place.id, type: 'TRAINING_CENTER', purposes: ['TRAINING', 'MEDICAL_TREATMENT'], status: 'ACTIVE', canonicalName: 'Multi Component Training Center' })
    const world = updateGameWorld(f.world, {
      places: [place],
      facilities: [trainingCenter],
      facilityComponents: [
        createFacilityComponent({ id: 'component:practice-court', facilityId: trainingCenter.id, type: 'PRACTICE_COURT', status: 'ACTIVE', quantity: 2 }),
        createFacilityComponent({ id: 'component:weight-room', facilityId: trainingCenter.id, type: 'WEIGHT_ROOM', status: 'ACTIVE' }),
        createFacilityComponent({ id: 'component:medical-room', facilityId: trainingCenter.id, type: 'MEDICAL_ROOM', status: 'ACTIVE' }),
      ],
    })
    const active = activeFacilityComponentsAt(Object.values(world.facilityComponentsById), trainingCenter.id, parseGameDate('2030-01-01'))
    expect(active.map((c) => c.type).sort()).toEqual(['MEDICAL_ROOM', 'PRACTICE_COURT', 'WEIGHT_ROOM'].sort())
  })

  it('12. invalid temporal ranges are blocked at the factory boundary', () => {
    expect(() => createFacilityTeamRelationship({ id: 'rel:invalid', facilityId: 'facility:x', teamId: 'team:x', kind: 'TRAINING', validFrom: '2025-01-01', validTo: '2024-01-01' })).toThrow(RangeError)
    expect(() => createFacilityOwnershipInterest({ id: 'own:invalid', facilityId: 'facility:x', owner: { kind: 'PERSON', personId: personIdFromString('person:x') }, ownershipPercentage: 50, validFrom: '2025-01-01', validTo: '2024-01-01' })).toThrow(RangeError)
    expect(() => createFacility({ id: 'facility:invalid-lifecycle', placeId: 'place:x', type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'ACTIVE', canonicalName: 'Bad', physical: { openedOn: '2025-01-01' }, closedOn: '2024-01-01' })).toThrow(RangeError)
    expect(() => createFacilityOwnershipInterest({ id: 'own:over', facilityId: 'facility:x', owner: { kind: 'PERSON', personId: personIdFromString('person:x') }, ownershipPercentage: 150 })).toThrow(RangeError)
  })

  it('13. invalid foreign references are detected by GameWorld validation', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:city-i', kind: 'CITY', name: 'City I' })
    expect(() => updateGameWorld(f.world, {
      places: [place],
      facilities: [createFacility({ id: 'facility:orphan', placeId: 'place:does-not-exist', type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'ACTIVE', canonicalName: 'Orphan Arena' })],
    })).toThrow(GameWorldValidationError)

    expect(() => updateGameWorld(f.world, {
      places: [place],
      facilities: [createFacility({ id: 'facility:ok', placeId: place.id, type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'ACTIVE', canonicalName: 'OK Arena' })],
      facilityTeamRelationships: [createFacilityTeamRelationship({ id: 'rel:missing-team', facilityId: 'facility:ok', teamId: 'team:does-not-exist', kind: 'HOME_VENUE', validFrom: '2020-01-01' })],
    })).toThrow(GameWorldValidationError)

    expect(() => updateGameWorld(f.world, {
      places: [place],
      facilities: [createFacility({ id: 'facility:ok-2', placeId: place.id, type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'ACTIVE', canonicalName: 'OK Arena 2' })],
      facilityOrganizationRelationships: [createFacilityOrganizationRelationship({ id: 'rel:missing-org', facilityId: 'facility:ok-2', organizationId: 'organization:does-not-exist', kind: 'TENANT', validFrom: '2020-01-01' })],
    })).toThrow(GameWorldValidationError)

    expect(() => updateGameWorld(f.world, {
      places: [place],
      facilities: [createFacility({ id: 'facility:ok-3', placeId: place.id, type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'ACTIVE', canonicalName: 'OK Arena 3' })],
      facilityComponents: [createFacilityComponent({ id: 'component:orphan', facilityId: 'facility:does-not-exist', type: 'MAIN_COURT', status: 'ACTIVE' })],
    })).toThrow(GameWorldValidationError)
  })

  it('12b. ownership exceeding 100% when fully known is rejected', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:city-j', kind: 'CITY', name: 'City J' })
    const arena = createFacility({ id: 'facility:over-owned', placeId: place.id, type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'ACTIVE', canonicalName: 'Over-owned Arena' })
    expect(() => updateGameWorld(f.world, {
      places: [place],
      facilities: [arena],
      facilityOwnershipInterests: [
        createFacilityOwnershipInterest({ id: 'own:over-a', facilityId: arena.id, owner: { kind: 'ORGANIZATION', organizationId: f.organizationA }, ownershipPercentage: 70, validFrom: '2020-01-01' }),
        createFacilityOwnershipInterest({ id: 'own:over-b', facilityId: arena.id, owner: { kind: 'ORGANIZATION', organizationId: f.organizationB }, ownershipPercentage: 60, validFrom: '2020-01-01' }),
      ],
    })).toThrow(GameWorldValidationError)
  })

  it('12c. duplicate active relationships of the same kind are rejected', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:city-k', kind: 'CITY', name: 'City K' })
    const arena = createFacility({ id: 'facility:dup-arena', placeId: place.id, type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'ACTIVE', canonicalName: 'Dup Arena' })
    expect(() => updateGameWorld(f.world, {
      places: [place],
      facilities: [arena],
      facilityTeamRelationships: [
        createFacilityTeamRelationship({ id: 'rel:dup-1', facilityId: arena.id, teamId: f.teamA.id, kind: 'HOME_VENUE', validFrom: '2020-01-01' }),
        createFacilityTeamRelationship({ id: 'rel:dup-2', facilityId: arena.id, teamId: f.teamA.id, kind: 'HOME_VENUE', validFrom: '2021-01-01' }),
      ],
    })).toThrow(GameWorldValidationError)
  })

  it('14. temporal queries are deterministic across repeated calls and independent of input order', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:city-l', kind: 'CITY', name: 'City L' })
    const arena = createFacility({ id: 'facility:deterministic-arena', placeId: place.id, type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'ACTIVE', canonicalName: 'Deterministic Arena' })
    const ownershipA = createFacilityOwnershipInterest({ id: 'own:det-a', facilityId: arena.id, owner: { kind: 'ORGANIZATION', organizationId: f.organizationA }, ownershipPercentage: 55, validFrom: '2020-01-01' })
    const ownershipB = createFacilityOwnershipInterest({ id: 'own:det-b', facilityId: arena.id, owner: { kind: 'ORGANIZATION', organizationId: f.organizationB }, ownershipPercentage: 45, validFrom: '2020-01-01' })
    const worldA = updateGameWorld(f.world, { places: [place], facilities: [arena], facilityOwnershipInterests: [ownershipA, ownershipB] })
    const worldB = updateGameWorld(f.world, { places: [place], facilities: [arena], facilityOwnershipInterests: [ownershipB, ownershipA] })
    const onDate = parseGameDate('2030-01-01')
    const resultA = ownersOfFacilityAt(Object.values(worldA.facilityOwnershipInterestsById), arena.id, onDate).map((o) => o.id)
    const resultB = ownersOfFacilityAt(Object.values(worldB.facilityOwnershipInterestsById), arena.id, onDate).map((o) => o.id)
    expect(resultA).toEqual(resultB)
    expect(resultA).toEqual([...resultA].sort())
    // Calling again returns the identical result (pure/deterministic, no hidden state).
    expect(ownersOfFacilityAt(Object.values(worldA.facilityOwnershipInterestsById), arena.id, onDate).map((o) => o.id)).toEqual(resultA)
  })

  it('facility status resolves deterministically at a past date via status history', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:city-m', kind: 'CITY', name: 'City M' })
    const arena = createFacility({ id: 'facility:status-arena', placeId: place.id, type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'ACTIVE', canonicalName: 'Status Arena' })
    const world = updateGameWorld(f.world, {
      places: [place],
      facilities: [arena],
      facilityStatusRecords: [
        createFacilityStatusRecord({ id: 'status:planned', facilityId: arena.id, status: 'PLANNED', effectiveFrom: '2018-01-01' }),
        createFacilityStatusRecord({ id: 'status:construction', facilityId: arena.id, status: 'UNDER_CONSTRUCTION', effectiveFrom: '2019-01-01' }),
        createFacilityStatusRecord({ id: 'status:active', facilityId: arena.id, status: 'ACTIVE', effectiveFrom: '2020-01-01' }),
      ],
    })
    expect(facilityStatusAt(Object.values(world.facilityStatusRecordsById), world.facilitiesById[arena.id]!, parseGameDate('2018-06-01'))).toBe('PLANNED')
    expect(facilityStatusAt(Object.values(world.facilityStatusRecordsById), world.facilitiesById[arena.id]!, parseGameDate('2019-06-01'))).toBe('UNDER_CONSTRUCTION')
    expect(facilityStatusAt(Object.values(world.facilityStatusRecordsById), world.facilitiesById[arena.id]!, parseGameDate('2025-06-01'))).toBe('ACTIVE')
  })

  it('facility competition approval hook references a real Competition', () => {
    const f = fixture()
    const place = createPlace({ id: 'place:city-n', kind: 'CITY', name: 'City N' })
    const arena = createFacility({ id: 'facility:approval-arena', placeId: place.id, type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'ACTIVE', canonicalName: 'Approval Arena' })
    const competitionId = Object.values(f.world.competitions)[0]!.id
    const world = updateGameWorld(f.world, {
      places: [place],
      facilities: [arena],
      facilityCompetitionApprovals: [createFacilityCompetitionApproval({ id: 'approval:main', facilityId: arena.id, competitionId, approved: true, validFrom: '2020-01-01' })],
    })
    expect(Object.values(world.facilityCompetitionApprovalsById)).toHaveLength(1)
    expect(() => updateGameWorld(f.world, {
      places: [place],
      facilities: [arena],
      facilityCompetitionApprovals: [createFacilityCompetitionApproval({ id: 'approval:bad', facilityId: arena.id, competitionId: 'competition:does-not-exist', approved: true })],
    })).toThrow(GameWorldValidationError)
  })
})
