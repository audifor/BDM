import { describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { WORLDDB_V2_COMPETITIONS } from './WorldDbV2Competitions'
import { createWorldDbV2GameFromSnapshot } from './WorldDbV2Game'
import { getFreeAgents, validateGameWorld } from '@/domain/world'
import { initializeFreeAgentMarketTruth } from '@/engine/market'
import { getUserTeam } from '@/engine/calendar'
import { f3AdvanceDay, f3Store, f3World } from './testSupport/PlayableF3Support'
import { f3PlayDirectSigning } from './testSupport/PlayableF3TransferSupport'
import { serializeGameWorldV4, deserializeGameWorldSaveV4 } from '@/save/GameWorldSaveV4'
import { projectPersistentWorldTruth } from '@/save/persistentWorldTruth'
import type { WorldDbV2Snapshot } from '@/tauri/TauriWorldDbV2'
import { playerIdFromString } from '@/domain/ids'
vi.setConfig({ testTimeout:900_000 })
const root=process.env.WORLDDB_SOURCE_ROOT??'C:/BDM_DB/WORLDDB_PBM'
describe.skipIf(!existsSync(resolve(root,'WORLDDB_UNIFIED_V2/worlddb_bdm_btw_v2.sqlite')))('one PBM adapter, three real league formats',()=>{
  it.each(WORLDDB_V2_COMPETITIONS)('$countryCode creates a real roster, plays a match, signs an original free agent and persists',async config=>{
    const out=resolve('.worlddb-v2','multileague-03-'+config.countryCode+'-'+Date.now());mkdirSync(out,{recursive:true})
    const raw=execFileSync(process.env.BDM_PYTHON??'python',['-B','src-tauri/resources/worlddb_v2_bridge.py'],{input:JSON.stringify({method:'build',sourceRoot:root,competitionId:config.sourceCompetitionId,output:resolve(out,'universe.sqlite'),startDate:config.countryCode==='ESP'?'2025-10-04':'2025-07-01',seed:'multileague-03-'+config.countryCode}),encoding:'utf-8',maxBuffer:128*1024*1024})
    writeFileSync(resolve(out,'snapshot.json'),raw);const snapshot=JSON.parse(raw) as WorldDbV2Snapshot
    const opening=await createWorldDbV2GameFromSnapshot(snapshot,snapshot.clubs[0]!.entity_id)
    validateGameWorld(opening)
    expect(Object.keys(opening.teams)).toHaveLength(config.teamCount)
    expect(Object.keys(opening.teams).sort()).toEqual(snapshot.clubs.map(c=>c.entity_id).sort())
    expect(Object.keys(opening.players).sort()).toEqual([...snapshot.people.filter(p=>p.source_table==='DYN_joueur'&&p.reference_data.is_alive!==0&&p.reference_data.retraite!==1).map(p=>p.entity_id),...snapshot.freeAgents!.map(p=>p.entity_id)].sort())
    expect(Object.keys(opening.games)).toHaveLength(config.teamCount*(config.teamCount-1))
    expect(opening.competitions[opening.seasons[opening.currentSeasonId!]!.competitionId]!.id).toBe(config.nativeCompetitionId)
    expect(opening.seasons[opening.currentSeasonId!]!.worldCompetitionFormat?.competitionId).toBe(config.nativeCompetitionId)
    expect(opening.worldDbCompetitionRuntime?.worldDbV2?.sourceCompetitionId).toBe(config.sourceCompetitionId)
    expect(getFreeAgents(opening)).toHaveLength(60)
    const truth=initializeFreeAgentMarketTruth(opening,getFreeAgents(opening).map(p=>p.id))
    const candidates=getFreeAgents(truth).filter(p=>truth.marketRealityByPlayerId[p.id]!.playerWillingness>=50).sort((a,b)=>truth.marketRealityByPlayerId[a.id]!.expectedSalary-truth.marketRealityByPlayerId[b.id]!.expectedSalary)
    let signed=false;const attempts=[]
    for(const player of candidates.slice(0,6)){
      f3Store().replaceWorld(opening)
      const result=f3PlayDirectSigning(player.id,{salaryShare:1.1,years:1,role:'ROTATION'})
      attempts.push({playerId:player.id,name:player.firstName+' '+player.lastName,status:result.status,stoppedAt:result.stoppedAt,log:result.log})
      if(result.status!=='SIGNED')continue
      expect(getUserTeam(f3World())!.rosterPlayerIds).toContain(player.id)
      expect(Object.values(f3World().contractsById).filter(c=>c.playerId===player.id)).toHaveLength(1)
      const save=serializeGameWorldV4(f3World(),'2026-10-26T12:00:00Z');writeFileSync(resolve(out,'managed.json'),JSON.stringify(save))
      expect(projectPersistentWorldTruth(deserializeGameWorldSaveV4(JSON.parse(JSON.stringify(save))))).toEqual(projectPersistentWorldTruth(f3World()))
      signed=true;break
    }
    writeFileSync(resolve(out,'acceptance.json'),JSON.stringify({sourceCompetitionId:config.sourceCompetitionId,club:snapshot.clubs[0]!.entity_id,nativeCompetitionId:config.nativeCompetitionId,clubs:config.teamCount,rosterPlayers:Object.values(opening.teams).flatMap(t=>t.rosterPlayerIds).length,freeAgents:60,seed:'multileague-03-'+config.countryCode,attempts,signed,matchActas:Object.keys(f3World().matchStatLogsByGameId).length},null,2))
    expect(signed,JSON.stringify(attempts)).toBe(true)
    expect(Object.keys(f3World().matchStatLogsByGameId).length).toBeGreaterThan(0)
  })
})

describe.skipIf(process.env.BDM_WORLDDB_NATIVE_SIGNING!=='1')('saved native PBM signings are eligible in MatchEngine',()=>{
  it.each(WORLDDB_V2_COMPETITIONS)('$countryCode reopens the Windows signing, fields it and persists its real acta',config=>{
    const dir=resolve('.worlddb-v2'),name=readdirSync(dir).filter(n=>n.startsWith('native-03-'+config.countryCode+'-')).sort().at(-1)!
    const out=resolve(dir,name),proof=JSON.parse(readFileSync(resolve(out,'acceptance.json'),'utf-8'))
    const playerId=proof.steps.find((s:{name:string})=>s.name==='contact-offer-governance-sign').detail.candidate.playerId
    f3Store().replaceWorld(deserializeGameWorldSaveV4(JSON.parse(readFileSync(resolve(out,'continued.json'),'utf-8'))))
    const player=f3World().players[playerIdFromString(playerId)]!
    const team=getUserTeam(f3World())!
    const game=Object.values(f3World().games).filter(g=>g.status==='scheduled'&&(g.homeTeamId===team.id||g.awayTeamId===team.id)).sort((a,b)=>a.date.localeCompare(b.date))[0]!
    for(let n=0;n<30&&f3World().currentDate<game.date;n++)f3AdvanceDay()
    expect(f3World().currentDate).toBe(game.date)
    f3Store().setLineupSlot(player.basketball.primaryPosition,player.id)
    f3Store().instantResult()
    const line=f3World().matchStatLogsByGameId[game.id]!.playerLines.find(l=>l.playerId===player.id)!
    expect(line.stats.secondsPlayed).toBeGreaterThan(0)
    const save=serializeGameWorldV4(f3World(),'2026-10-26T12:00:00Z')
    expect(projectPersistentWorldTruth(deserializeGameWorldSaveV4(save))).toEqual(projectPersistentWorldTruth(f3World()))
    writeFileSync(resolve(out,'signed-player-played.json'),JSON.stringify({passed:true,playerId,gameId:game.id,date:game.date,line},null,2))
  })
})
