import type { GameDate } from '@/domain/date'
import type { StaffPersonId, TeamId } from '@/domain/ids'
import { getRelationshipDimensions } from '@/domain/relationships'
import { staffRoleDefinition, type StaffRoleId, type StaffRoleSeniority } from '@/domain/staff'
import {
  clampCultureValue,
  createStaffCultureState,
  neutralCultureValues,
  STAFF_CULTURE_DIMENSIONS,
  type StaffCultureDimension,
  type StaffCultureState,
  type StaffCultureValues,
} from '@/domain/staffCulture'
import { classifyWorkloadBand, type StaffHumanState } from '@/domain/staffHumanState'
import {
  calculateStaffWorkload,
  getTeamResponsibilities,
  getTeamStaffAssignments,
  type GameWorld,
} from '@/domain/world'
import { hasCanonicalAcceptanceSeam } from '@/domain/responsibility'

/**
 * Wave 5C — Organizational Culture derivation.
 *
 * Every dimension is derived from REAL, already-canonical world signals (Personality, professional
 * attributes, Role seniority, Responsibilities distribution/mode, DelegationOutcome acceptance,
 * Relationship facets, Workload bands, employment tenure). No randomness anywhere — Culture is
 * fully signal-derived and deterministic for a given world. Unknown/missing data always degrades to
 * a neutral prior — this module never invents Organization data that does not exist.
 *
 * Aggregation is ALWAYS leadership-weighted: a director's disposition shapes the organization far
 * more than a junior's. A naive unweighted mean is never used.
 */

/** Leadership influence weight by role seniority — the single authority for "whose disposition shapes the culture". */
export function seniorityWeight(seniority: StaffRoleSeniority): number {
  switch (seniority) {
    case 'director': return 4
    case 'senior': return 2.5
    case 'standard': return 1.5
    case 'junior': return 1
    default: return 1
  }
}

interface CultureContributor {
  readonly staffId: StaffPersonId
  readonly role: StaffRoleId
  readonly weight: number
  readonly personality: Readonly<Record<string, number>>
  readonly attributes: Readonly<Record<string, number>>
  readonly analyticsWeight: number
  /** Whole months of continuous employment on this Team as of `world.currentDate`. */
  readonly tenureMonths: number
  /** Workload utilization band for this Staff person right now. */
  readonly workloadBand: ReturnType<typeof classifyWorkloadBand>
}

function blend(...values: readonly number[]): number {
  if (values.length === 0) return 50
  return values.reduce((sum, value) => sum + value, 0) / values.length
}
function invert(value: number): number { return 100 - value }

function monthsBetween(fromDate: string, toDate: string): number {
  const [fromYear, fromMonth] = fromDate.split('-').map(Number)
  const [toYear, toMonth] = toDate.split('-').map(Number)
  return Math.max(0, (toYear! - fromYear!) * 12 + (toMonth! - fromMonth!))
}

function collectContributors(world: GameWorld, teamId: TeamId): readonly CultureContributor[] {
  const contributors: CultureContributor[] = []
  for (const assignment of getTeamStaffAssignments(world, teamId)) {
    const person = world.staffPeopleById[assignment.staffPersonId]
    if (person === undefined) continue
    if (world.staffEmploymentByStaffId[assignment.staffPersonId] !== undefined && world.staffEmploymentByStaffId[assignment.staffPersonId]!.status !== 'employed') continue
    const definition = staffRoleDefinition(assignment.role)
    const employment = world.staffEmploymentByStaffId[assignment.staffPersonId]
    const startedOn = employment?.status === 'employed' ? employment.startedOn : undefined
    contributors.push({
      staffId: assignment.staffPersonId,
      role: assignment.role,
      weight: seniorityWeight(definition.seniority),
      personality: world.personalitiesByPersonId[assignment.staffPersonId]?.values ?? {},
      attributes: person.professional.attributes,
      analyticsWeight: definition.attributeWeights.analysis ?? 0,
      tenureMonths: startedOn === undefined ? 0 : monthsBetween(startedOn, world.currentDate),
      workloadBand: classifyWorkloadBand(calculateStaffWorkload(world, assignment.staffPersonId).utilization),
    })
  }
  return contributors
}

