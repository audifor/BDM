import { createCoach } from '@/domain/coach'
import { createCompetition } from '@/domain/competition'
import { createSportsEcosystem, DEFAULT_FIBA_LIKE_ECOSYSTEM_ID, DEFAULT_NBA_LIKE_ECOSYSTEM_ID, DEFAULT_NCAA_LIKE_ECOSYSTEM_ID } from '@/domain/ecosystem'
import { createConference, createConferenceMembership } from '@/domain/conference'
import { createCountry } from '@/domain/country'
import { addDays, createGameDate, formatGameDate, type GameDate } from '@/domain/date'
import {
  coachIdFromString,
  competitionIdFromString,
  countryIdFromString,
  conferenceIdFromString,
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
import { createNbaLikeSalaryRules } from '@/engine/salary'
import { createNbaLikeTradeRules } from '@/engine/trade'

const FIBA_TEAM_COUNT = 8
const PLAYERS_PER_TEAM = 12
const GENERATED_COUNTRY_ID = countryIdFromString('generated-country-0001')
const GENERATED_COMPETITION_ID = competitionIdFromString('generated-competition-0001')
const GENERATED_NBA_COMPETITION_ID = competitionIdFromString('generated-competition-0003')
const GENERATED_NCAA_COMPETITION_ID = competitionIdFromString('generated-competition-0004')
const GENERATED_SEASON_ID = seasonIdFromString('generated-season-0001')
const GENERATED_NBA_SEASON_ID = seasonIdFromString('generated-season-0003')
const GENERATED_NCAA_SEASON_ID = seasonIdFromString('generated-season-0005')
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
  'Kestrel Point Comets',
  'Larkspur Forge',
  'Moonvale Pilots', 'Northgate Echoes', 'Oakridge Flares', 'Pinecrest Lynx', 'Quartz Harbor Rays', 'Ravenfall Rooks', 'Stonebridge Arcs', 'Tidewater Falcons', 'Umberfield Foxes', 'Verdant Vale Owls', 'Westmere Wolves', 'Zephyr Bay Gulls',
] as const

export interface GenerateWorldOptions {
  readonly seed: number
  readonly gender: Gender
  readonly startDate?: GameDate
  readonly userCoachRpgPreset?: CoachRpgPreset
  readonly includeNbaLike?: boolean
  readonly includeNcaaLike?: boolean
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
  const includeNcaaLike = options.includeNcaaLike ?? false
  const teamCount = FIBA_TEAM_COUNT + (options.includeNbaLike ? 4 : 0) + (includeNcaaLike ? 12 : 0)
  const professionalTeamCount = FIBA_TEAM_COUNT + (options.includeNbaLike ? 4 : 0)
  const coaches = Array.from({ length: teamCount }, (_, index) =>
    createCoach({
      id: coachIdFromString(`generated-coach-${formatSequence(index + 1)}`),
      ...generatePersonName(random),
      gender,
      nationalityId: country.id,
    }),
  )
  const baseTeamNames = shuffle([...TEAM_NAMES.slice(0, options.includeNbaLike ? 12 : 10)], random)
  const ncaaTeamNames = includeNcaaLike ? shuffle([...TEAM_NAMES.slice(12)], new SeededRandomSource(hashStringToSeed(`ncaa-team-names-v1:${options.seed}`))) : []
  const teamNames = [...baseTeamNames, ...ncaaTeamNames].slice(0, teamCount)
  const players: ReturnType<typeof createPlayer>[] = []
  const teams = []

