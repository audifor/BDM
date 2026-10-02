import type { GameDate } from '@/domain/date'
import type { InjuryId, PlayerId, StaffPersonId, TeamId } from '@/domain/ids'
import { trainingDefinitionById } from './TrainingCatalog'
import type { TrainingIntensity } from './Training'
import type { StaffRoleId } from '@/domain/staff'

export type ScheduledTrainingSessionStatus = 'scheduled' | 'completed'
export type TrainingParticipation = 'FULL' | 'REDUCED' | 'REST'

export interface TrainingParticipantExecutionEvidence {
  readonly playerId: PlayerId
  readonly participation: TrainingParticipation
  readonly careerFatigueDelta: number
  readonly moraleDelta?: number
  readonly developmentStimulusEventId?: string
  readonly injuryIds: readonly InjuryId[]
}

export interface TrainingExecutionEvidence {
  readonly completedOn: GameDate
  readonly moduleName: string
  readonly category: import('./TrainingCatalog').TrainingCategory
  readonly effectiveIntensity: TrainingIntensity
  readonly executingStaffPersonIds: readonly StaffPersonId[]
  readonly executingStaffRoles: readonly { readonly staffId: StaffPersonId; readonly roleId: StaffRoleId }[]
  readonly plannedModuleName: string
  readonly executionQualityMultiplier: number
  readonly participants: readonly TrainingParticipantExecutionEvidence[]
  readonly cohesionDelta: number
}

export interface ScheduledTrainingSession {
  readonly id: string
  readonly teamId: TeamId
  readonly date: GameDate
  readonly startTime: string
  readonly durationMinutes: number
  readonly scope: 'team' | 'individual'
  readonly playerId?: PlayerId
  readonly definitionId: string
  /**
   * Module the caller scheduled, when the session came from a training module rather than a raw
   * definition. A user-created module executes as its base definition, so without this the chosen
   * module would be unrecoverable from the scheduled session.
   */
  readonly moduleId?: string
  readonly intensity: TrainingIntensity
  readonly status: ScheduledTrainingSessionStatus
  /**
   * Staff assigned to execute this pending concrete session. This is deliberately separate from
   * plan/intensity Responsibilities. The active assignment is consumed when the session completes;
   * it is not an employment-history record.
   */
  readonly assignedStaffPersonIds?: readonly StaffPersonId[]
  /** Explicit per-player exceptions to the derived team-session recommendation. */
  readonly participationByPlayerId?: Readonly<Record<string, TrainingParticipation>>
  /** Immutable factual evidence attached when this scheduled session completes. */
  readonly execution?: TrainingExecutionEvidence
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/

export function timeToMinutes(time: string): number {
  const match = TIME_PATTERN.exec(time)
  if (!match) throw new RangeError(`Invalid session time: ${time}`)
  return Number(match[1]) * 60 + Number(match[2])
}

export function createScheduledTrainingSession(input: Omit<ScheduledTrainingSession, 'status'> & { readonly status?: ScheduledTrainingSessionStatus }): ScheduledTrainingSession {
  if (!input.id.trim()) throw new RangeError('Scheduled session id is required')
  if (!input.teamId) throw new RangeError('Scheduled session teamId is required')
  timeToMinutes(input.startTime)
  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes <= 0 || input.durationMinutes > 240) {
    throw new RangeError('Scheduled session duration must be an integer between 1 and 240 minutes')
  }
  if (input.scope === 'individual' && input.playerId === undefined) throw new RangeError('Individual sessions require a playerId')
  if (input.scope === 'team' && input.playerId !== undefined) throw new RangeError('Team sessions must not specify a playerId')
  if (input.moduleId !== undefined && input.moduleId.trim() === '') throw new RangeError('Scheduled session moduleId must not be blank')
  trainingDefinitionById(input.definitionId)
  if (!['light', 'normal', 'high'].includes(input.intensity)) throw new RangeError('Invalid session intensity')
  const assigned = input.assignedStaffPersonIds
  if (assigned !== undefined && new Set(assigned).size !== assigned.length) throw new RangeError('Scheduled session staff assignments must not contain duplicates')
  if (input.participationByPlayerId !== undefined) {
    if (input.scope !== 'team') throw new RangeError('Player participation only applies to team sessions')
    for (const value of Object.values(input.participationByPlayerId)) if (!['FULL', 'REDUCED', 'REST'].includes(value)) throw new RangeError('Invalid team-session participation')
  }
  if (input.execution !== undefined && input.status !== 'completed') throw new RangeError('Only a completed Training session can have execution evidence')
  if (input.execution !== undefined) {
    const evidence = input.execution
    if (evidence.completedOn !== input.date || !evidence.moduleName.trim() || !evidence.plannedModuleName.trim() || !['shooting', 'finishing', 'ballHandling', 'playmaking', 'defense', 'rebounding', 'physical', 'recovery', 'tactical'].includes(evidence.category)) throw new RangeError('Training execution evidence identity is invalid')
    if (!['light', 'normal', 'high'].includes(evidence.effectiveIntensity) || !Number.isFinite(evidence.executionQualityMultiplier) || evidence.executionQualityMultiplier < 0.9 || evidence.executionQualityMultiplier > 1.18 || !Number.isFinite(evidence.cohesionDelta)) throw new RangeError('Training execution evidence effects are invalid')
    if (new Set(evidence.executingStaffPersonIds).size !== evidence.executingStaffPersonIds.length || new Set(evidence.executingStaffRoles.map((staff) => staff.staffId)).size !== evidence.executingStaffRoles.length || new Set(evidence.participants.map((participant) => participant.playerId)).size !== evidence.participants.length) throw new RangeError('Training execution evidence must not contain duplicate participants or Staff')
    for (const participant of evidence.participants) {
      if (!['FULL', 'REDUCED', 'REST'].includes(participant.participation) || !Number.isFinite(participant.careerFatigueDelta) || (participant.moraleDelta !== undefined && !Number.isFinite(participant.moraleDelta)) || new Set(participant.injuryIds).size !== participant.injuryIds.length) throw new RangeError('Training participant execution evidence is invalid')
      if (participant.participation === 'REST' && (participant.careerFatigueDelta !== 0 || participant.developmentStimulusEventId !== undefined || participant.injuryIds.length > 0 || (participant.moraleDelta ?? 0) !== 0)) throw new RangeError('REST participation cannot have Training effects')
    }
  }
  const execution = input.execution === undefined ? undefined : Object.freeze({
    ...input.execution,
    executingStaffPersonIds: Object.freeze([...input.execution.executingStaffPersonIds]),
    executingStaffRoles: Object.freeze(input.execution.executingStaffRoles.map((staff) => Object.freeze({ ...staff }))),
    participants: Object.freeze(input.execution.participants.map((participant) => Object.freeze({ ...participant, injuryIds: Object.freeze([...participant.injuryIds]) }))),
  })
  return { ...input, ...(assigned === undefined ? {} : { assignedStaffPersonIds: Object.freeze([...assigned]) }), ...(input.participationByPlayerId === undefined ? {} : { participationByPlayerId: Object.freeze({ ...input.participationByPlayerId }) }), ...(execution === undefined ? {} : { execution }), status: input.status ?? 'scheduled' }
}

