import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { getUserTeam } from '@/engine/calendar'
import { updateGameWorld } from '@/domain/world'
import { ratingKnowledgeDimensionFor } from '@/domain/player/PlayerTruthCatalog'
import { buildScoutingRosterComparison } from './buildScoutingRosterComparison'

describe('PLAYER Scouting FM-style same-attribute comparison',()=>{
  it('uses canonical exact own roster ratings only when both players are ours',()=>{
    const world=createNewGame()
    const team=getUserTeam(world)!
    const [subject,other]=team.rosterPlayerIds
    const rows=buildScoutingRosterComparison(world,subject!,other!)
    expect(rows).toHaveLength(80)
    expect(rows.every(row=>row.subject!==null && row.low===row.subject && row.high===row.subject &&
      !row.isEstimate)).toBe(true)
    expect(rows.some(row=>row.own===null)).toBe(false)
  })

  it('does not expose hidden rival ratings without an individual rating evaluation',()=>{
    const world=createNewGame()
    const team=getUserTeam(world)!
    const rival=Object.keys(world.players).find(id=>!team.rosterPlayerIds.includes(id as never))!
    const rows=buildScoutingRosterComparison(world,rival as never,team.rosterPlayerIds[0]!)
    expect(rows).toHaveLength(80)
    expect(rows.every(row=>row.subject===null && row.low===null && row.high===null)).toBe(true)
    expect(rows.every(row=>row.own>=0)).toBe(true)
  })

  it('shows only a recorded uncertain estimate for the exact matching scouting rating',()=>{
    const world=createNewGame()
    const team=getUserTeam(world)!
    const rival=Object.keys(world.players).find(id=>!team.rosterPlayerIds.includes(id as never))! as never
    const key=ratingKnowledgeDimensionFor('THREE_POINT_STATIC')
    const informed=updateGameWorld(world,{
      organizationKnowledge:[
        ...world.organizationKnowledge,
        {organizationId:team.organizationId,subjectPlayerId:rival,
          dimensions:{[key]:{
            estimate:72,uncertainty:6,coverage:1,confidence:.8,
            assessedAt:world.currentDate,provenance:'scoutReport' as const,
          }}},
      ],
    })
    const rows=buildScoutingRosterComparison(informed,rival,team.rosterPlayerIds[0]!)
    const observed=rows.find(row=>row.id==='THREE_POINT_STATIC')!
    expect(observed.subject).toBe(72)
    expect(observed.low).toBe(66)
    expect(observed.high).toBe(78)
    expect(observed.isEstimate).toBe(true)
    expect(rows.filter(row=>row.subject!==null)).toHaveLength(1)
  })

  it('does not use non-roster players as own comparison baselines',()=>{
    const world=createNewGame()
    const team=getUserTeam(world)!
    const rival=Object.keys(world.players).find(id=>!team.rosterPlayerIds.includes(id as never))! as never
    expect(buildScoutingRosterComparison(world,team.rosterPlayerIds[0]!,rival)).toEqual([])
  })
})
