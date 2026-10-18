import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { getUserTeam } from '@/engine/calendar'
import { putTrainingStudioPlan, emptyTrainingStudioPlan } from '@/domain/training/TrainingStudioPlan'
import { serializeGameWorldV4, deserializeGameWorldV4 } from './GameWorldSaveV4'

describe('Training Studio Save V4 persistence', () => {
 it('preserves real macrocycles, mesocycles, goals and mentoring groups', () => {
  const original = createNewGame()
  const team = getUserTeam(original)!
  const playerIds = team.rosterPlayerIds
  const date = original.currentDate
  const end = new Date(new Date(date + 'T12:00:00Z').getTime()+60*86400000).toISOString().slice(0,10)
  const value = {...emptyTrainingStudioPlan(team.id, original.currentSeasonId),
   macrocycles:[{id:'macro:1',name:'Pretemporada',startDate:date,endDate:end,objective:'Forma física'}],
   mesocycles:[{id:'meso:1',macrocycleId:'macro:1',name:'Ataque',startDate:date,endDate:end,objective:'Espaciado',moduleId:'spacing',intensity:'normal' as const}],
   individualGoals:[{playerId:playerIds[0]!,targetRating:'threePointShooting',targetValue:79,targetDate:end,note:'Objetivo anual'}],
   mentoringGroups:[{id:'mentor:1',mentorId:playerIds[0]!,menteeIds:[playerIds[1]!],focus:'Profesionalidad',createdDate:date}]}
  const world = putTrainingStudioPlan(original,value)
  const restored = deserializeGameWorldV4(serializeGameWorldV4(world,'2026-10-17T12:00:00.000Z'))
  expect(restored.trainingStudioPlansByTeamId[team.id]).toEqual(value)
 })
})
