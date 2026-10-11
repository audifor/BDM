import { createValidGameWorldInput } from '@/domain/world/testFixtures'
import { createGameWorld, updateGameWorld } from '@/domain/world'
import { createTeam } from '@/domain/team'
import { createCompetition } from '@/domain/competition'
import { createPlayer } from '@/domain/player'
import { createTalentCohort } from '@/domain/talent'
import { createPlace, createFacility, createFacilityComponent, createFacilityComponentConditionRecord, createFacilityUsageRight } from '@/domain/facilities'
import { configureTeamPathway, acceptYouthIntake } from '@/engine/youth/YouthPathwayEngine'
import { createScheduledTrainingSession } from '@/domain/training'
import { scheduleTrainingSessionsBatch } from '@/engine/training/ScheduledTrainingEngine'
import { addDays } from '@/domain/date'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'

/** Explicit BS15C youth fixture; a configured Team, never inferred from a building name. */
export function youthFacilitiesFixture(gender: 'male' | 'female' = 'female') {
  const input = createValidGameWorldInput()
  const base = createGameWorld({ ...input, games: [], players: input.players.map(player => createPlayer({ ...player, gender })), teams: input.teams.map(team => createTeam({ ...team, gender })), competitions: input.competitions.map(competition => createCompetition({ ...competition, gender })) })
  const senior = Object.values(base.teams)[0]!
  const place = createPlace({ id: 't:place', kind: 'CAMPUS', name: 'Youth campus', countryId: senior.countryId })
  const youth = createTeam({ id: 't:youth' as never, name: 'Configured U18', gender, countryId: senior.countryId, organizationId: senior.organizationId, organizationSectionId: senior.organizationSectionId, rosterPlayerIds: [] })
  const competition = createCompetition({ id: 't:competition' as never, name: 'Explicit U18 competition', gender, participantTeamIds: [youth.id], rules: { ...Object.values(base.competitions)[0]!.rules, playerAgeEligibility: { maximumAge: 18, referenceDate: 'competitionDate' } } })
  const facility = createFacility({ id: 't:academy', placeId: place.id, type: 'ACADEMY_CENTER', status: 'ACTIVE', purposes: ['TRAINING'], canonicalName: 'Youth campus court' })
  const component = createFacilityComponent({ id: 't:court', facilityId: facility.id, type: 'ACADEMY_COURT', status: 'ACTIVE', specification: { kind: 'COURT', isFullCourt: true, isIndoor: true } })
  const condition = createFacilityComponentConditionRecord({ id: 't:condition', componentId: component.id, effectiveFrom: base.currentDate, serviceability: 'FULL', physicalCondition: 80 })
  const organizationRight = createFacilityUsageRight({ id: 't:org-right', facilityId: facility.id, organizationId: senior.organizationId, purpose: 'OTHER', exclusivity: 'SHARED', validFrom: base.currentDate })
  const teamRight = createFacilityUsageRight({ id: 't:team-right', facilityId: facility.id, teamId: youth.id, purpose: 'OTHER', exclusivity: 'SHARED', validFrom: base.currentDate })
  let world = updateGameWorld(base, { places: [place], organizations: Object.values(base.organizationsById).map(org => org.id === senior.organizationId ? { ...org, primaryPlaceId: place.id } : org), teams: [...Object.values(base.teams), youth], competitions: [...Object.values(base.competitions), competition], talentCohorts: [createTalentCohort({ id: 't:cohort', placeId: place.id, birthYear: 2017, generationYear: 2032, gender, seed: 151617, inputs: { ageCohortPopulation: 100, basketballParticipationPerThousand: 100, accessOpportunityBasisPoints: 10000 }, inputVersion: 'bs17d-t-fixture-v1' })], facilities: [facility], facilityComponents: [component], facilityComponentConditionRecords: [condition], facilityUsageRights: [organizationRight, teamRight] })
  world = configureTeamPathway(world, { id: 't:pathway', organizationId: senior.organizationId, seniorTeamId: senior.id, teamId: youth.id, role: 'youth', category: 'U18', movementTargetTeamIds: [senior.id] })
  world = configureTeamPathway(world, { id: 't:senior-pathway', organizationId: senior.organizationId, seniorTeamId: senior.id, teamId: senior.id, role: 'senior', movementTargetTeamIds: [] })
  // Canonical compatibility boundary, before comparing worlds or issuing commands.
  world = deserializeGameWorldV4(serializeGameWorldV4(world, '2032-10-01T00:00:00.000Z'))
  const intake = { cohortId: 't:cohort', candidateIndex: 1, youthTeamId: youth.id, competitionId: competition.id, actionId: 't:intake', decision: 'ACCEPT' as const }
  return { world, senior, youth, competition, component, facility, teamRight, organizationRight, intake }
}

export function acceptedYouthTrainingFixture(gender: 'male' | 'female' = 'female') {
  const fixture = youthFacilitiesFixture(gender)
  const accepted = acceptYouthIntake(fixture.world, fixture.intake)
  if (!accepted.ok) throw new Error(accepted.reason)
  const date = addDays(accepted.world.currentDate, 1)
  const world = scheduleTrainingSessionsBatch(accepted.world, [
    createScheduledTrainingSession({ id: 't:training', teamId: fixture.youth.id, date, startTime: '10:00', durationMinutes: 60, scope: 'team', definitionId: 'threePoint', intensity: 'normal' }),
    createScheduledTrainingSession({ id: 't:independent', teamId: fixture.youth.id, date, startTime: '12:00', durationMinutes: 60, scope: 'team', definitionId: 'teamCohesion', intensity: 'normal' }),
  ])
  return { ...fixture, world, date, playerId: accepted.playerId }
}