/** True if two sessions occupy overlapping time ranges on the same date. */
function timeRangesOverlap(a: ScheduledTrainingSession, b: ScheduledTrainingSession): boolean {
  if (a.date !== b.date) return false
  const startA = timeToMinutes(a.startTime)
  const endA = startA + a.durationMinutes
  const startB = timeToMinutes(b.startTime)
  const endB = startB + b.durationMinutes
  return startA < endB && startB < endA
}

/** Two sessions collide if they overlap in time and share a scope-relevant scheduling resource:
 * the same team (team sessions), or the same player (individual sessions for that player). */
function sessionsCollide(a: ScheduledTrainingSession, b: ScheduledTrainingSession): boolean {
  if (!timeRangesOverlap(a, b)) return false
  if (a.scope === 'team' && b.scope === 'team') return a.teamId === b.teamId
  if (a.scope === 'individual' && b.scope === 'individual') return a.playerId === b.playerId
  if (a.scope === 'team' && b.scope === 'individual') return a.teamId === b.teamId
  if (a.scope === 'individual' && b.scope === 'team') return a.teamId === b.teamId
  return false
}

/** Finds an existing session (excluding one with the same id) that collides with the candidate. */
export function findCollidingSession(candidate: ScheduledTrainingSession, existing: readonly ScheduledTrainingSession[]): ScheduledTrainingSession | undefined {
  return existing.find((session) => session.id !== candidate.id && sessionsCollide(candidate, session))
}
