import type { GameDate } from '@/domain/date'
import { parseGameDate } from '@/domain/date'
import type { ResponsibilityKind, ResponsibilityMode } from '@/domain/responsibility'
import type { StaffPersonId, TeamId } from '@/domain/ids'
import { requireNonEmptyString } from '@/domain/validation'

/**
 * Wave 5A — Staff Human State & Reaction System.
 *
 * World Database alignment (see docs): PERSON is the human identity root, STAFF is a 0..1
 * specialization of PERSON, ORGANIZATION is an independent root. `StaffHumanContext` never
 * becomes a second human identity — it represents "how this person is doing inside a concrete
 * employment stage", not "who this person is". Personality/ambition/loyalty/professionalism
 * already live on `Personality` (`@/domain/personality`, keyed by `personalitiesByPersonId`) and
 * must never be duplicated here. Relationships and Memory are likewise never duplicated — this
 * module only ever calls into `@/domain/relationships`/`@/domain/world/RelationshipEvents` and
 * `@/domain/memory`/`@/engine/memory` as bridges.
 *
 * The runtime does not yet have a canonical Organization aggregate, so `StaffHumanContext`
 * resolves its employment identity from the existing `StaffEmployment`/`TeamStaffAssignment`
 * authorities (`teamId` + `startedOn`) — a temporary adapter, not a `Team === Organization`
 * assumption baked into the engine. A future World Database bootstrap can re-point context
 * creation at a real Organization id without touching the reaction/appraisal pipeline.
 */

declare const staffHumanContextIdBrand: unique symbol
declare const staffReactionRecordIdBrand: unique symbol
type HumanStateBrandedId<Kind extends string> = string & { readonly [staffHumanContextIdBrand]: Kind }
type ReactionBrandedId<Kind extends string> = string & { readonly [staffReactionRecordIdBrand]: Kind }
export type StaffHumanContextId = HumanStateBrandedId<'StaffHumanContextId'>
export type StaffReactionRecordId = ReactionBrandedId<'StaffReactionRecordId'>

export const staffHumanContextIdFromString = (value: string): StaffHumanContextId => requireNonEmptyString(value, 'Staff human context ID') as StaffHumanContextId
export const staffReactionRecordIdFromString = (value: string): StaffReactionRecordId => requireNonEmptyString(value, 'Staff reaction record ID') as StaffReactionRecordId

/** Deterministic, stable identity for the CURRENT employment stage of a Staff person on a Team — never randomly generated, never re-derived per call. */
export function staffHumanContextIdFor(staffId: StaffPersonId, teamId: TeamId, startedOn: GameDate): StaffHumanContextId {
  return staffHumanContextIdFromString(`staff-human-context:${staffId}:${teamId}:${startedOn}`)
}

// ---------------------------------------------------------------------------
// StaffHumanContext — one concrete employment stage
// ---------------------------------------------------------------------------

export interface StaffHumanContext {
  readonly id: StaffHumanContextId
  readonly staffId: StaffPersonId
  /** Temporary Team-based adapter for "who employs this person" until a canonical Organization aggregate exists — see module doc comment. */
  readonly teamId: TeamId
  readonly startedOn: GameDate
  readonly endedOn?: GameDate
}

export function createStaffHumanContext(input: StaffHumanContext): StaffHumanContext {
  return {
    id: staffHumanContextIdFromString(input.id),
    staffId: requireNonEmptyString(input.staffId, 'Staff human context staff') as StaffPersonId,
    teamId: requireNonEmptyString(input.teamId, 'Staff human context team') as TeamId,
    startedOn: parseGameDate(input.startedOn),
    ...(input.endedOn === undefined ? {} : { endedOn: parseGameDate(input.endedOn) }),
  }
}

// ---------------------------------------------------------------------------
// 11 canonical Human State dimensions
// ---------------------------------------------------------------------------

export const STAFF_HUMAN_STATE_DIMENSIONS = [
  'roleSatisfaction',
  'responsibilitySatisfaction',
  'autonomySatisfaction',
  'influenceSatisfaction',
  'contractSatisfaction',
  'workloadSatisfaction',
  'professionalFulfillment',
  'recognitionSatisfaction',
  'frustration',
  'stress',
  'organizationalCommitment',
] as const
export type StaffHumanStateDimension = typeof STAFF_HUMAN_STATE_DIMENSIONS[number]

