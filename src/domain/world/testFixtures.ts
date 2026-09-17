import type { CreateGameWorldInput } from './GameWorld'
import { coachProfileRefsForCoachId, createCoach } from '@/domain/coach'
import { createCompetition } from '@/domain/competition'
import { createCountry } from '@/domain/country'
import { createGameDate } from '@/domain/date'
import { createGame } from '@/domain/game'
import {
  coachIdFromString,
  competitionIdFromString,
  countryIdFromString,
  gameIdFromString,
  playerIdFromString,
  seasonIdFromString,
  teamStaffAssignmentIdFromString,
  teamIdFromString,
} from '@/domain/ids'
import { createPlayer } from '@/domain/player'
import { createTestBasketballProfile, createTestPlayerBio } from '@/domain/player/testFixtures'
import { createSeason } from '@/domain/season'
import { createStaffPerson, STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { createTeam } from '@/domain/team'

export function createValidGameWorldInput(): CreateGameWorldInput {
  const country = createCountry({
    id: countryIdFromString('country-a'),
    name: 'Arcadia',
    code: 'ARC',
  })
  const coachId = coachIdFromString('coach-user')
  const coach = createCoach({
    id: coachId,
    ...coachProfileRefsForCoachId(coachId),
    firstName: 'Jordan',
    lastName: 'Reyes',
    gender: 'male',
    nationalityId: country.id,
  })
  const homePlayer = createPlayer({
    id: playerIdFromString('player-home'),
    firstName: 'Ari',
    lastName: 'Stone',
    gender: 'female',
    nationalityId: country.id,
    basketball: createTestBasketballProfile(),
    bio: createTestPlayerBio(),
  })
  const awayPlayer = createPlayer({
    id: playerIdFromString('player-away'),
    firstName: 'Noa',
    lastName: 'Vale',
    gender: 'female',
    nationalityId: country.id,
    basketball: createTestBasketballProfile(),
    bio: createTestPlayerBio(),
  })
  const homeTeam = createTeam({
    id: teamIdFromString('team-home'),
    name: 'Arcadia Owls',
    gender: 'female',
    countryId: country.id,
    rosterPlayerIds: [homePlayer.id],
    coachId: coach.id,
  })
  const awayTeam = createTeam({
    id: teamIdFromString('team-away'),
    name: 'Arcadia Foxes',
    gender: 'female',
    countryId: country.id,
    rosterPlayerIds: [awayPlayer.id],
  })
  const competition = createCompetition({
    id: competitionIdFromString('competition-a'),
    name: 'Arcadia League',
    gender: 'female',
    participantTeamIds: [homeTeam.id, awayTeam.id],
  })
  const season = createSeason({
    id: seasonIdFromString('season-a'),
    competitionId: competition.id,
    label: '2032-33',
    startDate: createGameDate(2032, 10, 1),
    endDate: createGameDate(2033, 5, 31),
  })
  const game = createGame({
    id: gameIdFromString('game-a'),
    seasonId: season.id,
    competitionId: competition.id,
    date: createGameDate(2032, 10, 1),
    homeTeamId: homeTeam.id,
    awayTeamId: awayTeam.id,
    status: 'scheduled',
    result: null,
  })
  const coachStaff = createStaffPerson({ id: coach.staffProfileId, personId: coach.personId, identity: { firstName: coach.firstName, lastName: coach.lastName, nationality: country.id }, professional: { attributes: Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 50])) as never }, marketRole: 'headCoach', roleFamily: 'coaching' })
  const coachAssignment = { id: teamStaffAssignmentIdFromString(`staff-assignment:${coach.id}:headCoach:${homeTeam.id}:${season.startDate}`), staffPersonId: coach.staffProfileId, teamId: homeTeam.id, role: 'headCoach' as const, assignedOn: season.startDate }

  return {
    currentDate: createGameDate(2032, 10, 1),
    userCoachId: coach.id,
    countries: [country],
    coaches: [coach],
    players: [homePlayer, awayPlayer],
    teams: [homeTeam, awayTeam],
    competitions: [competition],
    seasons: [season],
    games: [game],
    staffPeople: [coachStaff],
    teamStaffAssignments: [coachAssignment],
    staffEmploymentByStaffId: { [coach.staffProfileId]: { status: 'employed', teamId: homeTeam.id, roleId: 'headCoach', startedOn: season.startDate } },
  }
}
