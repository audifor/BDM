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

/**
 * Wave 5C — Organizational Culture derivation.
 *
 * Every dimension is derived from REAL, already-canonical world signals (Personality, professional
 * attributes, Role seniority, Responsibilities distribution, DelegationOutcome acceptance,
 * Relationship facets, Workload bands, employment tenure). No randomness anywhere — Culture is
 * fully signal-derived and deterministic for a given world.
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
    const definition = staffRoleDefinition(assignment.role)
    const employment = world.staffEmploymentByStaffId[assignment.staffPersonId]
    const startedOn = employment?.status === 'employed' ? employment.startedOn : undefined
    contributors.push({
      staffId: assignment.staffPersonId,
      role: assignment.role,
      weight: seniorityWeight(definition.seniority),
      personality: world.personalitiesByPersonId[assignment.staffPersonId]?.values ?? {},
      attributes: person.professional.attributes,
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
function relationshipFacetAverage(world: GameWorld, staffIds: readonly StaffPersonId[], facet: 'trust' | 'communicationQuality'): number {
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

/** Share of DelegationOutcomes produced by this unit's Staff that were actually applied — a real "does the organization act on its people" signal. */
function delegationAcceptanceRate(world: GameWorld, staffIds: readonly StaffPersonId[]): { readonly rate: number; readonly hasData: boolean } {
  const members = new Set<string>(staffIds)
  let applied = 0
  let total = 0
  for (const outcome of Object.values(world.delegationOutcomesById)) {
    if (!members.has(outcome.staffId)) continue
    total += 1
    if (outcome.applied) applied += 1
  }
  return total === 0 ? { rate: 0.5, hasData: false } : { rate: applied / total, hasData: true }
}

/** Share of this Team's Responsibilities that are actually delegated out (vs advisory/user-controlled) — a real distribution-of-authority signal. */
function delegatedResponsibilityShare(world: GameWorld, teamId: TeamId): { readonly share: number; readonly hasData: boolean } {
  const responsibilities = getTeamResponsibilities(world, teamId)
  const held = responsibilities.filter((item) => item.holderStaffId !== undefined)
  if (held.length === 0) return { share: 0.5, hasData: false }
  return { share: held.filter((item) => item.mode === 'delegated').length / held.length, hasData: true }
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
  const acceptance = delegationAcceptanceRate(world, staffIds)
  const delegation = delegatedResponsibilityShare(world, teamId)
  const seniorityShare = contributors.filter((contributor) => contributor.weight >= 2.5).length / contributors.length
  const overloadedShare = contributors.filter((contributor) => contributor.workloadBand === 'OVERLOADED' || contributor.workloadBand === 'HEAVY').length / contributors.length
  const tenureScore = weightedMean(contributors, (contributor) => Math.min(100, contributor.tenureMonths * 2.5))

  const values: Record<StaffCultureDimension, number> = {
    // Personality-led norms.
    innovationOrientation: weightedMean(contributors, (contributor) => personality(contributor, 'adaptability')),
    disciplineOrientation: weightedMean(contributors, (contributor) => personality(contributor, 'professionalism')),
    collaborationOrientation: blend(
      weightedMean(contributors, (contributor) => personality(contributor, 'teamOrientation')),
      // A team that actually hands work to its people collaborates; one that hoards it does not.
      delegation.hasData ? 30 + delegation.share * 55 : 50,
    ),
    hierarchyOrientation: blend(
      weightedMean(contributors, (contributor) => invert(personality(contributor, 'teamOrientation'))),
      // A director-heavy staff and a low advisory-acceptance rate both read as top-down.
      30 + seniorityShare * 50,
      acceptance.hasData ? 80 - acceptance.rate * 55 : 50,
    ),
    riskTolerance: weightedMean(contributors, (contributor) => blend(personality(contributor, 'adaptability'), personality(contributor, 'competitiveness'))),
    communicationOpenness: blend(
      weightedMean(contributors, (contributor) => blend(personality(contributor, 'adaptability'), personality(contributor, 'teamOrientation'))),
      communicationAverage,
    ),
    accountabilityStandard: weightedMean(contributors, (contributor) => blend(personality(contributor, 'professionalism'), personality(contributor, 'resilience'))),
    // A REAL professional-attribute signal, not a personality restatement.
    developmentFocus: weightedMean(contributors, (contributor) => contributor.attributes.playerDevelopment ?? 50),
    stabilityOrientation: blend(
      weightedMean(contributors, (contributor) => blend(invert(personality(contributor, 'ambition')), personality(contributor, 'loyalty'))),
      // Real continuity: long unbroken tenures make an organization feel stable.
      tenureScore,
    ),
    competitiveIntensity: blend(
      weightedMean(contributors, (contributor) => personality(contributor, 'competitiveness')),
      // A staff running hot on workload is, in practice, an intense place to work.
      40 + overloadedShare * 45,
    ),
    professionalismStandard: weightedMean(contributors, (contributor) => personality(contributor, 'professionalism')),
    inclusivity: blend(
      weightedMean(contributors, (contributor) => personality(contributor, 'teamOrientation')),
      communicationAverage,
    ),
    transparencyStandard: blend(trustAverage, communicationAverage),
    resultsOrientation: weightedMean(contributors, (contributor) => blend(personality(contributor, 'competitiveness'), personality(contributor, 'ambition'))),
  }

  const clamped: Record<StaffCultureDimension, number> = {} as never
  for (const dimension of STAFF_CULTURE_DIMENSIONS) clamped[dimension] = clampCultureValue(values[dimension])
  return clamped
}