/** Leadership-weighted mean of a per-contributor reading. Empty input degrades to neutral 50, never NaN. */
function weightedMean(contributors: readonly CultureContributor[], read: (contributor: CultureContributor) => number): number {
  let weighted = 0
  let totalWeight = 0
  for (const contributor of contributors) {
    const value = read(contributor)
    if (!Number.isFinite(value)) continue
    weighted += value * contributor.weight
    totalWeight += contributor.weight
  }
  return totalWeight === 0 ? 50 : weighted / totalWeight
}

/** Personality read with the canonical neutral-50 default for a person with no Personality profile. */
function personality(contributor: CultureContributor, dimension: string): number {
  return contributor.personality[dimension] ?? 50
}

/**
 * Relationship-derived organizational readings among the unit's OWN members only. Iterates the
 * sparse `relationshipsByKey` store directly — never materializes an n² Staff×Staff matrix.
 * Returns a 0-100 rescaled reading; no data at all yields neutral 50.
 */
function relationshipFacetAverage(world: GameWorld, staffIds: readonly StaffPersonId[], facet: 'trust' | 'communicationQuality' | 'collaboration' | 'professionalAlignment'): number {
  if (staffIds.length < 2) return 50
  const members = new Set<string>(staffIds)
  let total = 0
  let count = 0
  for (const profile of Object.values(world.relationshipsByKey)) {
    if (!members.has(profile.sourceId) || !members.has(profile.targetId)) continue
    total += (getRelationshipDimensions(profile)[facet] + 100) / 2
    count += 1
  }
  return count === 0 ? 50 : total / count
}

/** Explicit user dispositions are the sole professional-voice signal; automatic or unresolved outcomes are neutral. */
function delegationAcceptanceRate(world: GameWorld, staffIds: readonly StaffPersonId[]): { readonly rate: number; readonly hasData: boolean } {
  const members = new Set<string>(staffIds)
  let accepted = 0
  let total = 0
  for (const outcome of Object.values(world.delegationOutcomesById)) {
    if (!members.has(outcome.staffId)) continue
    if (outcome.userDisposition === 'accepted') {
      total += 1
      accepted += 1
    } else if (outcome.userDisposition === 'dismissed' && hasCanonicalAcceptanceSeam(outcome.kind)) {
      total += 1
    }
  }
  return total === 0 ? { rate: 0.5, hasData: false } : { rate: accepted / total, hasData: true }
}

interface ResponsibilityDistribution {
  readonly delegatedShare: number
  readonly advisoryShare: number
  readonly userControlledShare: number
  readonly organizationalShare: number
  readonly hasData: boolean
}

/** How this Team's held Responsibilities are actually distributed across the 4 canonical modes — the real "distribution of authority" signal. */
function responsibilityDistribution(world: GameWorld, teamId: TeamId): ResponsibilityDistribution {
  const responsibilities = getTeamResponsibilities(world, teamId)
  if (responsibilities.length === 0) return { delegatedShare: 0.5, advisoryShare: 0.5, userControlledShare: 0.5, organizationalShare: 0.5, hasData: false }
  const share = (mode: 'delegated' | 'advisory' | 'userControlled' | 'organizational') => responsibilities.filter((item) => item.mode === mode).length / responsibilities.length
  return { delegatedShare: share('delegated'), advisoryShare: share('advisory'), userControlledShare: share('userControlled'), organizationalShare: share('organizational'), hasData: true }
}

/**
 * Derives the organization's culture TARGET from real signals.
 *
 * `scopeKey` is opaque to callers. For this wave it resolves 1:1 to a `TeamId` (Team-as-Organization
 * proxy — see `@/domain/staffCulture`); a future canonical Organization id only changes this one
 * resolution line.
 */