export interface StaffHumanState {
  readonly contextId: StaffHumanContextId
  readonly staffId: StaffPersonId
  readonly roleSatisfaction: number
  readonly responsibilitySatisfaction: number
  readonly autonomySatisfaction: number
  readonly influenceSatisfaction: number
  readonly contractSatisfaction: number
  readonly workloadSatisfaction: number
  readonly professionalFulfillment: number
  readonly recognitionSatisfaction: number
  readonly frustration: number
  readonly stress: number
  readonly organizationalCommitment: number
  readonly lastEvaluatedOn: GameDate
}

export function clampHumanStateValue(value: number): number {
  if (!Number.isFinite(value)) return 50
  return Math.max(0, Math.min(100, Math.round(value)))
}

export function createStaffHumanState(input: StaffHumanState): StaffHumanState {
  const clamped: Record<StaffHumanStateDimension, number> = {} as never
  for (const dimension of STAFF_HUMAN_STATE_DIMENSIONS) clamped[dimension] = clampHumanStateValue(input[dimension])
  return {
    contextId: staffHumanContextIdFromString(input.contextId),
    staffId: requireNonEmptyString(input.staffId, 'Staff human state staff') as StaffPersonId,
    ...clamped,
    lastEvaluatedOn: parseGameDate(input.lastEvaluatedOn),
  }
}

// ---------------------------------------------------------------------------
// 15 canonical Expectation dimensions
// ---------------------------------------------------------------------------

export const STAFF_EXPECTATION_DIMENSIONS = [
  'roleStature',
  'responsibility',
  'autonomy',
  'influence',
  'compensation',
  'workload',
  'progression',
  'recognition',
  'jobSecurity',
  'professionalChallenge',
  'development',
  'resourceSupport',
  'informationAccess',
  'decisionAccess',
  'organizationalAmbition',
] as const
export type StaffExpectationDimension = typeof STAFF_EXPECTATION_DIMENSIONS[number]

export type StaffExpectationValues = Readonly<Record<StaffExpectationDimension, number>>

export interface StaffExpectationProfile {
  readonly contextId: StaffHumanContextId
  readonly staffId: StaffPersonId
  /** Frozen snapshot taken when the context was created — never recalculated. */
  readonly initial: StaffExpectationValues
  /** Slowly adaptable current expectation — see hedonic adaptation rules in the Appraisal Engine. */
  readonly current: StaffExpectationValues
  readonly establishedOn: GameDate
  readonly lastAdjustedOn: GameDate
}

function clampExpectationValues(values: StaffExpectationValues): StaffExpectationValues {
  const clamped: Record<StaffExpectationDimension, number> = {} as never
  for (const dimension of STAFF_EXPECTATION_DIMENSIONS) clamped[dimension] = clampHumanStateValue(values[dimension])
  return clamped
}

export function createStaffExpectationProfile(input: StaffExpectationProfile): StaffExpectationProfile {
  return {
    contextId: staffHumanContextIdFromString(input.contextId),
    staffId: requireNonEmptyString(input.staffId, 'Staff expectation profile staff') as StaffPersonId,
    initial: clampExpectationValues(input.initial),
    current: clampExpectationValues(input.current),
    establishedOn: parseGameDate(input.establishedOn),
    lastAdjustedOn: parseGameDate(input.lastAdjustedOn),
  }
}

// ---------------------------------------------------------------------------
// Reality: a per-dimension known/unknown reading, never fabricated
// ---------------------------------------------------------------------------

/** A known reality reading (0-100) or explicit UNKNOWN — never silently treated as 0. */
export type StaffRealityReading = { readonly known: true; readonly value: number } | { readonly known: false }
export type StaffRealityProfile = Readonly<Record<StaffExpectationDimension, StaffRealityReading>>

export function knownReality(value: number): StaffRealityReading {
  return { known: true, value: clampHumanStateValue(value) }
}
export const UNKNOWN_REALITY: StaffRealityReading = { known: false }

// ---------------------------------------------------------------------------
// Expectation gap
// ---------------------------------------------------------------------------

export const EXPECTATION_GAP_BANDS = ['STRONGLY_BELOW', 'BELOW', 'MATCHED', 'ABOVE', 'STRONGLY_ABOVE'] as const
export type ExpectationGapBand = typeof EXPECTATION_GAP_BANDS[number]

export const EXPECTATION_GAP_DURATIONS = ['RECENT', 'ESTABLISHED', 'SUSTAINED', 'CHRONIC'] as const
export type ExpectationGapDuration = typeof EXPECTATION_GAP_DURATIONS[number]