export function initializeStaffCultureState(world: GameWorld, scopeKey: string): StaffCultureState {
  const target = deriveStaffCultureTarget(world, scopeKey)
  return createStaffCultureState({ scopeKey, target, current: target, lastEvaluatedOn: world.currentDate })
}

/** Culture has real inertia: it moves 4% of the remaining distance toward its target per weekly tick. */
export const STAFF_CULTURE_INERTIA_RATE = 0.04

export function progressStaffCultureState(current: StaffCultureState, target: StaffCultureValues, evaluatedOn: GameDate): StaffCultureState {
  const next: Record<StaffCultureDimension, number> = {} as never
  for (const dimension of STAFF_CULTURE_DIMENSIONS) {
    const from = current.current[dimension]
    next[dimension] = clampCultureValue(from + (target[dimension] - from) * STAFF_CULTURE_INERTIA_RATE)
  }
  return createStaffCultureState({ scopeKey: current.scopeKey, target, current: next, lastEvaluatedOn: evaluatedOn })
}

// ---------------------------------------------------------------------------
// Individual culture preferences — PURE PROJECTION, never persisted
// ---------------------------------------------------------------------------

/**
 * What kind of organization would this specific Staff person prefer to work in?
 *
 * A read-only MAPPING of their existing Personality + professional attributes + Role onto the same
 * 14 culture dimensions. It is deliberately NOT a second Personality block and is never stored
 * anywhere — it is recomputed on demand wherever Culture Fit is needed.
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

  const preferences: Record<StaffCultureDimension, number> = {
    innovationOrientation: blend(p('adaptability'), a('analysis')) + analyticalPull,
    disciplineOrientation: blend(p('professionalism'), a('discipline')),
    collaborationOrientation: blend(p('teamOrientation'), a('communication')),
    // A senior/director role prefers clear lines of authority; a junior specialist prefers flatter ones.
    hierarchyOrientation: blend(invert(p('teamOrientation')), 50) + leadershipPull,
    riskTolerance: blend(p('adaptability'), p('competitiveness')),
    communicationOpenness: blend(p('teamOrientation'), a('communication')),
    accountabilityStandard: blend(p('professionalism'), p('resilience')) + leadershipPull,
    developmentFocus: blend(a('playerDevelopment'), p('teamOrientation')) + developmentPull,
    stabilityOrientation: blend(invert(p('ambition')), p('loyalty')),
    competitiveIntensity: blend(p('competitiveness'), p('ambition')),
    professionalismStandard: blend(p('professionalism'), a('discipline')),
    inclusivity: blend(p('teamOrientation'), a('communication')),
    transparencyStandard: blend(p('professionalism'), a('communication')),
    resultsOrientation: blend(p('competitiveness'), p('ambition')) + analyticalPull,
  }

  const clamped: Record<StaffCultureDimension, number> = {} as never
  for (const dimension of STAFF_CULTURE_DIMENSIONS) clamped[dimension] = clampCultureValue(preferences[dimension])
  return clamped
}

export interface StaffCultureFit {
  readonly fitScore: number
  readonly perDimension: Readonly<Record<StaffCultureDimension, number>>
}

/**
 * How well does this Staff person fit the organization they actually work in?
 *
 * Per dimension: the gap between their preference and the lived culture, weighted by how EXTREME
 * their own preference is (`|preference - 50| / 50`). Extremity-weighting is preferred over a
 * per-role importance table because it generalizes to every role with no extra data: a person who
 * genuinely does not care about a dimension (preference near neutral) is not made unhappy by it,
 * while a person with a strong conviction on a dimension feels every point of mismatch.
 * A flat unweighted average is deliberately NOT used.
 */
