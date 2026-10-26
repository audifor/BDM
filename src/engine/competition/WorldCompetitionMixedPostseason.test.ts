import { describe, expect, it } from 'vitest'
import source from '@/data/worlddb-v2/competition-runtime.json'
import { parseWorldCompetitionFormatDocument } from '@/domain/competition'
import { teamIdFromString, gameIdFromString } from '@/domain/ids'
import { selectQualifiedEntries } from './WorldCompetitionPostseason'
import { instantiateWorldCompetitionFixedBracketV1 } from './WorldCompetitionFixedBracket'
import { resolveWorldCompetitionVirtualFixturesV1, selectWorldCompetitionHigherSeedV1 } from './WorldCompetitionVirtualFixtureResolver'
import { singleGameFixture, singleGameFixtureOutcome } from './WorldCompetitionSingleElimination'
import { generateWorld } from '@/engine/world'
import { updateGameWorld } from '@/domain/world'
import { createGame } from '@/domain/game'

const raw=structuredClone(source.competition_formats.find(f=>f.competition_id==='competition:FRA:betclic-elite')!)
const sf=raw.variants[0]!.nodes.find(n=>n.key==='SEMIFINALS')!
Object.assign(sf.pairing!.payload,{paths:['WINNER_1_VS_8_VS_WINNER_4_VS_5','WINNER_2_VS_7_VS_WINNER_3_VS_6']})
const finalIn=raw.variants[0]!.nodes.find(n=>n.key==='PLAY_IN_FINAL')!
finalIn.hosting!.priority_basis='FIRST_PARTICIPANT'
const format=parseWorldCompetitionFormatDocument(raw)
const entries=Array.from({length:10},(_,i)=>({competitionSeasonEntryId:'entry:'+(i+1),seed:i+1}))
const plan=instantiateWorldCompetitionFixedBracketV1(format,'MAIN',entries)
const fixture=(key:string)=>plan.fixtures.find(f=>f.nodeKey===key)!

