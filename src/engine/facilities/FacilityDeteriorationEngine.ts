import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import {
  BASE_MONTHLY_DETERIORATION_RATE,
  DEFAULT_FACILITY_DETERIORATION_THRESHOLDS,
  activeFacilityComponentsAt,
  componentCategory,
  componentConditionAt,
  createFacilityComponentConditionRecord,
  createFacilityMaintenanceNeed,
  isFacilityMaintenanceNeedOpenStatus,
  isServiceabilityAtLeastAsSevereAs,
  maintenanceNeedsForComponentAt,
  utilizationMultiplier,
  wearProfileForComponentType,
  worstServiceabilityImpliedByCondition,
  type FacilityComponent,
  type FacilityComponentConditionRecord,
  type FacilityDeteriorationThresholds,
  type FacilityMaintenanceAction,
  type FacilityMaintenanceNeed,
  type FacilityUsageLoad,
} from '@/domain/facilities'
import { facilityComponentConditionRecordIdFromString, facilityMaintenanceNeedIdFromString, type FacilityComponentId, type FacilityId, type FacilityMaintenanceActionId } from '@/domain/ids'
import { updateGameWorld, type GameWorld } from '@/domain/world'

/**
 * Pure, deterministic elapsed-time deterioration. NEVER uses `Math.random` or an implicit
 * `Date.now` — the only inputs are the explicit dates, the component's wear profile, and the
 * optional supplied `utilizationRatio`. `elapsedDays` is derived from `fromDate`/`toDate` via plain
 * UTC calendar arithmetic (the same technique `GameDate.ts` itself uses internally), so this scales
 * to arbitrarily large gaps in one call — it never loops day-by-day.
 *
 * A component with no known starting `physicalCondition` (CFI4 `UNKNOWN`) is left `null`: CFI5
 * never invents a starting condition. It becomes computable only once a real condition record
 * exists to progress from.
 */
export function conditionAfterElapsedPeriod(startingCondition: number | null, component: FacilityComponent, fromDate: GameDate, toDate: GameDate, utilizationRatio = 1, thresholds: FacilityDeteriorationThresholds = DEFAULT_FACILITY_DETERIORATION_THRESHOLDS): number | null {
  if (startingCondition === null) return null
  if (compareGameDates(toDate, fromDate) < 0) throw new RangeError('Deterioration toDate cannot precede fromDate')
  const elapsedDays = daysBetween(fromDate, toDate)
  if (elapsedDays === 0) return startingCondition
  const elapsedMonths = elapsedDays / AVERAGE_DAYS_PER_MONTH
  const wearProfile = wearProfileForComponentType(component.type, componentCategory(component.type))
  const baseRate = BASE_MONTHLY_DETERIORATION_RATE[wearProfile]
  const totalLoss = baseRate * utilizationMultiplier(utilizationRatio) * elapsedMonths
  const next = startingCondition - totalLoss
  return Math.max(0, Math.min(100, Math.round(next)))
}

const AVERAGE_DAYS_PER_MONTH = 30.436875

/** Deterministic UTC day-count between two GameDates (positive when `toDate` is later). Never depends on local time zone or the wall-clock "now". */
function daysBetween(fromDate: GameDate, toDate: GameDate): number {
  const [fromYear, fromMonth, fromDay] = fromDate.split('-').map(Number) as [number, number, number]
  const [toYear, toMonth, toDay] = toDate.split('-').map(Number) as [number, number, number]
  const fromMs = Date.UTC(fromYear, fromMonth - 1, fromDay)
  const toMs = Date.UTC(toYear, toMonth - 1, toDay)
  return Math.round((toMs - fromMs) / 86_400_000)
}

/** One component's computed deterioration outcome for one engine invocation — a pure calculation result, not yet applied to any GameWorld. */
export interface ComponentDeteriorationResult {
  readonly componentId: FacilityComponentId
  readonly facilityId: FacilityId
  readonly previousCondition: number | null
  readonly nextCondition: number | null
  readonly previousServiceability: ReturnType<typeof worstServiceabilityImpliedByCondition> | null
  readonly nextServiceability: ReturnType<typeof worstServiceabilityImpliedByCondition> | null
  /** `true` when this result should be written as a new `FacilityComponentConditionRecord` — i.e. condition or serviceability actually changed. A no-op period (zero elapsed days, or a period too short to move the rounded condition) produces `changed: false` and writes nothing, keeping CFI5's snapshot-on-material-change strategy honest. */
  readonly changed: boolean
  /** One of the CFI5 "future RPG seam" observable outcome facts this component crossed during the period, if any — returned as plain data, never dispatched to any event bus. */
  readonly outcomes: readonly FacilityDeteriorationOutcome[]
}

