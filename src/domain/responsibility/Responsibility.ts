import type { GameDate } from '@/domain/date'
import { parseGameDate } from '@/domain/date'
import type { StaffPersonId, TeamId } from '@/domain/ids'
import type { Personality } from '@/domain/personality'
import type { RelationshipProfile } from '@/domain/relationships'
import type { StaffPerson } from '@/domain/staff'
import { staffRoleDefinition, type StaffRoleId } from '@/domain/staff'
import { requireNonEmptyString } from '@/domain/validation'

declare const responsibilityIdBrand: unique symbol
type ResponsibilityBrandedId<Kind extends string> = string & { readonly [responsibilityIdBrand]: Kind }
export type ResponsibilityId = ResponsibilityBrandedId<'ResponsibilityId'>
export type DelegationOutcomeId = ResponsibilityBrandedId<'DelegationOutcomeId'>

export const responsibilityIdFromString = (value: string): ResponsibilityId => brandedId(value, 'Responsibility ID')
export const delegationOutcomeIdFromString = (value: string): DelegationOutcomeId => brandedId(value, 'Delegation outcome ID')

/** Deterministic, stable id for one (team, responsibility kind) row — never randomly generated. */
export function responsibilityIdForTeam(teamId: TeamId, kind: ResponsibilityKind): ResponsibilityId {
  return responsibilityIdFromString(`responsibility:${teamId}:${kind}`)
}

export const RESPONSIBILITY_DOMAINS = ['training', 'tactics', 'scouting', 'roster', 'recruiting', 'medical'] as const
export type ResponsibilityDomain = typeof RESPONSIBILITY_DOMAINS[number]

export const RESPONSIBILITY_KINDS = [
  // training
  'createTeamTrainingPlan', 'assignIndividualDevelopment', 'manageRecovery', 'determineIntensity', 'recommendWorkloadChange',
  // tactics
  'oppositionScouting', 'defensiveGamePlan', 'offensivePreparation', 'rotationPlanning', 'matchupRecommendation',
  // scouting
  'assignScouts', 'prioritizeRegions', 'oppositionReport', 'prospectReport',
  // roster / personnel
  'recommendSignings', 'shortlistPlayers', 'contractRecommendation', 'tradeRecommendation',
  // recruiting
  'prospectIdentification', 'recruitEvaluation', 'recruitingPriorities',
  // medical
  'treatmentRecommendation', 'returnToPlayRecommendation', 'riskAssessment',
] as const
export type ResponsibilityKind = typeof RESPONSIBILITY_KINDS[number]

export const RESPONSIBILITY_MODES = ['userControlled', 'delegated', 'advisory', 'organizational'] as const
export type ResponsibilityMode = typeof RESPONSIBILITY_MODES[number]

export type ResponsibilityParticipant = 'staff' | 'coach'

export interface ResponsibilityDefinition {
  readonly kind: ResponsibilityKind
  readonly domain: ResponsibilityDomain
  /** Which StaffRoleId values (from `@/domain/staff`) may hold this responsibility. Empty when `eligibleParticipant` is `'coach'`. */
  readonly eligibleRoleIds: readonly StaffRoleId[]
  /** `'coach'`-eligible responsibilities (e.g. final rotation call) route to the Head Coach, never a `TeamStaffAssignment`. */
  readonly eligibleParticipant: ResponsibilityParticipant
  readonly defaultMode: ResponsibilityMode
  readonly supportedModes: readonly ResponsibilityMode[]
  /** Workload units consumed while held. See `calculateStaffWorkload`. */
  readonly capacityCost: number
}

function def(kind: ResponsibilityKind, domain: ResponsibilityDomain, eligibleRoleIds: readonly StaffRoleId[], capacityCost: number, supportedModes: readonly ResponsibilityMode[] = ['userControlled', 'delegated', 'advisory', 'organizational']): ResponsibilityDefinition {
  return { kind, domain, eligibleRoleIds, eligibleParticipant: 'staff', defaultMode: 'userControlled', supportedModes, capacityCost }
}