describe('mixed postseason graph: actual French qualification vocabulary',()=>{
 it.each([7,8].flatMap(a=>[9,10].flatMap(b=>[0,1].map(c=>({a,b,c})))))('routes winner $a, winner $b, final branch $c without admitting eliminated entries',({a,b,c})=>{
  const loser=a===7?8:7,winner=c===0?loser:b,eliminated=c===0?b:loser
  const outcomes=[{fixtureId:fixture('PLAY_IN_7_8').fixtureId,winnerEntryId:'entry:'+a,loserEntryId:'entry:'+loser},
   {fixtureId:fixture('PLAY_IN_9_10').fixtureId,winnerEntryId:'entry:'+b,loserEntryId:'entry:'+(b===9?10:9)},
   {fixtureId:fixture('PLAY_IN_FINAL').fixtureId,winnerEntryId:'entry:'+winner,loserEntryId:'entry:'+eliminated}]
  const state=resolveWorldCompetitionVirtualFixturesV1(plan,outcomes)
  const qf=state.readyFixtures.filter(f=>f.nodeKey==='QUARTERFINALS')
  expect(qf).toHaveLength(4)
  const participants=qf.flatMap(f=>f.participants)
  expect(new Set(participants.map(p=>p.competitionSeasonEntryId)).size).toBe(8)
  expect(participants.find(p=>p.seed===7)?.competitionSeasonEntryId).toBe('entry:'+a)
  expect(participants.find(p=>p.seed===8)?.competitionSeasonEntryId).toBe('entry:'+winner)
  expect(participants.some(p=>p.competitionSeasonEntryId==='entry:'+eliminated)).toBe(false)
  const final=state.resolvedFixtures.find(f=>f.nodeKey==='PLAY_IN_FINAL')!
  expect(final.participants[0].competitionSeasonEntryId).toBe('entry:'+loser)
  const quarter=qf.find(f=>f.participants.some(p=>p.competitionSeasonEntryId==='entry:'+winner))!
  const other=quarter.participants.find(p=>p.competitionSeasonEntryId!=='entry:'+winner)!
  const progressed=resolveWorldCompetitionVirtualFixturesV1(plan,[...outcomes,{fixtureId:quarter.fixtureId,winnerEntryId:'entry:'+winner,loserEntryId:other.competitionSeasonEntryId}])
  expect(progressed.completedFixtureIds).toContain(quarter.fixtureId)
 })
 it('refuses an undeclared loser route and a premature outcome',()=>{
  const bad=structuredClone(raw);const edges=bad.variants[0]!.edges;const loserIndex=edges.findIndex(e=>e.selector==='LOSER');edges.splice(loserIndex,1)
  expect(()=>instantiateWorldCompetitionFixedBracketV1(parseWorldCompetitionFormatDocument(bad),'MAIN',entries)).toThrow('Undeclared LOSER')
  expect(()=>resolveWorldCompetitionVirtualFixturesV1(plan,[{fixtureId:fixture('PLAY_IN_FINAL').fixtureId,winnerEntryId:'entry:7',loserEntryId:'entry:9'}])).toThrow('before participants')
 })
 it('carries explicit playoff-slot seeds through the semifinals and final without changing entry identities',()=>{
  const result=(key:string,winner:number,loser:number)=>({fixtureId:fixture(key).fixtureId,winnerEntryId:'entry:'+winner,loserEntryId:'entry:'+loser})
  const outcomes=[result('PLAY_IN_7_8',8,7),result('PLAY_IN_9_10',9,10),result('PLAY_IN_FINAL',7,9)]
  let state=resolveWorldCompetitionVirtualFixturesV1(plan,outcomes)
  for(const f of state.readyFixtures.filter(f=>f.nodeKey==='QUARTERFINALS')){
   const winner=f.participants.find(p=>p.competitionSeasonEntryId==='entry:7'||p.competitionSeasonEntryId==='entry:8')??f.participants[0]
   const loser=f.participants.find(p=>p!==winner)!
   outcomes.push({fixtureId:f.fixtureId,winnerEntryId:winner.competitionSeasonEntryId,loserEntryId:loser.competitionSeasonEntryId})
  }
  state=resolveWorldCompetitionVirtualFixturesV1(plan,outcomes)
  for(const f of state.readyFixtures.filter(f=>f.nodeKey==='SEMIFINALS')){
   const winner=f.participants.find(p=>['entry:7','entry:8'].includes(p.competitionSeasonEntryId))!,loser=f.participants.find(p=>p!==winner)!
   outcomes.push({fixtureId:f.fixtureId,winnerEntryId:winner.competitionSeasonEntryId,loserEntryId:loser.competitionSeasonEntryId})
  }
  const final=resolveWorldCompetitionVirtualFixturesV1(plan,outcomes).readyFixtures.find(f=>f.nodeKey==='FINAL')!
  expect(final.participants).toEqual([{competitionSeasonEntryId:'entry:7',seed:8},{competitionSeasonEntryId:'entry:8',seed:7}])
  expect(selectWorldCompetitionHigherSeedV1(final.participants).competitionSeasonEntryId).toBe('entry:8')
 })
 it('unions supported ranking routes while checking every bound and selector',()=>{
  const standings=entries.map(e=>({position:e.seed,teamId:teamIdFromString(e.competitionSeasonEntryId),played:30,wins:0,losses:30,pointsFor:0,pointsAgainst:30,pointDifference:-30}))
  expect(selectQualifiedEntries(standings,[{selector:'RANK_RANGE',rankFrom:1,rankTo:6},{selector:'RANK_RANGE',rankFrom:7,rankTo:8},{selector:'RANK_RANGE',rankFrom:9,rankTo:10}],'test')).toEqual(entries)
  expect(selectQualifiedEntries(standings,[{selector:'TOP_N',count:2},{selector:'RANK_RANGE',rankFrom:2,rankTo:3}],'test')).toHaveLength(3)
  expect(()=>selectQualifiedEntries(standings,[{selector:'TOP_N',count:11}],'test')).toThrow('cannot satisfy')
  expect(()=>selectQualifiedEntries(standings,[{selector:'RANK_RANGE',rankFrom:0,rankTo:2}],'test')).toThrow('invalid')
  expect(()=>selectQualifiedEntries(standings,[{selector:'UNKNOWN'}],'test')).toThrow('Unsupported')
 })
 it('shares the single-game authority: explicit host, one decisive result, no duplicate games',()=>{
  let world=generateWorld({seed:12345,gender:'male'}),season=Object.values(world.seasons)[0]!
  world=updateGameWorld(world,{seasons:[{...season,worldCompetitionFormat:format}]})
  const teams=Object.values(world.teams).slice(0,2)
  const f={...fixture('PLAY_IN_FINAL'),participants:[{competitionSeasonEntryId:teams[0]!.id,seed:8},{competitionSeasonEntryId:teams[1]!.id,seed:9}] as const}
  const game=singleGameFixture(world,season.id,f)
  expect(game.homeTeamId).toBe(teams[0]!.id)
  expect(singleGameFixtureOutcome(world,season.id,f)).toBeNull()
  world=updateGameWorld(world,{games:[createGame({...game,status:'completed',result:{homeScore:70,awayScore:80}})]})
  expect(singleGameFixtureOutcome(world,season.id,f)).toEqual({fixtureId:f.fixtureId,winnerEntryId:teams[1]!.id,loserEntryId:teams[0]!.id})
  const duplicate=gameIdFromString('duplicate-game')
  // Intentionally invalid input: the world validator also forbids duplicate team/date games.
  world={...world,games:{...world.games,[duplicate]:createGame({...game,id:duplicate})}}
  expect(()=>singleGameFixtureOutcome(world,season.id,f)).toThrow('Duplicate')
 })
})
