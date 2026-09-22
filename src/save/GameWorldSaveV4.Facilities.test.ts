import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { parseGameDate } from '@/domain/date'
import { updateGameWorld } from '@/domain/world'
import {
  createFacility,
  createFacilityComponent,
  createFacilityCompetitionApproval,
  createFacilityControlRight,
  createFacilityNameRecord,
  createFacilityOperatorAssignment,
  createFacilityOrganizationRelationship,
  createFacilityOwnershipInterest,
  createFacilityStatusRecord,
  createFacilityTeamRelationship,
  createFacilityUsageRight,
  createPlace,
  controllersOfFacilityAt,
  facilitiesOperatedByOrganizationAt,
  facilitiesOwnedByOrganizationAt,
  facilitiesUsedByOrganizationAt,
  facilitiesUsedByTeamAt,
  facilityComponentsUsableByTeamAt,
  facilityNameAt,
  facilityRightsConflictsAt,
  facilityStatusAt,
  homeFacilitiesForTeamAt,
  operatorsOfFacilityAt,
  organizationsRelatedToFacilityAt,
  organizationsUsingFacilityAt,
  ownershipShareOfAt,
  ownersOfFacilityAt,
  teamsUsingFacilityAt,
  trainingFacilitiesForTeamAt,
  usageRightsForFacilityAt,
  usageRightsForOrganizationAt,
  usageRightsForTeamAt,
} from '@/domain/facilities'
import { migrateGameWorldSaveV1ToV2 } from './GameWorldSaveV2'
import { migrateGameWorldSaveV2ToV3, serializeGameWorldV3 } from './GameWorldSaveV3'
import { deserializeGameWorldV4, migrateGameWorldSaveV3ToV4, serializeGameWorldV4 } from './GameWorldSaveV4'
import { serializeGameWorldV1 } from './GameWorldSaveV1'

const savedAt = '2033-01-01T00:00:00.000Z'

