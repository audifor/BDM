import { parseGameDate, type GameDate } from '@/domain/date'
import type { OrganizationId, TeamId, PlayerId, CompetitionId, SeasonId } from '@/domain/ids'

export type PathwayTeamRole = 'senior' | 'reserve' | 'youth'
export interface TeamPathwayRelation {
  readonly id: string
  readonly organizationId: OrganizationId
  readonly seniorTeamId: TeamId
  readonly teamId: TeamId
  readonly role: PathwayTeamRole
  readonly category?: string
  readonly movementTargetTeamIds: readonly TeamId[]
}
export type RegistrationCause = 'ACADEMY_INTAKE' | 'AGE_GROUP_PROMOTION' | 'RESERVE_PROMOTION' | 'SENIOR_PROMOTION' | 'RELEASE' | 'NCAA_WALK_ON'
export interface PlayerRegistration {
  readonly id: string
  readonly playerId: PlayerId
  readonly teamId: TeamId
  readonly organizationId: OrganizationId
  readonly startsOn: GameDate
  readonly endsOn?: GameDate
  readonly competitionId?: CompetitionId
  readonly seasonId?: SeasonId
  readonly cause: RegistrationCause
  readonly sourceActionId: string
}
export function createTeamPathwayRelation(value: TeamPathwayRelation): TeamPathwayRelation {
  if (!value.id || !value.organizationId || !value.seniorTeamId || !value.teamId || !value.movementTargetTeamIds) throw new TypeError('Invalid team pathway relation')
  if (!['senior', 'reserve', 'youth'].includes(value.role)) throw new TypeError('Invalid pathway Team role')
  if (new Set(value.movementTargetTeamIds).size !== value.movementTargetTeamIds.length) throw new TypeError('Duplicate pathway movement target')
  return Object.freeze({ ...value, movementTargetTeamIds: Object.freeze([...value.movementTargetTeamIds]) })
}
export function createPlayerRegistration(value: PlayerRegistration): PlayerRegistration {
  if (!value.id || !value.playerId || !value.teamId || !value.organizationId || !value.startsOn || !value.sourceActionId) throw new TypeError('Invalid player registration')
  if (value.endsOn !== undefined && value.endsOn < value.startsOn) throw new RangeError('Registration end precedes start')
  if (!['ACADEMY_INTAKE', 'AGE_GROUP_PROMOTION', 'RESERVE_PROMOTION', 'SENIOR_PROMOTION', 'RELEASE', 'NCAA_WALK_ON'].includes(value.cause)) throw new TypeError('Invalid player registration cause')
  return Object.freeze({ ...value, startsOn: parseGameDate(value.startsOn), ...(value.endsOn ? { endsOn: parseGameDate(value.endsOn) } : {}) })
}
