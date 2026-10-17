import { describe, it, expect } from 'vitest'
import { createTrainingStudioPlan, emptyTrainingStudioPlan } from './TrainingStudioPlan'
describe('Training Studio periodization boundaries', () => {
 it('creates empty canonical intent',()=>expect(emptyTrainingStudioPlan('team:1','season:1').mentoringGroups).toEqual([]))
 it('rejects mesocycles outside their macrocycle',()=>{
  const plan = { ...emptyTrainingStudioPlan('team:1','season:1'), macrocycles:[{id:'macro',name:'Season',startDate:'2026-07-01',endDate:'2027-06-30',objective:'Compete'}], mesocycles:[{id:'meso',macrocycleId:'macro',name:'Preseason',startDate:'2026-06-01',endDate:'2026-08-01',objective:'Conditioning',moduleId:'conditioning',intensity:'normal' as const}] }
  expect(()=>createTrainingStudioPlan(plan)).toThrow(/outside macrocycle/)
 })
 it('rejects duplicate mentoring members',()=>{
  const plan = { ...emptyTrainingStudioPlan('team:1','season:1'),mentoringGroups:[{id:'mentoring:1',mentorId:'a',menteeIds:['b','b'],focus:'Teamwork',createdDate:'2026-10-17'}]}
  expect(()=>createTrainingStudioPlan(plan)).toThrow(/Invalid mentoring/)
 })
})