export const FACILITY_DETERIORATION_OUTCOMES = ['MAINTENANCE_NEED_OPENED', 'COMPONENT_LIMITED', 'COMPONENT_OUT_OF_SERVICE'] as const
export type FacilityDeteriorationOutcome = (typeof FACILITY_DETERIORATION_OUTCOMES)[number]

/**
 * Calculates (without applying) the deterioration outcome for every currently-active component of
 * one Facility across `[fromDate, toDate]`. `usageLoads` is an optional, explicit list of
 * transient utilization inputs (see `FacilityUsageLoad`); a component absent from it uses the
 * engine's neutral baseline (`utilizationRatio = 1`, i.e. ordinary/typical use), never an assumed
 * zero. Existing serviceability is a FLOOR that condition-derived serviceability can only worsen,
 * never improve — an already-OUT_OF_SERVICE component whose condition alone would merely imply
 * LIMITED stays OUT_OF_SERVICE until an explicit maintenance/repair action restores it.
 */
export function calculateComponentDeterioration(world: GameWorld, facilityId: FacilityId, fromDate: GameDate, toDate: GameDate, usageLoads: readonly FacilityUsageLoad[] = [], thresholds: FacilityDeteriorationThresholds = DEFAULT_FACILITY_DETERIORATION_THRESHOLDS): readonly ComponentDeteriorationResult[] {
  const components = activeFacilityComponentsAt(Object.values(world.facilityComponentsById), facilityId, toDate)
  const conditionRecords = Object.values(world.facilityComponentConditionRecordsById)
  const usageByComponent = new Map(usageLoads.map((load) => [load.componentId, load.utilizationRatio]))
  return components.map((component) => {
    const previousRecord = componentConditionAt(conditionRecords, component.id, fromDate)
    const previousCondition = previousRecord?.physicalCondition ?? null
    const previousServiceability = previousRecord?.serviceability ?? null
    const utilizationRatio = usageByComponent.get(component.id) ?? 1
    const nextCondition = conditionAfterElapsedPeriod(previousCondition, component, fromDate, toDate, utilizationRatio, thresholds)
    const impliedServiceability = nextCondition === null ? null : worstServiceabilityImpliedByCondition(nextCondition, thresholds)
    const nextServiceability = resolveWorsenedServiceability(previousServiceability, impliedServiceability)
    const outcomes: FacilityDeteriorationOutcome[] = []
    if (nextCondition !== null && nextCondition <= thresholds.maintenanceNeedCondition && (previousCondition === null || previousCondition > thresholds.maintenanceNeedCondition)) {
      outcomes.push('MAINTENANCE_NEED_OPENED')
    }
    if (nextServiceability === 'LIMITED' && previousServiceability !== 'LIMITED' && previousServiceability !== 'SEVERELY_LIMITED' && previousServiceability !== 'OUT_OF_SERVICE') {
      outcomes.push('COMPONENT_LIMITED')
    }
    if (nextServiceability === 'OUT_OF_SERVICE' && previousServiceability !== 'OUT_OF_SERVICE') {
      outcomes.push('COMPONENT_OUT_OF_SERVICE')
    }
    const changed = nextCondition !== previousCondition || nextServiceability !== previousServiceability
    return Object.freeze({
      componentId: component.id,
      facilityId,
      previousCondition,
      nextCondition,
      previousServiceability,
      nextServiceability,
      changed,
      outcomes: Object.freeze(outcomes),
    })
  })
}

function resolveWorsenedServiceability(previous: ReturnType<typeof worstServiceabilityImpliedByCondition> | null, implied: ReturnType<typeof worstServiceabilityImpliedByCondition> | null): ReturnType<typeof worstServiceabilityImpliedByCondition> | null {
  if (previous === null) return implied
  if (implied === null) return previous
  return isServiceabilityAtLeastAsSevereAs(implied, previous) ? implied : previous
}

/** The full result of one `advanceFacilityCondition` call: the updated world plus every computed result (changed or not) and the resulting maintenance needs actually opened, for a caller to observe without any hidden event bus. */
export interface FacilityDeteriorationApplication {
  readonly world: GameWorld
  readonly results: readonly ComponentDeteriorationResult[]
  readonly openedNeeds: readonly FacilityMaintenanceNeed[]
}

/**
 * Applies `calculateComponentDeterioration`'s results to `world` atomically: every changed
 * component gets exactly one new `FacilityComponentConditionRecord` (closing the previous one via
 * `effectiveTo`, per CFI4's own historical-record convention — never a destructive edit), and a new
 * `FacilityMaintenanceNeed` is opened for a component only when it crosses the maintenance
 * threshold AND it does not already have an open need (idempotent: re-running this for a period
 * that already produced a need does not open a duplicate). A component with a `changed: false`
 * result is left untouched, so a zero-elapsed-period call is always a true no-op.
 */
