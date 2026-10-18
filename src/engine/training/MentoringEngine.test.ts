import { describe, it, expect } from 'vitest'
import { createNewGame } from '@/app/game'
import { getUserTeam } from '@/engine/calendar'
import { updateGameWorld } from '@/domain/world'
import { emptyTrainingStudioPlan, putTrainingStudioPlan } from '@/domain/training/TrainingStudioPlan'
import { progressTrainingMentoring } from './MentoringEngine'
import { relationshipKey } from '@/domain/relationships'
import type { GameDate } from '@/domain/date'
const add=(date:string,days:number)=>new Date(Date.parse(date+'T12:00:00Z')+days*86400000).toISOString().slice(0,10)
it('mentor actions are slow, bounded, traceable and idempotent',()=>{
 const base=createNewGame()
 const team=getUserTeam(base)!
 const monday=add(base.currentDate, (8-new Date(base.currentDate+'T12:00:00Z').getUTCDay())%7 || 7)
 const world=updateGameWorld(base,{currentDate:monday as GameDate})
 const mentor=team.rosterPlayerIds[0]!,mentee=team.rosterPlayerIds[1]!
 const plan={...emptyTrainingStudioPlan(team.id,world.currentSeasonId),mentoringGroups:[{id:'mentor:test',mentorId:mentor,menteeIds:[mentee],focus:'Profesionalidad',createdDate:add(monday,-28)}]}
 const before=putTrainingStudioPlan(world,plan)
 const after=progressTrainingMentoring(before)
 const key=relationshipKey(mentee,mentor)
 expect(after.relationshipsByKey[key]?.events).toHaveLength(1)
 expect(progressTrainingMentoring(after).relationshipsByKey[key]?.events).toHaveLength(1)
 expect(after.personalitiesByPersonId[mentee]?.values.professionalism).toBeLessThanOrEqual(100)
})
describe('mentoring eligibility',()=>{
 it('does not execute before the first monthly checkpoint',()=>{
  const base=createNewGame()
  expect(progressTrainingMentoring(base)).toBe(base)
 })
})
