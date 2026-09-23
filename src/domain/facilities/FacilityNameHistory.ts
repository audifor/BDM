import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import { facilityNameRecordIdFromString, facilityIdFromString, type FacilityId, type FacilityNameRecordId } from '@/domain/ids'
import { requireNonEmptyString } from '@/domain/validation'

/**
 * One named period in a Facility's identity, canonical or commercial (naming rights).
 * A commercial name change never creates a new Facility; it is a new record referencing
 * the same `facilityId`.
 */
export interface FacilityNameRecord {
  readonly id: FacilityNameRecordId
  readonly facilityId: FacilityId
  readonly name: string
  readonly isCanonical: boolean
  readonly validFrom: GameDate | null
  readonly validTo: GameDate | null
}

export interface CreateFacilityNameRecordInput {
  readonly id: FacilityNameRecordId | string
  readonly facilityId: FacilityId | string
  readonly name: string
  readonly isCanonical: boolean
  readonly validFrom?: GameDate | string | null
  readonly validTo?: GameDate | string | null
}

export function createFacilityNameRecord(input: CreateFacilityNameRecordInput): FacilityNameRecord {
  const validFrom = input.validFrom === undefined || input.validFrom === null ? null : parseGameDate(input.validFrom)
  const validTo = input.validTo === undefined || input.validTo === null ? null : parseGameDate(input.validTo)
  if (validFrom !== null && validTo !== null && compareGameDates(validTo, validFrom) < 0) {
    throw new RangeError('Facility name record validTo cannot precede validFrom')
  }
  return Object.freeze({
    id: facilityNameRecordIdFromString(input.id),
    facilityId: facilityIdFromString(input.facilityId),
    name: requireNonEmptyString(input.name, 'Facility name record name'),
    isCanonical: input.isCanonical,
    validFrom,
    validTo,
  })
}

/** Deterministic name resolution: an active commercial (naming-rights) name takes priority, since it is what the Facility is publicly called during that period; if none is active, the active canonical name wins; otherwise the identity's original canonical name (earliest record) is the fallback. */
export function resolveFacilityNameAt(records: readonly FacilityNameRecord[], onDate: GameDate): string | null {
  const active = records.filter((record) => isActiveOn(record.validFrom, record.validTo, onDate))
  const activeCommercial = [...active.filter((record) => !record.isCanonical)].sort((a, b) => compareRecordRecency(a, b)).at(0)
  if (activeCommercial !== undefined) return activeCommercial.name
  const activeCanonical = active.find((record) => record.isCanonical)
  if (activeCanonical !== undefined) return activeCanonical.name
  const canonicalRecords = records.filter((record) => record.isCanonical).sort((a, b) => compareGameDates(a.validFrom ?? onDate, b.validFrom ?? onDate))
  return canonicalRecords.at(0)?.name ?? null
}

function compareRecordRecency(a: FacilityNameRecord, b: FacilityNameRecord): number {
  const aFrom = a.validFrom
  const bFrom = b.validFrom
  if (aFrom === null && bFrom === null) return 0
  if (aFrom === null) return 1
  if (bFrom === null) return -1
  return compareGameDates(bFrom, aFrom)
}

function isActiveOn(validFrom: GameDate | null, validTo: GameDate | null, onDate: GameDate): boolean {
  return (validFrom === null || compareGameDates(validFrom, onDate) <= 0) && (validTo === null || compareGameDates(onDate, validTo) <= 0)
}