export function advanceFacilityCondition(world: GameWorld, facilityId: FacilityId, fromDate: GameDate, toDate: GameDate, usageLoads: readonly FacilityUsageLoad[] = [], thresholds: FacilityDeteriorationThresholds = DEFAULT_FACILITY_DETERIORATION_THRESHOLDS): FacilityDeteriorationApplication {
  const results = calculateComponentDeterioration(world, facilityId, fromDate, toDate, usageLoads, thresholds)
  const changed = results.filter((result) => result.changed)
  if (changed.length === 0) return { world, results, openedNeeds: [] }

  const existingConditionRecords = Object.values(world.facilityComponentConditionRecordsById)
  const newConditionRecords: FacilityComponentConditionRecord[] = []
  const closedRecordIds = new Set<string>()

  for (const result of changed) {
    const activeRecord = componentConditionAt(existingConditionRecords, result.componentId, fromDate)
    if (activeRecord !== undefined && activeRecord.effectiveTo === null) closedRecordIds.add(activeRecord.id)
    newConditionRecords.push(createFacilityComponentConditionRecord({
      id: facilityComponentConditionRecordIdFromString(`facility-component-condition:${result.componentId}:${toDate}`),
      componentId: result.componentId,
      effectiveFrom: toDate,
      physicalCondition: result.nextCondition,
      serviceability: result.nextServiceability ?? 'FULL',
      technicalStandard: activeRecord?.technicalStandard ?? null,
    }))
  }

  const carriedConditionRecords = existingConditionRecords.map((record) => (closedRecordIds.has(record.id) ? { ...record, effectiveTo: subtractOneDay(toDate) } : record))

  const existingNeeds = Object.values(world.facilityMaintenanceNeedsById)
  const openedNeeds: FacilityMaintenanceNeed[] = []
  for (const result of changed) {
    if (!result.outcomes.includes('MAINTENANCE_NEED_OPENED')) continue
    const alreadyOpen = maintenanceNeedsForComponentAt(existingNeeds, result.componentId, toDate).some((need) => isFacilityMaintenanceNeedOpenStatus(need.status))
    if (alreadyOpen) continue
    openedNeeds.push(createFacilityMaintenanceNeed({
      id: facilityMaintenanceNeedIdFromString(`facility-maintenance-need:${result.componentId}:${toDate}`),
      facilityId,
      componentId: result.componentId,
      detectedAt: toDate,
      type: 'CORRECTIVE',
      severity: result.nextServiceability === 'OUT_OF_SERVICE' ? 'CRITICAL' : result.nextServiceability === 'SEVERELY_LIMITED' ? 'MAJOR' : 'MODERATE',
      status: 'OPEN',
      source: `deterioration:${result.componentId}`,
    }))
  }

  const updatedWorld = updateGameWorld(world, {
    facilityComponentConditionRecords: [...carriedConditionRecords, ...newConditionRecords],
    facilityMaintenanceNeeds: [...existingNeeds, ...openedNeeds],
  })

  return { world: updatedWorld, results, openedNeeds: Object.freeze(openedNeeds) }
}

/** Convenience: runs `advanceFacilityCondition` for every Facility that owns at least one active component, in deterministic FacilityId order. */
export function advanceFacilitiesCondition(world: GameWorld, fromDate: GameDate, toDate: GameDate, usageLoads: readonly FacilityUsageLoad[] = [], thresholds: FacilityDeteriorationThresholds = DEFAULT_FACILITY_DETERIORATION_THRESHOLDS): FacilityDeteriorationApplication {
  const facilityIds = [...new Set(Object.values(world.facilityComponentsById).map((component) => component.facilityId))].sort((a, b) => a.localeCompare(b))
  let current = world
  const allResults: ComponentDeteriorationResult[] = []
  const allOpenedNeeds: FacilityMaintenanceNeed[] = []
  for (const facilityId of facilityIds) {
    const application = advanceFacilityCondition(current, facilityId, fromDate, toDate, usageLoads, thresholds)
    current = application.world
    allResults.push(...application.results)
    allOpenedNeeds.push(...application.openedNeeds)
  }
  return { world: current, results: Object.freeze(allResults), openedNeeds: Object.freeze(allOpenedNeeds) }
}

