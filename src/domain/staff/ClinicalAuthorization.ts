import { parseGameDate, type GameDate } from '@/domain/date'
import type { TeamStaffAssignmentId } from '@/domain/ids'

/** Recorded clinical evidence, never derived from job title, advice quality or coach access. */
export interface ClinicalAuthorization {
  readonly id: string
  readonly assignmentId: TeamStaffAssignmentId
  readonly operation: 'EQUIPPED_REHABILITATION_SESSION'
  readonly actions: readonly ('INDICATE' | 'PERFORM')[]
  readonly eligibility: 'VERIFIED' | 'UNVERIFIED' | 'REVOKED'
  readonly credentialEvidenceRef: string
  readonly validFrom: GameDate
  readonly validTo: GameDate
}
export function createClinicalAuthorization(input: ClinicalAuthorization): ClinicalAuthorization {
  if (!input || [input.id, input.assignmentId, input.credentialEvidenceRef].some(value => typeof value !== 'string' || !value.trim()) || input.operation !== 'EQUIPPED_REHABILITATION_SESSION' || !['VERIFIED', 'UNVERIFIED', 'REVOKED'].includes(input.eligibility)) throw new RangeError('Invalid clinical authorization evidence')
  parseGameDate(input.validFrom); parseGameDate(input.validTo)
  if (input.validTo < input.validFrom || !Array.isArray(input.actions) || input.actions.length === 0 || new Set(input.actions).size !== input.actions.length || input.actions.some(value => !['INDICATE', 'PERFORM'].includes(value))) throw new RangeError('Invalid clinical authorization scope')
  return Object.freeze({ ...input, actions: Object.freeze([...input.actions]) })
}
