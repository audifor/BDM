import { beforeAll, describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createWorldDbV2GameFromSnapshot } from './WorldDbV2Game'
import type { WorldDbV2Snapshot } from '@/tauri/TauriWorldDbV2'
import { getFreeAgents, getTeamRoster, isPlayerFreeAgent, updateGameWorld, validateGameWorld, type GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { getPlayerContractStatus } from '@/domain/contract'
import { initializeFreeAgentMarketTruth, reconcileExpiredPlayerContracts } from '@/engine/market'
import { assessActiveContractRosterIntegrity } from '@/engine/market/RosterContractIntegrity'
import { executePlayerTransfer } from '@/app/transfer'
import { assessContractRelease } from '@/app/market/ContractReleaseService'
import { authorizeTeamSalaryForTest } from '@/domain/finance/financeTestFixture'
import { serializeGameWorldV4, deserializeGameWorldSaveV4 } from '@/save/GameWorldSaveV4'
import { projectPersistentWorldTruth } from '@/save/persistentWorldTruth'
import { f3AdvanceDay, f3Store, f3World } from './testSupport/PlayableF3Support'
import { f3PlayDirectSigning, f3PlayTransfer, f3TransferCandidates } from './testSupport/PlayableF3TransferSupport'

vi.setConfig({testTimeout:900_000,hookTimeout:900_000})
const root=process.env.WORLDDB_SOURCE_ROOT ?? 'C:/BDM_DB/WORLDDB_PBM'
const out=resolve('.worlddb-v2/market-02-'+Date.now())
let opening: GameWorld, managed: GameWorld
let openingSnapshot: WorldDbV2Snapshot
const evidence: Record<string,unknown>={}
const reset=()=>f3Store().replaceWorld(opening)
const teamId=()=>getUserTeam(f3World())!.id
const roundTrip=(name:string)=>{
  const world=f3World(), saved=serializeGameWorldV4(world,'2026-10-26T12:00:00Z')
  writeFileSync(resolve(out,name+'.json'),JSON.stringify(saved))
  const loaded=deserializeGameWorldSaveV4(JSON.parse(JSON.stringify(saved)))
  expect(projectPersistentWorldTruth(loaded)).toEqual(projectPersistentWorldTruth(world))
  validateGameWorld(loaded);f3Store().replaceWorld(loaded)
}

describe.skipIf(!existsSync(resolve(root,'WORLDDB_UNIFIED_V2/worlddb_bdm_btw_v2.sqlite')))('PBM originals: real F3 contractual and transfer workflows',()=>{
  beforeAll(async()=>{
    mkdirSync(out,{recursive:true})
    const raw=execFileSync(process.env.BDM_PYTHON ?? 'python',['-B','src-tauri/resources/worlddb_v2_bridge.py'],{input:JSON.stringify({method:'build',sourceRoot:root,output:resolve(out,'universe.sqlite'),startDate:'2025-07-01',seed:'worlddb-v2-market-02'}),encoding:'utf-8',maxBuffer:128*1024*1024})
    writeFileSync(resolve(out,'snapshot.json'),raw)
    openingSnapshot=JSON.parse(raw)
    opening=await createWorldDbV2GameFromSnapshot(openingSnapshot,'pbm:DYN_equipe:41')
    reset()
  })
  it('opens 255 generated playable contracts, preserves PBM identities and imports an original eligible free-agent pool reproducibly',async()=>{
    expect(Object.values(opening.contractsById)).toHaveLength(255)
    for(const team of Object.values(opening.teams))for(const id of team.rosterPlayerIds)expect(assessActiveContractRosterIntegrity(opening,id)).toBe('VALID')
    expect(getFreeAgents(opening)).toHaveLength(60)
    expect(getFreeAgents(opening).every(p=>p.id.startsWith('pbm:DYN_joueur:'))).toBe(true)
    expect(opening.worldDbCompetitionRuntime?.worldDbV2?.contracts).toBe('BDM_GENERATED_INITIAL_V1_PBM_REFERENCE_ONLY')
    const repeated=JSON.parse(execFileSync(process.env.BDM_PYTHON ?? 'python',['-B','src-tauri/resources/worlddb_v2_bridge.py'],{input:JSON.stringify({method:'build',sourceRoot:root,output:resolve(out,'reproducible-universe.sqlite'),startDate:'2025-07-01',seed:'worlddb-v2-market-02'}),encoding:'utf-8',maxBuffer:128*1024*1024})) as WorldDbV2Snapshot
    expect(repeated.freeAgents?.map(p=>p.entity_id)).toEqual(openingSnapshot.freeAgents?.map(p=>p.entity_id))
    expect(projectPersistentWorldTruth(await createWorldDbV2GameFromSnapshot(repeated,'pbm:DYN_equipe:41'))).toEqual(projectPersistentWorldTruth(opening))
    roundTrip('opening')
  })
  it('contacts, negotiates salary/term/role, obtains Governance/Finance approval and signs an original free agent once',()=>{
    reset()
    const truth=initializeFreeAgentMarketTruth(opening,getFreeAgents(opening).map(p=>p.id))
    const candidates=getFreeAgents(truth).filter(p=>truth.marketRealityByPlayerId[p.id]!.playerWillingness>=50).sort((a,b)=>truth.marketRealityByPlayerId[a.id]!.expectedSalary-truth.marketRealityByPlayerId[b.id]!.expectedSalary)
    const attempts: unknown[]=[]
    let signed=false
    for(const p of candidates.slice(0,8)){
      reset()
      const result=f3PlayDirectSigning(p.id,{salaryShare:1.1,years:1,role:'ROTATION'})
      attempts.push({playerId:p.id,status:result.status,stoppedAt:result.stoppedAt,log:result.log})
      if(result.status!=='SIGNED')continue
      expect(isPlayerFreeAgent(f3World(),p.id)).toBe(false)
      expect(getTeamRoster(f3World(),teamId()).map(p=>p.id)).toContain(p.id)
      const active=Object.values(f3World().contractsById).filter(c=>c.playerId===p.id&&getPlayerContractStatus(c,f3World().currentDate)==='active')
      expect(active).toHaveLength(1)
      const before=f3World()
      f3Store().completeFreeAgentSigning(teamId(),result.negotiationId!,undefined!)
      expect(Object.keys(f3World().contractsById)).toHaveLength(Object.keys(before.contractsById).length)
      expect(assessActiveContractRosterIntegrity(f3World(),p.id)).toBe('VALID')
      roundTrip('signed');managed=f3World();signed=true;break
    }
    evidence.signing=attempts;writeFileSync(resolve(out,'progress.json'),JSON.stringify(evidence,null,2))
    expect(signed,JSON.stringify(attempts)).toBe(true)
  })
  it('renews the PBM signing through retention and Board, then releases through the actual financial authority',()=>{
    f3Store().replaceWorld(managed)
    const contract=Object.values(managed.contractsById).find(c=>c.teamId===teamId()&&c.term.expiresOn.startsWith('2026'))!
    expect(contract).toBeDefined()
    f3Store().openContractRetention(teamId(),contract.id,'pbm-renewal')
    const negotiation=Object.values(f3World().retentionNegotiationsById).find(n=>n.predecessorContractId===contract.id)!
    expect(negotiation.status).toBe('OPEN')
    f3Store().submitContractRetentionOffer(teamId(),negotiation.id,0,'pbm-renewal-offer',{salary:contract.compensation.annualSalary,years:2,guarantees:[{year:1,guaranteedAmount:contract.compensation.annualSalary},{year:2,guaranteedAmount:contract.compensation.annualSalary}]})
    expect(f3World().retentionNegotiationsById[negotiation.id]!.status).toBe('ACCEPTED')
    f3Store().requestRetentionSigning(teamId(),negotiation.id);f3AdvanceDay()
    const renewed=f3World().retentionNegotiationsById[negotiation.id]!
    expect(renewed.execution?.status).toBe('SIGNED')
    const successor=f3World().contractsById[renewed.execution!.contractId]!
    expect(successor.term.startsOn).toBe(contract.term.expiresOn)
    f3Store().requestRetentionSigning(teamId(),negotiation.id)
    expect(Object.values(f3World().contractsById).filter(c=>c.predecessorContractId===contract.id)).toHaveLength(1)
    roundTrip('renewed')
    evidence.renewal={negotiationId:negotiation.id,successorId:successor.id}
    // Complementary expiry-boundary check on this real PBM contract chain, not
    // a claim that the intervening season was simulated in this market scenario.
    const boundary=reconcileExpiredPlayerContracts(updateGameWorld(f3World(),{currentDate:successor.term.startsOn}),successor.term.startsOn)
    expect(getPlayerContractStatus(boundary.contractsById[contract.id]!,boundary.currentDate)).toBe('expired')
    expect(getPlayerContractStatus(boundary.contractsById[successor.id]!,boundary.currentDate)).toBe('active')
    expect(assessActiveContractRosterIntegrity(boundary,contract.playerId)).toBe('VALID')
    expect(boundary.teams[teamId()]!.rosterPlayerIds).toContain(contract.playerId)
    // Release another original roster member; never silently erase a scheduled successor.
    const releasable=Object.values(f3World().contractsById).filter(c=>c.teamId===teamId()&&c.id!==contract.id&&c.id!==successor.id).find(c=>assessContractRelease(f3World(),teamId(),c.playerId).status==='READY')!
    expect(releasable).toBeDefined()
    f3Store().releasePlayer(teamId(),releasable.playerId)
    expect(isPlayerFreeAgent(f3World(),releasable.playerId)).toBe(true)
    expect(f3World().contractsById[releasable.id]!.termination?.reason).toBe('released')
    const count=Object.keys(f3World().playerTransactionsById).length
    f3Store().releasePlayer(teamId(),releasable.playerId)
    expect(Object.keys(f3World().playerTransactionsById)).toHaveLength(count)
    roundTrip('released');evidence.release={playerId:releasable.playerId,contractId:releasable.id}
  })
  it('negotiates club compensation and player terms, executes a PBM transfer atomically and refuses replay',()=>{
    reset()
    const candidates=f3TransferCandidates(opening,24),attempts:unknown[]=[]
    let done=false
    for(const id of candidates){
      reset()
      const result=f3PlayTransfer(id)
      attempts.push({playerId:id,status:result.status,stoppedAt:result.stoppedAt,log:result.log})
      if(result.status!=='EXECUTED')continue
      const transfer=f3World().playerTransferNegotiationsById[result.transferId!]!
      expect(f3World().teams[transfer.sellerTeamId]!.rosterPlayerIds).not.toContain(id)
      expect(f3World().teams[transfer.buyerTeamId]!.rosterPlayerIds).toContain(id)
      expect(assessActiveContractRosterIntegrity(f3World(),id)).toBe('VALID')
      expect(executePlayerTransfer(f3World(),transfer.id).status).toBe('ALREADY_EXECUTED')
      roundTrip('transfer');done=true;break
    }
    evidence.transfer=attempts;writeFileSync(resolve(out,'progress.json'),JSON.stringify(evidence,null,2))
    expect(done,JSON.stringify(attempts)).toBe(true)
  })
  it('rejects ineligible contact, a duplicate contract, unaffordable offer and a real player refusal without changing canonical rosters',()=>{
    reset()
    const original=getTeamRoster(opening,teamId())[0]!, before=Object.keys(opening.contractsById).length
    f3Store().contactFreeAgentDirectly(teamId(),original.id)
    expect(Object.values(f3World().negotiationsById).some(n=>n.playerId===original.id)).toBe(false)
    const duplicate=updateGameWorld(opening,{contracts:[...Object.values(opening.contractsById),{...Object.values(opening.contractsById)[0]!,id:'duplicate-pbm-contract' as never}]})
    expect(assessActiveContractRosterIntegrity(duplicate,Object.values(opening.contractsById)[0]!.playerId)).toBe('AMBIGUOUS')
    expect(assessContractRelease(duplicate,Object.values(opening.contractsById)[0]!.teamId,Object.values(opening.contractsById)[0]!.playerId).status).toBe('INTEGRITY_INVALID')
    const poor=authorizeTeamSalaryForTest(opening,teamId(),{currencyCode:'EUR',playerSalaryMinorUnits:1,staffSalaryMinorUnits:1})
    f3Store().replaceWorld(poor)
    const id=getFreeAgents(poor)[0]!.id
    const denied=f3PlayDirectSigning(id,{salaryShare:1.1,years:2})
    expect(denied.status).not.toBe('SIGNED')
    expect(denied.stoppedAt).toContain('INSUFFICIENT_AUTHORIZED_HEADROOM')
    expect(isPlayerFreeAgent(f3World(),id)).toBe(true)
    reset()
    const truth=initializeFreeAgentMarketTruth(opening,getFreeAgents(opening).map(p=>p.id))
    const unwilling=getFreeAgents(truth).find(p=>truth.marketRealityByPlayerId[p.id]!.playerWillingness<50)!
    const refused=f3PlayDirectSigning(unwilling.id,{salaryShare:0.01,years:1,stopAfterAnswer:true})
    expect(refused.status).not.toBe('SIGNED');expect(isPlayerFreeAgent(f3World(),unwilling.id)).toBe(true)
    expect(Object.keys(f3World().contractsById)).toHaveLength(before)
    evidence.negative={denied,refused};writeFileSync(resolve(out,'acceptance.json'),JSON.stringify({passed:true,...evidence},null,2))
  })
})