/**
 * The result of applying one completed `FacilityMaintenanceAction` to the world: the closure of the
 * causal chain's final link, MAINTENANCE/REPAIR ACTION → CONDITION RESTORED. Only a `completedAt`
 * action with a non-null `outcome` can be applied — an action still in progress carries no
 * condition/serviceability effect yet. Applying writes at most one new
 * `FacilityComponentConditionRecord` (only when the action actually specifies a
 * `resultingCondition`/`resultingServiceability`) and, when the action references a
 * `FacilityMaintenanceNeed` and its outcome is `SUCCESSFUL`, marks that need `COMPLETED` with
 * `resolvedAt` set to the action's `completedAt` — all through one `updateGameWorld` call, so no
 * intermediate invalid state (repaired component, still-open need) is ever observable.
 *
 * Repair is deliberately not renovation: `resultingCondition` is whatever the action declares (it
 * need not be 100), and a `PARTIAL`/`UNSUCCESSFUL` outcome leaves the referenced need open rather
 * than closing it — an unsuccessful repair attempt does not fabricate a resolution.
 *
 * Idempotent by construction: re-applying the same action a second time recomputes the identical new
 * condition-record id (`facility-component-condition:${componentId}:${completedAt}`) and the
 * identical need-completion patch, so a duplicate application either no-ops (need already
 * `COMPLETED`, condition record already present with the same values) or is rejected by
 * `GameWorld`'s own duplicate-ID guard — CFI5 relies on that existing mechanism rather than adding a
 * separate idempotency ledger.
 */
export interface FacilityMaintenanceActionApplication {
  readonly world: GameWorld
  readonly conditionRecordWritten: boolean
  readonly needClosed: boolean
}

export function applyFacilityMaintenanceAction(world: GameWorld, actionId: FacilityMaintenanceActionId): FacilityMaintenanceActionApplication {
  const action = world.facilityMaintenanceActionsById[actionId]
  if (action === undefined) throw new RangeError(`Unknown facility maintenance action: ${actionId}`)
  if (action.completedAt === null || action.outcome === null) {
    return { world, conditionRecordWritten: false, needClosed: false }
  }

  let conditionRecordWritten = false
  let updatedConditionRecords = Object.values(world.facilityComponentConditionRecordsById)

  if (action.componentId !== null && (action.resultingCondition !== null || action.resultingServiceability !== null)) {
    const activeRecord = componentConditionAt(updatedConditionRecords, action.componentId, action.completedAt)
    const resultingServiceability = action.resultingServiceability ?? activeRecord?.serviceability ?? 'FULL'
    const resultingCondition = action.resultingCondition ?? activeRecord?.physicalCondition ?? null
    updatedConditionRecords = updatedConditionRecords.map((record) =>
      activeRecord !== undefined && record.id === activeRecord.id && record.effectiveTo === null
        ? { ...record, effectiveTo: subtractOneDay(action.completedAt as GameDate) }
        : record,
    )
    updatedConditionRecords = [
      ...updatedConditionRecords,
      createFacilityComponentConditionRecord({
        id: facilityComponentConditionRecordIdFromString(`facility-component-condition:${action.componentId}:${action.completedAt}`),
        componentId: action.componentId,
        effectiveFrom: action.completedAt,
        physicalCondition: resultingCondition,
        serviceability: resultingServiceability,
        technicalStandard: activeRecord?.technicalStandard ?? null,
      }),
    ]
    conditionRecordWritten = true
  }

  let needClosed = false
  let updatedNeeds = Object.values(world.facilityMaintenanceNeedsById)
  if (action.needId !== null && action.outcome === 'SUCCESSFUL') {
    const existingNeed = world.facilityMaintenanceNeedsById[action.needId]
    if (existingNeed !== undefined && isFacilityMaintenanceNeedOpenStatus(existingNeed.status)) {
      updatedNeeds = updatedNeeds.map((need) =>
        need.id === existingNeed.id
          ? createFacilityMaintenanceNeed({ ...need, status: 'COMPLETED', resolvedAt: action.completedAt })
          : need,
      )
      needClosed = true
    }
  }

  if (!conditionRecordWritten && !needClosed) return { world, conditionRecordWritten: false, needClosed: false }

  const updatedWorld = updateGameWorld(world, {
    ...(conditionRecordWritten ? { facilityComponentConditionRecords: updatedConditionRecords } : {}),
    ...(needClosed ? { facilityMaintenanceNeeds: updatedNeeds } : {}),
  })

  return { world: updatedWorld, conditionRecordWritten, needClosed }
}

function subtractOneDay(date: GameDate): GameDate {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  const utcMs = Date.UTC(year, month - 1, day) - 86_400_000
  const previous = new Date(utcMs)
  return parseGameDate(`${previous.getUTCFullYear().toString().padStart(4, '0')}-${(previous.getUTCMonth() + 1).toString().padStart(2, '0')}-${previous.getUTCDate().toString().padStart(2, '0')}`)
}
