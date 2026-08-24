import type { GameDate } from '@/domain/date'
import type { CoachId, SeasonId, TeamId } from '@/domain/ids'

export type BoardPriority = 'critical' | 'high' | 'medium' | 'secondary'
export type BoardHorizon = 'immediate' | 'season' | 'project'
export type BoardObjectiveKind = 'winChampionship' | 'reachTopPosition' | 'avoidRelegation' | 'earnPromotion'
export type BoardOutcome = 'inProgress' | 'exceptional' | 'exceeded' | 'met' | 'nearMiss' | 'failed' | 'severelyFailed'
export type JobSecurity = 'secure' | 'stable' | 'underPressure' | 'atRisk' | 'critical'
export interface BoardProfile { readonly ambition: number; readonly patience: number; readonly stability: number; readonly resultsFocus: number; readonly developmentFocus: number; readonly prestigeFocus: number }
export interface BoardExpectation { readonly summary: string; readonly baselinePosition: number; readonly seasonId: SeasonId }
export interface BoardObjective { readonly id: string; readonly kind: BoardObjectiveKind; readonly label: string; readonly priority: BoardPriority; readonly horizon: BoardHorizon; readonly seasonId: SeasonId; readonly targetPosition?: number; readonly outcome: BoardOutcome }
export interface BoardReason { readonly id: string; readonly date: GameDate; readonly delta: number; readonly code: string; readonly detail: string }
export interface BoardState { readonly teamId: TeamId; readonly coachId: CoachId; readonly startedOn: GameDate; readonly profile: BoardProfile; readonly expectation: BoardExpectation; readonly objectives: readonly BoardObjective[]; readonly confidence: number; readonly reasons: readonly BoardReason[]; readonly processedEventKeys: readonly string[] }
export function createBoardState(input: BoardState): BoardState { if (!Number.isInteger(input.confidence)||input.confidence<0||input.confidence>100||!Number.isInteger(input.expectation.baselinePosition)||input.expectation.baselinePosition<1) throw new RangeError('Board state is invalid'); if(Object.values(input.profile).some((value)=>!Number.isInteger(value)||value<0||value>100))throw new RangeError('Board profile is invalid');return {...input,profile:{...input.profile},expectation:{...input.expectation},objectives:input.objectives.map((item)=>({...item})),reasons:input.reasons.map((item)=>({...item})),processedEventKeys:[...new Set(input.processedEventKeys)]} }
export function getJobSecurity(state: BoardState): JobSecurity { const failedCritical=state.objectives.some((item)=>item.priority==='critical'&&['failed','severelyFailed'].includes(item.outcome));const score=state.confidence+Math.floor(state.profile.patience/10);return failedCritical&&score<60||score<25?'critical':score<40?'atRisk':score<55?'underPressure':score<75?'stable':'secure' }
