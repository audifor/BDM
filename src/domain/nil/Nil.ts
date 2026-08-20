import type { EcosystemId, PlayerId, TeamId } from '@/domain/ids'
import type { GameDate } from '@/domain/date'
export type NilOpportunityType='localEndorsement'|'socialCampaign'|'appearance'|'regionalBrand'|'collectiveBacked'
export type NilOpportunityStatus='available'|'accepted'|'declined'|'expired'|'completed'
export interface NilRules{readonly ecosystemId:EcosystemId;readonly enabled:boolean;readonly maxActiveDeals:number;readonly dealDurationDays:number;readonly collectiveParticipation:boolean;readonly recruitingAppealFactor:number}
export interface NilProfile{readonly id:string;readonly playerId:PlayerId;readonly ecosystemId:EcosystemId;readonly programTeamId:TeamId;readonly marketability:number}
export interface Collective{readonly id:string;readonly ecosystemId:EcosystemId;readonly programTeamId:TeamId;readonly name:string;readonly resourceCapacity:number;readonly resourcesRemaining:number}
export interface NilOpportunity{readonly id:string;readonly playerId:PlayerId;readonly type:NilOpportunityType;readonly estimatedValue:number;readonly durationDays:number;readonly status:NilOpportunityStatus;readonly createdAt:GameDate;readonly expiresAt:GameDate;readonly collectiveId?:string;readonly resourceCost?:number}
export interface NilDeal{readonly id:string;readonly playerId:PlayerId;readonly opportunityId:string;readonly type:NilOpportunityType;readonly value:number;readonly startsAt:GameDate;readonly endsAt:GameDate;readonly status:'active'|'completed'}
export const defaultNilRules=(ecosystemId:EcosystemId):NilRules=>({ecosystemId,enabled:true,maxActiveDeals:2,dealDurationDays:30,collectiveParticipation:true,recruitingAppealFactor:0})
