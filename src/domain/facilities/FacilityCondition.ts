import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import { facilityComponentConditionRecordIdFromString, facilityComponentIdFromString, facilityConditionRecordIdFromString, facilityIdFromString, type FacilityComponentConditionRecordId, type FacilityComponentId, type FacilityConditionRecordId, type FacilityId } from '@/domain/ids'

/**
 * CFI4 answers a different question from CFI1's `FacilityLifecycle`/`FacilityStatusHistory`.
 * Lifecycle/status is administrative: is this Facility open, closed, under renovation,
 * decommissioned? Condition is physical/functional: given that it is administratively ACTIVE,
 * what shape is it actually in, and is it fully usable right now? A Facility can be globally
 * ACTIVE while one component is OUT_OF_SERVICE — CFI4 never duplicates or re-derives the
 * lifecycle/status enums, it reuses them by staying orthogonal to them.
 *
 * `Facility.capabilities`/`FacilityCapability` (CFI1) and `FacilityComponentCapability` (CFI3)
 * remain completely untouched and unmerged by CFI4: CFI1's field is a small, coarse,
 * author-declared "hosts X" fact set directly on `Facility`; CFI3's model is a larger,
 * component-derived "what specifically can this support" set; CFI4 adds "and is that support
 * currently usable" via `usableCapabilitiesOfFacilityAt`/`facilityHasUsableCapabilityAt`
 * (`FacilityComponentCapability.ts`), without introducing a third overlapping naming scheme.
 */

/**
 * A 0–100 scale meaning exclusively PHYSICAL CONDITION: how physically sound/well-maintained a
 * component or Facility-wide dimension currently is. It is explicitly NOT prestige, general
 * quality, sporting level, modernity, or economic value — none of those concepts are represented
 * anywhere in this file. `null` means the condition is genuinely unknown/unrecorded and must never
 * be treated as, defaulted to, or displayed as a perfect 100; absence of data is not evidence of
 * excellent condition. Suggested (non-enforced) bands: 90-100 near-new/excellent, 70-89 good,
 * 50-69 worn but functional, 30-49 poor/degraded, 1-29 severely degraded, 0 physically unusable —
 * these labels are documentation only; the canonical source of truth remains the number.
 */
export type PhysicalCondition = number | null

export function createPhysicalCondition(value: PhysicalCondition): PhysicalCondition {
  if (value === null) return null
  if (!Number.isFinite(value) || value < 0 || value > 100) throw new RangeError('Physical condition must be null (unknown) or between 0 and 100')
  return value
}

/**
 * Functional usability, independent of `PhysicalCondition`: an old-but-well-maintained space can
 * be `FULL` at a low condition score, and a modern space can be `OUT_OF_SERVICE` or `LIMITED`
 * despite a high condition score if a critical part of it is temporarily non-functional.
 * Deliberately not a boolean — `LIMITED`/`SEVERELY_LIMITED` preserve a distinction a plain
 * available/unavailable flag would destroy.
 */
export const FACILITY_SERVICEABILITIES = ['FULL', 'LIMITED', 'SEVERELY_LIMITED', 'OUT_OF_SERVICE'] as const
export type FacilityServiceability = (typeof FACILITY_SERVICEABILITIES)[number]

export function isFacilityServiceability(value: unknown): value is FacilityServiceability {
  return typeof value === 'string' && (FACILITY_SERVICEABILITIES as readonly string[]).includes(value)
}

/**
 * The technical sophistication of a component, independent of both its condition and its age.
 * Answers "how capable is this by design", not "how well is it currently maintained" (a BASIC gym
 * in excellent condition and a degraded SPECIALIST lab are both fully representable). Small and
 * explicit by design, per the brief's instruction not to introduce twenty subjective ratings.
 */
export const FACILITY_TECHNICAL_STANDARDS = ['BASIC', 'CONVENTIONAL', 'ADVANCED', 'SPECIALIST'] as const
export type FacilityTechnicalStandard = (typeof FACILITY_TECHNICAL_STANDARDS)[number]

