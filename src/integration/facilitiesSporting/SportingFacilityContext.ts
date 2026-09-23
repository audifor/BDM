/**
 * CFI8 — the derived answer to "what usable sporting infrastructure does this Team actually have
 * access to at this date?" Composed entirely from CFI2 (access rights), CFI3 (anatomy/capabilities)
 * and CFI4 (condition/serviceability/technical standard) facts already resolvable from GameWorld.
 * Nothing here is world truth: it is never persisted (no GameWorld collection, no Save field), it
 * is pure and deterministic for a given (world, teamId, date), and it introduces no facility
 * "overall rating" or sporting quality score of its own. Facilities decides only what capability
 * a Team can currently reach; sporting systems (Training/Development/Medical/Recovery/...) decide
 * what that capability means for their own outcomes.
 */

import { parseGameDate, type GameDate } from '@/domain/date'
import type { FacilityComponentId, TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import {
  componentCategory,
  componentConditionAt,
  facilityHasCapability,
  usableCapabilitiesOfFacilityAt,
  usableComponentsForTeamAt,
  usageRightsForTeamAt,
  type FacilityComponent,
  type FacilityComponentCapability,
  type FacilityServiceability,
  type FacilityTechnicalStandard,
} from '@/domain/facilities'

/**
 * Why a capability is unavailable or a component is absent from a context, for UI/debug
 * explainability. Deliberately small and derived — never persisted.
 */
export const SPORTING_FACILITY_CONSTRAINT_REASONS = [
  'NO_COMPONENT',
  'NO_ACCESS',
  'OUT_OF_SERVICE',
  'LIMITED_SERVICE',
  'INSUFFICIENT_CAPACITY',
  'UNKNOWN_SPECIFICATION',
] as const
export type SportingFacilityConstraintReason = (typeof SPORTING_FACILITY_CONSTRAINT_REASONS)[number]

/** One explainable capability entry within a sporting sub-context. */
export interface SportingCapabilityStatus {
  readonly capability: FacilityComponentCapability
  /** AVAILABLE: at least one justifying component is usable (FULL/LIMITED/SEVERELY_LIMITED, Team has access). LIMITED: usable but the best justifying component is degraded. UNAVAILABLE: no usable justifying component the Team can access. */
  readonly status: 'AVAILABLE' | 'LIMITED' | 'UNAVAILABLE'
  readonly reason: SportingFacilityConstraintReason | null
  /** The component whose state this status is explained by, when one exists (best-serviceability justifying component the Team can access, or the first NO_ACCESS/NO_COMPONENT candidate found). */
  readonly sourceComponentId: FacilityComponentId | null
  readonly serviceability: FacilityServiceability | null
  readonly technicalStandard: FacilityTechnicalStandard | null
}

/** One physically identifiable court the Team can reach, with its effective (access + serviceability) availability — never collapsed into a bare count. */
export interface SportingCourtStatus {
  readonly componentId: FacilityComponentId
  readonly type: FacilityComponent['type']
  readonly isFullCourt: boolean | null
  readonly isIndoor: boolean | null
  readonly serviceability: FacilityServiceability
  readonly technicalStandard: FacilityTechnicalStandard | null
  readonly hasVideoTrackingTechnology: boolean | null
}

export interface BasketballFacilityContext {
  readonly courts: readonly SportingCourtStatus[]
  /** Count of courts with serviceability other than OUT_OF_SERVICE the Team can access. Never a guess when the underlying component set is empty: 0 usable courts is a real, representable fact, not UNKNOWN. */
  readonly usablePracticeCourtCount: number
  readonly capabilities: readonly SportingCapabilityStatus[]
}

export interface TrainingFacilityContext {
  readonly capabilities: readonly SportingCapabilityStatus[]
}

export interface PerformanceFacilityContext {
  readonly capabilities: readonly SportingCapabilityStatus[]
}

export interface MedicalFacilityContext {
  readonly capabilities: readonly SportingCapabilityStatus[]
}

export interface RehabilitationFacilityContext {
  readonly capabilities: readonly SportingCapabilityStatus[]
}

export interface RecoveryFacilityContext {
  readonly capabilities: readonly SportingCapabilityStatus[]
}

export interface AnalysisFacilityContext {
  readonly capabilities: readonly SportingCapabilityStatus[]
}

export interface SupportFacilityContext {
  readonly capabilities: readonly SportingCapabilityStatus[]
}

/**
 * Factual, non-numeric limitations observed while building the context — the RPG/event seam
 * (§ "RPG / EVENT SEAM"). Plain data, never a complaint, penalty, or narrative consequence.
 */
export const SPORTING_FACILITY_CONSTRAINT_FACTS = [
  'TRAINING_CAPACITY_INSUFFICIENT',
  'KEY_PRACTICE_COURT_UNAVAILABLE',
  'MEDICAL_CAPABILITY_UNAVAILABLE',
  'REHABILITATION_CAPACITY_LIMITED',
  'RECOVERY_INFRASTRUCTURE_LIMITED',
] as const
export type SportingFacilityConstraintFact = (typeof SPORTING_FACILITY_CONSTRAINT_FACTS)[number]

/**
 * The full derived sporting-infrastructure picture for one Team at one date. Never persisted;
 * recomputed on demand from Facilities + CFI2 rights + CFI4 condition/serviceability. Composing
 * this does not read or write Training, Development, Medical, Recovery, or any other sporting
 * domain state — it only answers what physical capability is reachable, never what that capability
 * causes.
 */
export interface TeamSportingFacilityContext {
  readonly teamId: TeamId
  readonly date: GameDate
  readonly basketball: BasketballFacilityContext
  readonly strengthAndConditioning: TrainingFacilityContext
  readonly performance: PerformanceFacilityContext
  readonly medical: MedicalFacilityContext
  readonly rehabilitation: RehabilitationFacilityContext
  readonly recovery: RecoveryFacilityContext
  readonly analysis: AnalysisFacilityContext
  readonly support: SupportFacilityContext
  readonly constraints: readonly SportingFacilityConstraintFact[]
}

const BASKETBALL_CAPABILITIES: readonly FacilityComponentCapability[] = ['BASKETBALL_FULL_COURT', 'BASKETBALL_TRAINING']
const TRAINING_CAPABILITIES: readonly FacilityComponentCapability[] = ['STRENGTH_TRAINING', 'CARDIO_TRAINING']
const PERFORMANCE_CAPABILITIES: readonly FacilityComponentCapability[] = ['STRENGTH_TRAINING', 'CARDIO_TRAINING', 'VIDEO_ANALYSIS']
const MEDICAL_CAPABILITIES: readonly FacilityComponentCapability[] = ['MEDICAL_EXAMINATION', 'MEDICAL_IMAGING']
const REHABILITATION_CAPABILITIES: readonly FacilityComponentCapability[] = ['PHYSIOTHERAPY', 'HYDROTHERAPY', 'STRENGTH_TRAINING', 'CARDIO_TRAINING']
const RECOVERY_CAPABILITIES: readonly FacilityComponentCapability[] = ['HYDROTHERAPY', 'CRYOTHERAPY', 'PHYSIOTHERAPY']
const ANALYSIS_CAPABILITIES: readonly FacilityComponentCapability[] = ['VIDEO_ANALYSIS']
const SUPPORT_CAPABILITIES: readonly FacilityComponentCapability[] = ['PLAYER_DINING', 'PLAYER_RESIDENTIAL']

const COMPONENT_TYPES_FOR_CAPABILITY: Readonly<Record<FacilityComponentCapability, readonly FacilityComponent['type'][]>> = {
  BASKETBALL_FULL_COURT: ['MAIN_COURT', 'SECONDARY_COURT'],
  BASKETBALL_TRAINING: ['PRACTICE_COURT', 'SHOOTING_COURT', 'HALF_COURT', 'ACADEMY_COURT', 'OUTDOOR_COURT'],
  STRENGTH_TRAINING: ['STRENGTH_ROOM', 'WEIGHT_ROOM'],
  CARDIO_TRAINING: ['CARDIO_AREA', 'CONDITIONING_AREA'],
  HYDROTHERAPY: ['HYDROTHERAPY_POOL', 'HYDROTHERAPY'],
  CRYOTHERAPY: ['CRYOTHERAPY_ROOM', 'COLD_TUB'],
  PHYSIOTHERAPY: ['PHYSIO_ROOM', 'TREATMENT_ROOM', 'REHABILITATION_ROOM'],
  MEDICAL_EXAMINATION: ['EXAMINATION_ROOM', 'MEDICAL_CLINIC', 'MEDICAL_ROOM'],
  MEDICAL_IMAGING: ['IMAGING_ROOM', 'DIAGNOSTIC_ROOM'],
  VIDEO_ANALYSIS: ['FILM_ROOM'],
  PLAYER_DINING: ['DINING_AREA', 'DINING_HALL', 'KITCHEN', 'NUTRITION_AREA'],
  PLAYER_RESIDENTIAL: ['DORMITORY', 'DORMITORY_ROOM', 'PLAYER_ROOM'],
  PRESS_CONFERENCE: ['PRESS_CONFERENCE_ROOM', 'PRESS_ROOM'],
  LIVE_BROADCAST: ['BROADCAST_ROOM', 'TV_STUDIO'],
  HOSPITALITY: ['HOSPITALITY_LOUNGE', 'HOSPITALITY_AREA', 'VIP_LOUNGE', 'SPONSOR_LOUNGE', 'RESTAURANT', 'BAR', 'CAFE'],
  RETAIL: ['CLUB_STORE', 'RETAIL_UNIT', 'MERCHANDISE_STORE'],
}

const SERVICEABILITY_RANK: Readonly<Record<FacilityServiceability, number>> = {
  FULL: 3,
  LIMITED: 2,
  SEVERELY_LIMITED: 1,
  OUT_OF_SERVICE: 0,
}

function betterServiceability(a: FacilityServiceability, b: FacilityServiceability): FacilityServiceability {
  return SERVICEABILITY_RANK[a] >= SERVICEABILITY_RANK[b] ? a : b
}

/**
 * Every active component the Team has a CFI2 usage right to reach, regardless of CFI4
 * serviceability — an OUT_OF_SERVICE component the Team has rights to remains "accessible" here so
 * its degraded state can be explained (§40), rather than silently disappearing as if the Team never
 * had access to it in the first place. Serviceability is layered on afterwards, per component, by
 * the capability/court resolvers below — never pre-filtered away like CFI4's own
 * `availableComponentsForTeamAt` (which is the right tool for a caller that only wants usable
 * components, not this context's explainability requirement).
 */
function accessibleComponentsForTeam(world: GameWorld, teamId: TeamId, onDate: GameDate): readonly FacilityComponent[] {
  const accessibleIds = new Set(usableComponentsForTeamAt(Object.values(world.facilityUsageRightsById), Object.values(world.facilityComponentsById), teamId, onDate))
  return Object.values(world.facilityComponentsById).filter((component) => accessibleIds.has(component.id))
}

function hasAnyUsageRight(world: GameWorld, teamId: TeamId, onDate: GameDate): boolean {
  return usageRightsForTeamAt(Object.values(world.facilityUsageRightsById), teamId, onDate).length > 0
}

function resolveCapabilityStatus(world: GameWorld, teamId: TeamId, onDate: GameDate, capability: FacilityComponentCapability, accessible: readonly FacilityComponent[]): SportingCapabilityStatus {
  const candidateTypes = COMPONENT_TYPES_FOR_CAPABILITY[capability]
  const accessibleCandidates = accessible.filter((component) => candidateTypes.includes(component.type))

  if (accessibleCandidates.length === 0) {
    // Distinguish "no such component exists anywhere the Team could reach" (NO_COMPONENT) from
    // "such a component exists in the world, but this Team has no access right to it" (NO_ACCESS).
    const existsAnywhereForTeamsFacilities = Object.values(world.facilityComponentsById).some((component) => candidateTypes.includes(component.type) && component.status === 'ACTIVE')
    const teamHasAnyRightAtAll = hasAnyUsageRight(world, teamId, onDate)
    const reason: SportingFacilityConstraintReason = existsAnywhereForTeamsFacilities && teamHasAnyRightAtAll ? 'NO_ACCESS' : 'NO_COMPONENT'
    return { capability, status: 'UNAVAILABLE', reason, sourceComponentId: null, serviceability: null, technicalStandard: null }
  }

  let best: { component: FacilityComponent; serviceability: FacilityServiceability; technicalStandard: FacilityTechnicalStandard | null } | null = null
  for (const component of accessibleCandidates) {
    if (capability === 'BASKETBALL_FULL_COURT' && component.specification !== null && component.specification.kind === 'COURT' && !component.specification.isFullCourt) continue
    const record = componentConditionAt(Object.values(world.facilityComponentConditionRecordsById), component.id, onDate)
    const serviceability = record?.serviceability ?? 'FULL'
    if (best === null || SERVICEABILITY_RANK[serviceability] > SERVICEABILITY_RANK[best.serviceability]) {
      best = { component, serviceability, technicalStandard: record?.technicalStandard ?? null }
    }
  }

  if (best === null) {
    return { capability, status: 'UNAVAILABLE', reason: 'NO_COMPONENT', sourceComponentId: null, serviceability: null, technicalStandard: null }
  }
  if (best.serviceability === 'OUT_OF_SERVICE') {
    return { capability, status: 'UNAVAILABLE', reason: 'OUT_OF_SERVICE', sourceComponentId: best.component.id, serviceability: best.serviceability, technicalStandard: best.technicalStandard }
  }
  if (best.serviceability !== 'FULL') {
    return { capability, status: 'LIMITED', reason: 'LIMITED_SERVICE', sourceComponentId: best.component.id, serviceability: best.serviceability, technicalStandard: best.technicalStandard }
  }
  return { capability, status: 'AVAILABLE', reason: null, sourceComponentId: best.component.id, serviceability: best.serviceability, technicalStandard: best.technicalStandard }
}

function capabilityStatuses(world: GameWorld, teamId: TeamId, onDate: GameDate, capabilities: readonly FacilityComponentCapability[], accessible: readonly FacilityComponent[]): readonly SportingCapabilityStatus[] {
  return capabilities.map((capability) => resolveCapabilityStatus(world, teamId, onDate, capability, accessible))
}

function basketballContext(world: GameWorld, teamId: TeamId, onDate: GameDate, accessible: readonly FacilityComponent[]): BasketballFacilityContext {
  const courtTypes: readonly FacilityComponent['type'][] = ['MAIN_COURT', 'PRACTICE_COURT', 'SECONDARY_COURT', 'HALF_COURT', 'SHOOTING_COURT', 'ACADEMY_COURT', 'OUTDOOR_COURT']
  const courtComponents = accessible.filter((component) => courtTypes.includes(component.type))
  const courts: SportingCourtStatus[] = courtComponents
    .map((component) => {
      const record = componentConditionAt(Object.values(world.facilityComponentConditionRecordsById), component.id, onDate)
      const spec = component.specification !== null && component.specification.kind === 'COURT' ? component.specification : null
      return {
        componentId: component.id,
        type: component.type,
        isFullCourt: spec?.isFullCourt ?? null,
        isIndoor: spec?.isIndoor ?? null,
        serviceability: record?.serviceability ?? 'FULL',
        technicalStandard: record?.technicalStandard ?? null,
        hasVideoTrackingTechnology: spec?.hasVideoTrackingTechnology ?? null,
      }
    })
    .sort((a, b) => a.componentId.localeCompare(b.componentId))

  const usablePracticeCourtCount = courts.filter((court) => court.serviceability !== 'OUT_OF_SERVICE').length

  return {
    courts,
    usablePracticeCourtCount,
    capabilities: capabilityStatuses(world, teamId, onDate, BASKETBALL_CAPABILITIES, accessible),
  }
}

function constraintFactsFor(basketball: BasketballFacilityContext, strengthAndConditioning: TrainingFacilityContext, medical: MedicalFacilityContext, rehabilitation: RehabilitationFacilityContext, recovery: RecoveryFacilityContext): readonly SportingFacilityConstraintFact[] {
  const facts = new Set<SportingFacilityConstraintFact>()
  if (basketball.usablePracticeCourtCount === 0 && basketball.courts.length > 0) facts.add('KEY_PRACTICE_COURT_UNAVAILABLE')
  if (basketball.usablePracticeCourtCount === 0 && strengthAndConditioning.capabilities.every((c) => c.status === 'UNAVAILABLE')) facts.add('TRAINING_CAPACITY_INSUFFICIENT')
  if (medical.capabilities.some((c) => c.status === 'UNAVAILABLE')) facts.add('MEDICAL_CAPABILITY_UNAVAILABLE')
  if (rehabilitation.capabilities.some((c) => c.status === 'LIMITED')) facts.add('REHABILITATION_CAPACITY_LIMITED')
  if (recovery.capabilities.some((c) => c.status === 'LIMITED' || c.status === 'UNAVAILABLE')) facts.add('RECOVERY_INFRASTRUCTURE_LIMITED')
  return Object.freeze([...facts].sort())
}

/**
 * The single composition root: builds the full derived sporting-infrastructure picture for one
 * Team at one date. Pure, deterministic, side-effect-free — never mutates or reads beyond
 * `world.facilityUsageRightsById` / `facilityComponentsById` / `facilityComponentConditionRecordsById`.
 */
export function sportingFacilityContextForTeamAt(world: GameWorld, teamId: TeamId, onDateInput: GameDate | string): TeamSportingFacilityContext {
  const onDate = parseGameDate(onDateInput)
  const accessible = accessibleComponentsForTeam(world, teamId, onDate)

  const basketball = basketballContext(world, teamId, onDate, accessible)
  const strengthAndConditioning: TrainingFacilityContext = { capabilities: capabilityStatuses(world, teamId, onDate, TRAINING_CAPABILITIES, accessible) }
  const performance: PerformanceFacilityContext = { capabilities: capabilityStatuses(world, teamId, onDate, PERFORMANCE_CAPABILITIES, accessible) }
  const medical: MedicalFacilityContext = { capabilities: capabilityStatuses(world, teamId, onDate, MEDICAL_CAPABILITIES, accessible) }
  const rehabilitation: RehabilitationFacilityContext = { capabilities: capabilityStatuses(world, teamId, onDate, REHABILITATION_CAPABILITIES, accessible) }
  const recovery: RecoveryFacilityContext = { capabilities: capabilityStatuses(world, teamId, onDate, RECOVERY_CAPABILITIES, accessible) }
  const analysis: AnalysisFacilityContext = { capabilities: capabilityStatuses(world, teamId, onDate, ANALYSIS_CAPABILITIES, accessible) }
  const support: SupportFacilityContext = { capabilities: capabilityStatuses(world, teamId, onDate, SUPPORT_CAPABILITIES, accessible) }

  return Object.freeze({
    teamId,
    date: onDate,
    basketball,
    strengthAndConditioning,
    performance,
    medical,
    rehabilitation,
    recovery,
    analysis,
    support,
    constraints: constraintFactsFor(basketball, strengthAndConditioning, medical, rehabilitation, recovery),
  })
}

/** Convenience: every capability currently AVAILABLE or LIMITED (i.e. not UNAVAILABLE) across every sub-context, deduplicated. */
export function availableSportingCapabilitiesForTeamAt(world: GameWorld, teamId: TeamId, onDate: GameDate | string): readonly FacilityComponentCapability[] {
  const context = sportingFacilityContextForTeamAt(world, teamId, onDate)
  const all = [
    ...context.basketball.capabilities,
    ...context.strengthAndConditioning.capabilities,
    ...context.performance.capabilities,
    ...context.medical.capabilities,
    ...context.rehabilitation.capabilities,
    ...context.recovery.capabilities,
    ...context.analysis.capabilities,
    ...context.support.capabilities,
  ]
  const available = new Set(all.filter((c) => c.status !== 'UNAVAILABLE').map((c) => c.capability))
  return Object.freeze([...available].sort())
}

/** Convenience: the plain-data constraint facts for a Team at a date (RPG/event seam only — never a complaint or narrative). */
export function sportingFacilityConstraintsForTeamAt(world: GameWorld, teamId: TeamId, onDate: GameDate | string): readonly SportingFacilityConstraintFact[] {
  return sportingFacilityContextForTeamAt(world, teamId, onDate).constraints
}

export function basketballFacilityContextForTeamAt(world: GameWorld, teamId: TeamId, onDate: GameDate | string): BasketballFacilityContext {
  return sportingFacilityContextForTeamAt(world, teamId, onDate).basketball
}

export function trainingFacilityContextForTeamAt(world: GameWorld, teamId: TeamId, onDate: GameDate | string): TrainingFacilityContext {
  return sportingFacilityContextForTeamAt(world, teamId, onDate).strengthAndConditioning
}

export function performanceFacilityContextForTeamAt(world: GameWorld, teamId: TeamId, onDate: GameDate | string): PerformanceFacilityContext {
  return sportingFacilityContextForTeamAt(world, teamId, onDate).performance
}

export function medicalFacilityContextForTeamAt(world: GameWorld, teamId: TeamId, onDate: GameDate | string): MedicalFacilityContext {
  return sportingFacilityContextForTeamAt(world, teamId, onDate).medical
}

export function rehabilitationFacilityContextForTeamAt(world: GameWorld, teamId: TeamId, onDate: GameDate | string): RehabilitationFacilityContext {
  return sportingFacilityContextForTeamAt(world, teamId, onDate).rehabilitation
}

export function recoveryFacilityContextForTeamAt(world: GameWorld, teamId: TeamId, onDate: GameDate | string): RecoveryFacilityContext {
  return sportingFacilityContextForTeamAt(world, teamId, onDate).recovery
}

// Re-exported so callers of this module never need to reach into `@/domain/facilities` themselves
// just to name a capability or read `facilityHasCapability`/`componentCategory` for explainability.
export { componentCategory, facilityHasCapability, usableCapabilitiesOfFacilityAt }
