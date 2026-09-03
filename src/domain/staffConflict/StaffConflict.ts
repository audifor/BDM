import { parseGameDate, type GameDate } from '@/domain/date'
import { requireNonEmptyString } from '@/domain/validation'

export const STAFF_CONFLICT_TYPES = ['RESPONSIBILITY', 'AUTHORITY', 'ROLE', 'PROFESSIONAL_METHOD', 'STRATEGY', 'COMMUNICATION', 'WORKLOAD', 'RESOURCE', 'RECOGNITION', 'CAREER', 'PERSONAL', 'ETHICAL'] as const
export type StaffConflictType = typeof STAFF_CONFLICT_TYPES[number]
export const STAFF_CONFLICT_PRIMARY_CAUSES = ['responsibilityRemoved', 'responsibilityReduced', 'responsibilityReassigned', 'responsibilityOverlap', 'recommendationRejected', 'repeatedProfessionalDisregard', 'roleReduced', 'roleExpectationMismatch', 'promotionPassedOver', 'autonomyDeficit', 'influenceDeficit', 'decisionAccessDeficit', 'informationAccessDeficit', 'workloadImbalance', 'sustainedOverload', 'professionalFailure', 'professionalBlame', 'methodDisagreement', 'strategicDisagreement', 'poorCommunication', 'lowTrust', 'lowProfessionalRespect', 'lowAlignment', 'cultureMismatch', 'leadershipMismatch', 'resourceDeficit', 'recognitionDeficit', 'personalFriction', 'ethicalDisagreement'] as const
export type StaffConflictPrimaryCause = typeof STAFF_CONFLICT_PRIMARY_CAUSES[number]
export const STAFF_CONFLICT_STATUSES = ['ACTIVE', 'RESOLVED'] as const
export type StaffConflictStatus = typeof STAFF_CONFLICT_STATUSES[number]
export const STAFF_CONFLICT_STAGES = ['LATENT', 'EMERGING', 'ACTIVE', 'ESCALATING', 'COOLING', 'RESOLVING', 'RESOLVED'] as const
export type StaffConflictStage = typeof STAFF_CONFLICT_STAGES[number]
export const STAFF_CONFLICT_SEVERITIES = ['MINOR', 'MODERATE', 'SERIOUS', 'SEVERE', 'CRITICAL'] as const
export type StaffConflictSeverity = typeof STAFF_CONFLICT_SEVERITIES[number]
export const STAFF_CONFLICT_PARTICIPANT_ROLES = ['PRIMARY', 'SECONDARY', 'SUPPORTER', 'OPPOSING_SUPPORTER', 'MEDIATOR'] as const
export type StaffConflictParticipantRole = typeof STAFF_CONFLICT_PARTICIPANT_ROLES[number]
export const STAFF_CONFLICT_PARTICIPANT_STATE_DIMENSIONS = ['grievance', 'willingnessToCompromise', 'perceivedFairness', 'emotionalInvestment'] as const
export type StaffConflictParticipantStateDimension = typeof STAFF_CONFLICT_PARTICIPANT_STATE_DIMENSIONS[number]
export const STAFF_CONFLICT_RESOLUTION_TYPES = ['MUTUAL', 'MEDIATED', 'MANAGEMENT_DECISION', 'ONE_SIDE_CONCEDES', 'STRUCTURAL_CHANGE', 'FADED', 'UNRESOLVED'] as const
export type StaffConflictResolutionType = typeof STAFF_CONFLICT_RESOLUTION_TYPES[number]

export interface StaffConflictParticipantState { readonly grievance: number; readonly willingnessToCompromise: number; readonly perceivedFairness: number; readonly emotionalInvestment: number }
export interface StaffConflictParticipant { readonly actorId: string; readonly role: StaffConflictParticipantRole; readonly state: StaffConflictParticipantState; readonly joinedOn: GameDate; readonly leftOn?: GameDate }
export interface StaffConflictResolution { readonly type: StaffConflictResolutionType; readonly resolvedOn: GameDate }
export interface StaffConflict {
  readonly id: string; readonly scopeKey: string; readonly teamId?: string; readonly type: StaffConflictType; readonly primaryCause: StaffConflictPrimaryCause
  readonly startedOn: GameDate; readonly lastEvaluatedOn: GameDate; readonly resolvedOn?: GameDate; readonly status: StaffConflictStatus; readonly stage: StaffConflictStage; readonly severity: StaffConflictSeverity
  readonly participants: readonly StaffConflictParticipant[]; readonly sourceTriggerIds: readonly string[]; readonly resolution?: StaffConflictResolution
}
export interface StaffConflictTrigger { readonly id: string; readonly occurredOn: GameDate; readonly scopeKey: string; readonly teamId?: string; readonly subjectActorId: string; readonly counterpartActorId: string; readonly type: StaffConflictType; readonly cause: StaffConflictPrimaryCause; readonly basePressure: number; readonly sourceKind: string; readonly sourceId?: string; readonly context?: Readonly<Record<string, string | number | boolean>> }