export interface StaffExpectationGap {
  readonly dimension: StaffExpectationDimension
  readonly band: ExpectationGapBand
  readonly gapValue: number
}

/** UNKNOWN reality is always neutral (MATCHED, gapValue 0) — never a penalty for data BDM does not yet have. */
export function deriveExpectationGap(dimension: StaffExpectationDimension, expectation: number, reality: StaffRealityReading): StaffExpectationGap {
  if (!reality.known) return { dimension, band: 'MATCHED', gapValue: 0 }
  const gapValue = reality.value - expectation
  const band: ExpectationGapBand = gapValue <= -30 ? 'STRONGLY_BELOW' : gapValue <= -10 ? 'BELOW' : gapValue < 10 ? 'MATCHED' : gapValue < 30 ? 'ABOVE' : 'STRONGLY_ABOVE'
  return { dimension, band, gapValue }
}

// ---------------------------------------------------------------------------
// Career stage — derived, never persisted
// ---------------------------------------------------------------------------

export const CAREER_STAGES = ['EARLY', 'ESTABLISHING', 'PRIME', 'VETERAN', 'LATE_CAREER'] as const
export type CareerStage = typeof CAREER_STAGES[number]

/** Pure age-based derivation — no new persisted field. `undefined` age (unknown date of birth) yields the neutral PRIME assumption rather than a guess-penalty. */
export function deriveCareerStage(age: number | undefined): CareerStage {
  if (age === undefined) return 'PRIME'
  if (age < 30) return 'EARLY'
  if (age < 38) return 'ESTABLISHING'
  if (age < 48) return 'PRIME'
  if (age < 58) return 'VETERAN'
  return 'LATE_CAREER'
}

// ---------------------------------------------------------------------------
// Attribution — who actually caused a reaction-worthy situation
// ---------------------------------------------------------------------------

export const STAFF_HUMAN_EVENT_ACTOR_KINDS = ['USER_COACH', 'OTHER_STAFF', 'EXECUTIVE', 'ORGANIZATION', 'SYSTEMIC_CONTEXT', 'SELF', 'EXTERNAL'] as const
export type StaffHumanEventActorKind = typeof STAFF_HUMAN_EVENT_ACTOR_KINDS[number]

export interface StaffHumanEventAttribution {
  readonly actorKind: StaffHumanEventActorKind
  /** Concrete PERSON id (coach id / staff id) when `actorKind` names a specific person — absent for ORGANIZATION/SYSTEMIC_CONTEXT. */
  readonly actorId?: string
}

export const SYSTEMIC_ATTRIBUTION: StaffHumanEventAttribution = { actorKind: 'SYSTEMIC_CONTEXT' }

// ---------------------------------------------------------------------------
// 30 canonical Staff Human Event kinds
// ---------------------------------------------------------------------------

export const STAFF_HUMAN_EVENT_KINDS = [
  // Responsibilities
  'responsibilityGranted',
  'responsibilityRemoved',
  'responsibilityModeIncreased',
  'responsibilityModeReduced',
  'responsibilityReassignedAway',
  'responsibilityReassignedToStaff',
  'responsibilityScopeExpanded',
  'responsibilityScopeReduced',
  // Advisory / professional voice
  'recommendationAccepted',
  'actionableRecommendationRejected',
  'importantRecommendationAccepted',
  'importantRecommendationRejected',
  'recommendationPatternPositive',
  'recommendationPatternNegative',
  // Role / professional standing
  'staffAppointed',
  'staffRoleImproved',
  'staffRoleReduced',
  'professionalStandingImproved',
  'professionalStandingReduced',
  // Workload
  'sustainedUnderutilization',
  'sustainedHealthyWorkload',
  'sustainedHeavyWorkload',
  'sustainedOverload',
  'workloadRelief',
  // Contract
  'contractSituationImproved',
  'contractSituationDeteriorated',
  'contractRecognitionGapOpened',
  'contractSecurityRestored',
  // Professional outcome
  'professionalSuccess',
  'professionalFailure',
] as const
export type StaffHumanEventKind = typeof STAFF_HUMAN_EVENT_KINDS[number]

export const STAFF_HUMAN_EVENT_IMPORTANCE_LEVELS = ['ROUTINE', 'MEANINGFUL', 'IMPORTANT', 'CRITICAL'] as const
export type StaffHumanEventImportance = typeof STAFF_HUMAN_EVENT_IMPORTANCE_LEVELS[number]