export function deriveStaffCultureTarget(world: GameWorld, scopeKey: string): StaffCultureValues {
  const teamId = scopeKey as TeamId
  const contributors = collectContributors(world, teamId)
  if (contributors.length === 0) return neutralCultureValues()

  const staffIds = contributors.map((contributor) => contributor.staffId)
  const trustAverage = relationshipFacetAverage(world, staffIds, 'trust')
  const communicationAverage = relationshipFacetAverage(world, staffIds, 'communicationQuality')
  const collaborationAverage = relationshipFacetAverage(world, staffIds, 'collaboration')
  const alignmentAverage = relationshipFacetAverage(world, staffIds, 'professionalAlignment')
  const acceptance = delegationAcceptanceRate(world, staffIds)
  const responsibilities = responsibilityDistribution(world, teamId)
  const seniorityShare = contributors.filter((contributor) => contributor.weight >= 2.5).length / contributors.length
  const overloadedShare = contributors.filter((contributor) => contributor.workloadBand === 'OVERLOADED' || contributor.workloadBand === 'HEAVY').length / contributors.length
  const tenureScore = weightedMean(contributors, (contributor) => Math.min(100, contributor.tenureMonths * 2.5))
  const totalAnalyticsWeight = contributors.reduce((sum, contributor) => sum + contributor.analyticsWeight, 0)
  const analyticsRoleShare = totalAnalyticsWeight === 0 ? 0 : totalAnalyticsWeight / contributors.length

  const values: Record<StaffCultureDimension, number> = {
    // AUTONOMY: real distribution of professional decision authority — delegated share plus how
    // often the organization actually acts on the advisory/professional voice it receives.
    autonomy: blend(
      responsibilities.hasData ? 22 + responsibilities.delegatedShare * 65 + responsibilities.advisoryShare * 35 + responsibilities.organizationalShare * 28 - responsibilities.userControlledShare * 12 : 50,
      acceptance.hasData ? 30 + acceptance.rate * 55 : 50,
    ),
    // HIERARCHY: centralization of authority — director-heavy and user-controlled responsibility
    // mixes read as top-down, while delegated authority counterbalances them.
    hierarchy: blend(
      30 + seniorityShare * 50,
      responsibilities.hasData ? 38 + responsibilities.userControlledShare * 50 + responsibilities.advisoryShare * 22 + responsibilities.organizationalShare * 25 - responsibilities.delegatedShare * 18 : 50,
    ),
    // COLLABORATION: cooperative disposition, the lived Relationship collaboration facet, and
    // professional alignment (people who see eye-to-eye on the work collaborate more readily).
    collaboration: blend(
      weightedMean(contributors, (contributor) => personality(contributor, 'teamOrientation')),
      collaborationAverage,
      alignmentAverage,
    ),
    // ACCOUNTABILITY: professionalism/discipline, real responsibility ownership (someone actually
    // holds the outcome, rather than it sitting unassigned), and the trust the unit has actually earned.
    accountability: blend(
      weightedMean(contributors, (contributor) => blend(personality(contributor, 'professionalism'), contributor.attributes.discipline ?? 50)),
      responsibilities.hasData ? 40 + responsibilities.delegatedShare * 35 : 50,
      trustAverage,
    ),
    // COMMUNICATION OPENNESS: communication attributes, the lived communicationQuality facet, and
    // whether advisory professional voice actually gets acted on.
    communicationOpenness: blend(
      weightedMean(contributors, (contributor) => contributor.attributes.communication ?? 50),
      communicationAverage,
      acceptance.hasData ? 30 + acceptance.rate * 55 : 50,
    ),
    // INNOVATION: openness to new methods — adaptability plus an analytical professional profile.
    innovation: weightedMean(contributors, (contributor) => blend(personality(contributor, 'adaptability'), contributor.attributes.analysis ?? 50)),
    // ADAPTABILITY: Personality adaptability + the professional adaptability attribute directly.
    adaptability: weightedMean(contributors, (contributor) => blend(personality(contributor, 'adaptability'), contributor.attributes.adaptability ?? 50)),
    // DEVELOPMENT ORIENTATION: a REAL professional-attribute signal, never a Personality restatement.
    developmentOrientation: weightedMean(contributors, (contributor) => contributor.attributes.playerDevelopment ?? 50),
    // ANALYTICS ORIENTATION: analysis attributes plus how analytically-weighted the role mix is —
    // no giant role-id switch, just the existing registry weights.
    analyticsOrientation: blend(
      weightedMean(contributors, (contributor) => contributor.attributes.analysis ?? 50),
      40 + Math.min(1, analyticsRoleShare * 4) * 40,
    ),
    // PERFORMANCE INTENSITY: internal pressure for immediate results — competitiveness/ambition as
    // the primary signal, sustained workload pressure only as a limited secondary signal.
    performanceIntensity: blend(
      weightedMean(contributors, (contributor) => blend(personality(contributor, 'competitiveness'), personality(contributor, 'ambition'))),
      40 + overloadedShare * 30,
    ),
    // STABILITY: preference for continuity plus real continuity — long unbroken tenures make an
    // organization feel stable, whatever anyone's disposition says.
    stability: blend(
      weightedMean(contributors, (contributor) => blend(invert(personality(contributor, 'ambition')), personality(contributor, 'loyalty'))),
      tenureScore,
    ),
    // LONG TERM ORIENTATION: loyalty and stability read straightforwardly; ambition is interpreted
    // carefully (a loyal, low-ambition long-tenured staff projects forward; raw invert(ambition)
    // would be wrong, so ambition only softly discounts rather than dominating).
    longTermOrientation: blend(
      weightedMean(contributors, (contributor) => blend(personality(contributor, 'loyalty'), invert(personality(contributor, 'ambition')) * 0.5 + 25)),
      tenureScore,
    ),
    // DISCIPLINE: professionalism and the discipline attribute directly — rigor/structure/standards.
    discipline: weightedMean(contributors, (contributor) => blend(personality(contributor, 'professionalism'), contributor.attributes.discipline ?? 50)),
    // COMPETITIVENESS: competitive intensity — competitiveness and ambition.
    competitiveness: weightedMean(contributors, (contributor) => blend(personality(contributor, 'competitiveness'), personality(contributor, 'ambition'))),
  }

  const clamped: Record<StaffCultureDimension, number> = {} as never
  for (const dimension of STAFF_CULTURE_DIMENSIONS) clamped[dimension] = clampCultureValue(values[dimension])
  return clamped
}

