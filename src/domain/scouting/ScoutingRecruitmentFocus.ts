import { parseGameDate, type GameDate } from '@/domain/date'
import type { OrganizationId, PlayerId, StaffPersonId, TeamId } from '@/domain/ids'
import type { BasketballPosition } from '@/domain/primitives'
import type { ScoutingPriority } from './Scouting'
import { scoutingTerritoryKey, type ScoutingTerritory } from './ScoutingTerritory'

export type RecruitmentFocusStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED'
export type RecruitmentFocusDuration = 'SHORT' | 'MEDIUM' | 'ONGOING'

export interface ScoutingRecruitmentFocus {
  readonly id: string
  readonly organizationId: OrganizationId
  readonly requestingTeamId: TeamId
  readonly name: string
  readonly positions: readonly BasketballPosition[]
  readonly minimumAge?: number
  readonly maximumAge?: number
  readonly knowledgeState?: 'ANY' | 'DISCOVERED' | 'EVALUATED'
  readonly evaluationDimension?: 'finishing' | 'shooting' | 'creation' | 'perimeterDefense' | 'interiorDefense' | 'rebounding' | 'physical'
  readonly minimumCurrentLevel?: number
  readonly minimumPotentialLevel?: number
  readonly territories: readonly ScoutingTerritory[]
  readonly scoutStaffIds: readonly StaffPersonId[]
  readonly priority: ScoutingPriority
  readonly duration: RecruitmentFocusDuration
  readonly daysActive: number
  readonly status: RecruitmentFocusStatus
  readonly createdAt: GameDate
  readonly lastProcessedAt?: GameDate
  readonly completedAt?: GameDate
  readonly cancelledAt?: GameDate
  readonly dismissedPlayerIds?: readonly PlayerId[]
}

export function createScoutingRecruitmentFocus(value: ScoutingRecruitmentFocus): ScoutingRecruitmentFocus {
  if (value.id.trim() === '' || value.name.trim() === '') throw new TypeError('Recruitment Focus requires an id and name')
  if (value.positions.length === 0) throw new TypeError('Recruitment Focus requires at least one basketball position')
  if (value.positions.some((position) => !['PG', 'SG', 'SF', 'PF', 'C'].includes(position))) throw new TypeError('Recruitment Focus positions must be basketball positions')
  if (value.minimumAge !== undefined && (!Number.isInteger(value.minimumAge) || value.minimumAge < 0 || value.minimumAge > 100)) throw new RangeError('Minimum age must be from 0 to 100')
  if (value.maximumAge !== undefined && (!Number.isInteger(value.maximumAge) || value.maximumAge < 0 || value.maximumAge > 100)) throw new RangeError('Maximum age must be from 0 to 100')
  if (value.minimumAge !== undefined && value.maximumAge !== undefined && value.minimumAge > value.maximumAge) throw new RangeError('Minimum age cannot exceed maximum age')
  if (value.knowledgeState !== undefined && !['ANY', 'DISCOVERED', 'EVALUATED'].includes(value.knowledgeState)) throw new TypeError('Recruitment Focus knowledge state is invalid')
  if ((value.minimumCurrentLevel !== undefined || value.minimumPotentialLevel !== undefined) && value.evaluationDimension === undefined) throw new TypeError('An evaluation dimension is required for ability criteria')
  if (value.minimumCurrentLevel !== undefined && (!Number.isInteger(value.minimumCurrentLevel) || value.minimumCurrentLevel < 0 || value.minimumCurrentLevel > 100)) throw new RangeError('Minimum current level must be from 0 to 100')
  if (value.minimumPotentialLevel !== undefined && (!Number.isInteger(value.minimumPotentialLevel) || value.minimumPotentialLevel < 0 || value.minimumPotentialLevel > 100)) throw new RangeError('Minimum potential level must be from 0 to 100')
  if (value.territories.length === 0 || value.scoutStaffIds.length === 0) throw new TypeError('Recruitment Focus requires a territory and an assigned Scout')
  if (!['LOW', 'NORMAL', 'HIGH', 'URGENT'].includes(value.priority)) throw new TypeError('Recruitment Focus priority is invalid')
  if (!['SHORT', 'MEDIUM', 'ONGOING'].includes(value.duration)) throw new TypeError('Recruitment Focus duration is invalid')
  if (!['ACTIVE', 'COMPLETED', 'CANCELLED'].includes(value.status)) throw new TypeError('Recruitment Focus status is invalid')
  if (value.status === 'ACTIVE' && (value.completedAt !== undefined || value.cancelledAt !== undefined)) throw new TypeError('Active Recruitment Focus cannot have a terminal date')
  if (value.status === 'COMPLETED' && (value.completedAt === undefined || value.cancelledAt !== undefined)) throw new TypeError('Completed Recruitment Focus requires only completedAt')
  if (value.status === 'CANCELLED' && (value.cancelledAt === undefined || value.completedAt !== undefined)) throw new TypeError('Cancelled Recruitment Focus requires only cancelledAt')
  if (!Number.isInteger(value.daysActive) || value.daysActive < 0) throw new RangeError('Recruitment Focus days active is invalid')
  const territories = [...new Map(value.territories.map((territory) => [scoutingTerritoryKey(territory), Object.freeze({ ...territory })])).values()]
  return Object.freeze({ ...value, name: value.name.trim(), positions: Object.freeze([...new Set(value.positions)]), territories: Object.freeze(territories), scoutStaffIds: Object.freeze([...new Set(value.scoutStaffIds)]), createdAt: parseGameDate(value.createdAt), ...(value.lastProcessedAt === undefined ? {} : { lastProcessedAt: parseGameDate(value.lastProcessedAt) }), ...(value.completedAt === undefined ? {} : { completedAt: parseGameDate(value.completedAt) }), ...(value.cancelledAt === undefined ? {} : { cancelledAt: parseGameDate(value.cancelledAt) }), ...(value.dismissedPlayerIds === undefined ? {} : { dismissedPlayerIds: Object.freeze([...new Set(value.dismissedPlayerIds)]) }) })
}