export function isFacilityTechnicalStandard(value: unknown): value is FacilityTechnicalStandard {
  return typeof value === 'string' && (FACILITY_TECHNICAL_STANDARDS as readonly string[]).includes(value)
}

/**
 * One historical period of a FacilityComponent's physical condition/serviceability/technical
 * standard. `physicalCondition: null` and `technicalStandard: null` both mean "not recorded",
 * never a default value. This is the primary, preferred locus of condition truth per the brief:
 * "la fuente primaria de estado debe estar preferentemente en los componentes cuando exista
 * granularidad suficiente."
 */
export interface FacilityComponentConditionRecord {
  readonly id: FacilityComponentConditionRecordId
  readonly componentId: FacilityComponentId
  readonly effectiveFrom: GameDate
  readonly effectiveTo: GameDate | null
  readonly physicalCondition: PhysicalCondition
  readonly serviceability: FacilityServiceability
  readonly technicalStandard: FacilityTechnicalStandard | null
  readonly notes: string | null
}

export interface CreateFacilityComponentConditionRecordInput {
  readonly id: FacilityComponentConditionRecordId | string
  readonly componentId: FacilityComponentId | string
  readonly effectiveFrom: GameDate | string
  readonly effectiveTo?: GameDate | string | null
  readonly physicalCondition?: PhysicalCondition
  readonly serviceability: FacilityServiceability
  readonly technicalStandard?: FacilityTechnicalStandard | null
  readonly notes?: string | null
}

export function createFacilityComponentConditionRecord(input: CreateFacilityComponentConditionRecordInput): FacilityComponentConditionRecord {
  if (!isFacilityServiceability(input.serviceability)) throw new TypeError(`Facility component condition record serviceability is invalid: ${String(input.serviceability)}`)
  const technicalStandard = input.technicalStandard === undefined || input.technicalStandard === null ? null : input.technicalStandard
  if (technicalStandard !== null && !isFacilityTechnicalStandard(technicalStandard)) throw new TypeError(`Facility component condition record technicalStandard is invalid: ${String(technicalStandard)}`)
  const effectiveFrom = parseGameDate(input.effectiveFrom)
  const effectiveTo = input.effectiveTo === undefined || input.effectiveTo === null ? null : parseGameDate(input.effectiveTo)
  if (effectiveTo !== null && compareGameDates(effectiveTo, effectiveFrom) < 0) throw new RangeError('Facility component condition record effectiveTo cannot precede effectiveFrom')
  const physicalCondition = createPhysicalCondition(input.physicalCondition ?? null)
  const notes = input.notes === undefined || input.notes === null ? null : input.notes
  if (notes !== null && notes.trim().length === 0) throw new TypeError('Facility component condition record notes must be a non-empty string or null')
  return Object.freeze({
    id: facilityComponentConditionRecordIdFromString(input.id),
    componentId: facilityComponentIdFromString(input.componentId),
    effectiveFrom,
    effectiveTo,
    physicalCondition,
    serviceability: input.serviceability,
    technicalStandard,
    notes,
  })
}

/**
 * Facility-wide condition, reserved for dimensions that genuinely describe the whole
 * building/asset rather than any single component — structural integrity, building envelope,
 * utilities, accessibility infrastructure. This is never an aggregate/average of component
 * records; it is only used when the Facility itself, as a single asset, has its own condition
 * fact to record. Most Facilities will have zero of these records, which is expected, not an
 * error — the component layer remains the primary source of truth per the brief.
 */
export const FACILITY_CONDITION_DIMENSIONS = ['STRUCTURAL_INTEGRITY', 'BUILDING_ENVELOPE', 'UTILITIES', 'ACCESSIBILITY_INFRASTRUCTURE'] as const
export type FacilityConditionDimension = (typeof FACILITY_CONDITION_DIMENSIONS)[number]

export function isFacilityConditionDimension(value: unknown): value is FacilityConditionDimension {
  return typeof value === 'string' && (FACILITY_CONDITION_DIMENSIONS as readonly string[]).includes(value)
}