export function calculateStaffCultureFit(world: GameWorld, staffId: StaffPersonId, cultureState: StaffCultureState): StaffCultureFit {
  const preferences = deriveStaffCulturePreferences(world, staffId)
  const perDimension: Record<StaffCultureDimension, number> = {} as never
  let weightedGap = 0
  let totalWeight = 0

  for (const dimension of STAFF_CULTURE_DIMENSIONS) {
    const preference = preferences[dimension]
    const gap = Math.abs(preference - cultureState.current[dimension])
    perDimension[dimension] = Math.round(gap)
    const importance = Math.abs(preference - 50) / 50
    weightedGap += gap * importance
    totalWeight += importance
  }

  // Every preference exactly neutral means this person has no cultural convictions at all: a
  // perfectly indifferent fit, not a divide-by-zero.
  const averageGap = totalWeight === 0 ? 0 : weightedGap / totalWeight
  return { fitScore: Math.max(0, Math.min(100, Math.round(100 - averageGap))), perDimension }
}

// ---------------------------------------------------------------------------
// Culture Fit → Human State pressure
// ---------------------------------------------------------------------------

/** Secondary/soft pressure bound — deliberately smaller than the primary ±6 appraisal clamp in `StaffHumanAppraisalEngine`. */
export const CULTURE_FIT_PRESSURE_CLAMP = 3

/**
 * Applies a small bounded Culture-Fit nudge to the TWO existing canonical Human State dimensions it
 * legitimately speaks to: `organizationalCommitment` ("do I belong here") and
 * `professionalFulfillment` ("does this place let me do my work my way").
 *
 * It adds NO new Human State dimension (11 stays 11), NO new Human Event kind (30 stays 30) and NO
 * new Consequence Signal kind (40 stays 40) — Culture Fit flows silently into existing vocabulary.
 */
export function applyCultureFitPressure(state: StaffHumanState, fitScore: number): StaffHumanState {
  if (!Number.isFinite(fitScore)) return state
  const raw = (fitScore - 50) * 0.06
  const nudge = Math.max(-CULTURE_FIT_PRESSURE_CLAMP, Math.min(CULTURE_FIT_PRESSURE_CLAMP, raw))
  if (nudge === 0) return state
  const clamp = (value: number): number => Math.max(0, Math.min(100, Math.round(value)))
  return {
    ...state,
    organizationalCommitment: clamp(state.organizationalCommitment + nudge),
    professionalFulfillment: clamp(state.professionalFulfillment + nudge),
  }
}
