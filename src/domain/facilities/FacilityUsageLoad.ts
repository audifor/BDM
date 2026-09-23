import { facilityComponentIdFromString, type FacilityComponentId } from '@/domain/ids'

/**
 * A caller-supplied, transient utilization signal for one component over one deterioration period.
 * This is deliberately NOT persisted GameWorld state: no real usage source (Match, Training,
 * Events) exists yet to produce it, so CFI5 only defines the shape callers can already test
 * against by hand. A future wave that wires real usage will construct these from actual
 * scheduling/session data and pass them into the engine unchanged; this type itself never changes.
 *
 * `utilizationRatio` is dimensionless in `[0, 1]`. Components with no supplied load use the
 * engine's neutral baseline (see `FacilityDeteriorationEngine.ts`), not zero — CFI5 does not assume
 * an un-instrumented component is unused; it assumes ordinary/typical use until real usage data
 * says otherwise.
 */
export interface FacilityUsageLoad {
  readonly componentId: FacilityComponentId
  readonly utilizationRatio: number
}

export interface CreateFacilityUsageLoadInput {
  readonly componentId: FacilityComponentId | string
  readonly utilizationRatio: number
}

export function createFacilityUsageLoad(input: CreateFacilityUsageLoadInput): FacilityUsageLoad {
  if (!Number.isFinite(input.utilizationRatio) || input.utilizationRatio < 0 || input.utilizationRatio > 1) {
    throw new RangeError('Facility usage load utilizationRatio must be between 0 and 1')
  }
  return Object.freeze({
    componentId: facilityComponentIdFromString(input.componentId),
    utilizationRatio: input.utilizationRatio,
  })
}
