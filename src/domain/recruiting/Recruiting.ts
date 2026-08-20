import type { EcosystemId, PlayerId, SeasonId, TeamId } from '@/domain/ids'
import type { GameDate } from '@/domain/date'
import type { BasketballPosition } from '@/domain/primitives'
export type RecruitingStatus='scheduled'|'open'|'signing'|'completed'
export type RecruitOrigin='preCollege'|'international'|'academy'
export type Priority='high'|'normal'|'low'
export type RecruitAction='contact'|'pitch'|'visit'|'offer'
export interface RecruitingRules{readonly poolSize:number;readonly maxSignings:number;readonly maxOffers:number;readonly periodCapacity:number;readonly costs:Readonly<Record<RecruitAction,number>>;readonly commitmentThreshold:number}
export interface RecruitingCycle{readonly id:string;readonly ecosystemId:EcosystemId;readonly sourceSeasonId:SeasonId;readonly targetSeasonId:SeasonId;readonly opensOn:GameDate;readonly signingOn:GameDate;readonly closesOn:GameDate;readonly status:RecruitingStatus;readonly rules:RecruitingRules}
export interface RecruitProfile{readonly id:string;readonly playerId:PlayerId;readonly cycleId:string;readonly origin:RecruitOrigin;readonly position:BasketballPosition;readonly publicRank:number;readonly positionRank:number;readonly tier:'elite'|'strong'|'rotation'|'developmental';readonly preferences:Readonly<Record<'opportunity'|'development'|'competing'|'coach',number>>;readonly status:'open'|'committed'|'signed'|'incoming'|'arrived'|'unsigned'}
export interface RecruitingInterest{readonly recruitId:string;readonly programTeamId:TeamId;readonly value:number}
export interface RecruitingBoardEntry{readonly programTeamId:TeamId;readonly recruitId:string;readonly priority:Priority}
export interface RecruitingOffer{readonly id:string;readonly cycleId:string;readonly recruitId:string;readonly programTeamId:TeamId;readonly status:'active'|'withdrawn'|'committed'|'signed';readonly madeOn:GameDate}
export interface RecruitingVisit{readonly id:string;readonly cycleId:string;readonly recruitId:string;readonly programTeamId:TeamId;readonly date:GameDate;readonly cost:number;readonly outcome:number}
export interface RecruitingActionRecord{readonly id:string;readonly cycleId:string;readonly recruitId:string;readonly programTeamId:TeamId;readonly kind:RecruitAction;readonly date:GameDate;readonly cost:number;readonly effect:number}
export interface RecruitingCommitment{readonly id:string;readonly cycleId:string;readonly recruitId:string;readonly programTeamId:TeamId;readonly offerId:string;readonly committedOn:GameDate}
export interface RecruitSigning{readonly id:string;readonly cycleId:string;readonly recruitId:string;readonly playerId:PlayerId;readonly programTeamId:TeamId;readonly targetSeasonId:SeasonId;readonly offerId:string;readonly signedOn:GameDate}
export const defaultRecruitingRules:RecruitingRules=Object.freeze({poolSize:72,maxSignings:4,maxOffers:8,periodCapacity:10,costs:{contact:1,pitch:2,visit:3,offer:1},commitmentThreshold:60})
