import { createCoach, coachProfileRefsForCoachId } from '@/domain/coach'
import { createCompetition, defaultLeagueCompetitionRules } from '@/domain/competition'
import { createCountry } from '@/domain/country'
import { parseGameDate } from '@/domain/date'
import { createSportsEcosystem } from '@/domain/ecosystem'
import {
  coachIdFromString, competitionIdFromString, countryIdFromString,
  playerIdFromString, teamStaffAssignmentIdFromString,
} from '@/domain/ids'
import { calculateAge, createPlayer } from '@/domain/player'
import { createSeason } from '@/domain/season'
import { createStaffPerson, type StaffPerson, type TeamStaffAssignment } from '@/domain/staff'
import type { StaffEmployment } from '@/domain/staffCareer'
import type { StaffPersonId } from '@/domain/ids'
import { createTeam } from '@/domain/team'
import { createGameWorld, updateGameWorld, type GameWorld } from '@/domain/world'
import { generateNcaaConfiguredSchedule, type NcaaGeneratedSchedulePolicy } from '@/engine/competition/schedule'
import { defaultRecruitingRules } from '@/domain/recruiting'
import { generateCanonicalRatings, generateCanonicalDevelopmentProfile } from '@/engine/world/CanonicalPlayerTruthGenerator'
import { generatePlayerBio } from '@/engine/world/PlayerBioGenerator'
import { generatePersonName } from '@/engine/world/GeneratedPersonName'
import { generateAiCoachProfessionalProfile, createUserCoachRookieProfessionalProfile } from '@/engine/world/CoachProfessionalProfileGenerator'
import { hashStringToSeed, SeededRandomSource } from '@/engine/random'
import { buildNcaaD1Real2026ConferenceSnapshot, type NcaaD1RealGender } from './NcaaD1Real2026Conferences'
import { projectNcaaD1Real2026Fixtures, type NcaaD1Real2026FixtureSource, type NcaaD1Real2026FixtureProjection } from './NcaaD1Real2026Fixtures'

const POSITIONS = ['PG', 'SG', 'SF', 'SF', 'PF', 'C', 'C'] as const
const USA = countryIdFromString('country:USA')
const START = parseGameDate('2026-10-01')
const END = parseGameDate('2027-06-30')

export interface NcaaD1Real2026WorldSeedOptions {
  readonly gender: NcaaD1RealGender
  readonly seed: number
  readonly managedProgramId: string
  /** Existing historical fixtures remain optional and cannot be mixed with a generated schedule. */
  readonly sourcedFixtures?: readonly NcaaD1Real2026FixtureSource[]
  readonly generatedSchedule?: NcaaGeneratedSchedulePolicy
}

export interface NcaaD1Real2026NativeSeed {
  /** A real GameWorld, but NOT a complete 2026-27 playing season or NCAA certified career. */
  readonly world: GameWorld
  /** Source provenance is retained outside GameWorld's pure Game DTO; a future
   * persisted edition evidence store must carry it across saves. */
  readonly sourceEvidenceByGameId: NcaaD1Real2026FixtureProjection['evidenceByGameId']
  readonly fixtureCoverage: 'PARTIAL_OFFICIALLY_SOURCED' | 'GENERATED_FROM_EXPLICIT_CONFERENCE_RULES'
  readonly membershipCoverage: 'SECONDARY_DIRECTORY_PENDING_PRIMARY_VERIFICATION'
  readonly sportingFormatCoverage: 'NCAA_EXISTING_ENGINE_NOT_FULLY_CONNECTED'
}

/** Real 2026-27 NCAA Division I school identities with BDM-generated people.
 *
 * Build a complete 7-player baseline roster for every actual program and a
 * generated head coach for each team using the existing canonical player/staff
 * profile and recruiting systems. All 365/363 teams are present. Games are
 * either explicitly sourced fixtures or generated from supplied rules.
 *
 * This does not certify an official schedule, conference championship,
 * 76-team field selection or a complete playable NCAA season. In particular
 * the generic CompetitionRules shape is not an NCAA season scheduler.
 */