export function initializeStaffCultureState(world: GameWorld, scopeKey: string): StaffCultureState {
  const target = deriveStaffCultureTarget(world, scopeKey)
  return createStaffCultureState({ scopeKey, target, current: target, establishedOn: world.currentDate, lastEvaluatedOn: world.currentDate })
}

/** Culture has real inertia: it moves 4% of the remaining distance toward its target per weekly tick. */
export const STAFF_CULTURE_INERTIA_RATE = 0.04

export function progressStaffCultureState(current: StaffCultureState, target: StaffCultureValues, evaluatedOn: GameDate): StaffCultureState {
  const next: Record<StaffCultureDimension, number> = {} as never
  for (const dimension of STAFF_CULTURE_DIMENSIONS) {
    const from = current.current[dimension]
    next[dimension] = clampCultureValue(from + (target[dimension] - from) * STAFF_CULTURE_INERTIA_RATE)
  }
  return createStaffCultureState({ scopeKey: current.scopeKey, target, current: next, establishedOn: current.establishedOn, lastEvaluatedOn: evaluatedOn })
}

// ---------------------------------------------------------------------------
// Individual culture preferences — PURE PROJECTION, never persisted
// ---------------------------------------------------------------------------

/**
 * What kind of organization would this specific Staff person prefer to work in?
 *
 * A read-only MAPPING of their existing Personality + professional attributes + Role + (where a
 * live employment context exists) their own Wave 5A Staff Expectations onto the same 14 culture
 * dimensions. It is deliberately NOT a second Personality block and is never stored anywhere — it
 * is recomputed on demand wherever Culture Fit is needed. No expectation state is duplicated: the
 * existing `StaffExpectationProfile.current` is read directly, never copied.
 */
