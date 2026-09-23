import { parseGameDate, compareGameDates, type GameDate } from '@/domain/date'
import { facilityComponentIdFromString, facilityIdFromString, facilityMaintenanceActionIdFromString, facilityMaintenanceNeedIdFromString, type FacilityComponentId, type FacilityId, type FacilityMaintenanceActionId, type FacilityMaintenanceNeedId } from '@/domain/ids'
import type { FacilityServiceability } from './FacilityCondition'

/**
 * The kind of intervention performed. Distinct from `FacilityMaintenanceNeedType`: a need
 * describes WHAT is wrong (e.g. `STRUCTURAL`), while an action describes WHAT WAS DONE about it
 * (routine upkeep vs. an actual repair) — the two are related but not the same axis, and CFI5 does
 * not force a 1:1 mapping between them (a `CORRECTIVE` need can be resolved by either a `REPAIR` or
 * an `INSPECTION` that finds nothing wrong).
 */
export const FACILITY_MAINTENANCE_ACTION_TYPES = ['ROUTINE_MAINTENANCE', 'PREVENTIVE_MAINTENANCE', 'REPAIR', 'INSPECTION_FOLLOW_UP', 'OTHER'] as const
export type FacilityMaintenanceActionType = (typeof FACILITY_MAINTENANCE_ACTION_TYPES)[number]

export function isFacilityMaintenanceActionType(value: unknown): value is FacilityMaintenanceActionType {
  return typeof value === 'string' && (FACILITY_MAINTENANCE_ACTION_TYPES as readonly string[]).includes(value)
}

export const FACILITY_MAINTENANCE_ACTION_OUTCOMES = ['SUCCESSFUL', 'PARTIAL', 'UNSUCCESSFUL'] as const
export type FacilityMaintenanceActionOutcome = (typeof FACILITY_MAINTENANCE_ACTION_OUTCOMES)[number]

export function isFacilityMaintenanceActionOutcome(value: unknown): value is FacilityMaintenanceActionOutcome {
  return typeof value === 'string' && (FACILITY_MAINTENANCE_ACTION_OUTCOMES as readonly string[]).includes(value)
}

/**
 * The recorded intervention itself: what was done, over what window, to what effect. `outcome`
 * fields (`resultingCondition`/`resultingServiceability`) are the action's own claim about the
 * new state — the engine (`FacilityDeteriorationEngine.ts`) is what actually writes the
 * corresponding new `FacilityComponentConditionRecord`/`FacilityConditionRecord` atomically
 * alongside completing this action, keeping the "why" (this action) and the "current truth" (CFI4's
 * condition record) as two coherent, cross-referencing facts rather than one overloaded record.
 * No monetary cost field exists anywhere here — Finance is a future, separate integration.
 */
export interface FacilityMaintenanceAction {
  readonly id: FacilityMaintenanceActionId
  readonly needId: FacilityMaintenanceNeedId | null
  readonly facilityId: FacilityId
  readonly componentId: FacilityComponentId | null
  readonly type: FacilityMaintenanceActionType
  readonly startedAt: GameDate
  readonly completedAt: GameDate | null
  readonly outcome: FacilityMaintenanceActionOutcome | null
  readonly resultingCondition: number | null
  readonly resultingServiceability: FacilityServiceability | null
}

export interface CreateFacilityMaintenanceActionInput {
  readonly id: FacilityMaintenanceActionId | string
  readonly needId?: FacilityMaintenanceNeedId | string | null
  readonly facilityId: FacilityId | string
  readonly componentId?: FacilityComponentId | string | null
  readonly type: FacilityMaintenanceActionType
  readonly startedAt: GameDate | string
  readonly completedAt?: GameDate | string | null
  readonly outcome?: FacilityMaintenanceActionOutcome | null
  readonly resultingCondition?: number | null
  readonly resultingServiceability?: FacilityServiceability | null
}

export function createFacilityMaintenanceAction(input: CreateFacilityMaintenanceActionInput): FacilityMaintenanceAction {
  if (!isFacilityMaintenanceActionType(input.type)) throw new TypeError(`Facility maintenance action type is invalid: ${String(input.type)}`)
  const startedAt = parseGameDate(input.startedAt)
  const completedAt = input.completedAt === undefined || input.completedAt === null ? null : parseGameDate(input.completedAt)
  if (completedAt !== null && compareGameDates(completedAt, startedAt) < 0) throw new RangeError('Facility maintenance action completedAt cannot precede startedAt')
  const outcome = input.outcome === undefined || input.outcome === null ? null : input.outcome
  if (outcome !== null && !isFacilityMaintenanceActionOutcome(outcome)) throw new TypeError(`Facility maintenance action outcome is invalid: ${String(outcome)}`)
  if (outcome !== null && completedAt === null) throw new RangeError('Facility maintenance action cannot have an outcome before it has completed')
  if (completedAt !== null && outcome === null) throw new RangeError('Facility maintenance action requires an outcome once completed')
  const resultingCondition = input.resultingCondition === undefined || input.resultingCondition === null ? null : input.resultingCondition
  if (resultingCondition !== null && (!Number.isFinite(resultingCondition) || resultingCondition < 0 || resultingCondition > 100)) {
    throw new RangeError('Facility maintenance action resultingCondition must be null or between 0 and 100')
  }
  const resultingServiceability = input.resultingServiceability === undefined ? null : input.resultingServiceability
  return Object.freeze({
    id: facilityMaintenanceActionIdFromString(input.id),
    needId: input.needId === undefined || input.needId === null ? null : facilityMaintenanceNeedIdFromString(input.needId),
    facilityId: facilityIdFromString(input.facilityId),
    componentId: input.componentId === undefined || input.componentId === null ? null : facilityComponentIdFromString(input.componentId),
    type: input.type,
    startedAt,
    completedAt,
    outcome,
    resultingCondition,
    resultingServiceability,
  })
}
