import { createCompetition } from '@/domain/competition'
import { createGame, type Game } from '@/domain/game'
import { parseGameDate, type GameDate } from '@/domain/date'
import { competitionIdFromString, gameIdFromString, seasonIdFromString, type SeasonId, type TeamId } from '@/domain/ids'
import { createSeason } from '@/domain/season'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { calculateStandings } from '@/engine/competition/standings/Standings'
import formatDocuments from '@/data/worlddb-v2/additional-formats.json'
import { getNcaa2027ConferenceChampions } from './NcaaD1Real2027ConferenceTournaments'
import type { NcaaD1RealGender } from './NcaaD1Real2026Conferences'

type Selection = Readonly<{ gender: NcaaD1RealGender; automatic: readonly TeamId[]; atLarge: readonly TeamId[]; seeded: readonly TeamId[] }>
const sourceId = (gender: NcaaD1RealGender) => seasonIdFromString(`season:USA:ncaa-d1-${gender}:2026-27`)
const competitionId = (gender: NcaaD1RealGender) => competitionIdFromString(`competition:USA:ncaa-d1-${gender}:2027:national-championship`)
const tournamentId = (gender: NcaaD1RealGender) => seasonIdFromString(`season:USA:ncaa-d1-${gender}:2027:national-championship`)
const rounds = ['OPENING_ROUND', 'FIRST_ROUND', 'SECOND_ROUND', 'SWEET_16', 'ELITE_EIGHT', 'FINAL_FOUR', 'FINAL'] as const
type NationalRound = typeof rounds[number]
const expected = [12, 32, 16, 8, 4, 2, 1]
const days: Readonly<Record<NcaaD1RealGender, Readonly<Record<NationalRound, readonly GameDate[]>>>> = {
  men: {
    OPENING_ROUND: ['2027-03-16','2027-03-17'], FIRST_ROUND: ['2027-03-18','2027-03-19'],
    SECOND_ROUND: ['2027-03-20','2027-03-21'], SWEET_16: ['2027-03-25','2027-03-26'],
    ELITE_EIGHT: ['2027-03-27','2027-03-28'], FINAL_FOUR: ['2027-04-03'], FINAL: ['2027-04-05'],
  },
  women: {
    OPENING_ROUND: ['2027-03-17','2027-03-18'], FIRST_ROUND: ['2027-03-19','2027-03-20'],
    SECOND_ROUND: ['2027-03-21','2027-03-22'], SWEET_16: ['2027-03-26','2027-03-27'],
    ELITE_EIGHT: ['2027-03-28','2027-03-29'], FINAL_FOUR: ['2027-04-02'], FINAL: ['2027-04-04'],
  },
}

function resultWinner(game: Game): TeamId {
  if (game.status !== 'completed' || game.result.homeScore === game.result.awayScore) throw new Error('NCAA elimination game must have a decisive completed result')
  return game.result.homeScore > game.result.awayScore ? game.homeTeamId : game.awayTeamId
}

/** The two NCAA committees are NOT reproduced: this deterministic BDM fallback
 * ranks ALL regular-season performances, substitutes no fictional teams,
 * and takes 32 authentic simulated conference champions plus 44 at-large.
 * The bracket still follows the published 2027 76-team and 12-game shape.
 */
export function selectNcaa2027Field(world: GameWorld, gender: NcaaD1RealGender): Selection {
  const season = world.seasons[sourceId(gender)]
  if (!season) throw new Error('NCAA national field requires real 2026-27 programmes')
  const games = Object.values(world.games).filter(game => game.seasonId === season.id)
  if (games.length === 0 || games.some(game => game.status !== 'completed')) throw new Error('NCAA national field requires completed regular-season results')
  const automatic = getNcaa2027ConferenceChampions(world, gender)
  if (automatic.length !== 32 || new Set(automatic).size !== 32) throw new Error('NCAA requires 32 distinct conference tournament winners')
  const record = calculateStandings(world, season.id)
  const participantIds = new Set(season.participantTeamIds ?? [])
  if (record.length !== participantIds.size) throw new Error('NCAA national ranking has missing source programmes')
  const sorted = [...record].sort((a,b) => {
    const pctA = a.wins / Math.max(1,a.played), pctB = b.wins / Math.max(1,b.played)
    return pctB - pctA || b.pointDifference / Math.max(1,b.played) - a.pointDifference / Math.max(1,a.played) || a.teamId.localeCompare(b.teamId)
  }).map(row => row.teamId)
  if (automatic.some(team => !participantIds.has(team))) throw new Error('NCAA qualifier is outside gender-specific 2026-27 season')
  const aq = new Set(automatic)
  const atLarge = sorted.filter(id => !aq.has(id)).slice(0,44)
  if (atLarge.length !== 44) throw new Error('NCAA needs 44 separate at-large programmes')
  const selected = new Set([...automatic,...atLarge])
  return Object.freeze({ gender, automatic: Object.freeze([...automatic]), atLarge: Object.freeze(atLarge),
    seeded: Object.freeze(sorted.filter(id => selected.has(id))) })
}