export interface FacilityConditionRecord {
  readonly id: FacilityConditionRecordId
  readonly facilityId: FacilityId
  readonly dimension: FacilityConditionDimension
  readonly effectiveFrom: GameDate
  readonly effectiveTo: GameDate | null
  readonly physicalCondition: PhysicalCondition
  readonly serviceability: FacilityServiceability
  readonly notes: string | null
}

export interface CreateFacilityConditionRecordInput {
  readonly id: FacilityConditionRecordId | string
  readonly facilityId: FacilityId | string
  readonly dimension: FacilityConditionDimension
  readonly effectiveFrom: GameDate | string
  readonly effectiveTo?: GameDate | string | null
  readonly physicalCondition?: PhysicalCondition
  readonly serviceability: FacilityServiceability
  readonly notes?: string | null
}

export function createFacilityConditionRecord(input: CreateFacilityConditionRecordInput): FacilityConditionRecord {
  if (!isFacilityConditionDimension(input.dimension)) throw new TypeError(`Facility condition record dimension is invalid: ${String(input.dimension)}`)
  if (!isFacilityServiceability(input.serviceability)) throw new TypeError(`Facility condition record serviceability is invalid: ${String(input.serviceability)}`)
  const effectiveFrom = parseGameDate(input.effectiveFrom)
  const effectiveTo = input.effectiveTo === undefined || input.effectiveTo === null ? null : parseGameDate(input.effectiveTo)
  if (effectiveTo !== null && compareGameDates(effectiveTo, effectiveFrom) < 0) throw new RangeError('Facility condition record effectiveTo cannot precede effectiveFrom')
  const physicalCondition = createPhysicalCondition(input.physicalCondition ?? null)
  const notes = input.notes === undefined || input.notes === null ? null : input.notes
  if (notes !== null && notes.trim().length === 0) throw new TypeError('Facility condition record notes must be a non-empty string or null')
  return Object.freeze({
    id: facilityConditionRecordIdFromString(input.id),
    facilityId: facilityIdFromString(input.facilityId),
    dimension: input.dimension,
    effectiveFrom,
    effectiveTo,
    physicalCondition,
    serviceability: input.serviceability,
    notes,
  })
}

function isActiveOn(effectiveFrom: GameDate, effectiveTo: GameDate | null, onDate: GameDate): boolean {
  return compareGameDates(effectiveFrom, onDate) <= 0 && (effectiveTo === null || compareGameDates(onDate, effectiveTo) <= 0)
}

/** Deterministic: among records active on the date, the one with the latest `effectiveFrom` wins; ties broken by record ID. `undefined` means no record ever existed for this component — the caller must treat this as UNKNOWN, never as a default FULL/100 state. */
export function componentConditionAt(records: readonly FacilityComponentConditionRecord[], componentId: FacilityComponentId, onDate: GameDate): FacilityComponentConditionRecord | undefined {
  const candidates = records.filter((record) => record.componentId === componentId && isActiveOn(record.effectiveFrom, record.effectiveTo, onDate))
  if (candidates.length === 0) return undefined
  return [...candidates].sort((a, b) => {
    const byDate = compareGameDates(b.effectiveFrom, a.effectiveFrom)
    return byDate !== 0 ? byDate : b.id.localeCompare(a.id)
  })[0]
}

/** Convenience projection of `componentConditionAt` returning only the serviceability, defaulting to `FULL` when no record exists — absence of a condition record means "never recorded as impaired", which is the only default that does not falsify unknown physical condition data (physicalCondition itself remains `null`/unknown in that case, never defaulted). */
export function componentServiceabilityAt(records: readonly FacilityComponentConditionRecord[], componentId: FacilityComponentId, onDate: GameDate): FacilityServiceability {
  return componentConditionAt(records, componentId, onDate)?.serviceability ?? 'FULL'
}

/** All FacilityConditionRecords for one Facility active at a date, across every recorded dimension. */
export function facilityConditionRecordsAt(records: readonly FacilityConditionRecord[], facilityId: FacilityId, onDate: GameDate): readonly FacilityConditionRecord[] {
  return records.filter((record) => record.facilityId === facilityId && isActiveOn(record.effectiveFrom, record.effectiveTo, onDate)).sort((a, b) => a.id.localeCompare(b.id))
}
