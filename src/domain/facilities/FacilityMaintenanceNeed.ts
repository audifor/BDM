import { parseGameDate, compareGameDates, type GameDate } from '@/domain/date'
import { facilityIdFromString, facilityComponentIdFromString, facilityMaintenanceNeedIdFromString, type FacilityComponentId, type FacilityId, type FacilityMaintenanceNeedId } from '@/domain/ids'

/**
 * Extensible, non-exhaustive catalog of maintenance need categories. Deliberately not hardcoded
 * into per-type branching logic anywhere in this domain — a need's `type` is a classification fact
 * a caller/engine may use for prioritization or reporting, not a discriminant that changes how the
 * need itself is validated or resolved.
 */
export const FACILITY_MAINTENANCE_NEED_TYPES = [
  'ROUTINE',
  'PREVENTIVE',
  'CORRECTIVE',
  'SAFETY',
  'EQUIPMENT',
  'STRUCTURAL',
  'UTILITIES',
  'SURFACE',
  'CLEANING',
  'SPECIALIST',
  'OTHER',
] as const
export type FacilityMaintenanceNeedType = (typeof FACILITY_MAINTENANCE_NEED_TYPES)[number]

export function isFacilityMaintenanceNeedType(value: unknown): value is FacilityMaintenanceNeedType {
  return typeof value === 'string' && (FACILITY_MAINTENANCE_NEED_TYPES as readonly string[]).includes(value)
}

/**
 * A small, explicit severity scale — deliberately NOT a second 0-100 rating. Severity answers "how
 * urgent/serious is this specific need", which is a different question from `PhysicalCondition`
 * (CFI4's "how sound is the asset overall"): a MINOR need can exist on an otherwise excellent
 * component (a loose fixture), and a CRITICAL need can exist on a component whose overall
 * condition score has not yet dropped far (an electrical fault).
 */
export const FACILITY_MAINTENANCE_NEED_SEVERITIES = ['MINOR', 'MODERATE', 'MAJOR', 'CRITICAL'] as const
export type FacilityMaintenanceNeedSeverity = (typeof FACILITY_MAINTENANCE_NEED_SEVERITIES)[number]

export function isFacilityMaintenanceNeedSeverity(value: unknown): value is FacilityMaintenanceNeedSeverity {
  return typeof value === 'string' && (FACILITY_MAINTENANCE_NEED_SEVERITIES as readonly string[]).includes(value)
}

/**
 * Explicit lifecycle. `DEFERRED` is a distinct status from `OPEN` (per the brief) because it
 * carries real future semantics: a deferred need is known and acknowledged but deliberately not
 * being acted on yet (e.g. pending a future Governance/Finance decision), whereas `OPEN` simply
 * means no action has started. CFI5 never invents a reason for deferral itself — it only records
 * that a caller marked a need deferred.
 */
export const FACILITY_MAINTENANCE_NEED_STATUSES = ['OPEN', 'PLANNED', 'IN_PROGRESS', 'DEFERRED', 'COMPLETED', 'CANCELLED'] as const
export type FacilityMaintenanceNeedStatus = (typeof FACILITY_MAINTENANCE_NEED_STATUSES)[number]

export function isFacilityMaintenanceNeedStatus(value: unknown): value is FacilityMaintenanceNeedStatus {
  return typeof value === 'string' && (FACILITY_MAINTENANCE_NEED_STATUSES as readonly string[]).includes(value)
}

const TERMINAL_MAINTENANCE_NEED_STATUSES: readonly FacilityMaintenanceNeedStatus[] = ['COMPLETED', 'CANCELLED']

/**
 * A recorded need for maintenance/repair attention, immutable history: a need's `status` field
 * describes its state at creation. This domain keeps needs immutable and represents lifecycle
 * transitions by superseding records where transition metadata (who/when) matters — see
 * `FacilityMaintenanceAction`, which is the record of the intervention that eventually resolves a
 * need. `resolvedAt` on the need itself is the simple terminal timestamp for COMPLETED/CANCELLED
 * needs; it does not replace the richer `FacilityMaintenanceAction` history.
 */
export interface FacilityMaintenanceNeed {
  readonly id: FacilityMaintenanceNeedId
  readonly facilityId: FacilityId
  readonly componentId: FacilityComponentId | null
  readonly detectedAt: GameDate
  readonly type: FacilityMaintenanceNeedType
  readonly severity: FacilityMaintenanceNeedSeverity
  readonly status: FacilityMaintenanceNeedStatus
  readonly source: string
  readonly resolvedAt: GameDate | null
}

export interface CreateFacilityMaintenanceNeedInput {
  readonly id: FacilityMaintenanceNeedId | string
  readonly facilityId: FacilityId | string
  readonly componentId?: FacilityComponentId | string | null
  readonly detectedAt: GameDate | string
  readonly type: FacilityMaintenanceNeedType
  readonly severity: FacilityMaintenanceNeedSeverity
  readonly status: FacilityMaintenanceNeedStatus
  readonly source: string
  readonly resolvedAt?: GameDate | string | null
}

export function createFacilityMaintenanceNeed(input: CreateFacilityMaintenanceNeedInput): FacilityMaintenanceNeed {
  if (!isFacilityMaintenanceNeedType(input.type)) throw new TypeError(`Facility maintenance need type is invalid: ${String(input.type)}`)
  if (!isFacilityMaintenanceNeedSeverity(input.severity)) throw new TypeError(`Facility maintenance need severity is invalid: ${String(input.severity)}`)
  if (!isFacilityMaintenanceNeedStatus(input.status)) throw new TypeError(`Facility maintenance need status is invalid: ${String(input.status)}`)
  const source = input.source.trim()
  if (source.length === 0) throw new TypeError('Facility maintenance need source must be a non-empty string')
  const detectedAt = parseGameDate(input.detectedAt)
  const resolvedAt = input.resolvedAt === undefined || input.resolvedAt === null ? null : parseGameDate(input.resolvedAt)
  if (resolvedAt !== null && compareGameDates(resolvedAt, detectedAt) < 0) throw new RangeError('Facility maintenance need resolvedAt cannot precede detectedAt')
  const isTerminal = TERMINAL_MAINTENANCE_NEED_STATUSES.includes(input.status)
  if (isTerminal && resolvedAt === null) throw new RangeError(`Facility maintenance need status ${input.status} requires a resolvedAt date`)
  if (!isTerminal && resolvedAt !== null) throw new RangeError(`Facility maintenance need status ${input.status} cannot already have a resolvedAt date`)
  return Object.freeze({
    id: facilityMaintenanceNeedIdFromString(input.id),
    facilityId: facilityIdFromString(input.facilityId),
    componentId: input.componentId === undefined || input.componentId === null ? null : facilityComponentIdFromString(input.componentId),
    detectedAt,
    type: input.type,
    severity: input.severity,
    status: input.status,
    source,
    resolvedAt,
  })
}

export function isFacilityMaintenanceNeedOpenStatus(status: FacilityMaintenanceNeedStatus): boolean {
  return !TERMINAL_MAINTENANCE_NEED_STATUSES.includes(status)
}
