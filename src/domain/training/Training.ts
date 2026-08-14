import type { GameDate } from '@/domain/date'
import type { BasketballRatingKey } from '@/domain/player'
export type TrainingIntensity='light'|'normal'|'high';export type TrainingFocus='balanced'|BasketballRatingKey;
export interface TeamTrainingPlan{readonly teamId:string;readonly intensity:TrainingIntensity;readonly focus:TrainingFocus}
export interface TrainingPlayerResult{readonly playerId:string;readonly stimulus:Readonly<Partial<Record<BasketballRatingKey,number>>>;readonly careerFatigueAdded:number}
export interface TrainingSession{readonly id:string;readonly teamId:string;readonly gameDate:GameDate;readonly intensity:TrainingIntensity;readonly focus:TrainingFocus;readonly playerResults:readonly TrainingPlayerResult[]}
export function createTrainingPlan(plan:TeamTrainingPlan):TeamTrainingPlan{if(!['light','normal','high'].includes(plan.intensity)||!['balanced','finishing','shooting','playmaking','perimeterDefense','interiorDefense','rebounding','athleticism'].includes(plan.focus))throw new RangeError('Invalid training plan');return{...plan}}
export function createDefaultTrainingPlan(teamId:string):TeamTrainingPlan{return{teamId,intensity:'normal',focus:'balanced'}}
export function trainingLoad(intensity:TrainingIntensity){return intensity==='light'?{stimulus:1,fatigue:2}:intensity==='normal'?{stimulus:2,fatigue:5}:{stimulus:3,fatigue:9}}