export function deriveStaffCulturePreferences(world: GameWorld, staffId: StaffPersonId): StaffCultureValues {
  const person = world.staffPeopleById[staffId]
  const values = world.personalitiesByPersonId[staffId]?.values
  const p = (dimension: string): number => (values as Readonly<Record<string, number>> | undefined)?.[dimension] ?? 50
  const attributes = person?.professional.attributes as Readonly<Record<string, number>> | undefined
  const a = (key: string): number => attributes?.[key] ?? 50

  const assignment = Object.values(world.teamStaffAssignmentsById).find((item) => item.staffPersonId === staffId)
  const definition = assignment === undefined ? undefined : staffRoleDefinition(assignment.role)
  const leadershipPull = definition === undefined ? 0 : (seniorityWeight(definition.seniority) - 1) * 5
  const analyticalPull = ((definition?.attributeWeights.analysis ?? 0) - 0.15) * 60
  const developmentPull = ((definition?.attributeWeights.playerDevelopment ?? 0) - 0.1) * 60

  // Bounded correction from the person's OWN live Wave 5A Expectations, where a context exists.
  // Extremity-weighting alone ignores explicit expectations and role importance — this closes that
  // gap without duplicating any expectation state (read directly, never copied/persisted here).
  const context = Object.values(world.staffHumanContextsById).find((item) => item.staffId === staffId && item.endedOn === undefined)
  const expectations = context === undefined ? undefined : world.staffExpectationProfilesByContextId[context.id]?.current
  const e = (dimension: string): number | undefined => expectations?.[dimension as keyof typeof expectations]
  /** Small bounded pull toward an explicit expectation reading, away from the personality-only estimate. Never dominates. */
  const expectationPull = (dimension: string, weight = 0.35): number => {
    const reading = e(dimension)
    return reading === undefined ? 0 : (reading - 50) * weight
  }

  const preferences: Record<StaffCultureDimension, number> = {
    // No strong personality-only prior for how much authority a person wants: this is driven mainly
    // by their explicit autonomy/decisionAccess Expectations (where a live context exists) plus a
    // real role-seniority pull (a senior/director role legitimately expects more real authority).
    autonomy: 50 + expectationPull('autonomy') + expectationPull('decisionAccess', 0.2) + leadershipPull * 0.4,
    // A senior/director role prefers clear lines of authority; a junior specialist prefers flatter ones.
    hierarchy: blend(invert(p('teamOrientation')), 50) + leadershipPull - expectationPull('autonomy') * 0.5,
    collaboration: blend(p('teamOrientation'), a('communication')),
    accountability: blend(p('professionalism'), p('resilience')) + leadershipPull,
    communicationOpenness: blend(p('teamOrientation'), a('communication')) + expectationPull('informationAccess', 0.2),
    innovation: blend(p('adaptability'), a('analysis')) + analyticalPull,
    adaptability: blend(p('adaptability'), a('adaptability')),
    developmentOrientation: blend(a('playerDevelopment'), p('teamOrientation')) + developmentPull + expectationPull('development'),
    analyticsOrientation: blend(a('analysis'), 40) + analyticalPull,
    performanceIntensity: blend(p('competitiveness'), p('ambition')) + expectationPull('organizationalAmbition', 0.2),
    stability: blend(invert(p('ambition')), p('loyalty')),
    longTermOrientation: blend(p('loyalty'), invert(p('ambition')) * 0.5 + 25) + expectationPull('organizationalAmbition', -0.15),
    discipline: blend(p('professionalism'), a('discipline')),
    competitiveness: blend(p('competitiveness'), p('ambition')) + expectationPull('organizationalAmbition', 0.15),
  }

  const clamped: Record<StaffCultureDimension, number> = {} as never
  for (const dimension of STAFF_CULTURE_DIMENSIONS) clamped[dimension] = clampCultureValue(preferences[dimension])
  return clamped
}

export interface StaffCultureFit {
  readonly fitScore: number
  readonly perDimension: Readonly<Record<StaffCultureDimension, number>>
  /** Signed gap (culture minus preference) per dimension — positive means the lived culture reads HIGHER than the person prefers. Used for causal Human State pressure and UI cause phrases. */
  readonly signedGap: Readonly<Record<StaffCultureDimension, number>>
  /** This person's own preference per dimension — kept alongside the gap so causal pressure can be extremity-weighted (a person indifferent to a dimension is not pressured by its mismatch). */
  readonly preferences: Readonly<Record<StaffCultureDimension, number>>
}