function gamesForStage(world: GameWorld, seasonId: SeasonId, stage: NationalRound): Game[] {
  return Object.values(world.games).filter(g => g.seasonId === seasonId && g.competitionStageKey === stage)
    .sort((a,b) => a.postseasonFixtureId!.localeCompare(b.postseasonFixtureId!))
}

function makeMatches(gender: NcaaD1RealGender, stage: NationalRound, pairs: readonly (readonly [TeamId,TeamId])[], sitePolicy: 'NEUTRAL'|'CAMPUS'): Game[] {
  const seasonId = tournamentId(gender), cid = competitionId(gender), dates = days[gender][stage]
  return pairs.map(([home,away], i) => createGame({
    id: gameIdFromString(`ncaa2027:national:${gender}:${stage}:${String(i+1).padStart(2,'0')}`),
    seasonId, competitionId: cid, date: parseGameDate(dates[i % dates.length]!),
    homeTeamId: home, awayTeamId: away, status:'scheduled', result: null,
    ...(sitePolicy === 'NEUTRAL' ? { neutralSite: true } : {}),
    stakes: stage === 'FINAL' ? 'final' : 'elimination', competitionStageKey: stage,
    postseasonFixtureId: `${stage}:${String(i+1).padStart(2,'0')}`, postseasonGameNo: 1,
  }))
}

function pairsAdjacent(teams: readonly TeamId[]): [TeamId,TeamId][] {
  if (teams.length % 2 !== 0) throw new Error('NCAA field must contain an even number of tournament entrants')
  return Array.from({length:teams.length/2},(_,i)=>[teams[i*2]!,teams[i*2+1]!] as [TeamId,TeamId])
}

export function startNcaa2027NationalTournament(world: GameWorld, gender: NcaaD1RealGender): GameWorld {
  if (world.seasons[tournamentId(gender)]) throw new Error('NCAA 2027 national tournament was already selected')
  const officialWomen = formatDocuments.find(doc => doc.competition_id === 'competition:USA:ncaa-d1-women-championship')
  const opening = officialWomen?.variants[0]?.nodes.find(node => node.key === 'OPENING_ROUND')
  if (officialWomen?.status !== 'COMPLETE' || officialWomen.variants[0]?.entry_selection?.payload.field_size !== 76
    || opening?.pairing?.payload.game_count !== 12) throw new Error('NCAA 2027 format provenance no longer confirms the 76-team, 12-opening-game bracket')
  const field = selectNcaa2027Field(world,gender)
  const ordered = field.seeded, index = new Map(ordered.map((team,i)=>[team,i]))
  const byRank = (a:TeamId,b:TeamId) => index.get(a)! - index.get(b)!
  const bottomAq = [...field.automatic].sort(byRank).slice(-12)
  const bottomAtLarge = [...field.atLarge].sort(byRank).slice(-12)
  const pairings = [...pairsAdjacent(bottomAq),...pairsAdjacent(bottomAtLarge)]
  if (new Set(pairings.flat()).size !== 24) throw new Error('NCAA Opening Round needs 12 AQ and 12 at-large distinct programmes')
  const source = world.seasons[sourceId(gender)]!
  const competition = createCompetition({
    id:competitionId(gender), name:`2027 NCAA Division I ${gender} 76-team championship (BDM committee simulation)`,
    gender:gender==='men'?'male':'female',ecosystemId:world.competitions[source.competitionId]!.ecosystemId,
    participantTeamIds: field.seeded,
    rules:world.competitions[source.competitionId]!.rules,
  })
  const season=createSeason({
    id:tournamentId(gender),competitionId:competition.id,label:`2027 NCAA DI ${gender} 76-team BDM committee simulation`,
    startDate:gender==='men'?'2027-03-14':'2027-03-14',endDate:gender==='men'?'2027-04-05':'2027-04-04',
    participantTeamIds:field.seeded,
  })
  return updateGameWorld(world,{
    competitions:[...Object.values(world.competitions),competition],
    seasons:[...Object.values(world.seasons),season],
    games:[...Object.values(world.games),...makeMatches(gender,'OPENING_ROUND',pairings,gender==='women'?'CAMPUS':'NEUTRAL')],
  })
}