export const RESPONSIBILITY_REGISTRY: Readonly<Record<ResponsibilityKind, ResponsibilityDefinition>> = {
  createTeamTrainingPlan: def('createTeamTrainingPlan', 'training', ['assistantCoach', 'associateCoach', 'playerDevelopmentCoach', 'performanceCoach'], 2),
  assignIndividualDevelopment: def('assignIndividualDevelopment', 'training', ['playerDevelopmentCoach', 'assistantCoach', 'shootingCoach', 'skillsCoach', 'bigManCoach', 'developmentSpecialist'], 2),
  manageRecovery: def('manageRecovery', 'training', ['physiotherapist', 'rehabilitationSpecialist', 'teamDoctor', 'sportsScientist'], 2),
  determineIntensity: def('determineIntensity', 'training', ['strengthConditioningCoach', 'performanceCoach', 'loadManagementSpecialist'], 1),
  recommendWorkloadChange: def('recommendWorkloadChange', 'training', ['strengthConditioningCoach', 'performanceCoach', 'loadManagementSpecialist', 'sportsScientist'], 1, ['userControlled', 'advisory', 'organizational']),

  oppositionScouting: def('oppositionScouting', 'tactics', ['advanceScout', 'headScout', 'assistantCoach', 'offensiveSpecialist', 'defensiveSpecialist'], 2, ['userControlled', 'advisory', 'organizational']),
  defensiveGamePlan: def('defensiveGamePlan', 'tactics', ['defensiveSpecialist', 'associateCoach', 'assistantCoach'], 2),
  offensivePreparation: def('offensivePreparation', 'tactics', ['offensiveSpecialist', 'associateCoach', 'assistantCoach'], 2),
  rotationPlanning: { ...def('rotationPlanning', 'tactics', [], 1, ['userControlled']), eligibleParticipant: 'coach' },
  matchupRecommendation: def('matchupRecommendation', 'tactics', ['advanceScout', 'assistantCoach'], 1, ['userControlled', 'advisory', 'organizational']),

  assignScouts: def('assignScouts', 'scouting', ['headScout', 'regionalScout'], 2),
  prioritizeRegions: def('prioritizeRegions', 'scouting', ['headScout', 'regionalScout'], 1),
  oppositionReport: def('oppositionReport', 'scouting', ['advanceScout', 'regionalScout', 'proScout'], 2, ['userControlled', 'advisory', 'organizational']),
  prospectReport: def('prospectReport', 'scouting', ['regionalScout', 'collegeScout', 'internationalScout', 'proScout'], 2, ['userControlled', 'advisory', 'organizational']),

  recommendSignings: def('recommendSignings', 'roster', ['generalManager', 'assistantGeneralManager', 'directorOfBasketballOperations', 'sportingDirector'], 2, ['userControlled', 'advisory', 'organizational']),
  shortlistPlayers: def('shortlistPlayers', 'roster', ['generalManager', 'assistantGeneralManager', 'analyticsStaff'], 1, ['userControlled', 'advisory', 'organizational']),
  contractRecommendation: def('contractRecommendation', 'roster', ['capContractsSpecialist', 'generalManager', 'assistantGeneralManager'], 2, ['userControlled', 'advisory', 'organizational']),
  tradeRecommendation: def('tradeRecommendation', 'roster', ['generalManager', 'assistantGeneralManager', 'sportingDirector'], 2, ['userControlled', 'advisory', 'organizational']),

  prospectIdentification: def('prospectIdentification', 'recruiting', ['recruitingCoordinator', 'positionalRecruiter'], 2, ['userControlled', 'advisory', 'organizational']),
  recruitEvaluation: def('recruitEvaluation', 'recruiting', ['recruitingCoordinator', 'positionalRecruiter', 'collegeScout'], 2, ['userControlled', 'advisory', 'organizational']),
  recruitingPriorities: def('recruitingPriorities', 'recruiting', ['recruitingCoordinator'], 1, ['userControlled', 'advisory', 'organizational']),

  treatmentRecommendation: def('treatmentRecommendation', 'medical', ['teamDoctor', 'physiotherapist', 'rehabilitationSpecialist'], 2, ['userControlled', 'advisory', 'organizational']),
  returnToPlayRecommendation: def('returnToPlayRecommendation', 'medical', ['teamDoctor', 'physiotherapist'], 2, ['userControlled', 'advisory', 'organizational']),
  riskAssessment: def('riskAssessment', 'medical', ['teamDoctor', 'sportsScientist', 'physiotherapist'], 1, ['userControlled', 'advisory', 'organizational']),
}

