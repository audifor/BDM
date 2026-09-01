import type { GameDate } from '@/domain/date'
import type { PlayerId, StaffPersonId, TeamId } from '@/domain/ids'
import { trainingDefinitionById } from './TrainingCatalog'
import type { TrainingIntensity } from './Training'

export type ScheduledTrainingSessionStatus = 'scheduled' | 'completed'

export interface ScheduledTrainingSession {
  readonly id: string
  readonly teamId: TeamId
  readonly date: GameDate
  readonly startTime: string
  readonly durationMinutes: number
  readonly scope: 'team' | 'individual'
  readonly playerId?: PlayerId
  readonly definitionId: string
  readonly intensity: TrainingIntensity
  readonly status: ScheduledTrainingSessionStatus
  /** Staff who execute this concrete session. This is deliberately separate from plan responsibility. */
  readonly assignedStaffPersonIds?: readonly StaffPersonId[]
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
  trainingDefinitionById(input.definitionId)
  if (!['light', 'normal', 'high'].includes(input.intensity)) throw new RangeError('Invalid session intensity')
  const assigned = input.assignedStaffPersonIds
  if (assigned !== undefined && new Set(assigned).size !== assigned.length) throw new RangeError('Scheduled session staff assignments must not contain duplicates')
  return { ...input, ...(assigned === undefined ? {} : { assignedStaffPersonIds: Object.freeze([...assigned]) }), status: input.status ?? 'scheduled' }
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
