import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { getUserTeam } from '@/engine/calendar'
import type { PlayerId } from '@/domain/ids'
import { PLAYER_TRUTH_RATING_KEYS } from '@/domain/player'
import { derivePlayerKnowledgeAccess } from '@/app/player/PlayerKnowledgeAccess'
import { buildScoutingRosterComparison } from './buildScoutingRosterComparison'
import { buildPlayerScoutingModel } from './buildPlayerScoutingModel'
import { buildPlayerScoutingDecision, scoutingRosterBenchmarks } from './buildPlayerScoutingDecision'
import { positionEvidenceKeys, sharedScoutingPositions, resolveScoutingPositionMatch, SCOUTING_POSITION_KEYS } from './scoutingPositionEvidence'

const seed = () => {
  const world = createNewGame()
  const team = getUserTeam(world)!
  const ownId = team.rosterPlayerIds[0]!
  const externalId = Object.values(world.players).find(p => !team.rosterPlayerIds.includes(p.id))!.id
  return { world, team, ownId, externalId }
}
function decide(
  world: ReturnType<typeof createNewGame>, subject: PlayerId, comparator: PlayerId,
  overrides?: {own?:boolean; rows?:ReturnType<typeof buildScoutingRosterComparison>;
    scouting?:ReturnType<typeof buildPlayerScoutingModel>}
) {
  const player = world.players[subject]!
  const rival = world.players[comparator]!
  return buildPlayerScoutingDecision({
    own: overrides?.own ?? getUserTeam(world)!.rosterPlayerIds.includes(subject),
    rows: overrides?.rows ?? buildScoutingRosterComparison(world,subject,comparator),
    scouting: overrides?.scouting ?? buildPlayerScoutingModel(world,subject),
    comparatorName:rival.lastName,
    subjectPosition:player.basketball.primaryPosition,
    sharedPositions:sharedScoutingPositions(player.basketball,rival.basketball),
  })
}
describe('PLAYER Scouting positional decision safety',()=>{
  it('uses one explicitly selected common position and classifies primary/secondary claims',()=>{
    const subject={primaryPosition:'SG' as const,secondaryPositions:['PG' as const]}
    const primary={primaryPosition:'SG' as const,secondaryPositions:['SF' as const]}
    const mixed={primaryPosition:'PG' as const,secondaryPositions:['C' as const]}
    const secondary={primaryPosition:'C' as const,secondaryPositions:['PG' as const]}
    const none={primaryPosition:'C' as const,secondaryPositions:['PF' as const]}
    expect(resolveScoutingPositionMatch(subject,primary).compatibility).toBe('primary')
    expect(resolveScoutingPositionMatch(subject,mixed)).toMatchObject({position:'PG',compatibility:'mixed',subjectPrimary:false,comparatorPrimary:true})
    expect(resolveScoutingPositionMatch(subject,secondary)).toMatchObject({position:'PG',compatibility:'secondary'})
    expect(resolveScoutingPositionMatch(subject,none)).toMatchObject({position:'SG',compatibility:'none'})
    const dual={primaryPosition:'SG' as const,secondaryPositions:['PG' as const]}
    const selected=resolveScoutingPositionMatch(subject,dual,'PG')
    expect(selected).toMatchObject({position:'PG',compatibility:'secondary'})
    expect(selected.availablePositions).toEqual(['SG','PG'])
  })

  it('does not convert secondary only or primary/secondary cross roles into confirmed upgrades',()=>{
    const {world,team,ownId}=seed()
    const other=team.rosterPlayerIds.find(id=>id!==ownId)!
    const subject={primaryPosition:'SG' as const,secondaryPositions:['PG' as const]}
    const secondary={primaryPosition:'C' as const,secondaryPositions:['PG' as const]}
    const mixed={primaryPosition:'PG' as const,secondaryPositions:['C' as const]}
    const original=buildScoutingRosterComparison(world,ownId,other)
    for(const comparator of [secondary,mixed]){
      const positionMatch=resolveScoutingPositionMatch(subject,comparator)
      const result=buildPlayerScoutingDecision({
        own:true,rows:original,scouting:buildPlayerScoutingModel(world,ownId),
        comparatorName:'Comparison player',subjectPosition:'SG',
        sharedPositions:positionMatch.availablePositions,positionMatch,
      })
      expect(result.status).not.toBe('supported')
      expect(result.position).toBe('PG')
      expect(result.positionCompatibility).toBe(positionMatch.compatibility)
      expect(result.positionalEvidenceTotal).toBe(positionEvidenceKeys('PG').length)
    }
  })

  it('uses only canonical 80-rating keys for each of the five explicit unweighted position lenses',()=>{
    for (const [position,keys] of Object.entries(SCOUTING_POSITION_KEYS)){
      expect(keys).toHaveLength(14)
      expect(new Set(keys).size).toBe(14)
      expect(keys.every(key=>PLAYER_TRUTH_RATING_KEYS.includes(key))).toBe(true)
      expect(position).toMatch(/^(PG|SG|SF|PF|C)$/)
    }
  })

  it('selects same-primary-position peers only, never auto-promoting source secondaries',()=>{
    const {world,team,ownId}=seed()
    const benchmark=scoutingRosterBenchmarks(world,ownId)
    const subject=world.players[ownId]!.basketball
    for(const id of [benchmark.rolePeer,benchmark.ratingLeader]){
      if(id===null)continue
      expect(team.rosterPlayerIds).toContain(id)
      expect(id).not.toBe(ownId)
      expect(world.players[id]!.basketball.primaryPosition).toBe(subject.primaryPosition)
    }
    if(benchmark.rolePeer!==null){
      const verdict=decide(world,ownId,benchmark.rolePeer)
      expect(verdict.positionMatched).toBe(true)
      expect(verdict.positionalComparableCount).toBe(14)
      expect(verdict.positionalEvidenceTotal).toBe(14)
      expect(verdict.status).toBe('supported')
      expect(verdict.basis).toBe('Direct roster ratings')
      expect(verdict.meaning).not.toMatch(/starting five|guaranteed starter|must keep/)
    }
  })

  it('does not manufacture an auto peer when all other players list all positions as secondary',()=>{
    const {world,team,ownId}=seed()
    const subject=world.players[ownId]!
    const positions=['PG','SG','SF','PF','C'] as const
    const otherPrimary=positions.find(position=>position!==subject.basketball.primaryPosition)!
    const rewrittenPlayers={...world.players}
    for(const id of team.rosterPlayerIds.filter(id=>id!==ownId)){
      const existing=world.players[id]!
      rewrittenPlayers[id]={...existing,basketball:{...existing.basketball,
        primaryPosition:otherPrimary,
        secondaryPositions:positions.filter(position=>position!==otherPrimary),
      }}
    }
    const modeledWorld={...world,players:rewrittenPlayers}
    const automatic=scoutingRosterBenchmarks(modeledWorld,ownId)
    expect(automatic.rolePeer).toBeNull()
    expect(automatic.ratingLeader).toBeNull()
    const other=rewrittenPlayers[team.rosterPlayerIds.find(id=>id!==ownId)!]!
    expect(resolveScoutingPositionMatch(subject.basketball,other.basketball).compatibility).toBe('mixed')
  })

  it('chooses a positional rating leader by transparent relevant-key mean, not all 80',()=>{
    const {world,team,ownId}=seed()
    const leader=scoutingRosterBenchmarks(world,ownId).ratingLeader
    if(leader===null)return
    const subject=world.players[ownId]!.basketball
    const peers=team.rosterPlayerIds.filter(id=>id!==ownId &&
      world.players[id]!.basketball.primaryPosition===subject.primaryPosition)
    const average=(id:PlayerId)=>{
      const access=derivePlayerKnowledgeAccess(world,id)
      if(access.kind!=='own-roster')return 0
      const position=subject.primaryPosition
      const keys=positionEvidenceKeys(position)
      return keys.reduce((sum,key)=>sum+access.currentRatings[key],0)/keys.length
    }
    expect(peers.every(id=>average(leader)>=average(id))).toBe(true)
  })

  it('keeps 80 rating comparison available but blocks cross-position sporting verdicts',()=>{
    const {world,team}=seed()
    const candidates=team.rosterPlayerIds
    const subject=candidates.find(id=>candidates.some(other=>other!==id &&
      sharedScoutingPositions(world.players[id]!.basketball,world.players[other]!.basketball).length===0))!
    const other=candidates.find(id=>id!==subject &&
      sharedScoutingPositions(world.players[subject]!.basketball,world.players[id]!.basketball).length===0)!
    expect(subject).toBeDefined()
    expect(other).toBeDefined()
    const result=decide(world,subject,other)
    expect(result.comparableCount).toBe(80)
    expect(result.positionMatched).toBe(false)
    expect(result.status).toBe('insufficient')
    expect(result.headline).toBe('CROSS-POSITION · NO FIT VERDICT')
    expect(result.meaning).toContain('cannot justify')
  })

  it('does not leak unscouted rival attributes or recommend signing',()=>{
    const {world,ownId,externalId}=seed()
    const result=decide(world,externalId,ownId)
    expect(result.comparableCount).toBe(0)
    expect(result.positionalComparableCount).toBe(0)
    expect(result.confirmedAdvantageCount).toBe(0)
    expect(result.status).toBe('insufficient')
  })

  it('requires position-specific coverage, not 80 generic attributes, to support a recruitment recommendation',()=>{
    const {world,team,externalId}=seed()
    const subject=world.players[externalId]!.basketball
    const other=team.rosterPlayerIds.find(id=>
      sharedScoutingPositions(subject,world.players[id]!.basketball).length>0)
    if(other===undefined)return
    const position=sharedScoutingPositions(subject,world.players[other]!.basketball)[0]!
    const keys=new Set(positionEvidenceKeys(position))
    const baseline=buildScoutingRosterComparison(world,externalId,other)
    // 66 external attributes are excellent but only a few are relevant to the position.
    const rows=baseline.map(row=>keys.has(row.id)
      ? {...row,subject:null,low:null,high:null}
      : {...row,own:45,subject:85,low:78,high:90})
    const result=decide(world,externalId,other,{rows})
    expect(result.comparableCount).toBe(66)
    expect(result.positionalComparableCount).toBe(0)
    expect(result.status).toBe('insufficient')
    expect(result.headline).toContain('MORE EVIDENCE')
  })

  it('withholds a signing conclusion with 14 position ratings but wide ranges and unverified archetype',()=>{
    const {world,team,externalId}=seed()
    const subject=world.players[externalId]!.basketball
    const other=team.rosterPlayerIds.find(id=>
      sharedScoutingPositions(subject,world.players[id]!.basketball).length>0)
    if(other===undefined)return
    const keys=new Set(positionEvidenceKeys(sharedScoutingPositions(subject,world.players[other]!.basketball)[0]!))
    const rows=buildScoutingRosterComparison(world,externalId,other).map(row=>({
      ...row,own:35,subject:65,low:keys.has(row.id)?50:55,high:keys.has(row.id)?80:75,isEstimate:true,
    }))
    const original=buildPlayerScoutingModel(world,externalId)
    const scouting={...original,noteTimeline:[{id:'report',dateLabel:'01 OCT 2025',
      title:'Scout',detail:'Reported',knowledgeState:'known' as const}],
      statusPanel:{...original.statusPanel!,confidenceLabel:'High'}}
    const result=decide(world,externalId,other,{own:false,rows,scouting})
    expect(result.positionalComparableCount).toBe(14)
    expect(result.uncertainComparableCount).toBe(80)
    expect(result.status).toBe('provisional')
    expect(result.headline).toContain('VERIFY POSITIONAL CASE')
  })

  it('allows investigating a positional upgrade only with narrow ranges, evidence and same-position benchmark',()=>{
    const {world,team,externalId}=seed()
    const subject=world.players[externalId]!.basketball
    const other=team.rosterPlayerIds.find(id=>
      sharedScoutingPositions(subject,world.players[id]!.basketball).length>0)
    if(other===undefined)return
    const keys=new Set(positionEvidenceKeys(sharedScoutingPositions(subject,world.players[other]!.basketball)[0]!))
    const rows=buildScoutingRosterComparison(world,externalId,other).map(row=>({
      ...row,own:50,subject:keys.has(row.id)?76:52,
      low:keys.has(row.id)?70:48,high:keys.has(row.id)?82:56,isEstimate:true,
    }))
    const original=buildPlayerScoutingModel(world,externalId)
    const scouting={...original,archetypeTitle:'Observed playing identity',
      strengths:[{id:'shooting',label:'Shooting',rangeLabel:'Above average',knowledgeState:'estimated' as const}],
      noteTimeline:[{id:'report',dateLabel:'01 OCT 2025',title:'Scout',detail:'Evidence',knowledgeState:'known' as const}],
      statusPanel:{...original.statusPanel!,confidenceLabel:'High'}}
    const result=decide(world,externalId,other,{own:false,rows,scouting})
    expect(result.positionalAdvantageCount).toBe(14)
    expect(result.status).toBe('supported')
    expect(result.headline).toContain('POSITIONAL UPGRADE')
    expect(result.meaning).toContain('tactical')
  })
})
