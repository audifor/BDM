import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import { facilityIdFromString, facilityStatusRecordIdFromString, type FacilityId, type FacilityStatusRecordId } from '@/domain/ids'
import { FACILITY_STATUSES, isFacilityStatus, type FacilityStatus } from './FacilityLifecycle'

/**
 * Historical lifecycle transitions for a Facility. `Facility.status` on the entity itself is the
 * current snapshot; this collection is what makes `facilityStatusAt` for a past date possible
 * without inventing history that was never recorded (a Facility with no records simply resolves
 * to its current `Facility.status` for every date, since CFI1 does not backfill unrecorded past).
 */
export interface FacilityStatusRecord {
  readonly id: FacilityStatusRecordId
  readonly facilityId: FacilityId
  readonly status: FacilityStatus
  readonly effectiveFrom: GameDate
}

export interface CreateFacilityStatusRecordInput {
  readonly id: FacilityStatusRecordId | string
  readonly facilityId: FacilityId | string
  readonly status: FacilityStatus
  readonly effectiveFrom: GameDate | string
}

export function createFacilityStatusRecord(input: CreateFacilityStatusRecordInput): FacilityStatusRecord {
  if (!isFacilityStatus(input.status)) throw new TypeError(`Facility status record status is invalid: ${String(input.status)}`)
  return Object.freeze({
    id: facilityStatusRecordIdFromString(input.id),
    facilityId: facilityIdFromString(input.facilityId),
    status: input.status,
    effectiveFrom: parseGameDate(input.effectiveFrom),
  })
}

/** Deterministic: the latest record with `effectiveFrom <= onDate` wins; ties broken by record ID for total ordering. Falls back to `currentStatus` when no record qualifies. */
export function resolveFacilityStatusAt(records: readonly FacilityStatusRecord[], facilityId: FacilityId, onDate: GameDate, currentStatus: FacilityStatus): FacilityStatus {
  const candidates = records.filter((record) => record.facilityId === facilityId && compareGameDates(record.effectiveFrom, onDate) <= 0)
  if (candidates.length === 0) return currentStatus
  const latest = [...candidates].sort((a, b) => {
    const byDate = compareGameDates(b.effectiveFrom, a.effectiveFrom)
    return byDate !== 0 ? byDate : b.id.localeCompare(a.id)
  })[0]!
  return latest.status
}

export { FACILITY_STATUSES }