export function clampStaffConflictState(value: number): number { return !Number.isFinite(value) ? 50 : Math.max(0, Math.min(100, Math.round(value))) }
export function createStaffConflictParticipantState(input: StaffConflictParticipantState): StaffConflictParticipantState { return { grievance: clampStaffConflictState(input.grievance), willingnessToCompromise: clampStaffConflictState(input.willingnessToCompromise), perceivedFairness: clampStaffConflictState(input.perceivedFairness), emotionalInvestment: clampStaffConflictState(input.emotionalInvestment) } }
export function createStaffConflict(input: StaffConflict): StaffConflict {
  const participants = input.participants.map((participant) => ({ actorId: requireNonEmptyString(participant.actorId, 'Staff conflict participant'), role: enumValue(participant.role, STAFF_CONFLICT_PARTICIPANT_ROLES, 'Staff conflict participant role'), state: createStaffConflictParticipantState(participant.state), joinedOn: parseGameDate(participant.joinedOn), ...(participant.leftOn === undefined ? {} : { leftOn: parseGameDate(participant.leftOn) }) }))
  if (participants.length < 2 || new Set(participants.map((item) => item.actorId)).size !== participants.length) throw new RangeError('Staff conflict requires unique participants')
  const status = enumValue(input.status, STAFF_CONFLICT_STATUSES, 'Staff conflict status'); const stage = enumValue(input.stage, STAFF_CONFLICT_STAGES, 'Staff conflict stage')
  if ((status === 'ACTIVE') !== (input.resolvedOn === undefined) || (status === 'ACTIVE') !== (input.resolution === undefined) || (status === 'ACTIVE') !== (stage !== 'RESOLVED')) throw new RangeError('Staff conflict status, stage and resolution are inconsistent')
  const sourceTriggerIds = [...input.sourceTriggerIds]
  if (sourceTriggerIds.some((id) => !id.trim()) || new Set(sourceTriggerIds).size !== sourceTriggerIds.length) throw new RangeError('Staff conflict trigger ids must be unique')
  return { id: requireNonEmptyString(input.id, 'Staff conflict ID'), scopeKey: requireNonEmptyString(input.scopeKey, 'Staff conflict scope key'), ...(input.teamId === undefined ? {} : { teamId: requireNonEmptyString(input.teamId, 'Staff conflict team') }), type: enumValue(input.type, STAFF_CONFLICT_TYPES, 'Staff conflict type'), primaryCause: enumValue(input.primaryCause, STAFF_CONFLICT_PRIMARY_CAUSES, 'Staff conflict cause'), startedOn: parseGameDate(input.startedOn), lastEvaluatedOn: parseGameDate(input.lastEvaluatedOn), status, stage, severity: enumValue(input.severity, STAFF_CONFLICT_SEVERITIES, 'Staff conflict severity'), participants, sourceTriggerIds, ...(input.resolvedOn === undefined ? {} : { resolvedOn: parseGameDate(input.resolvedOn) }), ...(input.resolution === undefined ? {} : { resolution: { type: enumValue(input.resolution.type, STAFF_CONFLICT_RESOLUTION_TYPES, 'Staff conflict resolution type'), resolvedOn: parseGameDate(input.resolution.resolvedOn) } }) }
}
export function createStaffConflictTrigger(input: StaffConflictTrigger): StaffConflictTrigger { if (!Number.isFinite(input.basePressure) || input.basePressure < 0 || input.basePressure > 100 || input.subjectActorId === input.counterpartActorId) throw new RangeError('Invalid staff conflict trigger'); return { ...input, id: requireNonEmptyString(input.id, 'Staff conflict trigger ID'), occurredOn: parseGameDate(input.occurredOn), scopeKey: requireNonEmptyString(input.scopeKey, 'Staff conflict trigger scope'), subjectActorId: requireNonEmptyString(input.subjectActorId, 'Staff conflict trigger subject'), counterpartActorId: requireNonEmptyString(input.counterpartActorId, 'Staff conflict trigger counterpart'), type: enumValue(input.type, STAFF_CONFLICT_TYPES, 'Staff conflict trigger type'), cause: enumValue(input.cause, STAFF_CONFLICT_PRIMARY_CAUSES, 'Staff conflict trigger cause'), context: input.context === undefined ? undefined : { ...input.context } } }
export function staffConflictGroupingKey(conflict: Pick<StaffConflict, 'scopeKey' | 'type' | 'participants'>): string { return `${conflict.scopeKey}:${[...conflict.participants].filter((item) => item.role === 'PRIMARY' || item.role === 'SECONDARY').map((item) => item.actorId).sort().join(':')}:${conflict.type}` }
export function staffConflictIdFor(trigger: StaffConflictTrigger): string { return `staff-conflict:${trigger.scopeKey}:${[trigger.subjectActorId, trigger.counterpartActorId].sort().join(':')}:${trigger.type}:${trigger.occurredOn}:${trigger.id}` }
function enumValue<T extends string>(value: string, values: readonly T[], name: string): T { if (!(values as readonly string[]).includes(value)) throw new RangeError(`${name} is invalid`); return value as T }
