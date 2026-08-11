import type { CreateGameWorldInput } from './GameWorld'
import { createCoach } from '@/domain/coach'
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
  teamIdFromString,
} from '@/domain/ids'
import { createPlayer } from '@/domain/player'
import { createSeason } from '@/domain/season'
import { createTeam } from '@/domain/team'

export function createValidGameWorldInput(): CreateGameWorldInput {
  const country = createCountry({
    id: countryIdFromString('country-a'),
    name: 'Arcadia',
    code: 'ARC',
  })
  const coach = createCoach({
    id: coachIdFromString('coach-user'),
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
  })
  const awayPlayer = createPlayer({
    id: playerIdFromString('player-away'),
    firstName: 'Noa',
    lastName: 'Vale',
    gender: 'female',
    nationalityId: country.id,
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
  }
}
