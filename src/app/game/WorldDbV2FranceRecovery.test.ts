import { expect, it } from 'vitest'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { deserializeGameWorldSaveV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { advanceGameDayWithResult } from './advanceGameDay'
import { areRegularSeasonGamesComplete } from '@/engine/competition'
import { bindWorldDbV2FrenchFormat } from './WorldDbV2FrenchFormatBinding'
import { loadSavedGame } from '@/app/save/GameSaveService'
import { evaluateSimulationBreakpoints } from './SimulationBreakpoints'
import { useGameStore } from '@/stores/gameStore'
import { hashStringToSeed } from '@/engine/random'

it.skipIf(!process.env.BDM_FRANCE_RECOVERY)('recovers the certified French 232/240 save and completes the final regular round atomically',()=>{
 const world=deserializeGameWorldSaveV4(JSON.parse(readFileSync(process.env.BDM_FRANCE_RECOVERY!,'utf8')))
 const games=Object.values(world.games),season=world.currentSeasonId!
 expect(games.filter(g=>g.status==='completed')).toHaveLength(232)
 expect(games.filter(g=>g.status==='scheduled')).toHaveLength(8)
 expect(areRegularSeasonGamesComplete(world,season,'REGULAR_SEASON')).toBe(false)
 const bound=bindWorldDbV2FrenchFormat(world)
 expect(bindWorldDbV2FrenchFormat(bound)).toBe(bound)
 const result=advanceGameDayWithResult(bound,()=>12345)
 expect(result.status,JSON.stringify(result.failure)).toMatch(/COMPLETED|BREAKPOINT_AFTER_PROCESSING/)
 expect(Object.values(result.world.games).filter(g=>g.stakes==='regular'&&g.status==='completed')).toHaveLength(240)
 expect(areRegularSeasonGamesComplete(result.world,season,'REGULAR_SEASON')).toBe(true)
 const dir=resolve('.worlddb-v2/france-recovery-diagnostic');mkdirSync(dir,{recursive:true})
 writeFileSync(resolve(dir,'recovered.json'),JSON.stringify({date:result.world.currentDate,completed:240,status:result.status}))
},120000)

it.skipIf(!process.env.BDM_FRANCE_PHASE_SOURCE)('captures real lifecycle checkpoints for independent Windows play-in and playoff acceptance',async()=>{
 let world=await loadSavedGame({getInfo:async()=>null,load:async()=>readFileSync(process.env.BDM_FRANCE_PHASE_SOURCE!,'utf8'),save:async()=>{throw Error('Read-only source')}})
 const out=resolve('.worlddb-v2/france-phases-03f-'+Date.now());mkdirSync(out,{recursive:true})
 let captured=false
 const checkpoint=(name:string)=>writeFileSync(resolve(out,name+'.json'),JSON.stringify(serializeGameWorldV4(world,'2026-10-26T15:00:00Z')))
 for(let n=0;n<300;n++){
  const games=Object.values(world.games)
  if(games.some(g=>g.date===world.currentDate&&g.competitionStageKey?.startsWith('PLAY_IN')&&g.status==='scheduled')&&!captured){checkpoint('before-play-in');captured=true}
  if(games.some(g=>g.date===world.currentDate&&g.competitionStageKey==='QUARTERFINALS'&&g.status==='scheduled')){
   expect(games.filter(g=>g.competitionStageKey?.startsWith('PLAY_IN')&&g.status==='completed')).toHaveLength(3)
   checkpoint('before-playoffs');expect(captured).toBe(true);return
  }
  useGameStore.getState().replaceWorld(world)
  for(const b of evaluateSimulationBreakpoints(world).candidates.filter(b=>b.level==='ACTION_REQUIRED'||b.level==='BLOCKING')){
   if(b.reason==='userGame')continue
   if(b.reason==='mediaOpportunity')useGameStore.getState().skipMedia(b.sourceId)
   else if(b.reason==='coachJobOffer')useGameStore.getState().declineUserCoachOffer(b.sourceId)
   else if(b.reason==='returnToPlayReview'){const r=useGameStore.getState().reviewReturnToPlay(b.sourceId as never,'CLEAR_FOR_PLAY');if(!r.ok)useGameStore.getState().reviewReturnToPlay(b.sourceId as never,'CONTINUE_RECOVERY')}
   else throw Error('Unresolved required decision '+b.reason)
  }
  world=useGameStore.getState().world!
  let i=0;const result=advanceGameDayWithResult(world,()=>hashStringToSeed(`season-02:${world.currentDate}:${i++}`))
  expect(result.status,JSON.stringify(result.failure)).toMatch(/COMPLETED|BREAKPOINT_AFTER_PROCESSING/);world=result.world
 }
 throw Error('Failed to reach real postseason checkpoints')
},900000)
