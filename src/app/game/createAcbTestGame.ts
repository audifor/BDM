import { initializeBoardState } from '@/engine/board'
import { generateRoundRobinSchedule } from '@/engine/competition/schedule'
import { ensurePlayerKnowledge, generateCoachRpgProfiles, generateStaffSandbox } from '@/engine/world'
import { generateCanonicalDevelopmentProfile, generateCanonicalRatings } from '@/engine/world/CanonicalPlayerTruthGenerator'
import { generatePlayerBio } from '@/engine/world/PlayerBioGenerator'
import { generateInitialPlayerContract } from '@/engine/world/PlayerContractGenerator'
import { generateInitialTeamFinances } from '@/engine/world/TeamFinancesGenerator'
import { createCoach } from '@/domain/coach'
import { createDefaultStaffReputationProfile } from '@/domain/staffReputation'
import { createStaffContract, staffContractIdFromString } from '@/domain/staffContract'
import { calculateStaffRoleProficiencyByRoleId, staffRoleDefinition, type StaffPerson, type StaffRoleId } from '@/domain/staff'
import { createCompetition, defaultLeagueCompetitionRules } from '@/domain/competition'
import { createCountry } from '@/domain/country'
import { createGameDate } from '@/domain/date'
import { createSportsEcosystem, DEFAULT_FIBA_LIKE_ECOSYSTEM_ID } from '@/domain/ecosystem'
import type { Game } from '@/domain/game'
import {
  coachIdFromString,
  competitionIdFromString,
  countryIdFromString,
  playerIdFromString,
  seasonIdFromString,
  teamIdFromString,
} from '@/domain/ids'
import { calculateAge, createPlayer } from '@/domain/player'
import { createSeason } from '@/domain/season'
import { createTeam } from '@/domain/team'
import { createGameWorld, type GameWorld } from '@/domain/world'
import type { CoachRpgPreset } from '@/domain/coachRpg'
import { ACB_2026_27_TEAMS, ACB_QUICK_START_TEAM_KEY } from '@/data/acb2026'

const ACB_SEED = 20_260_827
const SPAIN_ID = countryIdFromString('acb-country-spain')
const UNKNOWN_COUNTRY_ID = countryIdFromString('acb-country-unknown')
const COMPETITION_ID = competitionIdFromString('acb-competition-liga-endesa-2026-27')
const SEASON_ID = seasonIdFromString('acb-season-2026-27')
const CURRENT_DATE = createGameDate(2026, 9, 19)
const SEASON_START = createGameDate(2026, 9, 26)
const SEASON_END = createGameDate(2027, 5, 23)
const USER_COACH_ID = coachIdFromString('acb-user-coach')

export interface CreateAcbTestGameOptions {
  readonly userTeamKey?: string
  readonly coachRpgPreset?: CoachRpgPreset
}

/**
 * Creates a development-only ACB universe using the generic BDM FIBA-like engine.
 * Recognizable club/player/head-coach names sit beside a deliberately broad synthetic Staff sandbox.
 */
