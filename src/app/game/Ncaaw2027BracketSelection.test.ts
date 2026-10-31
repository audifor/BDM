import { describe, expect, it } from 'vitest'
import programs from '@/data/worlddb-v2/ncaa-d1-2026-27-programs.json'
import { resolveWorldCompetitionVirtualFixturesV1, selectWorldCompetitionHigherSeedV1 } from '@/engine/competition/WorldCompetitionVirtualFixtureResolver'
import { buildNcaaw2027CommitteeBracket, NCAAW_2027_ROUND_DATES, type NcaaWomen2027CommitteeDecision } from './Ncaaw2027BracketSelection'

const REGIONS=['R1','R2','R3','R4'] as const
function sampleCommittee():NcaaWomen2027CommitteeDecision {
  const byConf=new Map<string,typeof programs.genders.women.teams[number]>()
  for(const school of programs.genders.women.teams)if(!byConf.has(school.conferenceId))byConf.set(school.conferenceId,school)
  const conferenceChampions=[...byConf].map(([conferenceId,team])=>({conferenceId,teamId:team.id}))
  const championIds=new Set(conferenceChampions.map(x=>x.teamId))
  const atLargeTeams=programs.genders.women.teams.filter(s=>!championIds.has(s.id)).slice(0,44).map(x=>x.id)
  const ranked=[...conferenceChampions.map(x=>x.teamId),...atLargeTeams]
  const lowestAq=ranked.slice(20,32),lowestAtLarge=ranked.slice(64,76)
  const openingMatchups=[
    ...Array.from({length:6},(_,i)=>[lowestAq[2*i]!,lowestAq[2*i+1]!] as const),
    ...Array.from({length:6},(_,i)=>[lowestAtLarge[2*i]!,lowestAtLarge[2*i+1]!] as const),
  ]
  const openingIds=new Set(openingMatchups.flat())
  const remaining=ranked.filter(id=>!openingIds.has(id))
  const regionSlots={} as Record<typeof REGIONS[number], Array<{seed:number;teamId:string}|{seed:number;openingWinner:number}>>
  for(let r=0;r<4;r++){
    regionSlots[REGIONS[r]!]=Array.from({length:4},(_,i)=>({seed:i+1,teamId:ranked[r*4+i]!}))
  }
  const rest=remaining.filter(id=>!ranked.slice(0,16).includes(id))
  let direct=0,openingIndex=1
  for(let r=0;r<4;r++){
    for(let seed=5;seed<=16;seed++){
      regionSlots[REGIONS[r]!]!.push(openingIndex<=12
        ? {seed,openingWinner:openingIndex++}
        : {seed,teamId:rest[direct++]!})
    }
  }
  if(direct!==36||openingIndex!==13)throw Error('Test bracket fixture construction incorrect')
  return {conferenceChampions,atLargeTeams,overallSeedOrder:ranked,
    openingMatchups,regionSlots,semifinalRegionPairings:[['R1','R2'],['R3','R4']]}
}
describe('2027 real NCAA Division I womens 76-team championship selection and BDM fixtures',()=>{
  it('materializes exactly 75 single elimination fixtures and resolves every round through an NCAA champion',()=>{
    const decision=sampleCommittee()
    const plan=buildNcaaw2027CommitteeBracket(decision)
    expect(plan.fixtures).toHaveLength(75)
    expect(plan.fixtureIdsByNodeKey.OPENING_ROUND).toHaveLength(12)
    expect(plan.fixtureIdsByNodeKey.FIRST_ROUND).toHaveLength(32)
    expect(plan.fixtureIdsByNodeKey.SECOND_ROUND).toHaveLength(16)
    expect(plan.fixtureIdsByNodeKey.SWEET_16).toHaveLength(8)
    expect(plan.fixtureIdsByNodeKey.ELITE_EIGHT).toHaveLength(4)
    expect(plan.fixtureIdsByNodeKey.FINAL_FOUR).toHaveLength(2)
    expect(plan.fixtureIdsByNodeKey.FINAL).toHaveLength(1)
    expect(NCAAW_2027_ROUND_DATES.FINAL).toEqual(['2027-04-04'])
    const outcomes:{fixtureId:string;winnerEntryId:string;loserEntryId:string}[]=[]
    for(let guard=0;guard<75;guard++){
      const status=resolveWorldCompetitionVirtualFixturesV1(plan,outcomes)
      if(status.readyFixtures.length===0)break
      for(const fixture of status.readyFixtures){
        const winner=selectWorldCompetitionHigherSeedV1(fixture.participants)
        const loser=fixture.participants.find(p=>p.competitionSeasonEntryId!==winner.competitionSeasonEntryId)!
        outcomes.push({fixtureId:fixture.fixtureId,winnerEntryId:winner.competitionSeasonEntryId,loserEntryId:loser.competitionSeasonEntryId})
      }
    }
    expect(outcomes).toHaveLength(75)
    expect(resolveWorldCompetitionVirtualFixturesV1(plan,outcomes).readyFixtures).toHaveLength(0)
    const champion=outcomes.find(x=>x.fixtureId===plan.fixtureIdsByNodeKey.FINAL![0])
    expect(champion).toBeDefined()
    expect(decision.overallSeedOrder).toContain(champion!.winnerEntryId)
  })
  it('rejects duplicate committee selections, invalid conference champions, and opening AQ/at-large crossovers',()=>{
    const decision=sampleCommittee()
    expect(()=>buildNcaaw2027CommitteeBracket({...decision,atLargeTeams:[...decision.atLargeTeams.slice(0,43),decision.atLargeTeams[0]!]}))
      .toThrow(/distinct/)
    expect(()=>buildNcaaw2027CommitteeBracket({...decision,conferenceChampions:[
      {...decision.conferenceChampions[0]!,conferenceId:decision.conferenceChampions[1]!.conferenceId},
      ...decision.conferenceChampions.slice(1),
    ]})).toThrow(/distinct/)
    expect(()=>buildNcaaw2027CommitteeBracket({...decision,openingMatchups:[
      [decision.openingMatchups[0]![0],decision.openingMatchups[6]![0]],
      ...decision.openingMatchups.slice(1),
    ]})).toThrow(/opening/)
    expect(()=>buildNcaaw2027CommitteeBracket({...decision,regionSlots:{
      ...decision.regionSlots,R1:decision.regionSlots.R1.map((s,i)=>i===1?decision.regionSlots.R1[0]!:s),
    }})).toThrow(/seed/)
  })
})
