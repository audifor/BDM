import programs from '@/data/worlddb-v2/ncaa-d1-2026-27-programs.json'
import type {
  WorldCompetitionFixedBracketPlanV1, WorldCompetitionFixtureParticipantRefV1,
  WorldCompetitionVirtualFixtureV1,
} from '@/engine/competition/WorldCompetitionFixedBracket'

export const NCAAW_2027_EDITION = 'edition:USA:ncaa-d1-women-championship:2026-27'
export const NCAAW_2027_ROUND_DATES = {
  OPENING_ROUND: ['2027-03-17', '2027-03-18'],
  FIRST_ROUND: ['2027-03-19', '2027-03-20'],
  SECOND_ROUND: ['2027-03-21', '2027-03-22'],
  SWEET_16: ['2027-03-26', '2027-03-27'],
  ELITE_EIGHT: ['2027-03-28', '2027-03-29'],
  FINAL_FOUR: ['2027-04-02'],
  FINAL: ['2027-04-04'],
} as const
type Region = 'R1' | 'R2' | 'R3' | 'R4'
const REGIONS: readonly Region[] = ['R1','R2','R3','R4']
export interface NcaaWomen2027CommitteeDecision {
  readonly conferenceChampions: readonly { conferenceId:string; teamId:string }[]
  readonly atLargeTeams: readonly string[]
  readonly overallSeedOrder: readonly string[]
  readonly openingMatchups: readonly (readonly [string,string])[]
  readonly regionSlots: Readonly<Record<Region, readonly (
    { readonly seed:number; readonly teamId:string; readonly openingWinner?:never }
    | { readonly seed:number; readonly openingWinner:number; readonly teamId?:never }
  )[]>>
  readonly semifinalRegionPairings: readonly (readonly [Region,Region])[]
}
function exactDistinct(values:readonly string[],expected:number,label:string):void {
  if(values.length!==expected||new Set(values).size!==expected)throw Error('NCAAW '+label+' requires '+expected+' distinct values')
}
const teams=new Map(programs.genders.women.teams.map(p=>[p.id,p]))
const conferenceIds=new Set(programs.genders.women.teams.map(p=>p.conferenceId))
const regionalPairs=[[1,16],[8,9],[5,12],[4,13],[6,11],[3,14],[7,10],[2,15]] as const

/** Builds the entire 2027 NCAA women's 76-team/75-game single-elimination
 * bracket with the existing BDM virtual-fixture structure. Source of the 32
 * tournament winners and the committee's 44 at-large/ranking/placements is a
 * REQUIRED actual game-world decision; this function never invents entrants.
 */
