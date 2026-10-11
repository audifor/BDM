import { parseGameDate, type GameDate } from '@/domain/date'
import type { InjuryId, PlayerId, TeamId, StaffPersonId } from '@/domain/ids'
import { createPhysicalAllocation, type PhysicalAllocation } from '@/domain/facilities/PhysicalAllocation'
import { createClinicalAuthorization, type ClinicalAuthorization } from '@/domain/staff/ClinicalAuthorization'
import { createTeamStaffAssignment, type TeamStaffAssignment } from '@/domain/staff/StaffPerson'

export type EquippedMedicalStatus = 'INDICATED' | 'SCHEDULED' | 'BLOCKED' | 'COMPLETED' | 'CANCELLED'
export interface EquippedRehabilitationAct {
  readonly id: string
  readonly kind: 'EQUIPPED_REHABILITATION_SESSION'
  readonly injuryId: InjuryId
  readonly episodeStartedOn: GameDate
  readonly playerId: PlayerId
  readonly teamId: TeamId
  readonly indicatedOn: GameDate
  readonly prescribingStaffId: StaffPersonId
  readonly prescribingAuthorizationId: string
  /** Dated evidence accepted by Medical, retained when active employment ends. */
  readonly indicationEvidence: { readonly authorization: ClinicalAuthorization; readonly assignment: TeamStaffAssignment }
  /** Explicit clinical material requirements; not inferred from rehabilitation mode. */
  readonly requiredEquipmentTags: readonly string[]
  readonly performingStaffId?: StaffPersonId
  readonly interval?: { readonly date: GameDate; readonly startTime: string; readonly durationMinutes: number }
  readonly physicalAllocations?: readonly PhysicalAllocation[]
  readonly status: EquippedMedicalStatus
  readonly fulfilledOn?: GameDate
  readonly history: readonly { readonly onDate: GameDate; readonly status: EquippedMedicalStatus; readonly reason: string }[]
}
export function createEquippedRehabilitationAct(input: EquippedRehabilitationAct): EquippedRehabilitationAct {
  if (!input || [input.id, input.injuryId, input.playerId, input.teamId, input.prescribingStaffId, input.prescribingAuthorizationId].some(value => typeof value !== 'string' || !value.trim()) || input.kind !== 'EQUIPPED_REHABILITATION_SESSION' || !['INDICATED', 'SCHEDULED', 'BLOCKED', 'COMPLETED', 'CANCELLED'].includes(input.status)) throw new RangeError('Invalid equipped Medical act')
  parseGameDate(input.episodeStartedOn); parseGameDate(input.indicatedOn)
  if (!input.indicationEvidence) throw new RangeError('Medical act requires historical INDICATE evidence')
  const authorization = createClinicalAuthorization(input.indicationEvidence.authorization)
  const assignment = createTeamStaffAssignment(input.indicationEvidence.assignment)
  if (authorization.id !== input.prescribingAuthorizationId || authorization.operation !== input.kind || authorization.eligibility !== 'VERIFIED' || !authorization.actions.includes('INDICATE') || authorization.validFrom > input.indicatedOn || authorization.validTo < input.indicatedOn || authorization.assignmentId !== assignment.id || assignment.staffPersonId !== input.prescribingStaffId || assignment.teamId !== input.teamId || assignment.assignedOn > input.indicatedOn) throw new RangeError('Medical act lacks historical INDICATE authority')
  if (input.indicatedOn < input.episodeStartedOn || !Array.isArray(input.requiredEquipmentTags) || input.requiredEquipmentTags.length === 0 || input.requiredEquipmentTags.some(value => typeof value !== 'string' || !value.trim()) || new Set(input.requiredEquipmentTags).size !== input.requiredEquipmentTags.length) throw new RangeError('Medical act requires explicit material indication')
  if (input.performingStaffId !== undefined && (typeof input.performingStaffId !== 'string' || !input.performingStaffId.trim())) throw new RangeError('Invalid performing professional')
  if (input.interval !== undefined) {
    parseGameDate(input.interval.date)
    if (input.interval.date < input.indicatedOn || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.interval.startTime) || !Number.isInteger(input.interval.durationMinutes) || input.interval.durationMinutes < 1 || input.interval.durationMinutes > 240) throw new RangeError('Invalid explicit Medical interval')
  }
  if (!Array.isArray(input.history) || input.history.length === 0 || input.history.at(-1)?.status !== input.status) throw new RangeError('Invalid Medical act history')
  for (const entry of input.history) { parseGameDate(entry.onDate); if (entry.onDate < input.indicatedOn || !['INDICATED', 'SCHEDULED', 'BLOCKED', 'COMPLETED', 'CANCELLED'].includes(entry.status) || typeof entry.reason !== 'string' || !entry.reason.trim()) throw new RangeError('Invalid Medical act event') }
  if ((input.status === 'COMPLETED') !== (input.fulfilledOn !== undefined) || input.status === 'COMPLETED' && (!input.interval || !input.performingStaffId || input.fulfilledOn !== input.interval.date)) throw new RangeError('Medical fulfillment requires executed interval and professional')
  const physicalAllocations = input.physicalAllocations?.map(createPhysicalAllocation)
  if (physicalAllocations && new Set(physicalAllocations.map(item => item.id)).size !== physicalAllocations.length) throw new RangeError('Duplicate Medical physical allocation')
  if (input.status === 'COMPLETED' && (input.history.filter(item => item.status === 'COMPLETED').length !== 1 || input.history.at(-1)?.reason !== 'MEDICAL_EXECUTED' || !physicalAllocations?.some(item => item.status === 'RELEASED' && item.history.at(-1)?.reason === 'MEDICAL_EXECUTED' && item.date === input.interval!.date && item.startTime === input.interval!.startTime && item.durationMinutes === input.interval!.durationMinutes))) throw new RangeError('Medical fulfillment requires exactly-once execution evidence')
  return Object.freeze({ ...input, indicationEvidence: Object.freeze({ authorization: Object.freeze({ ...authorization, actions: Object.freeze([...authorization.actions]) }), assignment: Object.freeze(assignment) }), ...(input.interval === undefined ? {} : { interval: Object.freeze({ ...input.interval }) }), requiredEquipmentTags: Object.freeze([...input.requiredEquipmentTags]), history: Object.freeze(input.history.map(item => Object.freeze({ ...item }))), ...(physicalAllocations === undefined ? {} : { physicalAllocations: Object.freeze(physicalAllocations) }) })
}