export interface Responsibility {
  readonly id: ResponsibilityId
  readonly teamId: TeamId
  readonly kind: ResponsibilityKind
  readonly mode: ResponsibilityMode
  readonly holderStaffId?: StaffPersonId
  readonly assignedOn?: GameDate
}

export function responsibilityDefinition(kind: ResponsibilityKind): ResponsibilityDefinition {
  const definition = RESPONSIBILITY_REGISTRY[kind]
  if (definition === undefined) throw new RangeError(`Unknown Responsibility kind: ${kind}`)
  return definition
}

/** Structural validation only — eligibility against a concrete StaffPerson's role is checked by `validateResponsibilityAssignment`. */
export function createResponsibility(input: Responsibility): Responsibility {
  const definition = responsibilityDefinition(input.kind)
  if (!definition.supportedModes.includes(input.mode)) throw new RangeError(`Responsibility ${input.kind} does not support mode ${input.mode}`)
  if (input.holderStaffId !== undefined && (input.mode === 'userControlled' || input.mode === 'organizational')) throw new RangeError(`Responsibility mode ${input.mode} must not have a holder`)
  if (definition.eligibleParticipant === 'coach' && input.holderStaffId !== undefined) throw new RangeError(`Responsibility ${input.kind} is Head Coach-only and cannot hold a Staff member`)
  return {
    id: responsibilityIdFromString(input.id),
    teamId: requireNonEmptyString(input.teamId, 'Responsibility team') as TeamId,
    kind: input.kind,
    mode: input.mode,
    ...(input.holderStaffId === undefined ? {} : { holderStaffId: input.holderStaffId }),
    ...(input.assignedOn === undefined ? {} : { assignedOn: parseGameDate(input.assignedOn) }),
  }
}

export type ResponsibilityAssignmentFailureReason = 'unknownKind' | 'unsupportedMode' | 'ineligibleRole' | 'headCoachOnly' | 'missingHolderForMode'
export interface ResponsibilityAssignmentResult { readonly ok: boolean; readonly reason?: ResponsibilityAssignmentFailureReason }

/**
 * Domain-level eligibility check for assigning `staff` as the holder of `kind` in `mode`.
 * Must be called wherever a Responsibility assignment is created or changed — a staff member
 * who does not satisfy a responsibility's role restrictions must never be assigned silently.
 */
