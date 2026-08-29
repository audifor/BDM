import type { GameDate } from '@/domain/date'
import type { StaffPersonId } from '@/domain/ids'
import type { BasketballRatingKey } from '@/domain/player'
export type TrainingIntensity='light'|'normal'|'high';export type TrainingFocus='balanced'|BasketballRatingKey;
export type TrainingModuleId='balanced'|'shooting'|'finishing'|'creation'|'defense'|'rebounding'|'physical'
export type TrainingResponsibility='teamTraining'|'individualDevelopment'|'physicalLoad'
export interface TrainingModule { readonly id:TrainingModuleId; readonly category:TrainingFocus; readonly defaultIntensity:TrainingIntensity; readonly scope:'team'|'individual'|'both' }
export interface IndividualTrainingPlan { readonly playerId:string; readonly primaryFocus:TrainingFocus; readonly intensity:TrainingIntensity; readonly responsibleStaffId?:StaffPersonId; readonly moduleId?:TrainingModuleId; readonly active:boolean }
export interface TeamTrainingPlan{readonly teamId:string;readonly intensity:TrainingIntensity;readonly focus:TrainingFocus;readonly moduleId?:TrainingModuleId}
export interface TrainingPlayerResult{readonly playerId:string;readonly stimulus:Readonly<Partial<Record<BasketballRatingKey,number>>>;readonly careerFatigueAdded:number}
export interface TrainingSession{readonly id:string;readonly teamId:string;readonly gameDate:GameDate;readonly intensity:TrainingIntensity;readonly focus:TrainingFocus;readonly playerResults:readonly TrainingPlayerResult[]}
export const TRAINING_MODULES:readonly TrainingModule[] = Object.freeze([
  {id:'balanced',category:'balanced',defaultIntensity:'normal',scope:'both'}, {id:'shooting',category:'shooting',defaultIntensity:'normal',scope:'both'}, {id:'finishing',category:'finishing',defaultIntensity:'normal',scope:'both'}, {id:'creation',category:'playmaking',defaultIntensity:'normal',scope:'both'}, {id:'defense',category:'perimeterDefense',defaultIntensity:'normal',scope:'both'}, {id:'rebounding',category:'rebounding',defaultIntensity:'normal',scope:'both'}, {id:'physical',category:'athleticism',defaultIntensity:'normal',scope:'both'},
])
export function createTrainingPlan(plan:TeamTrainingPlan):TeamTrainingPlan{validateTraining(plan.intensity,plan.focus,plan.moduleId);return{...plan}}
export function createIndividualTrainingPlan(plan:IndividualTrainingPlan):IndividualTrainingPlan{if(!plan.playerId||typeof plan.active!=='boolean')throw new RangeError('Invalid individual training plan');validateTraining(plan.intensity,plan.primaryFocus,plan.moduleId);return{...plan}}
export function createDefaultTrainingPlan(teamId:string):TeamTrainingPlan{return{teamId,intensity:'normal',focus:'balanced'}}
export function trainingLoad(intensity:TrainingIntensity){return intensity==='light'?{stimulus:1,fatigue:2}:intensity==='normal'?{stimulus:2,fatigue:5}:{stimulus:3,fatigue:9}}
export function trainingModuleById(id:TrainingModuleId):TrainingModule { const module=TRAINING_MODULES.find(item=>item.id===id); if(!module)throw new RangeError('Invalid training module'); return module }
function validateTraining(intensity:TrainingIntensity,focus:TrainingFocus,moduleId?:TrainingModuleId):void { if(!['light','normal','high'].includes(intensity)||!['balanced','finishing','shooting','playmaking','perimeterDefense','interiorDefense','rebounding','athleticism'].includes(focus))throw new RangeError('Invalid training plan');if(moduleId!==undefined)trainingModuleById(moduleId) }
