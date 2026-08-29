import type { GameDate } from '@/domain/date'
import type { OrganizationId, PlayerId, StaffPersonId, TeamId } from '@/domain/ids'

export const EVIDENCE_SOURCES = ['PUBLIC_DATA', 'STATISTICS', 'LIVE_SCOUTING', 'VIDEO_SCOUTING', 'OPPONENT_GAME', 'OWN_TEAM_OBSERVATION', 'STAFF_PRIOR_KNOWLEDGE', 'COMBINE', 'WORKOUT'] as const
export type EvidenceSource = typeof EVIDENCE_SOURCES[number]
export const SCOUTING_MISSIONS = ['QUICK_LOOK', 'FULL_REPORT', 'SKILL_EVALUATION', 'POTENTIAL_EVALUATION', 'TACTICAL_FIT', 'LIVE_GAME'] as const
export type ScoutingMission = typeof SCOUTING_MISSIONS[number]
export type ScoutingPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
export type ScoutingStatus = 'QUEUED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED'
export type ScoutingRequester = 'HEAD_COACH' | 'SCOUTING_DEPARTMENT'
export type EvaluatorPerk = 'EYE_FOR_SHOOTERS' | 'PROJECTION_EXPERT' | 'TAPE_GRINDER' | 'LIVE_SCOUT'
export type EvaluatorBias = 'UPSIDE_BIAS' | 'PRODUCTION_BIAS' | 'ATHLETICISM_BIAS' | 'SIZE_BIAS'
/** Partial observation only; this contract intentionally excludes PlayerTruth. */
export interface Evidence { readonly id:string; readonly organizationId:OrganizationId; readonly subjectPlayerId:PlayerId; readonly source:EvidenceSource; readonly observedAt:GameDate; readonly quality:number; readonly dimensions:readonly string[]; readonly context?:string; readonly gameId?:string }
export interface EvaluatorProfile { readonly staffPersonId:StaffPersonId; readonly experience:number; readonly perks:readonly EvaluatorPerk[]; readonly biases:readonly EvaluatorBias[] }
export interface ScoutingAssignment { readonly id:string; readonly organizationId:OrganizationId; readonly subjectPlayerId:PlayerId; readonly evaluatorStaffId:StaffPersonId; readonly missionType:ScoutingMission; readonly requestedBy:ScoutingRequester; readonly priority:ScoutingPriority; readonly createdAt:GameDate; readonly startedAt?:GameDate; readonly expectedCompletionAt?:GameDate; readonly completedAt?:GameDate; readonly status:ScoutingStatus; readonly targetDimension?:string; readonly teamContextId?:TeamId; readonly gameId?:string }
export interface EvaluatorFinding { readonly dimension:string; readonly estimate:number; readonly uncertainty:number; readonly confidence:number; readonly coverageContribution:number }
export interface EvaluatorReport { readonly id:string; readonly organizationId:OrganizationId; readonly subjectPlayerId:PlayerId; readonly evaluatorStaffId:StaffPersonId; readonly assignmentId?:string; readonly missionType:ScoutingMission; readonly createdAt:GameDate; readonly evidenceIds:readonly string[]; readonly findings:readonly EvaluatorFinding[]; readonly tacticalFit?:number }
export function createEvaluatorProfile(value:EvaluatorProfile):EvaluatorProfile { if(!Number.isInteger(value.experience)||value.experience<0||value.experience>100)throw new RangeError('Evaluator experience must be an integer from 0 to 100'); return {...value,perks:[...new Set(value.perks)],biases:[...new Set(value.biases)]} }