export function createNcaaD1Real2026WorldSeed(options: NcaaD1Real2026WorldSeedOptions): NcaaD1Real2026NativeSeed {
  if (!Number.isSafeInteger(options.seed)) throw new RangeError('NCAA generated profiles require an integer seed')
  if (options.generatedSchedule !== undefined && (options.sourcedFixtures?.length ?? 0) > 0) throw new Error('NCAA generated and historical schedules cannot be mixed')
  if (options.generatedSchedule === undefined && options.sourcedFixtures === undefined) throw new Error('NCAA requires explicit generated rules or source fixtures')
  const snapshot = buildNcaaD1Real2026ConferenceSnapshot(options.gender)
  const managed = snapshot.teams.find(team => team.id === options.managedProgramId)
  if (!managed) throw new Error('NCAA manager selection must be a current program in the chosen gender')
  const country = createCountry({ id: USA, name: 'United States', code: 'USA' })
  const coaches = []
  const players = []
  const teams = []
  const staffPeople: StaffPerson[] = []
  const teamStaffAssignments: TeamStaffAssignment[] = []
  const staffEmploymentByStaffId: Record<StaffPersonId, StaffEmployment> = {}
  for (const school of snapshot.teams) {
    const coachId = coachIdFromString('coach:BDM:' + school.id)
    const coachRefs = coachProfileRefsForCoachId(coachId)
    const coachName = generatePersonName(new SeededRandomSource(hashStringToSeed('ncaa-coach-name:' + options.seed + ':' + school.id)))
    const coach = createCoach({
      id: coachId, ...coachRefs, ...coachName,
      gender: school.gender, nationalityId: USA,
    })
    coaches.push(coach)
    staffPeople.push(createStaffPerson({
      id: coach.staffProfileId, personId: coach.personId,
      identity: { firstName: coach.firstName, lastName: coach.lastName, nationality: USA },
      professional: school.id === managed.id ? createUserCoachRookieProfessionalProfile() : generateAiCoachProfessionalProfile(coachId),
      marketRole: 'headCoach', roleFamily: 'coaching',
    }))
    const assignment: TeamStaffAssignment = {
      id: teamStaffAssignmentIdFromString('staff-assignment:' + coach.staffProfileId + ':' + school.id + ':headCoach:2026-27'),
      staffPersonId: coach.staffProfileId, teamId: school.id, role: 'headCoach', assignedOn: START,
    }
    teamStaffAssignments.push(assignment)
    staffEmploymentByStaffId[coach.staffProfileId] = { status: 'employed', teamId: school.id, roleId: 'headCoach', startedOn: START }
    const rosterPlayerIds = []
    for (let slot = 0; slot < POSITIONS.length; slot++) {
      const id = playerIdFromString('player:BDM:ncaa:2026-27:' + school.id + ':' + String(slot + 1))
      const pos = POSITIONS[slot]!
      const ratings = generateCanonicalRatings(options.seed, id, pos)
      // BDM identities and attributes are generated, never represented as
      // historical or current official NCAA student-athletes.
      const bio = generatePlayerBio(id, pos, START, 2005 + (slot % 4))
      const name = generatePersonName(new SeededRandomSource(hashStringToSeed('ncaa-player-name:' + options.seed + ':' + id)))
      players.push(createPlayer({
        id, ...name, gender: school.gender, nationalityId: USA,
        basketball: { primaryPosition: pos, ratings }, bio,
        development: generateCanonicalDevelopmentProfile(options.seed, id, ratings, calculateAge(bio.dateOfBirth, START)),
      }))
      rosterPlayerIds.push(id)
    }
    teams.push(createTeam({
      id: school.id, name: school.name, gender: school.gender,
      countryId: USA, coachId, rosterPlayerIds,
    }))
  }

  const competitionId = competitionIdFromString('competition:USA:ncaa-d1-' + options.gender + ':regular-season')
  const competition = createCompetition({
    id: competitionId, name: '2026-27 NCAA Division I ' + (options.gender === 'men' ? 'Men' : 'Women'),
    gender: managed.gender, ecosystemId: snapshot.ecosystemId,
    participantTeamIds: teams.map(team => team.id),
    // This old generic data interface requires a leagueRoundRobin field.
    // It must NEVER be used to infer NCAA fixtures; generation requires an
    // explicit per-conference policy.
    rules: { ...defaultLeagueCompetitionRules, gameFormat: snapshot.gameFormat },
  })
  const season = createSeason({
    id: snapshot.seasonId, competitionId,
    label: '2026-27 NCAA Division I ' + options.gender,
    startDate: START, endDate: END,
    participantTeamIds: teams.map(team => team.id),
    conferenceMembershipSnapshot: snapshot.memberships,
  })
  const evidence = projectNcaaD1Real2026Fixtures(options.gender, options.sourcedFixtures ?? [])
  let world = createGameWorld({
    currentDate: START, currentSeasonId: snapshot.seasonId,
    userCoachId: coachIdFromString('coach:BDM:' + managed.id),
    countries: [country], coaches, players, teams,
    competitions: [competition],
    ecosystems: [createSportsEcosystem({
      id: snapshot.ecosystemId, name: 'NCAA Division I ' + options.gender,
      kind: 'ncaaLike', category: options.gender, recruitingRules: defaultRecruitingRules,
    })],
    conferences: snapshot.conferences, conferenceMemberships: snapshot.memberships,
    seasons: [season], games: evidence.games,
    staffPeople, teamStaffAssignments, staffEmploymentByStaffId,
  })
  if (options.generatedSchedule !== undefined) {
    world = updateGameWorld(world, { games: generateNcaaConfiguredSchedule(world, season.id, options.generatedSchedule) })
  }
  return {
    world,
    sourceEvidenceByGameId: evidence.evidenceByGameId,
    fixtureCoverage: options.generatedSchedule === undefined ? 'PARTIAL_OFFICIALLY_SOURCED' : 'GENERATED_FROM_EXPLICIT_CONFERENCE_RULES',
    membershipCoverage: 'SECONDARY_DIRECTORY_PENDING_PRIMARY_VERIFICATION',
    sportingFormatCoverage: 'NCAA_EXISTING_ENGINE_NOT_FULLY_CONNECTED',
  }
}
