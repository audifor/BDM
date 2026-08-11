import { createCoach } from '@/domain/coach'
import { createCompetition } from '@/domain/competition'
import { createCountry } from '@/domain/country'
import { addDays, createGameDate, formatGameDate, type GameDate } from '@/domain/date'
import {
  coachIdFromString,
  competitionIdFromString,
  countryIdFromString,
  playerIdFromString,
  seasonIdFromString,
  teamIdFromString,
} from '@/domain/ids'
import { createPlayer } from '@/domain/player'
import { requireGender, type Gender } from '@/domain/primitives'
import { createSeason } from '@/domain/season'
import { createTeam } from '@/domain/team'
import { createGameWorld, type GameWorld } from '@/domain/world'
import { SeededRandomSource, type RandomSource } from '@/engine/random'

const TEAM_COUNT = 8
const PLAYERS_PER_TEAM = 12
const GENERATED_COUNTRY_ID = countryIdFromString('generated-country-0001')
const GENERATED_COMPETITION_ID = competitionIdFromString('generated-competition-0001')
const GENERATED_SEASON_ID = seasonIdFromString('generated-season-0001')
const DEFAULT_START_DATE = createGameDate(2032, 10, 1)
const SEASON_LENGTH_DAYS = 272

const FIRST_NAMES = [
  'Arel',
  'Bren',
  'Cira',
  'Daro',
  'Eris',
  'Falen',
  'Galen',
  'Hira',
  'Iven',
  'Jora',
] as const

const LAST_NAMES = [
  'Arden',
  'Bexley',
  'Corven',
  'Dain',
  'Elian',
  'Farrow',
  'Grove',
  'Hale',
  'Istra',
  'Joren',
] as const

const TEAM_NAMES = [
  'Ashvale Kites',
  'Brimford Stars',
  'Cinderbay Owls',
  'Dunmere Orbits',
  'Emberfield Arrows',
  'Frosthaven Drakes',
  'Glimmerport Stags',
  'Highridge Lanterns',
  'Ironhollow Vipers',
  'Juniper Coast Sails',
] as const

export interface GenerateWorldOptions {
  readonly seed: number
  readonly gender: Gender
  readonly startDate?: GameDate
}

/** Generates the fixed-size starter universe used by development and tests. */
export function generateWorld(options: GenerateWorldOptions): GameWorld {
  const random = new SeededRandomSource(options.seed)
  return generateWorldFromRandom(options, random)
}

function generateWorldFromRandom(options: GenerateWorldOptions, random: RandomSource): GameWorld {
  const gender = requireGender(options.gender)
  const startDate = options.startDate ?? DEFAULT_START_DATE
  const endDate = addDays(startDate, SEASON_LENGTH_DAYS)
  const country = createCountry({
    id: GENERATED_COUNTRY_ID,
    name: 'Virelia',
    code: 'VIR',
  })

  // The order of random calls is intentional: coaches, team names, then players.
  const coaches = Array.from({ length: TEAM_COUNT }, (_, index) =>
    createCoach({
      id: coachIdFromString(`generated-coach-${formatSequence(index + 1)}`),
      ...generatePersonName(random),
      gender,
      nationalityId: country.id,
    }),
  )
  const teamNames = shuffle([...TEAM_NAMES], random).slice(0, TEAM_COUNT)
  const players = []
  const teams = []

  for (let teamIndex = 0; teamIndex < TEAM_COUNT; teamIndex += 1) {
    const rosterPlayerIds = []
    for (let playerIndex = 0; playerIndex < PLAYERS_PER_TEAM; playerIndex += 1) {
      const sequence = teamIndex * PLAYERS_PER_TEAM + playerIndex + 1
      const player = createPlayer({
        id: playerIdFromString(`generated-player-${formatSequence(sequence)}`),
        ...generatePersonName(random),
        gender,
        nationalityId: country.id,
        // TODO(014B): replace this contract-compatibility profile with deterministic generation.
        basketball: createTemporaryBasketballProfile(),
      })
      players.push(player)
      rosterPlayerIds.push(player.id)
    }

    teams.push(
      createTeam({
        id: teamIdFromString(`generated-team-${formatSequence(teamIndex + 1)}`),
        name: teamNames[teamIndex]!,
        gender,
        countryId: country.id,
        rosterPlayerIds,
        coachId: coaches[teamIndex]!.id,
      }),
    )
  }

  const competition = createCompetition({
    id: GENERATED_COMPETITION_ID,
    name: 'Virelia Horizon League',
    gender,
    participantTeamIds: teams.map((team) => team.id),
  })
  const season = createSeason({
    id: GENERATED_SEASON_ID,
    competitionId: competition.id,
    label: `${formatGameDate(startDate)} to ${formatGameDate(endDate)}`,
    startDate,
    endDate,
  })

  return createGameWorld({
    currentDate: startDate,
    userCoachId: coaches[0]!.id,
    countries: [country],
    coaches,
    players,
    teams,
    competitions: [competition],
    seasons: [season],
    games: [],
  })
}

function createTemporaryBasketballProfile() {
  return { primaryPosition: 'PG' as const, ratings: { finishing: 50, shooting: 50, playmaking: 50, perimeterDefense: 50, interiorDefense: 50, rebounding: 50, athleticism: 50 } }
}

function generatePersonName(random: RandomSource): { firstName: string; lastName: string } {
  return {
    firstName: random.pick(FIRST_NAMES),
    lastName: random.pick(LAST_NAMES),
  }
}

function shuffle<Item>(items: Item[], random: RandomSource): Item[] {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = random.nextInt(0, index)
    ;[items[index], items[swapIndex]] = [items[swapIndex]!, items[index]!]
  }

  return items
}

function formatSequence(value: number): string {
  return value.toString().padStart(4, '0')
}