export interface StaffHumanEvent {
  readonly id: string
  readonly kind: StaffHumanEventKind
  readonly staffId: StaffPersonId
  readonly contextId: StaffHumanContextId
  readonly occurredOn: GameDate
  readonly importance: StaffHumanEventImportance
  /** The real-world artifact this event was derived from (a Responsibility id, DelegationOutcome id, etc.) — the idempotency key partner alongside `kind`. */
  readonly sourceEventId: string
  readonly attribution: StaffHumanEventAttribution
  readonly payload: Readonly<Record<string, string | number | boolean>>
}

export function createStaffHumanEvent(input: StaffHumanEvent): StaffHumanEvent {
  if (!STAFF_HUMAN_EVENT_KINDS.includes(input.kind)) throw new RangeError(`Unknown Staff human event kind: ${String(input.kind)}`)
  if (!STAFF_HUMAN_EVENT_IMPORTANCE_LEVELS.includes(input.importance)) throw new RangeError(`Unknown Staff human event importance: ${String(input.importance)}`)
  return {
    id: requireNonEmptyString(input.id, 'Staff human event id'),
    kind: input.kind,
    staffId: requireNonEmptyString(input.staffId, 'Staff human event staff') as StaffPersonId,
    contextId: staffHumanContextIdFromString(input.contextId),
    occurredOn: parseGameDate(input.occurredOn),
    importance: input.importance,
    sourceEventId: requireNonEmptyString(input.sourceEventId, 'Staff human event source'),
    attribution: { ...input.attribution },
    payload: { ...input.payload },
  }
}

// ---------------------------------------------------------------------------
// StaffReactionRecord — persisted outcome of one processed StaffHumanEvent
// ---------------------------------------------------------------------------

export type StaffHumanStateDelta = Readonly<Partial<Record<StaffHumanStateDimension, number>>>

export interface StaffReactionRecord {
  readonly id: StaffReactionRecordId
  readonly staffId: StaffPersonId
  readonly contextId: StaffHumanContextId
  readonly sourceEventId: string
  readonly eventKind: StaffHumanEventKind
  readonly importance: StaffHumanEventImportance
  readonly occurredOn: GameDate
  readonly stateDelta: StaffHumanStateDelta
  readonly attribution: StaffHumanEventAttribution
  readonly relatedMemoryIds?: readonly string[]
}

/** Idempotency identity — one reaction per (staff, context, source event, kind), regardless of how many times the source is reprocessed. */
export function staffReactionRecordIdFor(staffId: StaffPersonId, contextId: StaffHumanContextId, sourceEventId: string, kind: StaffHumanEventKind): StaffReactionRecordId {
  return staffReactionRecordIdFromString(`staff-reaction:${staffId}:${contextId}:${sourceEventId}:${kind}`)
}

export function createStaffReactionRecord(input: StaffReactionRecord): StaffReactionRecord {
  return {
    id: staffReactionRecordIdFromString(input.id),
    staffId: requireNonEmptyString(input.staffId, 'Staff reaction record staff') as StaffPersonId,
    contextId: staffHumanContextIdFromString(input.contextId),
    sourceEventId: requireNonEmptyString(input.sourceEventId, 'Staff reaction record source event'),
    eventKind: input.eventKind,
    importance: input.importance,
    occurredOn: parseGameDate(input.occurredOn),
    stateDelta: { ...input.stateDelta },
    attribution: { ...input.attribution },
    ...(input.relatedMemoryIds === undefined ? {} : { relatedMemoryIds: [...input.relatedMemoryIds] }),
  }
}

// ---------------------------------------------------------------------------
// Workload bands — thin classification over the canonical calculateStaffWorkload()
// ---------------------------------------------------------------------------

export const STAFF_WORKLOAD_BANDS = ['UNDERUTILIZED', 'HEALTHY', 'HEAVY', 'OVERLOADED'] as const
export type StaffWorkloadBand = typeof STAFF_WORKLOAD_BANDS[number]

export function classifyWorkloadBand(utilization: number): StaffWorkloadBand {
  if (!Number.isFinite(utilization)) return 'OVERLOADED'
  if (utilization < 0.4) return 'UNDERUTILIZED'
  if (utilization <= 0.85) return 'HEALTHY'
  if (utilization <= 1) return 'HEAVY'
  return 'OVERLOADED'
}

// ---------------------------------------------------------------------------
// Type guards shared by identity/kind helpers referenced by Responsibility/Advisory context
// ---------------------------------------------------------------------------

export type { ResponsibilityKind, ResponsibilityMode }