const regionMatchOrders = [[0,15],[7,8],[4,11],[3,12],[5,10],[2,13],[6,9],[1,14]] as const

/** Advance only when the preceding entire round has results. Once scheduled,
 * a bracket is fixed, not re-seeded between rounds.
 */
export function advanceNcaa2027NationalTournament(world:GameWorld,gender:NcaaD1RealGender):GameWorld {
  const id=tournamentId(gender),season=world.seasons[id]
  if(!season)throw new Error('NCAA 76-team championship not yet started')
  const staged=rounds.map(stage=>gamesForStage(world,id,stage))
  const active=staged.findIndex((games,i)=>games.length>0&&staged[i+1]?.length===0)
  if(active<0)return world
  const previous=staged[active]!,stage=rounds[active]!
  if(previous.length!==expected[active]||previous.some(g=>g.status!=='completed'))return world
  if(stage==='FINAL')return world
  let pairs:[TeamId,TeamId][]
  if(stage==='OPENING_ROUND'){
    const field=selectNcaa2027Field(world,gender)
    const openingIds=new Set(previous.flatMap(g=>[g.homeTeamId,g.awayTeamId]))
    const remaining=field.seeded.filter(t=>!openingIds.has(t))
    if(remaining.length!==52)throw new Error('NCAA Opening Round must leave 52 byes')
    const survivors=new Set([...remaining,...previous.map(resultWinner)])
    const ranked=field.seeded.filter(t=>survivors.has(t))
    if(ranked.length!==64)throw new Error('NCAA Opening Round must feed a 64-team first round')
    // A documented 64-team bracket has four 16-team regions. This simulation
    // assigns the source programme IDs by a deterministic overall-score snake.
    const regions:[TeamId[],TeamId[],TeamId[],TeamId[]]=[[],[],[],[]]
    ranked.forEach((id,i)=>{const within=i%8;const region=within<4?within:7-within;regions[region]!.push(id)})
    pairs=regions.flatMap(region=>regionMatchOrders.map(([a,b])=>[region[a]!,region[b]!] as [TeamId,TeamId]))
  }else{
    pairs=pairsAdjacent(previous.map(resultWinner))
  }
  const next=rounds[active+1]!
  if(pairs.length!==expected[active+1])throw new Error(`NCAA ${next} should materialize ${expected[active+1]} ties`)
  return updateGameWorld(world,{games:[...Object.values(world.games),...makeMatches(gender,next,pairs,
    gender==='women'&&['FIRST_ROUND','SECOND_ROUND'].includes(next)?'CAMPUS':'NEUTRAL')]})
}

export function getNcaa2027NationalChampion(world:GameWorld,gender:NcaaD1RealGender):TeamId|null{
  const id=tournamentId(gender)
  if(!world.seasons[id])return null
  const games=rounds.flatMap(stage=>gamesForStage(world,id,stage))
  if(games.length!==75||games.some(g=>g.status!=='completed'))return null
  const final=gamesForStage(world,id,'FINAL')
  return final.length===1?resultWinner(final[0]!):null
}

export function ncaa2027NationalFormatSummary(gender:NcaaD1RealGender){
  return {gender,field:76,automatic:32,atLarge:44,openingRoundGames:12,firstRoundTeams:64,
    roundGameCounts:Object.freeze([...expected]),selectionModel:'BDM_GENERATED_NOT_NCAA_COMMITTEE' as const,
    conferenceChampionsRequired:true,dates:days[gender]}
}