  for (let teamIndex = 0; teamIndex < teamCount; teamIndex += 1) {
    const rosterPlayerIds = []
    const playersForTeam = teamIndex < professionalTeamCount ? PLAYERS_PER_TEAM : 5
    for (let playerIndex = 0; playerIndex < playersForTeam; playerIndex += 1) {
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
    participantTeamIds: teams.slice(0, FIBA_TEAM_COUNT).map((team) => team.id),
  })
  const nbaCompetition = options.includeNbaLike ? createCompetition({ id: GENERATED_NBA_COMPETITION_ID, name: 'Orinthian Comets League', gender, participantTeamIds: teams.slice(FIBA_TEAM_COUNT, FIBA_TEAM_COUNT + 4).map((team) => team.id), ecosystemId: DEFAULT_NBA_LIKE_ECOSYSTEM_ID }) : undefined
  const nbaTeamsEnd = professionalTeamCount
  const ncaaCompetition = includeNcaaLike ? createCompetition({ id: GENERATED_NCAA_COMPETITION_ID, name: 'Asteria Collegiate Circuit', gender, participantTeamIds: teams.slice(nbaTeamsEnd).map((team) => team.id), ecosystemId: DEFAULT_NCAA_LIKE_ECOSYSTEM_ID }) : undefined
  const season = createSeason({
    id: GENERATED_SEASON_ID,
    competitionId: competition.id,
    label: `${formatGameDate(startDate)} to ${formatGameDate(endDate)}`,
    startDate,
    endDate,
  })
  const nbaSeason = nbaCompetition === undefined ? undefined : createSeason({ id: GENERATED_NBA_SEASON_ID, competitionId: nbaCompetition.id, label: `${formatGameDate(addDays(startDate, 19))} to ${formatGameDate(addDays(endDate, 31))}`, startDate: addDays(startDate, 19), endDate: addDays(endDate, 31) })
  const conferences = ncaaCompetition === undefined ? [] : ['Aster', 'Boreal', 'Cinder'].map((name, index) => createConference({ id: conferenceIdFromString(`generated-conference-${formatSequence(index + 1)}`), ecosystemId: DEFAULT_NCAA_LIKE_ECOSYSTEM_ID, name: `${name} Conference` }))
  const ncaaMemberships = ncaaCompetition === undefined ? [] : teams.slice(nbaTeamsEnd).map((team, index) => createConferenceMembership({ conferenceId: conferences[Math.floor(index / 4)]!.id, teamId: team.id, seasonId: GENERATED_NCAA_SEASON_ID }))
  const ncaaSeason = ncaaCompetition === undefined ? undefined : createSeason({ id: GENERATED_NCAA_SEASON_ID, competitionId: ncaaCompetition.id, label: `${formatGameDate(addDays(startDate, 90))} to ${formatGameDate(addDays(startDate, 180))}`, startDate: addDays(startDate, 90), endDate: addDays(startDate, 180), conferenceMembershipSnapshot: ncaaMemberships })

  const professionalTeams = teams.slice(0, nbaTeamsEnd)
  const contracts = professionalTeams.flatMap((team) => team.rosterPlayerIds.map((playerId) => generateInitialPlayerContract(players.find((player) => player.id === playerId)!, team.id, season.startDate)))
  const staff = generateInitialStaffStructure(professionalTeams, season.startDate)
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
    competitions: [competition, ...(nbaCompetition === undefined ? [] : [nbaCompetition]), ...(ncaaCompetition === undefined ? [] : [ncaaCompetition])],
    ecosystems: [createSportsEcosystem({ id: DEFAULT_FIBA_LIKE_ECOSYSTEM_ID, name: 'Virelia Basketball Federation', kind: 'fibaLike' }), ...(nbaCompetition === undefined ? [] : [createSportsEcosystem({ id: DEFAULT_NBA_LIKE_ECOSYSTEM_ID, name: 'Orinthian Franchise Basketball', kind: 'nbaLike' })]), ...(ncaaCompetition === undefined ? [] : [createSportsEcosystem({ id: DEFAULT_NCAA_LIKE_ECOSYSTEM_ID, name: 'Asteria Collegiate Basketball', kind: 'ncaaLike' })])],
    conferences, conferenceMemberships: ncaaMemberships,
    seasons: [season, ...(nbaSeason === undefined ? [] : [nbaSeason]), ...(ncaaSeason === undefined ? [] : [ncaaSeason])],
    games: [],
    contracts,
    teamFinances: teams.map((team) => generateInitialTeamFinances(team.id, contracts.filter((contract) => contract.teamId === team.id).reduce((sum, contract) => sum + contract.compensation.annualSalary, 0))),
    ...(nbaSeason === undefined ? {} : { salaryRulesBySeasonId: { [nbaSeason.id]: createNbaLikeSalaryRules(nbaSeason.id) } }),
    ...(nbaSeason === undefined ? {} : { tradeRulesBySeasonId: { [nbaSeason.id]: createNbaLikeTradeRules(nbaSeason.id, DEFAULT_NBA_LIKE_ECOSYSTEM_ID) } }),
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
