import type { GameDate } from '@/domain/date'
import type { CoachId, CompetitionId, SeasonId, TeamId } from '@/domain/ids'
export type CoachAchievementType='championship'|'promotion'|'exceptionalSeason'|'dynasty'|'hallInduction'
export type GlobalLegacyStatus='unproven'|'established'|'notable'|'distinguished'|'historic'|'legendary'
export type ClubLegacyStatus='forgettable'|'remembered'|'respected'|'icon'|'clubLegend'
export type HallStatus='notEligible'|'eligible'|'candidate'|'inducted'
export interface CoachAchievement{readonly id:string;readonly coachId:CoachId;readonly teamId?:TeamId;readonly competitionId?:CompetitionId;readonly seasonId:SeasonId;readonly type:CoachAchievementType;readonly legacyValue:number;readonly sourceEventKey:string;readonly occurredOn:GameDate}
export interface CoachTenure{readonly id:string;readonly coachId:CoachId;readonly teamId:TeamId;readonly startedOn:GameDate;readonly endedOn?:GameDate;readonly achievementIds:readonly string[];readonly seasonsManaged?:number;readonly processedSeasonIds?:readonly string[];readonly milestoneKeys?:readonly string[];readonly dynastyCount?:number}
export interface CoachTeamLegacy{readonly coachId:CoachId;readonly teamId:TeamId;readonly tenureIds:readonly string[];readonly legacyValue:number;readonly status:ClubLegacyStatus;readonly milestoneKeys?:readonly string[]}
export interface CoachLegacyState{readonly coachId:CoachId;readonly achievementIds:readonly string[];readonly tenureIds:readonly string[];readonly legacyValue:number;readonly status:GlobalLegacyStatus;readonly hallStatus:HallStatus;readonly processedEventKeys:readonly string[];readonly milestoneKeys?:readonly string[]}
export function coachTeamLegacyKey(coachId:CoachId,teamId:TeamId){return `${coachId}:${teamId}`}