export function buildNcaaw2027CommitteeBracket(input:NcaaWomen2027CommitteeDecision):WorldCompetitionFixedBracketPlanV1 {
  if(teams.size!==363||conferenceIds.size!==32)throw Error('Unexpected 2026-27 NCAA D1 women membership')
  const champions=input.conferenceChampions,atlarge=input.atLargeTeams,rank=input.overallSeedOrder
  exactDistinct(champions.map(x=>x.conferenceId),32,'conference AQ')
  exactDistinct(champions.map(x=>x.teamId),32,'champions')
  if(champions.some(x=>teams.get(x.teamId)?.conferenceId!==x.conferenceId))throw Error('NCAAW automatic bid must belong to the real conference champion')
  exactDistinct(atlarge,44,'committee at-large selection')
  exactDistinct(rank,76,'committee full field ranking')
  const field=[...champions.map(x=>x.teamId),...atlarge]
  exactDistinct(field,76,'76 selected school IDs')
  if(field.some(x=>!teams.has(x))||rank.some(x=>!field.includes(x)))throw Error('NCAAW seed list and eligible DI tournament field mismatch')
  const kind=new Map<string,'AQ'|'AT_LARGE'>(field.map(t=>[t,'AT_LARGE']))
  for(const c of champions)kind.set(c.teamId,'AQ')
  const seedRank=new Map(rank.map((t,i)=>[t,i+1]))
  const bottomAq=new Set(champions.map(x=>x.teamId).sort((a,b)=>seedRank.get(b)!-seedRank.get(a)!).slice(0,12))
  const bottomAl=new Set([...atlarge].sort((a,b)=>seedRank.get(b)!-seedRank.get(a)!).slice(0,12))
  if(input.openingMatchups.length!==12)throw Error('NCAAW requires twelve 2027 opening round matchups')
  const openingTeams=new Set<string>()
  let aqPairs=0,alPairs=0
  for(const [a,b] of input.openingMatchups){
    if(a===b||!kind.has(a)||kind.get(a)!==kind.get(b)||openingTeams.has(a)||openingTeams.has(b))throw Error('NCAAW opening round mixes qualifiers or repeats a school')
    openingTeams.add(a);openingTeams.add(b)
    if(kind.get(a)==='AQ'){if(!bottomAq.has(a)||!bottomAq.has(b))throw Error('NCAAW AQ not in lowest twelve');aqPairs++}
    else {if(!bottomAl.has(a)||!bottomAl.has(b))throw Error('NCAAW at-large not in lowest twelve');alPairs++}
  }
  if(aqPairs!==6||alPairs!==6||openingTeams.size!==24)throw Error('NCAAW opening must be six AQ games and six at-large games')
  const used=new Set<string>(),protectedTeams=new Set(rank.slice(0,16)),protectedPlaced=new Set<string>()
  for(const region of REGIONS){
    const slots=input.regionSlots[region]
    if(!Array.isArray(slots)||slots.length!==16)throw Error('NCAAW each regional bracket requires 16 slots')
    const seeds=new Set<number>()
    for(const slot of slots){
      if(!Number.isInteger(slot.seed)||slot.seed<1||slot.seed>16||seeds.has(slot.seed))throw Error('NCAAW regional seed duplicate or out of bounds')
      seeds.add(slot.seed)
      if(slot.teamId!==undefined){
        if(!kind.has(slot.teamId)||openingTeams.has(slot.teamId)||used.has(slot.teamId))throw Error('NCAAW invalid direct bracket placement')
        used.add(slot.teamId)
        if(protectedTeams.has(slot.teamId)){
          if(slot.seed>4)throw Error('NCAAW top sixteen not protected with regional top-four slot')
          protectedPlaced.add(slot.teamId)
        }
      } else {
        if(slot.openingWinner===undefined||!Number.isInteger(slot.openingWinner)||slot.openingWinner<1||slot.openingWinner>12||slot.seed<=4)throw Error('NCAAW invalid opening survivor slot')
        const key='OPENING_'+slot.openingWinner
        if(used.has(key))throw Error('NCAAW duplicate opening survivor placement')
        used.add(key)
      }
    }
  }
  if(used.size!==64||protectedPlaced.size!==16||field.filter(id=>!openingTeams.has(id)).some(id=>!used.has(id)))throw Error('NCAAW must have 52 byes, twelve play-in winners and sixteen protected seeds')
  exactDistinct(input.semifinalRegionPairings.flatMap(x=>[...x]),4,'Final Four region participants')
  if(input.semifinalRegionPairings.length!==2||input.semifinalRegionPairings.flatMap(x=>[...x]).some(x=>!REGIONS.includes(x)))throw Error('Invalid NCAAW semifinal region bracket')
  const fixtures:WorldCompetitionVirtualFixtureV1[]=[]
  const fixtureIdsByNodeKey:Record<string,string[]>={}
  const entry=(id:string):WorldCompetitionFixtureParticipantRefV1=>({kind:'ENTRY',competitionSeasonEntryId:id,seed:seedRank.get(id)!})
  const winner=(fixtureId:string):WorldCompetitionFixtureParticipantRefV1=>({kind:'WINNER_OF_FIXTURE',fixtureId})
  const add=(nodeKey:string,a:WorldCompetitionFixtureParticipantRefV1,b:WorldCompetitionFixtureParticipantRefV1)=>{
    const index=(fixtureIdsByNodeKey[nodeKey]?.length??0)+1
    const fixtureId='ncaaw:2027:'+nodeKey+':'+String(index).padStart(3,'0')
    const fixture:WorldCompetitionVirtualFixtureV1={fixtureId,competitionSeasonId:NCAAW_2027_EDITION,variantKey:'MAIN',nodeKey,fixtureOrder:index,participants:[a,b]}
    fixtures.push(fixture);(fixtureIdsByNodeKey[nodeKey]??=[]).push(fixtureId);return fixture
  }
  const opening=input.openingMatchups.map(([a,b])=>add('OPENING_ROUND',entry(a),entry(b)))
  const winnerByRegion=new Map<Region,string>()
  for(const region of REGIONS){
    const slots=new Map(input.regionSlots[region].map(x=>[x.seed,x]))
    const resolve=(seed:number):WorldCompetitionFixtureParticipantRefV1=>{
      const slot=slots.get(seed)!
      return slot.teamId!==undefined?entry(slot.teamId):winner(opening[slot.openingWinner!-1]!.fixtureId)
    }
    let round=regionalPairs.map(([a,b])=>add('FIRST_ROUND',resolve(a),resolve(b)))
    for(const node of ['SECOND_ROUND','SWEET_16','ELITE_EIGHT']){
      const next:WorldCompetitionVirtualFixtureV1[]=[]
      for(let i=0;i<round.length;i+=2)next.push(add(node,winner(round[i]!.fixtureId),winner(round[i+1]!.fixtureId)))
      round=next
    }
    winnerByRegion.set(region,round[0]!.fixtureId)
  }
  const semi=input.semifinalRegionPairings.map(([a,b])=>add('FINAL_FOUR',winner(winnerByRegion.get(a)!),winner(winnerByRegion.get(b)!)))
  add('FINAL',winner(semi[0]!.fixtureId),winner(semi[1]!.fixtureId))
  if(fixtures.length!==75||fixtureIdsByNodeKey.OPENING_ROUND?.length!==12||fixtureIdsByNodeKey.FIRST_ROUND?.length!==32||
     fixtureIdsByNodeKey.SECOND_ROUND?.length!==16||fixtureIdsByNodeKey.SWEET_16?.length!==8||
     fixtureIdsByNodeKey.ELITE_EIGHT?.length!==4||fixtureIdsByNodeKey.FINAL_FOUR?.length!==2||
      fixtureIdsByNodeKey.FINAL?.length!==1)throw Error("Invalid 76-team NCAA women's 2027 championship topology")
  return {competitionSeasonId:NCAAW_2027_EDITION,variantKey:'MAIN',fixtures,fixtureIdsByNodeKey}
}