/** Builds a rich Facilities fixture covering every category CFI2S must round-trip. */
function richFacilitiesWorld() {
  const base = createNewGame()
  const teams = Object.values(base.teams)
  const teamA = teams[0]!
  const teamB = teams.find((team) => team.id !== teamA.id)!
  const organizationA = teamA.organizationId
  const organizationB = teamB.organizationId
  const municipalOrg = Object.values(base.organizationsById).find((org) => org.id !== organizationA && org.id !== organizationB)!.id

  const cityPlace = createPlace({ id: 'place:rt-city', kind: 'CITY', name: 'Round-trip City' })
  const campusPlace = createPlace({ id: 'place:rt-campus', kind: 'CAMPUS', name: 'Round-trip Campus', parentPlaceId: cityPlace.id })

  const ownedArena = createFacility({
    id: 'facility:rt-owned-arena',
    placeId: cityPlace.id,
    type: 'ARENA',
    purposes: ['MATCH_HOSTING'],
    capabilities: ['HOSTS_COMPETITIVE_MATCHES'],
    status: 'ACTIVE',
    canonicalName: 'Round-trip Arena',
    physical: { openedOn: '1995-06-01', totalCapacity: 15000, seatedCapacity: 12000, standingCapacity: 3000, courtCount: 1, hasAccessibilityProvision: true },
  })
  const trainingCenter = createFacility({
    id: 'facility:rt-training',
    placeId: campusPlace.id,
    type: 'TRAINING_CENTER',
    purposes: ['TRAINING', 'MEDICAL_TREATMENT'],
    status: 'ACTIVE',
    canonicalName: 'Round-trip Training Center',
  })
  const tempArena = createFacility({ id: 'facility:rt-temp-arena', placeId: cityPlace.id, type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'ACTIVE', canonicalName: 'Temporary Arena' })

  const mainCourt = createFacilityComponent({ id: 'component:rt-main-court', facilityId: ownedArena.id, type: 'MAIN_COURT', status: 'ACTIVE' })
  const practiceCourtA = createFacilityComponent({ id: 'component:rt-practice-a', facilityId: trainingCenter.id, type: 'PRACTICE_COURT', status: 'ACTIVE', quantity: 1 })
  const practiceCourtB = createFacilityComponent({ id: 'component:rt-practice-b', facilityId: trainingCenter.id, type: 'PRACTICE_COURT', status: 'ACTIVE', quantity: 1 })
  const medicalRoom = createFacilityComponent({ id: 'component:rt-medical', facilityId: trainingCenter.id, type: 'MEDICAL_ROOM', status: 'ACTIVE' })
  const adminOffice = createFacilityComponent({ id: 'component:rt-admin-office', facilityId: trainingCenter.id, type: 'COACHES_OFFICE', status: 'ACTIVE' })

  const nameRecords = [
    createFacilityNameRecord({ id: 'name:rt-canonical', facilityId: ownedArena.id, name: 'Round-trip Arena', isCanonical: true, validFrom: '1995-06-01' }),
    createFacilityNameRecord({ id: 'name:rt-sponsor-old', facilityId: ownedArena.id, name: 'FirstBank Arena', isCanonical: false, validFrom: '1995-06-01', validTo: '2019-12-31' }),
    createFacilityNameRecord({ id: 'name:rt-sponsor-new', facilityId: ownedArena.id, name: 'MegaCorp Arena', isCanonical: false, validFrom: '2020-01-01' }),
  ]

  const statusRecords = [
    createFacilityStatusRecord({ id: 'status:rt-active-1', facilityId: ownedArena.id, status: 'ACTIVE', effectiveFrom: '1995-06-01' }),
    createFacilityStatusRecord({ id: 'status:rt-closed', facilityId: ownedArena.id, status: 'TEMPORARILY_CLOSED', effectiveFrom: '2024-01-01' }),
    createFacilityStatusRecord({ id: 'status:rt-active-2', facilityId: ownedArena.id, status: 'ACTIVE', effectiveFrom: '2024-06-01' }),
  ]

  const ownershipInterests = [
    createFacilityOwnershipInterest({ id: 'own:rt-60', facilityId: ownedArena.id, owner: { kind: 'ORGANIZATION', organizationId: organizationA }, ownershipPercentage: 60, validFrom: '2000-01-01' }),
    createFacilityOwnershipInterest({ id: 'own:rt-40', facilityId: ownedArena.id, owner: { kind: 'ORGANIZATION', organizationId: organizationB }, ownershipPercentage: 40, validFrom: '2000-01-01' }),
    createFacilityOwnershipInterest({ id: 'own:rt-unknown', facilityId: trainingCenter.id, owner: { kind: 'ORGANIZATION', organizationId: organizationA }, ownershipPercentage: null, validFrom: '2010-01-01' }),
    createFacilityOwnershipInterest({ id: 'own:rt-municipal', facilityId: tempArena.id, owner: { kind: 'ORGANIZATION', organizationId: municipalOrg }, ownershipPercentage: 100, validFrom: '1980-01-01' }),
  ]

  const controlRights = [
    createFacilityControlRight({ id: 'control:rt-1', facilityId: ownedArena.id, controller: { kind: 'ORGANIZATION', organizationId: organizationA }, validFrom: '2000-01-01' }),
  ]

  const operatorAssignments = [
    createFacilityOperatorAssignment({ id: 'op:rt-old', facilityId: ownedArena.id, operatorOrganizationId: organizationB, validFrom: '2000-01-01', validTo: '2014-12-31' }),
    createFacilityOperatorAssignment({ id: 'op:rt-new', facilityId: ownedArena.id, operatorOrganizationId: organizationA, validFrom: '2015-01-01' }),
  ]

  const organizationRelationships = [
    createFacilityOrganizationRelationship({ id: 'rel:rt-tenant', facilityId: tempArena.id, organizationId: organizationA, kind: 'TENANT', validFrom: '2024-01-01', validTo: '2024-12-31' }),
  ]

  const teamRelationships = [
    createFacilityTeamRelationship({ id: 'relteam:rt-home', facilityId: ownedArena.id, teamId: teamA.id, kind: 'HOME_VENUE', validFrom: '2000-01-01', validTo: '2023-12-31' }),
    createFacilityTeamRelationship({ id: 'relteam:rt-temp', facilityId: tempArena.id, teamId: teamA.id, kind: 'TEMPORARY_HOME', validFrom: '2024-01-01', validTo: '2024-12-31' }),
    createFacilityTeamRelationship({ id: 'relteam:rt-home-2', facilityId: ownedArena.id, teamId: teamA.id, kind: 'HOME_VENUE', validFrom: '2025-01-01' }),
  ]

  const usageRights = [
    createFacilityUsageRight({ id: 'usage:rt-home-a', facilityId: ownedArena.id, teamId: teamA.id, purpose: 'HOME_VENUE', exclusivity: 'SHARED', priority: 'PRIMARY', validFrom: '2000-01-01' }),
    createFacilityUsageRight({ id: 'usage:rt-home-b', facilityId: ownedArena.id, teamId: teamB.id, purpose: 'HOME_VENUE', exclusivity: 'SHARED', priority: 'SECONDARY', validFrom: '2000-01-01' }),
    createFacilityUsageRight({ id: 'usage:rt-train-a', facilityId: trainingCenter.id, componentIds: [practiceCourtA.id], teamId: teamA.id, purpose: 'TRAINING', exclusivity: 'EXCLUSIVE', validFrom: '2010-01-01' }),
    createFacilityUsageRight({ id: 'usage:rt-train-b', facilityId: trainingCenter.id, componentIds: [practiceCourtB.id], teamId: teamB.id, purpose: 'TRAINING', exclusivity: 'EXCLUSIVE', validFrom: '2010-01-01' }),
    createFacilityUsageRight({ id: 'usage:rt-medical-shared', facilityId: trainingCenter.id, componentIds: [medicalRoom.id], organizationId: organizationA, purpose: 'MEDICAL', exclusivity: 'NON_EXCLUSIVE', validFrom: '2010-01-01' }),
    createFacilityUsageRight({ id: 'usage:rt-admin-org', facilityId: trainingCenter.id, componentIds: [adminOffice.id], organizationId: organizationB, purpose: 'ADMINISTRATION', exclusivity: 'NON_EXCLUSIVE', validFrom: '2015-01-01', agreementReferenceId: 'agreement:future-lease-001' }),
  ]

  const competitionId = Object.values(base.competitions)[0]!.id
  const competitionApprovals = [
    createFacilityCompetitionApproval({ id: 'approval:rt-1', facilityId: ownedArena.id, competitionId, approved: true, validFrom: '2000-01-01' }),
  ]

  const world = updateGameWorld(base, {
    places: [cityPlace, campusPlace],
    facilities: [ownedArena, trainingCenter, tempArena],
    facilityComponents: [mainCourt, practiceCourtA, practiceCourtB, medicalRoom, adminOffice],
    facilityNameRecords: nameRecords,
    facilityStatusRecords: statusRecords,
    facilityOwnershipInterests: ownershipInterests,
    facilityControlRights: controlRights,
    facilityOperatorAssignments: operatorAssignments,
    facilityOrganizationRelationships: organizationRelationships,
    facilityTeamRelationships: teamRelationships,
    facilityUsageRights: usageRights,
    facilityCompetitionApprovals: competitionApprovals,
  })

  return { world, teamA, teamB, organizationA, organizationB, municipalOrg, ownedArena, trainingCenter, tempArena, mainCourt, practiceCourtA, practiceCourtB, medicalRoom, competitionId }
}