/**
 * How well does this Staff person fit the organization they actually work in?
 *
 * Per dimension: the gap between their preference and the lived culture, weighted by how EXTREME
 * their own preference is (`|preference - 50| / 50`), further bounded-adjusted by explicit
 * Expectations/Role importance already folded into `deriveStaffCulturePreferences`. Extremity
 * weighting generalizes to every role with no extra data: a person who genuinely does not care
 * about a dimension (preference near neutral) is not made unhappy by it, while a person with a
 * strong conviction on a dimension feels every point of mismatch. A flat unweighted average is
 * deliberately NOT used.
 */
export function calculateStaffCultureFit(world: GameWorld, staffId: StaffPersonId, cultureState: StaffCultureState): StaffCultureFit {
  const preferences = deriveStaffCulturePreferences(world, staffId)
  const perDimension: Record<StaffCultureDimension, number> = {} as never
  const signedGap: Record<StaffCultureDimension, number> = {} as never
  let weightedGap = 0
  let totalWeight = 0

  for (const dimension of STAFF_CULTURE_DIMENSIONS) {
    const preference = preferences[dimension]
    const lived = cultureState.current[dimension]
    const gap = Math.abs(preference - lived)
    perDimension[dimension] = Math.round(gap)
    signedGap[dimension] = Math.round(lived - preference)
    const importance = Math.abs(preference - 50) / 50
    weightedGap += gap * importance
    totalWeight += importance
  }

  // Every preference exactly neutral means this person has no cultural convictions at all: a
  // perfectly indifferent fit, not a divide-by-zero.
  const averageGap = totalWeight === 0 ? 0 : weightedGap / totalWeight
  return { fitScore: Math.max(0, Math.min(100, Math.round(100 - averageGap))), perDimension, signedGap, preferences }
}

// ---------------------------------------------------------------------------
// Culture Fit → Human State pressure — PER-DIMENSION CAUSAL MODEL
// ---------------------------------------------------------------------------

/** Secondary/soft pressure bound per Human State dimension — deliberately smaller than the primary ±6 appraisal clamp in `StaffHumanAppraisalEngine`. */
export const CULTURE_FIT_PRESSURE_CLAMP = 3
/** Total bound across ALL Human State dimensions in one weekly tick — keeps Culture Fit pressure clearly subordinate to the primary 5A appraisal even when several dimensions mismatch at once. */
export const CULTURE_FIT_TOTAL_PRESSURE_CLAMP = 5

type HumanStateNudgeKey = 'roleSatisfaction' | 'responsibilitySatisfaction' | 'autonomySatisfaction' | 'influenceSatisfaction' | 'workloadSatisfaction' | 'professionalFulfillment' | 'frustration' | 'stress' | 'organizationalCommitment'

/**
 * One bounded contribution from one culture dimension's signed gap (`lived - preference`) into one
 * Human State dimension.
 *
 * - `kind: 'mismatch'` — a SATISFACTION-style Human State dimension that a mismatch in EITHER
 *   direction hurts (too little OR too much of the dimension both read as poor fit): the nudge
 *   always follows `-|gap|`, i.e. it can only ever push the Human State dimension down (mismatch)
 *   or leave it unchanged (perfect match) — never up, because "the culture drifted from what I
 *   wanted" is never itself a source of satisfaction regardless of which way it drifted.
 * - `kind: 'directional'` — only the gap direction named by `badWhenGapIs` is unwelcome (e.g.
 *   performanceIntensity reading ABOVE preference is the only direction that stresses someone out;
 *   reading below is neutral-to-fine). The nudge is signed so the named direction always pushes the
 *   Human State dimension the UNWELCOME way for that dimension (down for a satisfaction dimension,
 *   up for frustration/stress) and the opposite (safe) direction produces zero pressure.
 */