export function createAcbTestGame(options: CreateAcbTestGameOptions = {}): GameWorld {
  const userTeamKey = options.userTeamKey ?? ACB_QUICK_START_TEAM_KEY
  const selectedDefinition = ACB_2026_27_TEAMS.find((team) => team.key === userTeamKey)
  if (selectedDefinition === undefined) throw new RangeError(`Unknown ACB test team: ${userTeamKey}`)

  const countries = [
    createCountry({ id: SPAIN_ID, name: 'Spain', code: 'ESP' }),
    createCountry({ id: UNKNOWN_COUNTRY_ID, name: 'Unknown', code: 'UNK' }),
  ]
  const userCoach = createCoach({ id: USER_COACH_ID, firstName: 'BDM', lastName: 'Test Coach', gender: 'male', nationalityId: SPAIN_ID })
  const aiCoaches = ACB_2026_27_TEAMS
    .filter((team) => team.key !== userTeamKey)
    .map((team) => {
      const name = splitPersonName(team.headCoachName)
      return createCoach({
        id: coachIdFromString(`acb-coach-${team.key}`),
        firstName: name.firstName,
        lastName: name.lastName,
        gender: 'male',
        nationalityId: UNKNOWN_COUNTRY_ID,
      })
    })
  const players = ACB_2026_27_TEAMS.flatMap((team) =>
    team.players.map(([name, position], playerIndex) => {
      const id = playerIdFromString(`acb-player-${team.key}-${String(playerIndex + 1).padStart(2, '0')}`)
      const personName = splitPersonName(name)
      const bio = generatePlayerBio(id, position, CURRENT_DATE)
      const ratings = generateCanonicalRatings(ACB_SEED, id, position)
      return createPlayer({
        id,
        ...personName,
        gender: 'male',
        nationalityId: UNKNOWN_COUNTRY_ID,
        basketball: { primaryPosition: position, ratings },
        bio,
        development: generateCanonicalDevelopmentProfile(ACB_SEED, id, ratings, calculateAge(bio.dateOfBirth, CURRENT_DATE)),
      })
    }),
  )

  const teams = ACB_2026_27_TEAMS.map((definition) => {
    const definitionIndex = ACB_2026_27_TEAMS.findIndex((team) => team.key === definition.key)
    const rosterOffset = ACB_2026_27_TEAMS.slice(0, definitionIndex).reduce((sum, team) => sum + team.players.length, 0)
    return createTeam({
      id: teamIdFromString(`acb-team-${definition.key}`),
      name: definition.name,
      gender: 'male',
      countryId: SPAIN_ID,
      rosterPlayerIds: players.slice(rosterOffset, rosterOffset + definition.players.length).map((player) => player.id),
      coachId: definition.key === userTeamKey ? USER_COACH_ID : coachIdFromString(`acb-coach-${definition.key}`),
    })
  })
  const competition = createCompetition({
    id: COMPETITION_ID,
    name: 'Liga Endesa 2026/27 [TEST]',
    gender: 'male',
    participantTeamIds: teams.map((team) => team.id),
    rules: defaultLeagueCompetitionRules,
    ecosystemId: DEFAULT_FIBA_LIKE_ECOSYSTEM_ID,
  })
  const season = createSeason({ id: SEASON_ID, competitionId: competition.id, label: '2026/27', startDate: SEASON_START, endDate: SEASON_END })
  const contracts = teams.flatMap((team) =>
    team.rosterPlayerIds.map((playerId) => generateInitialPlayerContract(players.find((player) => player.id === playerId)!, team.id, SEASON_START)),
  )
  const teamFinances = teams.map((team) =>
    generateInitialTeamFinances(
      team.id,
      contracts.filter((contract) => contract.teamId === team.id).reduce((sum, contract) => sum + contract.compensation.annualSalary, 0),
    ),
  )
  const freeAgentCoaches = Array.from({ length: 5 }, (_, index) => createCoach({ id: coachIdFromString(`acb-free-agent-head-coach-${index + 1}`), firstName: 'Free', lastName: `Coach ${index + 1}`, gender: 'male', nationalityId: SPAIN_ID }))
  const coaches = [userCoach, ...aiCoaches, ...freeAgentCoaches]
  const staffSandbox = generateStaffSandbox({ teams, assignedOn: CURRENT_DATE, idPrefix: 'acb-staff-sandbox-v1' })
  const assignmentsByStaffId = new Map(staffSandbox.assignments.map((assignment) => [assignment.staffPersonId, assignment]))
  const staffEmploymentByStaffId = Object.fromEntries(staffSandbox.people.map((person) => {
    const assignment = assignmentsByStaffId.get(person.id)
    return [person.id, assignment === undefined ? { status: 'unemployed' as const } : { status: 'employed' as const, teamId: assignment.teamId, roleId: assignment.role, startedOn: assignment.assignedOn }]
  }))
  const staffCareerHistoryByStaffId = Object.fromEntries(staffSandbox.people.map((person) => {
    const assignment = assignmentsByStaffId.get(person.id)
    return [person.id, assignment === undefined ? [] : [{ kind: 'appointment' as const, staffId: person.id, teamId: assignment.teamId, roleId: assignment.role, date: assignment.assignedOn, reason: 'initialAppointment' as const }]]
  }))
  const staffReputationProfilesByStaffId = Object.fromEntries(staffSandbox.people.map((person) => [person.id, createDefaultStaffReputationProfile()]))
  const staffContracts = staffSandbox.assignments.map((assignment) => {
    const staff = staffSandbox.people.find((person) => person.id === assignment.staffPersonId)!
    return createStaffContract({ id: staffContractIdFromString(`acb-staff-contract:${staff.id}:${assignment.teamId}`), staffId: staff.id, teamId: assignment.teamId, kind: 'standard', term: { startsOn: CURRENT_DATE, expiresOn: createGameDate(2028, 6, 30) }, compensation: { annualSalary: initialStaffSalary(staff, assignment.role) } })
  })
  const financedTeams = teamFinances.map((finance) => {
    const staffPayroll = staffContracts.filter((contract) => contract.teamId === finance.teamId).reduce((sum, contract) => sum + contract.compensation.annualSalary, 0)
    return { ...finance, staffSalaryBudget: Math.max(finance.staffSalaryBudget, staffPayroll + 250_000) }
  })
  const coachProfiles = generateCoachRpgProfiles(coaches, USER_COACH_ID, options.coachRpgPreset)
  const userTeam = teams.find((team) => team.coachId === USER_COACH_ID)!

  const buildWorld = (games: readonly Game[]) =>
    createGameWorld({
      currentDate: CURRENT_DATE,
      currentSeasonId: season.id,
      userCoachId: USER_COACH_ID,
      countries,
      coaches,
      players,
      teams,
      competitions: [competition],
      ecosystems: [createSportsEcosystem({ id: DEFAULT_FIBA_LIKE_ECOSYSTEM_ID, name: 'ACB Test Ecosystem', kind: 'fibaLike', category: 'men' })],
      seasons: [season],
      games,
      contracts,
      teamFinances: financedTeams,
      staffPeople: staffSandbox.people,
      teamStaffAssignments: staffSandbox.assignments,
      staffEmploymentByStaffId,
      staffCareerHistoryByStaffId,
      staffReputationProfilesByStaffId,
      staffContracts,
      coachProfessionalProfilesByCoachId: coachProfiles.professionalProfiles,
      coachRpgProfilesByCoachId: coachProfiles.rpgProfiles,
    })

  let world = buildWorld([])
  world = buildWorld(generateRoundRobinSchedule({ world, seasonId: season.id, daysBetweenRounds: 7 }))
  world = ensurePlayerKnowledge(world)
  return initializeBoardState(world, userTeam.id)
}

function initialStaffSalary(staff: StaffPerson, roleId: StaffRoleId): number {
  const baseBySeniority = { junior: 45_000, standard: 65_000, senior: 90_000, director: 130_000 } as const
  const base = baseBySeniority[staffRoleDefinition(roleId).seniority]
  const proficiency = calculateStaffRoleProficiencyByRoleId(staff, roleId)
  return Math.round((base * (0.8 + proficiency / 250)) / 1_000) * 1_000
}

function splitPersonName(value: string): { readonly firstName: string; readonly lastName: string } {
  const [firstName, ...rest] = value.trim().split(/\s+/)
  return { firstName: firstName!, lastName: rest.join(' ') || firstName! }
}
