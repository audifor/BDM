import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { getUserTeam } from '@/engine/calendar'
import type { ScoutingRosterComparisonRow } from './buildScoutingRosterComparison'
import { buildScoutingRosterComparison } from './buildScoutingRosterComparison'
import { buildPlayerScoutingModel } from './buildPlayerScoutingModel'
import { buildPlayerScoutingDecision, defaultScoutingRosterComparisonId, scoutingRosterBenchmarks } from './buildPlayerScoutingDecision'
import { derivePlayerKnowledgeAccess } from '@/app/player/PlayerKnowledgeAccess'
import { PLAYER_TRUTH_RATING_KEYS } from '@/domain/player'

describe('PLAYER scouting decision transparency',()=>{
  it('starts with a roster teammate in the same primary position when possible',()=>{
    const world=createNewGame()
    const team=getUserTeam(world)!
    const subject=team.rosterPlayerIds[0]!
    const reference=defaultScoutingRosterComparisonId(world,subject)
    expect(reference).not.toBe(subject)
    expect(team.rosterPlayerIds).toContain(reference)
    if(team.rosterPlayerIds.some(id=>id!==subject &&
        world.players[id]?.basketball.primaryPosition===world.players[subject]?.basketball.primaryPosition)){
      expect(world.players[reference!]!.basketball.primaryPosition).toBe(world.players[subject]!.basketball.primaryPosition)
    }
  })

  it('supports an own-roster decision but never calls it match performance',()=>{
    const world=createNewGame()
    const team=getUserTeam(world)!
    const subject=team.rosterPlayerIds[0]!
    const comparison=defaultScoutingRosterComparisonId(world,subject)!
    const rows=buildScoutingRosterComparison(world,subject,comparison)
    const result=buildPlayerScoutingDecision({
      own:true,rows,scouting:buildPlayerScoutingModel(world,subject),
      comparatorName:world.players[comparison]!.lastName,
    })
    expect(result.comparableCount).toBe(80)
    expect(result.status).toBe('supported')
    expect(result.basis).toBe('Direct roster ratings')
    expect(result.meaning).not.toMatch(/will score|guarantee|must sign/i)
  })

  it('does not recommend signing an unsighted rival even when the engine has hidden truth',()=>{
    const world=createNewGame()
    const team=getUserTeam(world)!
    const subject=Object.values(world.players).find(p=>!team.rosterPlayerIds.includes(p.id))!.id
    const comparison=team.rosterPlayerIds[0]!
    const rows=buildScoutingRosterComparison(world,subject,comparison)
    const result=buildPlayerScoutingDecision({
      own:false,rows,scouting:buildPlayerScoutingModel(world,subject),
      comparatorName:world.players[comparison]!.lastName,
    })
    expect(result.headline).toBe('SCOUT FIRST · NO VERDICT')
    expect(result.status).toBe('insufficient')
    expect(result.comparableCount).toBe(0)
    expect(result.confirmedAdvantageCount).toBe(0)
  })

  it('only counts a rival advantage if even the conservative scouting bound wins by five',()=>{
    const world=createNewGame()
    const team=getUserTeam(world)!
    const subject=Object.values(world.players).find(p=>!team.rosterPlayerIds.includes(p.id))!.id
    const sample=buildScoutingRosterComparison(world,subject,team.rosterPlayerIds[0]!)[0]!
    const rows=[
      {...sample,subject:75,low:62,high:85,own:61,isEstimate:true},
      {...sample,id:buildScoutingRosterComparison(world,subject,team.rosterPlayerIds[0]!)[1]!.id,subject:65,low:64,high:82,own:64,isEstimate:true},
      {...sample,id:buildScoutingRosterComparison(world,subject,team.rosterPlayerIds[0]!)[2]!.id,subject:24,low:15,high:35,own:42,isEstimate:true},
    ] satisfies readonly ScoutingRosterComparisonRow[]
    const result=buildPlayerScoutingDecision({
      own:false,rows,scouting:buildPlayerScoutingModel(world,subject),
      comparatorName:'Bench Player',
    })
    expect(result.confirmedAdvantageCount).toBe(0)
    expect(result.confirmedConcernCount).toBe(1)
    expect(result.status).toBe('insufficient')
  })

  it('uses the true own-roster rating-mean leader rather than asserting a starting five',()=>{
    const world=createNewGame()
    const team=getUserTeam(world)!
    const subject=team.rosterPlayerIds[0]!
    const refs=scoutingRosterBenchmarks(world,subject)
    expect(team.rosterPlayerIds).toContain(refs.ratingLeader)
    const position=world.players[subject]!.basketball.primaryPosition
    const peers=team.rosterPlayerIds.filter(id=>id!==subject &&
      world.players[id]?.basketball.primaryPosition===position)
    const pool=peers.length ? peers : team.rosterPlayerIds.filter(id=>id!==subject)
    const average=(id:typeof subject)=>{
      const access=derivePlayerKnowledgeAccess(world,id)
      if(access.kind!=='own-roster')return 0
      return PLAYER_TRUTH_RATING_KEYS.reduce((sum,key)=>sum+access.currentRatings[key],0)/80
    }
    expect(pool.every(id=>average(refs.ratingLeader!)>=average(id))).toBe(true)
  })

  it('withholds a strong signing recommendation when broad ranges prevent verified playing identity',()=>{
    const world=createNewGame()
    const team=getUserTeam(world)!
    const subject=Object.values(world.players).find(p=>!team.rosterPlayerIds.includes(p.id))!.id
    const original=buildScoutingRosterComparison(world,subject,team.rosterPlayerIds[0]!).slice(0,80)
    const rows=original.map((row,i)=>({
      ...row,own:35,subject:i<24?65:38,
      low:i<24?52:25,high:i<24?78:51,isEstimate:true,
    }))
    const actual=buildPlayerScoutingModel(world,subject)
    const seeded={...actual,noteTimeline:[{id:'test-report',dateLabel:'01 OCT 2025',
      title:'Scout',detail:'Report',knowledgeState:'known' as const}],
      statusPanel:{...actual.statusPanel!,confidenceLabel:'High'}}
    const result=buildPlayerScoutingDecision({
      own:false,rows,scouting:seeded,comparatorName:'Our Guard',
    })
    expect(result.comparableCount).toBe(80)
    expect(result.confirmedAdvantageCount).toBe(24)
    expect(result.uncertainComparableCount).toBe(80)
    expect(result.status).toBe('provisional')
    expect(result.headline).toContain('VERIFY BEFORE CONTACT')
    expect(result.headline).not.toContain('EXPLORE SIGNING')
  })

  it('supports recruitment exploration only after narrow evidence and verified sporting profile',()=>{
    const world=createNewGame()
    const team=getUserTeam(world)!
    const subject=Object.values(world.players).find(p=>!team.rosterPlayerIds.includes(p.id))!.id
    const original=buildScoutingRosterComparison(world,subject,team.rosterPlayerIds[0]!).slice(0,55)
    const rows=original.map((row,i)=>({
      ...row,own:50,subject:i<24?71:52,
      low:i<24?66:48,high:i<24?76:56,isEstimate:true,
    }))
    const actual=buildPlayerScoutingModel(world,subject)
    const seeded={...actual,archetypeTitle:'Verified scouting playing profile',
      strengths:[{id:'shooting',label:'Shooting',rangeLabel:'Strong',knowledgeState:'estimated' as const}],
      noteTimeline:[{id:'test-report',dateLabel:'01 OCT 2025',
        title:'Scout',detail:'Recorded evaluation',knowledgeState:'known' as const}],
      statusPanel:{...actual.statusPanel!,confidenceLabel:'High'}}
    const result=buildPlayerScoutingDecision({
      own:false,rows,scouting:seeded,comparatorName:'Our Guard',
    })
    expect(result.status).toBe('supported')
    expect(result.headline).toContain('REVIEW OPTIONS')
    expect(result.confirmedAdvantageCount).toBe(24)
    expect(result.meaning).toContain('Cost')
    expect(result.meaning).not.toContain('will sign')
  })
})
