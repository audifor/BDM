import type { EcosystemId, TeamId } from '@/domain/ids'
import type { GameDate } from '@/domain/date'
export type BoosterAgenda = 'WIN_NOW'|'RECRUITING_POWER'|'NIL_STRENGTH'|'PLAYER_DEVELOPMENT'|'PROGRAM_VISIBILITY'
export interface Booster { readonly id:string; readonly ecosystemId:EcosystemId; readonly programTeamId:TeamId; readonly name:string; readonly resourceCapacity:number; readonly resourcesRemaining:number; readonly influence:number; readonly patience:number; readonly agenda:BoosterAgenda; readonly relationship:number }
export interface BoosterContribution { readonly id:string; readonly boosterId:string; readonly collectiveId:string; readonly amount:number; readonly date:GameDate; readonly status:'accepted'|'declined' }
export interface BoosterRequest { readonly id:string; readonly boosterId:string; readonly agenda:BoosterAgenda; readonly createdAt:GameDate; readonly status:'open'|'accepted'|'declined' }
