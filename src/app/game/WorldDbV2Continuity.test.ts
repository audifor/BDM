import { expect, it } from 'vitest'
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { deserializeGameWorldSaveV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { projectPersistentWorldTruth } from '@/save/persistentWorldTruth'
import { advanceGameDayWithResult } from './advanceGameDay'
import { evaluateSimulationBreakpoints } from './SimulationBreakpoints'
import { useGameStore } from '@/stores/gameStore'
import { hashStringToSeed } from '@/engine/random'
import { calculateStandings } from '@/engine/competition/standings'
import { validateGameWorld } from '@/domain/world'

it.skipIf(process.env.BDM_WORLDDB_CONTINUITY!=='1')('resumes the certified PBM successor, advances its real annual lifecycle and plays its first round without resetting history',()=>{
  const dir=resolve('.worlddb-v2')
  const source=process.env.BDM_WORLDDB_SUCCESSOR ?? readdirSync(dir).filter(p=>p.startsWith('season-02-')).sort().reverse().map(p=>resolve(dir,p,'successor.json')).find(p=>existsSync(p))!
  expect(source).toBeTruthy()
  let world=deserializeGameWorldSaveV4(JSON.parse(readFileSync(source,'utf-8')))
  const out=resolve(dir,'continuity-03-'+Date.now());mkdirSync(out,{recursive:true})
  const oldSeason=world.currentSeasonId!, next=Object.values(world.seasons).find(s=>s.id!==oldSeason)!
  const oldGames=Object.values(world.games).filter(g=>g.seasonId===oldSeason)
  const oldHistory=world.seasonHistoryBySeasonId[oldSeason]!, clubs=Object.keys(world.teams).sort()
  const identities=Object.keys(world.players).filter(id=>id.startsWith('pbm:')).sort()
  const teamCount=Object.keys(world.teams).length
  expect(oldGames.filter(g=>g.stakes==='regular')).toHaveLength(teamCount*(teamCount-1))
  expect(oldGames.every(g=>g.status==='completed')).toBe(true)
  expect(oldHistory.championSource).toBe('postseason')
  expect(clubs).toContain(oldHistory.championTeamId)
  const decisions:unknown[]=[]
  let nextPlayed=false
  const resolveRequiredDecisions=(current:typeof world)=>{
    useGameStore.getState().replaceWorld(current)
    for(const b of evaluateSimulationBreakpoints(current).candidates.filter(b=>b.level==='ACTION_REQUIRED'||b.level==='BLOCKING')){
      if(b.reason==='userGame')continue
      if(b.reason==='mediaOpportunity')useGameStore.getState().skipMedia(b.sourceId)
      else if(b.reason==='coachJobOffer')useGameStore.getState().declineUserCoachOffer(b.sourceId)
      else if(b.reason==='returnToPlayReview'){
        const r=useGameStore.getState().reviewReturnToPlay(b.sourceId as never,'CLEAR_FOR_PLAY')
        if(!r.ok)useGameStore.getState().reviewReturnToPlay(b.sourceId as never,'CONTINUE_RECOVERY')
      }else throw Error('Continuity blocked: '+JSON.stringify(b))
      decisions.push({date:current.currentDate,reason:b.reason,id:b.sourceId})
    }
    return useGameStore.getState().world!
  }
  for(let day=0;day<200;day++){
    world=resolveRequiredDecisions(world)
    let i=0;const result=advanceGameDayWithResult(world,()=>hashStringToSeed(`continuity-02:${world.currentDate}:${i++}`))
    expect(result.status,JSON.stringify({date:world.currentDate,failure:result.failure,breakpoint:result.breakpointBefore.breakpoint})).toMatch(/COMPLETED|BREAKPOINT_AFTER_PROCESSING/)
    world=result.world
    writeFileSync(resolve(out,'progress.json'),JSON.stringify({date:world.currentDate,currentSeasonId:world.currentSeasonId}))
    if(Object.values(world.games).some(g=>g.seasonId===next.id&&g.status==='completed')){nextPlayed=true;break}
  }
  expect(nextPlayed).toBe(true);expect(world.currentSeasonId).toBe(next.id)
  expect(Object.keys(world.teams).sort()).toEqual(clubs)
  expect(Object.keys(world.players).filter(id=>id.startsWith('pbm:')).sort()).toEqual(identities)
  expect(world.seasonHistoryBySeasonId[oldSeason]).toEqual(oldHistory)
  expect(Object.values(world.games).filter(g=>g.seasonId===oldSeason)).toEqual(oldGames)
  const played=Object.values(world.games).filter(g=>g.seasonId===next.id&&g.status==='completed')
  expect(played.length).toBeGreaterThan(0)
  expect(played.every(g=>world.matchStatLogsByGameId[g.id]!==undefined)).toBe(true)
  expect(calculateStandings(world,next.id).reduce((sum,r)=>sum+r.played,0)).toBe(played.length*2)
  expect(world.worldAnnualDevelopmentCycle).toBeDefined()
  validateGameWorld(world)
  const save=serializeGameWorldV4(world,'2026-10-26T12:00:00Z');writeFileSync(resolve(out,'second-season.json'),JSON.stringify(save))
  const reopened=deserializeGameWorldSaveV4(JSON.parse(readFileSync(resolve(out,'second-season.json'),'utf-8')))
  expect(projectPersistentWorldTruth(reopened)).toEqual(projectPersistentWorldTruth(world))
  // Persisted mandatory post-match decisions still require the user's existing
  // actions after reload; loading must not silently mark them as answered.
  const requiredAfterLoad=evaluateSimulationBreakpoints(reopened).candidates.filter(b=>b.level==='ACTION_REQUIRED'||b.level==='BLOCKING')
  const continued=advanceGameDayWithResult(resolveRequiredDecisions(reopened),()=>123456)
  expect(continued.status).toMatch(/COMPLETED|BREAKPOINT_AFTER_PROCESSING/)
  writeFileSync(resolve(out,'continued.json'),JSON.stringify(serializeGameWorldV4(continued.world,'2026-10-26T12:00:00Z')))
  writeFileSync(resolve(out,'acceptance.json'),JSON.stringify({passed:true,source,oldGames:oldGames.length,oldChampion:oldHistory.championTeamId,nextSeason:next.id,newGames:played.length,date:continued.world.currentDate,clubs:clubs.length,pbmPlayers:identities.length,requiredAfterLoad,decisions,annualCycle:world.worldAnnualDevelopmentCycle},null,2))
},3_600_000)