interface CultureNudgeRule {
  readonly culture: StaffCultureDimension
  readonly humanState: HumanStateNudgeKey
  readonly weight: number
  readonly kind: 'mismatch' | 'directional'
  /** `directional` only: which gap sign is the unwelcome one for this Human State dimension. */
  readonly badWhenGapIs?: 'positive' | 'negative'
}

/**
 * At-minimum causal mappings required by the Wave 5C correction spec. Each rule reads a REAL
 * per-dimension signed gap (lived culture minus this person's preference) and contributes a small
 * bounded nudge to one existing canonical Human State dimension. No new dimension, no new Human
 * Event kind, no new Consequence Signal kind — Culture Fit flows silently into existing vocabulary.
 */
const CULTURE_NUDGE_RULES: readonly CultureNudgeRule[] = [
  // autonomy mismatch -> autonomySatisfaction (either direction: too little OR too much authority than preferred both read as a mismatch of fit).
  { culture: 'autonomy', humanState: 'autonomySatisfaction', weight: 0.05, kind: 'mismatch' },
  // hierarchy reading MORE centralized than preferred -> less personal authority/voice: hurts autonomySatisfaction and influenceSatisfaction. Reading flatter than preferred is not itself unwelcome.
  { culture: 'hierarchy', humanState: 'autonomySatisfaction', weight: 0.03, kind: 'directional', badWhenGapIs: 'positive' },
  { culture: 'hierarchy', humanState: 'influenceSatisfaction', weight: 0.03, kind: 'directional', badWhenGapIs: 'positive' },
  // communicationOpenness mismatch -> professionalFulfillment (either direction); reading BELOW preference specifically also breeds frustration (small).
  { culture: 'communicationOpenness', humanState: 'professionalFulfillment', weight: 0.04, kind: 'mismatch' },
  { culture: 'communicationOpenness', humanState: 'frustration', weight: 0.025, kind: 'directional', badWhenGapIs: 'negative' },
  // performanceIntensity ABOVE preferred level -> stress; small workload-satisfaction pressure only when justified (same direction).
  { culture: 'performanceIntensity', humanState: 'stress', weight: 0.05, kind: 'directional', badWhenGapIs: 'positive' },
  { culture: 'performanceIntensity', humanState: 'workloadSatisfaction', weight: 0.02, kind: 'directional', badWhenGapIs: 'positive' },
  // developmentOrientation mismatch -> professionalFulfillment.
  { culture: 'developmentOrientation', humanState: 'professionalFulfillment', weight: 0.045, kind: 'mismatch' },
  // collaboration mismatch -> professionalFulfillment; reading BELOW preference also breeds frustration (small).
  { culture: 'collaboration', humanState: 'professionalFulfillment', weight: 0.035, kind: 'mismatch' },
  { culture: 'collaboration', humanState: 'frustration', weight: 0.02, kind: 'directional', badWhenGapIs: 'negative' },
  // stability mismatch -> organizationalCommitment.
  { culture: 'stability', humanState: 'organizationalCommitment', weight: 0.04, kind: 'mismatch' },
  // longTermOrientation mismatch -> organizationalCommitment.
  { culture: 'longTermOrientation', humanState: 'organizationalCommitment', weight: 0.04, kind: 'mismatch' },
  // analyticsOrientation mismatch -> professionalFulfillment when individually important (extremity-weighted below).
  { culture: 'analyticsOrientation', humanState: 'professionalFulfillment', weight: 0.03, kind: 'mismatch' },
]