/** Every query-layer resolver CFI2 introduced, called on one world at one date, for before/after comparison. */
function queryEquivalenceSnapshot(world: ReturnType<typeof createNewGame>, f: ReturnType<typeof richFacilitiesWorld>, onDate: ReturnType<typeof parseGameDate>) {
  return {
    ownersOfFacilityAt: ownersOfFacilityAt(Object.values(world.facilityOwnershipInterestsById), f.ownedArena.id, onDate),
    ownershipShareOfA: ownershipShareOfAt(Object.values(world.facilityOwnershipInterestsById), f.ownedArena.id, f.organizationA, onDate),
    ownershipShareOfB: ownershipShareOfAt(Object.values(world.facilityOwnershipInterestsById), f.ownedArena.id, f.organizationB, onDate),
    facilitiesOwnedByA: facilitiesOwnedByOrganizationAt(Object.values(world.facilityOwnershipInterestsById), f.organizationA, onDate),
    controllersOfFacilityAt: controllersOfFacilityAt(Object.values(world.facilityControlRightsById), f.ownedArena.id, onDate),
    operatorsOfFacilityAt: operatorsOfFacilityAt(Object.values(world.facilityOperatorAssignmentsById), f.ownedArena.id, onDate),
    facilitiesOperatedByA: facilitiesOperatedByOrganizationAt(Object.values(world.facilityOperatorAssignmentsById), f.organizationA, onDate),
    organizationsRelatedToFacilityAt: organizationsRelatedToFacilityAt(Object.values(world.facilityOrganizationRelationshipsById), f.tempArena.id, onDate),
    usageRightsForFacilityAt: usageRightsForFacilityAt(Object.values(world.facilityUsageRightsById), f.ownedArena.id, onDate),
    usageRightsForTeamAt: usageRightsForTeamAt(Object.values(world.facilityUsageRightsById), f.teamA.id, onDate),
    usageRightsForOrganizationAt: usageRightsForOrganizationAt(Object.values(world.facilityUsageRightsById), f.organizationA, onDate),
    facilitiesUsedByTeamAt: facilitiesUsedByTeamAt(Object.values(world.facilityTeamRelationshipsById), f.teamA.id, onDate),
    facilitiesUsedByOrganizationAt: facilitiesUsedByOrganizationAt(Object.values(world.facilityUsageRightsById), f.organizationA, onDate),
    homeFacilitiesForTeamAt: homeFacilitiesForTeamAt(Object.values(world.facilityUsageRightsById), f.teamA.id, onDate),
    trainingFacilitiesForTeamAt: trainingFacilitiesForTeamAt(Object.values(world.facilityUsageRightsById), f.teamA.id, onDate),
    teamsUsingFacilityAt: teamsUsingFacilityAt(Object.values(world.facilityUsageRightsById), f.ownedArena.id, onDate),
    organizationsUsingFacilityAt: organizationsUsingFacilityAt(Object.values(world.facilityUsageRightsById), f.trainingCenter.id, onDate),
    facilityComponentsUsableByTeamAt: facilityComponentsUsableByTeamAt(Object.values(world.facilityUsageRightsById), Object.values(world.facilityComponentsById), f.teamA.id, onDate),
    facilityRightsConflictsAtTraining: facilityRightsConflictsAt(Object.values(world.facilityUsageRightsById), f.trainingCenter.id, onDate),
    facilityNameAt: facilityNameAt(Object.values(world.facilityNameRecordsById), f.ownedArena.id, onDate, world.facilitiesById[f.ownedArena.id]!.canonicalName),
    facilityStatusAt: facilityStatusAt(Object.values(world.facilityStatusRecordsById), world.facilitiesById[f.ownedArena.id]!, onDate),
  }
}