export function validateResponsibilityAssignment(kind: ResponsibilityKind, mode: ResponsibilityMode, staffRoleId: StaffRoleId | undefined, staff: StaffPerson | undefined): ResponsibilityAssignmentResult {
  const definition = RESPONSIBILITY_REGISTRY[kind]
  if (definition === undefined) return { ok: false, reason: 'unknownKind' }
  if (!definition.supportedModes.includes(mode)) return { ok: false, reason: 'unsupportedMode' }
  if (definition.eligibleParticipant === 'coach') return staffRoleId === undefined && staff === undefined ? { ok: true } : { ok: false, reason: 'headCoachOnly' }
  if (mode === 'userControlled' || mode === 'organizational') return staffRoleId === undefined ? { ok: true } : { ok: false, reason: 'missingHolderForMode' }
  if (staffRoleId === undefined || staff === undefined) return { ok: false, reason: 'missingHolderForMode' }
  if (!definition.eligibleRoleIds.includes(staffRoleId)) return { ok: false, reason: 'ineligibleRole' }
  staffRoleDefinition(staffRoleId) // throws if roleId itself is unknown
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Delegation foundation
// ---------------------------------------------------------------------------

/**
 * Explicit user decision on an `advisory` `DelegationOutcome` (Wave 4C3 — Advisory Center).
 * Deliberately just two states: `undefined` (no user decision yet) covers everything else,
 * including historical/automatic/delegated outcomes that were never surfaced for a user decision
 * at all — `applied: true` must never be read as "user accepted" on its own (see
 * `userDecidedOn`/`userDisposition` invariants below).
 */
export type DelegationOutcomeUserDisposition = 'accepted' | 'dismissed'

export interface DelegationOutcome {
  readonly id: DelegationOutcomeId
  readonly responsibilityId: ResponsibilityId
  readonly staffId: StaffPersonId
  readonly decidedOn: GameDate
  readonly kind: ResponsibilityKind
  /** false for 'advisory' outcomes awaiting a user decision. */
  readonly applied: boolean
  /** 0-100, deterministic function of staff attributes/personality/context — never the "correct" answer. */
  readonly qualityScore: number
  readonly payload: Readonly<Record<string, string | number | boolean>>
  readonly rationale?: string
  /**
   * Set only by the Wave 4C3 Advisory Center application façade, never by an engine's own
   * automatic/delegated outcome recording. Optional and additive — a `DelegationOutcome` with
   * neither field is exactly as valid as one that predates Wave 4C3 (Save backward compatibility).
   */
  readonly userDisposition?: DelegationOutcomeUserDisposition
  readonly userDecidedOn?: GameDate
}

export function createDelegationOutcome(input: DelegationOutcome): DelegationOutcome {
  if (!Number.isInteger(input.qualityScore) || input.qualityScore < 0 || input.qualityScore > 100) throw new RangeError('Delegation outcome quality score must be an integer from 0 to 100')
  // Bidirectional: userDisposition and userDecidedOn must be set together, or both absent (legacy/unresolved) — never just one.
  if (input.userDisposition !== undefined && input.userDecidedOn === undefined) throw new RangeError('Delegation outcome userDisposition requires userDecidedOn')
  if (input.userDisposition === undefined && input.userDecidedOn !== undefined) throw new RangeError('Delegation outcome userDecidedOn requires userDisposition')
  if (input.userDisposition !== undefined && input.userDisposition !== 'accepted' && input.userDisposition !== 'dismissed') throw new RangeError(`Delegation outcome userDisposition must be 'accepted' or 'dismissed', got: ${String(input.userDisposition)}`)
  if (input.userDisposition === 'accepted' && !input.applied) throw new RangeError('Delegation outcome accepted by the user must be applied')
  if (input.userDisposition === 'dismissed' && input.applied) throw new RangeError('Delegation outcome dismissed by the user must not be applied')
  return {
    id: delegationOutcomeIdFromString(input.id),
    responsibilityId: responsibilityIdFromString(input.responsibilityId),
    staffId: requireNonEmptyString(input.staffId, 'Delegation outcome staff') as StaffPersonId,
    decidedOn: parseGameDate(input.decidedOn),
    kind: input.kind,
    applied: input.applied,
    qualityScore: input.qualityScore,
    payload: { ...input.payload },
    ...(input.rationale === undefined ? {} : { rationale: input.rationale }),
    ...(input.userDisposition === undefined ? {} : { userDisposition: input.userDisposition }),
    ...(input.userDecidedOn === undefined ? {} : { userDecidedOn: parseGameDate(input.userDecidedOn) }),
  }
}

// ---------------------------------------------------------------------------
// Decision quality foundation
// ---------------------------------------------------------------------------

export interface StaffWorkloadSnapshot {
  readonly staffId: StaffPersonId
  readonly totalCapacityUsed: number
  readonly capacityLimit: number
  readonly utilization: number
  readonly overloaded: boolean
}

export interface DecisionQualityContext {
  readonly staff: StaffPerson
  readonly roleId: StaffRoleId
  readonly personality: Personality
  readonly relationshipToCoach?: RelationshipProfile
  readonly workload: StaffWorkloadSnapshot
}

/** One `DecisionQualityFn` per `ResponsibilityDomain`, never a monolithic switch. Must be pure/deterministic — no direct RNG access outside an injected seeded stream, no unseeded randomness. */
export type DecisionQualityFn = (context: DecisionQualityContext, seed: string) => number

function brandedId<Kind extends string>(value: string, name: string): ResponsibilityBrandedId<Kind> {
  return requireNonEmptyString(value, name) as ResponsibilityBrandedId<Kind>
}
