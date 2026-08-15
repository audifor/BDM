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
import { calculateAge, createPlayer } from '@/domain/player'
import { requireGender, type BasketballPosition, type Gender } from '@/domain/primitives'
import { createSeason } from '@/domain/season'
import { createTeam } from '@/domain/team'
import { createGameWorld, type GameWorld } from '@/domain/world'
import { hashStringToSeed, SeededRandomSource, type RandomSource } from '@/engine/random'
import { generatePlayerBio } from './PlayerBioGenerator'
import { generatePlayerPotential } from './PlayerPotentialGenerator'
import { generateInitialPlayerContract } from './PlayerContractGenerator'
import { generateInitialTeamFinances } from './TeamFinancesGenerator'
import { generateInitialStaffStructure } from './StaffGenerator'
import { generateCoachRpgProfiles } from './CoachProfessionalProfileGenerator'
import type { CoachRpgPreset } from '@/domain/coachRpg'

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
  readonly userCoachRpgPreset?: CoachRpgPreset
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
  const players: ReturnType<typeof createPlayer>[] = []
  const teams = []

  for (let teamIndex = 0; teamIndex < TEAM_COUNT; teamIndex += 1) {
    const rosterPlayerIds = []
    for (let playerIndex = 0; playerIndex < PLAYERS_PER_TEAM; playerIndex += 1) {
      const sequence = teamIndex * PLAYERS_PER_TEAM + playerIndex + 1
      const playerId = playerIdFromString(`generated-player-${formatSequence(sequence)}`)
      const basketball = generateBasketballProfile(options.seed, playerId, playerIndex)
      const bio = generatePlayerBio(playerId, ROSTER_POSITIONS[playerIndex]!, startDate)
      const player = createPlayer({
        id: playerId,
        ...generatePersonName(random),
        gender,
        nationalityId: country.id,
        basketball,
        bio,
        potential: generatePlayerPotential(playerId, basketball.ratings, calculateAge(bio.dateOfBirth, startDate)),
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

  const contracts = teams.flatMap((team) => team.rosterPlayerIds.map((playerId) => generateInitialPlayerContract(players.find((player) => player.id === playerId)!, team.id, season.startDate)))
  const staff = generateInitialStaffStructure(teams, season.startDate)
  const userCoachId = coaches[0]!.id
  const coachProfiles = generateCoachRpgProfiles(coaches, userCoachId, options.userCoachRpgPreset)
  return createGameWorld({
    currentDate: startDate,
    currentSeasonId: season.id,
    userCoachId,
    countries: [country],
    coaches,
    players,
    teams,
    competitions: [competition],
    seasons: [season],
    games: [],
    contracts,
    teamFinances: teams.map((team) => generateInitialTeamFinances(team.id, contracts.filter((contract) => contract.teamId === team.id).reduce((sum, contract) => sum + contract.compensation.annualSalary, 0))),
    staffPeople: staff.map((item) => item.person), teamStaffAssignments: staff.map((item) => item.assignment),
    coachProfessionalProfilesByCoachId: coachProfiles.professionalProfiles,
    coachRpgProfilesByCoachId: coachProfiles.rpgProfiles,
  })
}

const ROSTER_POSITIONS: readonly BasketballPosition[] = ['PG','PG','SG','SG','SG','SF','SF','PF','PF','PF','C','C']
function generateBasketballProfile(seed:number, playerId:string, rosterIndex:number) {
  const random=new SeededRandomSource(hashStringToSeed(`player-ratings-v1:${seed}:${playerId}`)); const primaryPosition=ROSTER_POSITIONS[rosterIndex]!; const bases={PG:[52,58,68,54,43,43,56],SG:[55,66,52,55,44,45,57],SF:[57,57,53,56,52,52,58],PF:[60,51,48,50,63,65,55],C:[62,48,43,46,70,70,52]} as const; const [finishing,shooting,playmaking,perimeterDefense,interiorDefense,rebounding,athleticism]=bases[primaryPosition]; const talent=random.nextInt(-8,8); const rate=(base:number)=>Math.max(0,Math.min(100,base+talent+random.nextInt(-10,10))); return {primaryPosition,ratings:{finishing:rate(finishing),shooting:rate(shooting),playmaking:rate(playmaking),perimeterDefense:rate(perimeterDefense),interiorDefense:rate(interiorDefense),rebounding:rate(rebounding),athleticism:rate(athleticism)}}
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
