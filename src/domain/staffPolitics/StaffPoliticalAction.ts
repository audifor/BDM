import { parseGameDate, type GameDate } from '@/domain/date'
import { type StaffPersonId, teamIdFromString, type TeamId } from '@/domain/ids'
import { POLITICAL_ACTION_KINDS, POLITICAL_STANCES, type PoliticalActionKind, type PoliticalStance } from './StaffPolitics'

export const MAX_POLITICAL_COORDINATION_ACTORS = 4

export type StaffPoliticalActionTarget = { readonly kind: 'COACH'; readonly id: string } | { readonly kind: 'STAFF'; readonly id: StaffPersonId }
export interface StaffPoliticalAction { readonly id: string; readonly caseId: string; readonly teamId: TeamId; readonly kind: PoliticalActionKind; readonly stance: PoliticalStance; readonly actorIds: readonly StaffPersonId[]; readonly target?: StaffPoliticalActionTarget; readonly performedOn: GameDate }

export function staffPoliticalActionIdFor(caseId: string, kind: PoliticalActionKind, stance: PoliticalStance, actorIds: readonly StaffPersonId[], target?: StaffPoliticalActionTarget): string {
  if (caseId.trim().length === 0 || actorIds.length === 0) throw new TypeError('Staff political action identity fields must be non-empty')
  if (kind === 'COORDINATE') return `staff-political-action:${caseId}:COORDINATE:${stance}`
  if (kind === 'LOBBY' && target === undefined) throw new TypeError('LOBBY action identity requires a target')
  const actorId = actorIds[0]!
  return kind === 'LOBBY' ? `staff-political-action:${caseId}:LOBBY:${stance}:${actorId}:${target!.kind}:${target!.id}` : `staff-political-action:${caseId}:${kind}:${actorId}`
}

export function createStaffPoliticalAction(value: StaffPoliticalAction): StaffPoliticalAction {
  const teamId = teamIdFromString(value.teamId)
  const actorIds = [...value.actorIds]
  if (!POLITICAL_ACTION_KINDS.includes(value.kind) || !POLITICAL_STANCES.includes(value.stance) || actorIds.length === 0 || actorIds.some((id) => id.trim().length === 0) || new Set(actorIds).size !== actorIds.length || actorIds.some((id, index) => index > 0 && actorIds[index - 1]!.localeCompare(id) >= 0)) throw new RangeError('Invalid Staff political action actors')
  if (value.target !== undefined && value.target.kind !== 'COACH' && value.target.kind !== 'STAFF') throw new RangeError('Invalid Staff political action target')
  const target: StaffPoliticalActionTarget | undefined = value.target === undefined ? undefined : value.target.kind === 'COACH' ? { kind: 'COACH', id: value.target.id } : { kind: 'STAFF', id: value.target.id }
  if (target !== undefined && target.id.trim().length === 0) throw new RangeError('Invalid Staff political action target')
  if (value.kind === 'ENDORSE' && (value.stance !== 'SUPPORT' || actorIds.length !== 1 || target !== undefined)) throw new RangeError('Invalid ENDORSE action')
  if (value.kind === 'LOBBY' && ((value.stance !== 'SUPPORT' && value.stance !== 'OPPOSE') || actorIds.length !== 1 || target === undefined)) throw new RangeError('Invalid LOBBY action')
  if (value.kind === 'COORDINATE' && ((value.stance !== 'SUPPORT' && value.stance !== 'OPPOSE') || actorIds.length < 2 || actorIds.length > MAX_POLITICAL_COORDINATION_ACTORS || target !== undefined)) throw new RangeError('Invalid COORDINATE action')
  if (value.kind === 'MEDIATE' && (value.stance !== 'MEDIATE' || actorIds.length !== 1 || target !== undefined)) throw new RangeError('Invalid MEDIATE action')
  const performedOn = parseGameDate(value.performedOn)
  if (value.id !== staffPoliticalActionIdFor(value.caseId, value.kind, value.stance, actorIds, target)) throw new RangeError('Staff political action ID must match its canonical identity')
  return { ...value, teamId, actorIds, ...(target === undefined ? {} : { target }), performedOn }
}