describe('GameWorldSaveV4 — Club Facilities & Infrastructure V2 persistence (CFI2S)', () => {
  it('round-trips a rich Facilities world through Save V4 with full semantic equivalence', () => {
    const f = richFacilitiesWorld()
    const saved = serializeGameWorldV4(f.world, savedAt)
    const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(saved)))

    expect(restored.placesById).toEqual(f.world.placesById)
    expect(restored.facilitiesById).toEqual(f.world.facilitiesById)
    expect(restored.facilityComponentsById).toEqual(f.world.facilityComponentsById)
    expect(restored.facilityNameRecordsById).toEqual(f.world.facilityNameRecordsById)
    expect(restored.facilityOwnershipInterestsById).toEqual(f.world.facilityOwnershipInterestsById)
    expect(restored.facilityControlRightsById).toEqual(f.world.facilityControlRightsById)
    expect(restored.facilityOperatorAssignmentsById).toEqual(f.world.facilityOperatorAssignmentsById)
    expect(restored.facilityOrganizationRelationshipsById).toEqual(f.world.facilityOrganizationRelationshipsById)
    expect(restored.facilityTeamRelationshipsById).toEqual(f.world.facilityTeamRelationshipsById)
    expect(restored.facilityUsageRightsById).toEqual(f.world.facilityUsageRightsById)
    expect(restored.facilityCompetitionApprovalsById).toEqual(f.world.facilityCompetitionApprovalsById)
    expect(restored.facilityStatusRecordsById).toEqual(f.world.facilityStatusRecordsById)

    // validateWorld must accept the reconstructed world without any new error.
    expect(() => updateGameWorld(restored, {})).not.toThrow()
  })

  it('preserves query equivalence across the full resolver surface, before and after save/load', () => {
    const f = richFacilitiesWorld()
    const onDate = parseGameDate('2030-01-01')
    const before = queryEquivalenceSnapshot(f.world, f, onDate)

    const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(f.world, savedAt))))
    const after = queryEquivalenceSnapshot(restored, f, onDate)

    expect(after).toEqual(before)
  })

  it('preserves query equivalence at a historical date spanning operator change, status closure, and temporary relocation', () => {
    const f = richFacilitiesWorld()
    const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(f.world, savedAt))))

    for (const onDate of [parseGameDate('2005-01-01'), parseGameDate('2024-06-15'), parseGameDate('2026-01-01')]) {
      const before = queryEquivalenceSnapshot(f.world, f, onDate)
      const after = queryEquivalenceSnapshot(restored, f, onDate)
      expect(after).toEqual(before)
    }
  })

  it('does not serialize derived conflicts: facilityRightsConflictsAt is recomputed identically from persisted rights, never stored', () => {
    const f = richFacilitiesWorld()
    const saved = serializeGameWorldV4(f.world, savedAt)
    // The raw payload must never contain a "conflicts" field — conflicts are query-time only.
    expect(Object.keys(saved.payload)).not.toContain('facilityRightsConflicts')
    expect(Object.keys(saved.payload)).not.toContain('facilityConflicts')

    const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(saved)))
    const onDate = parseGameDate('2015-01-01')
    // Exclusive, disjoint-component training rights: correctly non-conflicting before and after.
    expect(facilityRightsConflictsAt(Object.values(restored.facilityUsageRightsById), f.trainingCenter.id, onDate)).toEqual(
      facilityRightsConflictsAt(Object.values(f.world.facilityUsageRightsById), f.trainingCenter.id, onDate),
    )
    expect(facilityRightsConflictsAt(Object.values(restored.facilityUsageRightsById), f.trainingCenter.id, onDate)).toEqual([])
  })

  it('reloading the same save repeatedly is deterministic', () => {
    const f = richFacilitiesWorld()
    const rawSave = JSON.parse(JSON.stringify(serializeGameWorldV4(f.world, savedAt)))

    const first = deserializeGameWorldV4(JSON.parse(JSON.stringify(rawSave)))
    const second = deserializeGameWorldV4(JSON.parse(JSON.stringify(rawSave)))

    expect(first.facilitiesById).toEqual(second.facilitiesById)
    expect(first.facilityUsageRightsById).toEqual(second.facilityUsageRightsById)
    expect(first.facilityOwnershipInterestsById).toEqual(second.facilityOwnershipInterestsById)
    const onDate = parseGameDate('2020-01-01')
    expect(ownersOfFacilityAt(Object.values(first.facilityOwnershipInterestsById), f.ownedArena.id, onDate)).toEqual(
      ownersOfFacilityAt(Object.values(second.facilityOwnershipInterestsById), f.ownedArena.id, onDate),
    )
  })

  describe('per-collection round-trips', () => {
    it('Place: nested parent/child places survive, including null geography fields', () => {
      const base = createNewGame()
      const city = createPlace({ id: 'place:pc-city', kind: 'CITY', name: 'PC City', latitude: 40.4, longitude: -3.7 })
      const campus = createPlace({ id: 'place:pc-campus', kind: 'CAMPUS', name: 'PC Campus', parentPlaceId: city.id })
      const world = updateGameWorld(base, { places: [city, campus] })
      const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world, savedAt))))
      expect(restored.placesById).toEqual(world.placesById)
      expect(restored.placesById[campus.id]!.parentPlaceId).toBe(city.id)
      expect(restored.placesById[city.id]!.latitude).toBe(40.4)
    })

    it('Facility: physical profile (including all-null profile) and lifecycle survive', () => {
      const base = createNewGame()
      const place = createPlace({ id: 'place:fac-1', kind: 'CITY', name: 'Fac City' })
      const bare = createFacility({ id: 'facility:fac-bare', placeId: place.id, type: 'STORAGE', purposes: ['STORAGE'], status: 'ACTIVE', canonicalName: 'Bare Storage' })
      const rich = createFacility({ id: 'facility:fac-rich', placeId: place.id, type: 'STADIUM', purposes: ['MATCH_HOSTING', 'COMMUNITY_ENGAGEMENT'], capabilities: ['HOSTS_COMPETITIVE_MATCHES', 'HOSTS_HOSPITALITY'], status: 'DEMOLISHED', canonicalName: 'Old Stadium', physical: { openedOn: '1950-01-01', totalCapacity: 40000, seatedCapacity: 35000, standingCapacity: 5000, courtCount: 1, hasAccessibilityProvision: false }, closedOn: '2010-01-01' })
      const world = updateGameWorld(base, { places: [place], facilities: [bare, rich] })
      const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world, savedAt))))
      expect(restored.facilitiesById[bare.id]!.physical).toEqual(bare.physical)
      expect(restored.facilitiesById[rich.id]!).toEqual(rich)
    })

    it('FacilityComponent: independent identity, capacity/quantity, and open/closed dates survive', () => {
      const base = createNewGame()
      const place = createPlace({ id: 'place:comp-1', kind: 'CITY', name: 'Comp City' })
      const facility = createFacility({ id: 'facility:comp-1', placeId: place.id, type: 'TRAINING_CENTER', purposes: ['TRAINING'], status: 'ACTIVE', canonicalName: 'Comp Center' })
      const active = createFacilityComponent({ id: 'component:comp-active', facilityId: facility.id, type: 'GYM', status: 'ACTIVE', capacity: 50, quantity: 2, openedAt: '2020-01-01' })
      const closed = createFacilityComponent({ id: 'component:comp-closed', facilityId: facility.id, type: 'VIP_BOX', status: 'CLOSED', openedAt: '2018-01-01', closedAt: '2022-01-01' })
      const world = updateGameWorld(base, { places: [place], facilities: [facility], facilityComponents: [active, closed] })
      const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world, savedAt))))
      expect(restored.facilityComponentsById).toEqual({ [active.id]: active, [closed.id]: closed })
    })

    it('FacilityNameRecord: canonical + multiple commercial-name periods survive and resolve identically', () => {
      const base = createNewGame()
      const place = createPlace({ id: 'place:name-1', kind: 'CITY', name: 'Name City' })
      const facility = createFacility({ id: 'facility:name-1', placeId: place.id, type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'ACTIVE', canonicalName: 'Name Arena' })
      const records = [
        createFacilityNameRecord({ id: 'name:pc-canonical', facilityId: facility.id, name: 'Name Arena', isCanonical: true, validFrom: '2000-01-01' }),
        createFacilityNameRecord({ id: 'name:pc-old', facilityId: facility.id, name: 'Old Sponsor Arena', isCanonical: false, validFrom: '2000-01-01', validTo: '2015-12-31' }),
        createFacilityNameRecord({ id: 'name:pc-new', facilityId: facility.id, name: 'New Sponsor Arena', isCanonical: false, validFrom: '2016-01-01' }),
      ]
      const world = updateGameWorld(base, { places: [place], facilities: [facility], facilityNameRecords: records })
      const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world, savedAt))))
      expect(restored.facilityNameRecordsById).toEqual(world.facilityNameRecordsById)
      for (const onDate of [parseGameDate('2005-01-01'), parseGameDate('2020-01-01')]) {
        expect(facilityNameAt(Object.values(restored.facilityNameRecordsById), facility.id, onDate, facility.canonicalName)).toBe(
          facilityNameAt(Object.values(world.facilityNameRecordsById), facility.id, onDate, facility.canonicalName),
        )
      }
    })

    it('FacilityOwnershipInterest: 100%, 60/40, and unknown share all survive with the correct actor kind', () => {
      const base = createNewGame()
      const place = createPlace({ id: 'place:own-1', kind: 'CITY', name: 'Own City' })
      const facilityFull = createFacility({ id: 'facility:own-full', placeId: place.id, type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'ACTIVE', canonicalName: 'Full' })
      const facilitySplit = createFacility({ id: 'facility:own-split', placeId: place.id, type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'ACTIVE', canonicalName: 'Split' })
      const facilityUnknown = createFacility({ id: 'facility:own-unknown', placeId: place.id, type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'ACTIVE', canonicalName: 'Unknown' })
      const teamOrg = Object.values(base.teams)[0]!.organizationId
      const otherOrg = Object.values(base.organizationsById).find((o) => o.id !== teamOrg)!.id
      const interests = [
        createFacilityOwnershipInterest({ id: 'own:pc-full', facilityId: facilityFull.id, owner: { kind: 'ORGANIZATION', organizationId: teamOrg }, ownershipPercentage: 100, validFrom: '2020-01-01' }),
        createFacilityOwnershipInterest({ id: 'own:pc-60', facilityId: facilitySplit.id, owner: { kind: 'ORGANIZATION', organizationId: teamOrg }, ownershipPercentage: 60, validFrom: '2020-01-01' }),
        createFacilityOwnershipInterest({ id: 'own:pc-40', facilityId: facilitySplit.id, owner: { kind: 'ORGANIZATION', organizationId: otherOrg }, ownershipPercentage: 40, validFrom: '2020-01-01' }),
        createFacilityOwnershipInterest({ id: 'own:pc-unknown', facilityId: facilityUnknown.id, owner: { kind: 'ORGANIZATION', organizationId: teamOrg }, ownershipPercentage: null, validFrom: '2020-01-01' }),
      ]
      const world = updateGameWorld(base, { places: [place], facilities: [facilityFull, facilitySplit, facilityUnknown], facilityOwnershipInterests: interests })
      const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world, savedAt))))
      expect(restored.facilityOwnershipInterestsById).toEqual(world.facilityOwnershipInterestsById)
      const onDate = parseGameDate('2030-01-01')
      expect(ownershipShareOfAt(Object.values(restored.facilityOwnershipInterestsById), facilityUnknown.id, teamOrg, onDate)).toBeNull()
      expect(ownershipShareOfAt(Object.values(restored.facilityOwnershipInterestsById), facilitySplit.id, teamOrg, onDate)).toBe(60)
    })

    it('FacilityOwnershipInterest with a PERSON owner actor survives', () => {
      const base = createNewGame()
      const place = createPlace({ id: 'place:own-person', kind: 'CITY', name: 'Person City' })
      const facility = createFacility({ id: 'facility:own-person', placeId: place.id, type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'ACTIVE', canonicalName: 'Person Arena' })
      const owner = Object.values(base.personsById)[0]!
      const interest = createFacilityOwnershipInterest({ id: 'own:pc-person', facilityId: facility.id, owner: { kind: 'PERSON', personId: owner.id }, ownershipPercentage: 100, validFrom: '2020-01-01' })
      const world = updateGameWorld(base, { places: [place], facilities: [facility], facilityOwnershipInterests: [interest] })
      const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world, savedAt))))
      expect(restored.facilityOwnershipInterestsById[interest.id]!.owner).toEqual({ kind: 'PERSON', personId: owner.id })
    })

    it('FacilityControlRight: survives and controllersOfFacilityAt returns exactly the same result after reload', () => {
      const base = createNewGame()
      const place = createPlace({ id: 'place:ctrl-1', kind: 'CITY', name: 'Ctrl City' })
      const facility = createFacility({ id: 'facility:ctrl-1', placeId: place.id, type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'ACTIVE', canonicalName: 'Ctrl Arena' })
      const org = Object.values(base.teams)[0]!.organizationId
      const right = createFacilityControlRight({ id: 'control:pc-1', facilityId: facility.id, controller: { kind: 'ORGANIZATION', organizationId: org }, validFrom: '2015-01-01' })
      const world = updateGameWorld(base, { places: [place], facilities: [facility], facilityControlRights: [right] })
      const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world, savedAt))))
      const onDate = parseGameDate('2030-01-01')
      expect(controllersOfFacilityAt(Object.values(restored.facilityControlRightsById), facility.id, onDate)).toEqual(
        controllersOfFacilityAt(Object.values(world.facilityControlRightsById), facility.id, onDate),
      )
    })

    it('FacilityOperatorAssignment: owner==operator, owner!=operator, and historical operator change all survive', () => {
      const base = createNewGame()
      const place = createPlace({ id: 'place:op-1', kind: 'CITY', name: 'Op City' })
      const facility = createFacility({ id: 'facility:op-1', placeId: place.id, type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'ACTIVE', canonicalName: 'Op Arena' })
      const orgA = Object.values(base.teams)[0]!.organizationId
      const orgB = Object.values(base.organizationsById).find((o) => o.id !== orgA)!.id
      const ownership = createFacilityOwnershipInterest({ id: 'own:op-same', facilityId: facility.id, owner: { kind: 'ORGANIZATION', organizationId: orgA }, ownershipPercentage: 100, validFrom: '2000-01-01' })
      const operatorHistory = [
        createFacilityOperatorAssignment({ id: 'op:pc-old', facilityId: facility.id, operatorOrganizationId: orgB, validFrom: '2000-01-01', validTo: '2009-12-31' }),
        createFacilityOperatorAssignment({ id: 'op:pc-new', facilityId: facility.id, operatorOrganizationId: orgA, validFrom: '2010-01-01' }),
      ]
      const world = updateGameWorld(base, { places: [place], facilities: [facility], facilityOwnershipInterests: [ownership], facilityOperatorAssignments: operatorHistory })
      const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world, savedAt))))
      expect(operatorsOfFacilityAt(Object.values(restored.facilityOperatorAssignmentsById), facility.id, parseGameDate('2005-01-01')).map((a) => a.operatorOrganizationId)).toEqual([orgB])
      expect(operatorsOfFacilityAt(Object.values(restored.facilityOperatorAssignmentsById), facility.id, parseGameDate('2020-01-01')).map((a) => a.operatorOrganizationId)).toEqual([orgA])
    })

    it('FacilityUsageRight: exclusivity, priority, component scope, and agreementReferenceId all survive without type collapse', () => {
      const base = createNewGame()
      const place = createPlace({ id: 'place:usage-1', kind: 'CAMPUS', name: 'Usage Campus' })
      const facility = createFacility({ id: 'facility:usage-1', placeId: place.id, type: 'TRAINING_CENTER', purposes: ['TRAINING'], status: 'ACTIVE', canonicalName: 'Usage Center' })
      const component = createFacilityComponent({ id: 'component:usage-court', facilityId: facility.id, type: 'PRACTICE_COURT', status: 'ACTIVE' })
      const team = Object.values(base.teams)[0]!
      const right = createFacilityUsageRight({
        id: 'usage:pc-full',
        facilityId: facility.id,
        componentIds: [component.id],
        teamId: team.id,
        purpose: 'TRAINING',
        exclusivity: 'EXCLUSIVE',
        priority: 'TERTIARY',
        validFrom: '2020-01-01',
        validTo: '2029-12-31',
        agreementReferenceId: 'agreement:pc-lease-001',
      })
      const world = updateGameWorld(base, { places: [place], facilities: [facility], facilityComponents: [component], facilityUsageRights: [right] })
      const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world, savedAt))))
      const restoredRight = restored.facilityUsageRightsById[right.id]!
      expect(restoredRight).toEqual(right)
      expect(restoredRight.exclusivity).toBe('EXCLUSIVE')
      expect(typeof restoredRight.exclusivity).toBe('string')
      expect(restoredRight.priority).toBe('TERTIARY')
      expect(restoredRight.componentIds).toEqual([component.id])
      expect(restoredRight.agreementReferenceId).toBe('agreement:pc-lease-001')
    })

    it('FacilityUsageRight: whole-facility scope (componentIds: null) survives distinctly from a component-scoped right', () => {
      const base = createNewGame()
      const place = createPlace({ id: 'place:usage-2', kind: 'CITY', name: 'Usage City 2' })
      const facility = createFacility({ id: 'facility:usage-2', placeId: place.id, type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'ACTIVE', canonicalName: 'Usage Arena 2' })
      const team = Object.values(base.teams)[0]!
      const wholeFacilityRight = createFacilityUsageRight({ id: 'usage:pc-whole', facilityId: facility.id, teamId: team.id, purpose: 'HOME_VENUE', validFrom: '2020-01-01' })
      const world = updateGameWorld(base, { places: [place], facilities: [facility], facilityUsageRights: [wholeFacilityRight] })
      const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world, savedAt))))
      expect(restored.facilityUsageRightsById[wholeFacilityRight.id]!.componentIds).toBeNull()
    })

    it('FacilityOrganizationRelationship and FacilityTeamRelationship: kinds and historical periods survive', () => {
      const base = createNewGame()
      const place = createPlace({ id: 'place:rel-1', kind: 'CITY', name: 'Rel City' })
      const facility = createFacility({ id: 'facility:rel-1', placeId: place.id, type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'ACTIVE', canonicalName: 'Rel Arena' })
      const org = Object.values(base.teams)[0]!.organizationId
      const team = Object.values(base.teams)[0]!
      const orgRelationship = createFacilityOrganizationRelationship({ id: 'rel:pc-tenant', facilityId: facility.id, organizationId: org, kind: 'TENANT', validFrom: '2010-01-01', validTo: '2019-12-31' })
      const teamRelationship = createFacilityTeamRelationship({ id: 'relteam:pc-home', facilityId: facility.id, teamId: team.id, kind: 'HOME_VENUE', validFrom: '2010-01-01' })
      const world = updateGameWorld(base, { places: [place], facilities: [facility], facilityOrganizationRelationships: [orgRelationship], facilityTeamRelationships: [teamRelationship] })
      const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world, savedAt))))
      expect(restored.facilityOrganizationRelationshipsById).toEqual({ [orgRelationship.id]: orgRelationship })
      expect(restored.facilityTeamRelationshipsById).toEqual({ [teamRelationship.id]: teamRelationship })
    })

    it('FacilityCompetitionApproval: approved/not-approved and temporal window survive', () => {
      const base = createNewGame()
      const place = createPlace({ id: 'place:approval-1', kind: 'CITY', name: 'Approval City' })
      const facility = createFacility({ id: 'facility:approval-1', placeId: place.id, type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'ACTIVE', canonicalName: 'Approval Arena' })
      const competitionId = Object.values(base.competitions)[0]!.id
      const approval = createFacilityCompetitionApproval({ id: 'approval:pc-1', facilityId: facility.id, competitionId, approved: true, validFrom: '2015-01-01', validTo: '2025-12-31' })
      const world = updateGameWorld(base, { places: [place], facilities: [facility], facilityCompetitionApprovals: [approval] })
      const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world, savedAt))))
      expect(restored.facilityCompetitionApprovalsById).toEqual({ [approval.id]: approval })
    })

    it('FacilityStatusRecord: multi-period lifecycle history round-trips and facilityStatusAt matches at each period', () => {
      const base = createNewGame()
      const place = createPlace({ id: 'place:status-1', kind: 'CITY', name: 'Status City' })
      const facility = createFacility({ id: 'facility:status-1', placeId: place.id, type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'ACTIVE', canonicalName: 'Status Arena' })
      const records = [
        createFacilityStatusRecord({ id: 'status:pc-1', facilityId: facility.id, status: 'ACTIVE', effectiveFrom: '2000-01-01' }),
        createFacilityStatusRecord({ id: 'status:pc-2', facilityId: facility.id, status: 'TEMPORARILY_CLOSED', effectiveFrom: '2020-01-01' }),
        createFacilityStatusRecord({ id: 'status:pc-3', facilityId: facility.id, status: 'ACTIVE', effectiveFrom: '2021-01-01' }),
      ]
      const world = updateGameWorld(base, { places: [place], facilities: [facility], facilityStatusRecords: records })
      const restored = deserializeGameWorldV4(JSON.parse(JSON.stringify(serializeGameWorldV4(world, savedAt))))
      for (const onDate of [parseGameDate('2010-01-01'), parseGameDate('2020-06-01'), parseGameDate('2022-01-01')]) {
        expect(facilityStatusAt(Object.values(restored.facilityStatusRecordsById), restored.facilitiesById[facility.id]!, onDate)).toBe(
          facilityStatusAt(Object.values(world.facilityStatusRecordsById), world.facilitiesById[facility.id]!, onDate),
        )
      }
    })
  })

  describe('migration V1/V2/V3 -> latest (V4)', () => {
    it('migrates a genuinely pre-Facilities V1 save to V4 with valid, empty Facilities collections', () => {
      const world = createNewGame()
      const v1 = serializeGameWorldV1(world, savedAt)
      const v2 = migrateGameWorldSaveV1ToV2(v1)
      const v3 = migrateGameWorldSaveV2ToV3(v2)
      const v4 = migrateGameWorldSaveV3ToV4(v3)

      expect(v4.payload.places).toEqual([])
      expect(v4.payload.facilities).toEqual([])
      expect(v4.payload.facilityComponents).toEqual([])
      expect(v4.payload.facilityNameRecords).toEqual([])
      expect(v4.payload.facilityOwnershipInterests).toEqual([])
      expect(v4.payload.facilityControlRights).toEqual([])
      expect(v4.payload.facilityOperatorAssignments).toEqual([])
      expect(v4.payload.facilityOrganizationRelationships).toEqual([])
      expect(v4.payload.facilityTeamRelationships).toEqual([])
      expect(v4.payload.facilityUsageRights).toEqual([])
      expect(v4.payload.facilityCompetitionApprovals).toEqual([])
      expect(v4.payload.facilityStatusRecords).toEqual([])

      const restored = deserializeGameWorldV4(v4)
      expect(restored.placesById).toEqual({})
      expect(restored.facilitiesById).toEqual({})
      expect(restored.facilityUsageRightsById).toEqual({})
      expect(() => updateGameWorld(restored, {})).not.toThrow()
    })

    it('migrates a V2 save (no Facilities) to V4 with valid, empty Facilities collections', () => {
      const world = createNewGame()
      const v1 = serializeGameWorldV1(world, savedAt)
      const v2 = migrateGameWorldSaveV1ToV2(v1)
      const v3 = migrateGameWorldSaveV2ToV3(v2)
      const v4 = migrateGameWorldSaveV3ToV4(v3)

      expect(v4.payload.facilities).toEqual([])
      const restored = deserializeGameWorldV4(v4)
      expect(restored.facilitiesById).toEqual({})
    })

    it('migrates a V3 save (no Facilities) to V4 with valid, empty Facilities collections', () => {
      const world = createNewGame()
      const v3 = serializeGameWorldV3(world, savedAt)
      const v4 = migrateGameWorldSaveV3ToV4(v3)

      expect(v4.payload.facilities).toEqual([])
      expect(v4.payload.facilityUsageRights).toEqual([])
      const restored = deserializeGameWorldV4(v4)
      expect(restored.facilitiesById).toEqual({})
      expect(() => updateGameWorld(restored, {})).not.toThrow()
    })

    it('a real V3 save already carrying Facilities-independent state migrates cleanly and old saves need no fictitious Facilities data', () => {
      const f = richFacilitiesWorld()
      const v3 = serializeGameWorldV3(f.world, savedAt)
      // V3 has no concept of Facilities: its payload simply carries no such keys.
      expect(Object.prototype.hasOwnProperty.call(v3.payload, 'facilities')).toBe(false)
      const v4 = migrateGameWorldSaveV3ToV4(v3)
      // Migrating a payload that itself never had Facilities data must not invent any.
      expect(v4.payload.facilities).toEqual([])
    })
  })

  describe('malformed Facilities save payloads', () => {
    it('rejects a bad ownership percentage', () => {
      const valid = serializeGameWorldV4(createNewGame(), savedAt)
      const place = createPlace({ id: 'place:mal-1', kind: 'CITY', name: 'Mal City' })
      const facility = createFacility({ id: 'facility:mal-1', placeId: place.id, type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'ACTIVE', canonicalName: 'Mal Arena' })
      const org = Object.values(createNewGame().teams)[0]!.organizationId
      expect(() => deserializeGameWorldV4({
        ...valid,
        payload: {
          ...valid.payload,
          places: [place],
          facilities: [facility],
          facilityOwnershipInterests: [{ id: 'own:mal', facilityId: facility.id, owner: { kind: 'ORGANIZATION', organizationId: org }, ownershipPercentage: 150, validFrom: '2020-01-01', validTo: null }],
        },
      })).toThrow(RangeError)
    })

    it('rejects an unknown enum value for Facility status', () => {
      const valid = serializeGameWorldV4(createNewGame(), savedAt)
      const place = createPlace({ id: 'place:mal-2', kind: 'CITY', name: 'Mal City 2' })
      expect(() => deserializeGameWorldV4({
        ...valid,
        payload: {
          ...valid.payload,
          places: [place],
          facilities: [{ id: 'facility:mal-2', placeId: place.id, type: 'ARENA', purposes: ['MATCH_HOSTING'], capabilities: [], status: 'NOT_A_REAL_STATUS', canonicalName: 'Mal Arena 2', physical: { openedOn: null, totalCapacity: null, seatedCapacity: null, standingCapacity: null, courtCount: null, hasAccessibilityProvision: null }, closedOn: null }],
        },
      })).toThrow(TypeError)
    })

    it('rejects a malformed temporal interval (validTo before validFrom)', () => {
      const valid = serializeGameWorldV4(createNewGame(), savedAt)
      const place = createPlace({ id: 'place:mal-3', kind: 'CITY', name: 'Mal City 3' })
      const facility = createFacility({ id: 'facility:mal-3', placeId: place.id, type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'ACTIVE', canonicalName: 'Mal Arena 3' })
      expect(() => deserializeGameWorldV4({
        ...valid,
        payload: {
          ...valid.payload,
          places: [place],
          facilities: [facility],
          facilityStatusRecords: [],
          facilityNameRecords: [{ id: 'name:mal', facilityId: facility.id, name: 'Bad Name', isCanonical: true, validFrom: '2025-01-01', validTo: '2020-01-01' }],
        },
      })).toThrow(RangeError)
    })

    it('rejects an invalid FacilityUsageRight shape (missing both team and organization beneficiary)', () => {
      const valid = serializeGameWorldV4(createNewGame(), savedAt)
      const place = createPlace({ id: 'place:mal-4', kind: 'CITY', name: 'Mal City 4' })
      const facility = createFacility({ id: 'facility:mal-4', placeId: place.id, type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'ACTIVE', canonicalName: 'Mal Arena 4' })
      expect(() => deserializeGameWorldV4({
        ...valid,
        payload: {
          ...valid.payload,
          places: [place],
          facilities: [facility],
          facilityUsageRights: [{ id: 'usage:mal', facilityId: facility.id, componentIds: null, organizationId: null, teamId: null, purpose: 'TRAINING', exclusivity: 'SHARED', priority: 'PRIMARY', validFrom: '2020-01-01', validTo: null, agreementReferenceId: null }],
        },
      })).toThrow(TypeError)
    })

    it('rejects an invalid component scope (empty array)', () => {
      const valid = serializeGameWorldV4(createNewGame(), savedAt)
      const place = createPlace({ id: 'place:mal-5', kind: 'CITY', name: 'Mal City 5' })
      const facility = createFacility({ id: 'facility:mal-5', placeId: place.id, type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'ACTIVE', canonicalName: 'Mal Arena 5' })
      const team = Object.values(createNewGame().teams)[0]!
      expect(() => deserializeGameWorldV4({
        ...valid,
        payload: {
          ...valid.payload,
          places: [place],
          facilities: [facility],
          facilityUsageRights: [{ id: 'usage:mal-scope', facilityId: facility.id, componentIds: [], organizationId: null, teamId: team.id, purpose: 'TRAINING', exclusivity: 'SHARED', priority: 'PRIMARY', validFrom: '2020-01-01', validTo: null, agreementReferenceId: null }],
        },
      })).toThrow(RangeError)
    })

    it('rejects an unknown property on a Facility record (exactKeys)', () => {
      const valid = serializeGameWorldV4(createNewGame(), savedAt)
      const place = createPlace({ id: 'place:mal-6', kind: 'CITY', name: 'Mal City 6' })
      const facility = createFacility({ id: 'facility:mal-6', placeId: place.id, type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'ACTIVE', canonicalName: 'Mal Arena 6' })
      expect(() => deserializeGameWorldV4({
        ...valid,
        payload: {
          ...valid.payload,
          places: [place],
          facilities: [{ ...facility, physical: { openedOn: null, totalCapacity: null, seatedCapacity: null, standingCapacity: null, courtCount: null, hasAccessibilityProvision: null }, unexpectedField: 'oops' }],
        },
      })).toThrow(TypeError)
    })

    it('rejects a malformed discriminated union (unknown ownership actor kind)', () => {
      const valid = serializeGameWorldV4(createNewGame(), savedAt)
      const place = createPlace({ id: 'place:mal-7', kind: 'CITY', name: 'Mal City 7' })
      const facility = createFacility({ id: 'facility:mal-7', placeId: place.id, type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'ACTIVE', canonicalName: 'Mal Arena 7' })
      expect(() => deserializeGameWorldV4({
        ...valid,
        payload: {
          ...valid.payload,
          places: [place],
          facilities: [facility],
          facilityOwnershipInterests: [{ id: 'own:mal-union', facilityId: facility.id, owner: { kind: 'ALIEN_CORP', someId: 'x' }, ownershipPercentage: 100, validFrom: '2020-01-01', validTo: null }],
        },
      })).toThrow(TypeError)
    })

    it('rejects a missing component reference in a component-scoped usage right at the domain-validation boundary', () => {
      const base = createNewGame()
      const place = createPlace({ id: 'place:mal-8', kind: 'CITY', name: 'Mal City 8' })
      const facility = createFacility({ id: 'facility:mal-8', placeId: place.id, type: 'ARENA', purposes: ['MATCH_HOSTING'], status: 'ACTIVE', canonicalName: 'Mal Arena 8' })
      const team = Object.values(base.teams)[0]!
      // The parser accepts a well-formed shape; GameWorld's own referential validation must still
      // catch the dangling component reference — this is schema parsing succeeding but domain
      // validation correctly refusing, exactly the separation CFI2S must preserve.
      expect(() => updateGameWorld(base, {
        places: [place],
        facilities: [facility],
        facilityUsageRights: [createFacilityUsageRight({ id: 'usage:mal-component', facilityId: facility.id, componentIds: ['component:does-not-exist'], teamId: team.id, purpose: 'TRAINING', validFrom: '2020-01-01' })],
      })).toThrow()
    })
  })
})
