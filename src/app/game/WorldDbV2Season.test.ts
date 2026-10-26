import { it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createWorldDbV2GameFromSnapshot } from './WorldDbV2Game'
import { advanceGameDayWithResult } from './advanceGameDay'
import { evaluateSimulationBreakpoints } from './SimulationBreakpoints'
import { useGameStore } from '@/stores/gameStore'
import { hashStringToSeed } from '@/engine/random'
import { isSeasonComplete } from '@/engine/season'
import { calculateStandings } from '@/engine/competition/standings'
import { getCompetitionPostseasonState } from '@/engine/competition'
import { startNextSeasonTransitionFor } from './startNextSeason'
import { validateGameWorld } from '@/domain/world'
import { serializeGameWorldV4, deserializeGameWorldSaveV4 } from '@/save/GameWorldSaveV4'
import { projectPersistentWorldTruth } from '@/save/persistentWorldTruth'

// Explicit long-running acceptance: production day boundary and exact MatchEngine for every fixture.
it.skipIf(process.env.BDM_WORLDDB_SEASON !== '1')('WorldDB V2 complete PBM season, postseason and successor through canonical authorities', async () => {
  const out=resolve('.worlddb-v2/season-02-'+Date.now()); mkdirSync(out,{recursive:true})
  const raw=execFileSync(process.env.BDM_PYTHON ?? 'python',['-B','src-tauri/resources/worlddb_v2_bridge.py'],{input:JSON.stringify({method:'build',sourceRoot:process.env.WORLDDB_SOURCE_ROOT ?? 'C:/BDM_DB/WORLDDB_PBM',output:resolve(out,'universe.sqlite'),startDate:'2025-10-04',seed:'worlddb-v2-season-02'}),encoding:'utf-8',maxBuffer:128*1024*1024})
  writeFileSync(resolve(out,'snapshot.json'),raw)
  let world=await createWorldDbV2GameFromSnapshot(JSON.parse(raw),'pbm:DYN_equipe:41')
  const season=world.currentSeasonId!, originalIds=Object.keys(world.teams).sort(), regularIds=Object.keys(world.games)
  const decisions: unknown[]=[]
  useGameStore.getState().replaceWorld(world)
  const checkpoint=(name:string)=>{
    const saved=serializeGameWorldV4(world,'2026-10-26T12:00:00Z')
    writeFileSync(resolve(out,name+'.json'),JSON.stringify(saved))
    const loaded=deserializeGameWorldSaveV4(JSON.parse(JSON.stringify(saved)))
    expect(projectPersistentWorldTruth(loaded)).toEqual(projectPersistentWorldTruth(world))
    world=loaded
    useGameStore.getState().replaceWorld(world)
  }
  checkpoint('opening')
  let regularCertified=false
  for(let n=0;n<500 && !isSeasonComplete(world,season);n++){
    const blocks=evaluateSimulationBreakpoints(world).candidates.filter(b=>b.level==='ACTION_REQUIRED'||b.level==='BLOCKING')
    for(const b of blocks){
      if(b.reason==='userGame')continue // Direct Continue explicitly quick-sims the user match.
      if(b.reason==='mediaOpportunity')useGameStore.getState().skipMedia(b.sourceId)
      else if(b.reason==='coachJobOffer')useGameStore.getState().declineUserCoachOffer(b.sourceId)
      else if(b.reason==='returnToPlayReview'){
        const r=useGameStore.getState().reviewReturnToPlay(b.sourceId as never,'CLEAR_FOR_PLAY')
        if(!r.ok)useGameStore.getState().reviewReturnToPlay(b.sourceId as never,'CONTINUE_RECOVERY')
      } else throw new Error('Unresolved required decision '+JSON.stringify(b))
      decisions.push({date:world.currentDate,reason:b.reason,id:b.sourceId})
    }
    world=useGameStore.getState().world!
    let i=0
    const result=advanceGameDayWithResult(world,()=>hashStringToSeed(`season-02:${world.currentDate}:${i++}`))
    if(result.status==='FAILED'||result.status==='BREAKPOINT_PREVENTED'){
      writeFileSync(resolve(out,'failure.json'),JSON.stringify({date:world.currentDate,status:result.status,failure:result.failure,breakpoints:result.breakpointBefore,phases:result.phases},null,2))
      checkpoint('before-failure')
    }
    expect(result.status,JSON.stringify({date:world.currentDate,failure:result.failure,breakpoint:result.breakpointBefore.breakpoint})).toMatch(/COMPLETED|BREAKPOINT_AFTER_PROCESSING/)
    world=result.world;useGameStore.getState().replaceWorld(world)
    const completed=regularIds.filter(id=>world.games[id as never]!.status==='completed').length
    writeFileSync(resolve(out,'progress.json'),JSON.stringify({date:world.currentDate,regularCompleted:completed,total:Object.keys(world.games).length,completed:Object.values(world.games).filter(g=>g.status==='completed').length,decisions:decisions.length}))
    if(!regularCertified && completed===306){
      const rows=calculateStandings(world,season)
      expect(rows).toHaveLength(18);expect(rows.every(r=>r.played===34)).toBe(true)
      expect(rows.reduce((s,r)=>s+r.wins,0)).toBe(306)
      expect(rows.reduce((s,r)=>s+r.losses,0)).toBe(306)
      expect(regularIds.every(id=>world.matchStatLogsByGameId[id as never]!==undefined)).toBe(true)
      expect(new Set(regularIds.map(id=>{const g=world.games[id as never]!;return `${g.homeTeamId}:${g.awayTeamId}`})).size).toBe(306)
      checkpoint('regular-complete');regularCertified=true
    }
    if(n===90)checkpoint('midseason')
  }
  expect(regularCertified).toBe(true);expect(isSeasonComplete(world,season)).toBe(true)
  const postseason=getCompetitionPostseasonState(world,season)
  expect(postseason?.championTeamId).toBeTruthy()
  expect(world.seasonHistoryBySeasonId[season]?.championTeamId).toBe(postseason!.championTeamId)
  checkpoint('season-complete')
  const transition=startNextSeasonTransitionFor(world,season);world=transition.world
  expect(Object.keys(world.teams).sort()).toEqual(originalIds)
  const next=Object.values(world.games).filter(g=>g.seasonId===transition.result.targetSeasonId)
  expect(next).toHaveLength(306);expect(next.every(g=>g.status==='scheduled')).toBe(true)
  expect(startNextSeasonTransitionFor(world,season).result.targetSeasonId).toBe(transition.result.targetSeasonId)
  validateGameWorld(world);checkpoint('successor')
  writeFileSync(resolve(out,'acceptance.json'),JSON.stringify({passed:true,regularGames:306,perClub:34,postseason,transition:transition.result,decisions,currentDate:world.currentDate},null,2))
},7_200_000)