function clampHumanState(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

/**
 * Applies small bounded Culture-Fit nudges to the canonical Human State dimensions the PER-DIMENSION
 * mismatch (or match) legitimately speaks to — see `CULTURE_NUDGE_RULES`. Replaces the previous
 * scalar-only `fitScore -> organizationalCommitment/professionalFulfillment` behavior: causes now
 * flow from the specific dimension that is actually mismatched (or matched), extremity-weighted by
 * how strongly this person cares about that dimension, so a person indifferent to e.g. analytics
 * orientation is not pressured by a mismatch there.
 *
 * Positive fit (culture matches or the gap favors the person) produces gradual POSITIVE pressure
 * too, symmetric with negative pressure — never asymmetric doom-only pressure.
 *
 * Bounded per Human State dimension (`CULTURE_FIT_PRESSURE_CLAMP`) AND bounded in total across all
 * dimensions in one call (`CULTURE_FIT_TOTAL_PRESSURE_CLAMP`), so total Culture Fit pressure stays
 * clearly subordinate to the primary ±6 Wave 5A appraisal even when several dimensions mismatch at
 * once. Adds NO new Human State dimension (11 stays 11), NO new Human Event kind (30 stays 30) and
 * NO new Consequence Signal kind (40 stays 40).
 */
export function applyCultureFitPressure(state: StaffHumanState, fit: StaffCultureFit): StaffHumanState {
  const totals: Partial<Record<HumanStateNudgeKey, number>> = {}
  let totalMagnitude = 0

  // Around-match band: within this many points of a perfect match, a `mismatch`-kind rule reads as
  // a genuine, mild POSITIVE ("strong fit") rather than merely "not yet negative" — this is what
  // gives positive fit its own gradual positive pressure, symmetric with negative pressure.
  const MISMATCH_COMFORT_BAND = 15

  for (const rule of CULTURE_NUDGE_RULES) {
    const gap = fit.signedGap[rule.culture]
    if (!Number.isFinite(gap)) continue

    // Extremity-weighted: a person indifferent to this specific dimension (preference near neutral
    // 50) is not pressured by its mismatch, mirroring `calculateStaffCultureFit`'s own weighting.
    const importance = Math.abs(fit.preferences[rule.culture] - 50) / 50
    if (importance === 0) continue

    let raw: number
    if (rule.kind === 'mismatch') {
      // Symmetric: a small gap either direction reads as a mild genuine positive (comfort band minus
      // the actual gap is positive); a large gap either direction reads as negative. Never rewards an
      // ever-larger overshoot — the reward peaks at a PERFECT match and only degrades from there.
      raw = (MISMATCH_COMFORT_BAND - Math.abs(gap)) * rule.weight * importance
    } else {
      const badDirectionSign = rule.badWhenGapIs === 'positive' ? 1 : -1
      const unwelcomeAmount = gap * badDirectionSign // > 0 only when the gap points the unwelcome way for this rule.
      if (unwelcomeAmount <= 0) continue
      // Directional rules always push the Human State dimension the UNWELCOME way for that
      // dimension: down for a satisfaction-style dimension, up for frustration/stress.
      const unwelcomeIsUp = rule.humanState === 'frustration' || rule.humanState === 'stress'
      raw = unwelcomeAmount * rule.weight * importance * (unwelcomeIsUp ? 1 : -1)
    }

    const bounded = Math.max(-CULTURE_FIT_PRESSURE_CLAMP, Math.min(CULTURE_FIT_PRESSURE_CLAMP, raw))
    if (bounded === 0) continue
    totals[rule.humanState] = (totals[rule.humanState] ?? 0) + bounded
    totalMagnitude += Math.abs(bounded)
  }

  if (totalMagnitude === 0) return state

  // Scale the whole batch down (never up) so the total movement across every dimension in one call
  // never exceeds the total clamp — keeps Culture Fit clearly subordinate to the primary appraisal.
  const scale = totalMagnitude > CULTURE_FIT_TOTAL_PRESSURE_CLAMP ? CULTURE_FIT_TOTAL_PRESSURE_CLAMP / totalMagnitude : 1

  let changed = false
  const next: Record<string, number> = {}
  for (const [key, value] of Object.entries(totals)) {
    const dimension = key as HumanStateNudgeKey
    const nudge = Math.max(-CULTURE_FIT_PRESSURE_CLAMP, Math.min(CULTURE_FIT_PRESSURE_CLAMP, value * scale))
    const nextValue = clampHumanState(state[dimension] + nudge)
    if (nextValue !== state[dimension]) {
      next[dimension] = nextValue
      changed = true
    }
  }

  if (!changed) return state
  return { ...state, ...next } as StaffHumanState
}
