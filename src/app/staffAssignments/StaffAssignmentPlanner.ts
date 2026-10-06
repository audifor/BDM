import { isResponsibilityConnected, RESPONSIBILITY_KINDS, responsibilityDefinition, type ResponsibilityDomain, type ResponsibilityKind, type ResponsibilityMode } from '@/domain/responsibility'
import type { StaffPersonId, TeamId } from '@/domain/ids'
import {
  calculateStaffWorkload,
  getRankedResponsibilityCandidates,
  getStaffPerson,
  getTeamResponsibilities,
  type EligibleResponsibilityCandidate,
  type GameWorld,
} from '@/domain/world'
import { setTeamResponsibility } from '@/app/staffResponsibilities'

/**
 * Bulk Staff Assignment strategies (Staff Assignments screen).
 *
 * Every strategy is a pure plan over canonical domain queries — no RNG, no persisted derived
 * state — and is applied exclusively through `setTeamResponsibility`, the single canonical
 * Application boundary for "who controls a Team's Responsibility".
 *
 * The four AUTO-ASSIGN strategies are deliberately distinct:
 * - `bestOverallFit` fills every vacant staff-eligible Responsibility whose best ranked candidate
 *   reaches `MINIMUM_AUTO_SUITABILITY`; responsibilities nobody is good enough for stay with the
 *   Head Coach.
 * - `delegateMore` fills every vacant staff-eligible Responsibility with the best available
 *   candidate regardless of fit quality (minimizes Head-Coach-held work).
 * - `maximumSpecialization` fills with the highest raw proficiency candidate, ignoring the
 *   workload discount a specialist would take on.
 * - `balanceWorkload` fills only with candidates that stay within capacity and then rebalances
 *   Responsibilities held by overloaded Staff onto a fitting alternative.
 *
 * `planStaffOptimization` is the separate OPTIMIZE pass: it never fills a vacancy, it only
 * proposes moving an existing assignment to a strictly better alternative.
 */
export const STAFF_ASSIGNMENT_STRATEGIES = ['bestOverallFit', 'balanceWorkload', 'maximumSpecialization', 'delegateMore'] as const
export type StaffAssignmentStrategy = (typeof STAFF_ASSIGNMENT_STRATEGIES)[number]

export const STAFF_ASSIGNMENT_STRATEGY_LABELS: Readonly<Record<StaffAssignmentStrategy, string>> = {
  bestOverallFit: 'BEST OVERALL FIT',
  balanceWorkload: 'BALANCE WORKLOAD',
  maximumSpecialization: 'MAXIMUM SPECIALIZATION',
  delegateMore: 'DELEGATE MORE',
}

export const STAFF_ASSIGNMENT_STRATEGY_DESCRIPTIONS: Readonly<Record<StaffAssignmentStrategy, string>> = {
  bestOverallFit: 'Prioritize suitability for every responsibility',
  balanceWorkload: 'Avoid staff overload',
  maximumSpecialization: 'Prefer specialists even if workload increases',
  delegateMore: 'Minimize responsibilities handled by Head Coach',
}

/** `bestOverallFit` refuses to hand work to someone below this suitability. */
export const MINIMUM_AUTO_SUITABILITY = 50

/** OPTIMIZE only proposes a move when the alternative is better by at least this margin. */
export const OPTIMIZATION_MINIMUM_GAIN = 4

export type StaffAssignmentChangeReason = 'vacancy' | 'rebalance' | 'upgrade'

export interface StaffAssignmentChange {
  readonly kind: ResponsibilityKind
  readonly domain: ResponsibilityDomain
  readonly previousMode: ResponsibilityMode
  readonly previousHolderStaffId: StaffPersonId | undefined
  readonly previousHolderName: string | undefined
  readonly previousSuitability: number | undefined
  readonly mode: 'delegated' | 'advisory'
  readonly holderStaffId: StaffPersonId
  readonly holderName: string
  readonly suitability: number
  /** Suitability gained versus the previous holder; `undefined` when the row was vacant. */
  readonly suitabilityGain: number | undefined
  /** True when the resulting assignment pushes the holder past capacity. */
  readonly overloadWarning: boolean
  readonly reason: StaffAssignmentChangeReason
}

export interface StaffAssignmentProgram {
  readonly changes: readonly StaffAssignmentChange[]
  readonly unchanged: number
  readonly workloadWarnings: number
}

/** Optional restriction used by the per-section AUTO control. */
export interface StaffAssignmentScope {
  readonly domain?: ResponsibilityDomain
}

export function staffAssignmentDomainOf(kind: ResponsibilityKind): ResponsibilityDomain {
  return responsibilityDefinition(kind).domain
}

/**
 * Delegation posture used by the bulk strategies: `delegated` when the Responsibility supports it
 * (the holder performs the work), otherwise `advisory` (the holder only recommends). Kinds that
 * support neither — or that belong to the Head Coach rather than to Staff — are never assigned.
 *
 * MX0.3: a retired or deferred kind is never assignable either. This is the same canonical
 * `isResponsibilityConnected` authority `setTeamResponsibility` and the Staff workspace rows use, so
 * the auto-assign planner and the UI candidate list can never offer a responsibility the assignment
 * boundary would reject.
 */
export function delegationModeForResponsibility(kind: ResponsibilityKind): 'delegated' | 'advisory' | undefined {
  const definition = responsibilityDefinition(kind)
  if (!isResponsibilityConnected(kind)) return undefined
  if (definition.eligibleParticipant !== 'staff') return undefined
  if (definition.supportedModes.includes('delegated')) return 'delegated'
  if (definition.supportedModes.includes('advisory')) return 'advisory'
  return undefined
}

interface ResponsibilityState {
  readonly mode: ResponsibilityMode
  readonly holderStaffId: StaffPersonId | undefined
}

function currentState(world: GameWorld, teamId: TeamId, kind: ResponsibilityKind): ResponsibilityState {
  const existing = getTeamResponsibilities(world, teamId).find((item) => item.kind === kind)
  return { mode: existing?.mode ?? responsibilityDefinition(kind).defaultMode, holderStaffId: existing?.holderStaffId }
}

function hasStaffHolder(state: ResponsibilityState): boolean {
  return (state.mode === 'delegated' || state.mode === 'advisory') && state.holderStaffId !== undefined
}

function holderName(world: GameWorld, holderStaffId: StaffPersonId | undefined): string | undefined {
  if (holderStaffId === undefined) return undefined
  const person = getStaffPerson(world, holderStaffId)
  return person === undefined ? undefined : `${person.identity.firstName} ${person.identity.lastName}`
}

/** Canonical suitability of the current holder, or `undefined` when the row has no staff holder. */
function currentHolderSuitability(world: GameWorld, teamId: TeamId, kind: ResponsibilityKind, state: ResponsibilityState): number | undefined {
  if (!hasStaffHolder(state) || state.holderStaffId === undefined) return undefined
  const ranked = getRankedResponsibilityCandidates(world, teamId, kind, state.mode === 'advisory' ? 'advisory' : 'delegated')
  return ranked.find((candidate) => candidate.staffPersonId === state.holderStaffId)?.suitability
}

function pickCandidate(strategy: StaffAssignmentStrategy, candidates: readonly EligibleResponsibilityCandidate[]): EligibleResponsibilityCandidate | undefined {
  if (candidates.length === 0) return undefined
  if (strategy === 'maximumSpecialization') {
    return [...candidates].sort((left, right) => right.proficiency - left.proficiency || left.staffPersonId.localeCompare(right.staffPersonId))[0]
  }
  if (strategy === 'balanceWorkload') {
    const fitting = candidates.filter((candidate) => !candidate.projectedOverloaded)
    return fitting.length === 0 ? undefined : fitting[0]
  }
  if (strategy === 'delegateMore') return candidates[0]
  const best = candidates[0]
  return best !== undefined && best.suitability >= MINIMUM_AUTO_SUITABILITY ? best : undefined
}

/** Builds the plan for a strategy (optionally restricted to one domain) without mutating `world`. */
export function planStaffAssignments(world: GameWorld, teamId: TeamId, strategy: StaffAssignmentStrategy, scope: StaffAssignmentScope = {}): StaffAssignmentProgram {
  const kinds = RESPONSIBILITY_KINDS.filter((kind) => scope.domain === undefined || staffAssignmentDomainOf(kind) === scope.domain)
  let working = world
  const changes: StaffAssignmentChange[] = []
  let unchanged = 0

  const commit = (kind: ResponsibilityKind, state: ResponsibilityState, mode: 'delegated' | 'advisory', candidate: EligibleResponsibilityCandidate, reason: StaffAssignmentChangeReason): void => {
    const previousSuitability = currentHolderSuitability(working, teamId, kind, state)
    changes.push({
      kind,
      domain: staffAssignmentDomainOf(kind),
      previousMode: state.mode,
      previousHolderStaffId: state.holderStaffId,
      previousHolderName: holderName(working, state.holderStaffId),
      previousSuitability,
      mode,
      holderStaffId: candidate.staffPersonId,
      holderName: candidate.name,
      suitability: candidate.suitability,
      suitabilityGain: previousSuitability === undefined ? undefined : candidate.suitability - previousSuitability,
      overloadWarning: candidate.projectedOverloaded,
      reason,
    })
    working = setTeamResponsibility(working, { teamId, kind, mode, holderStaffId: candidate.staffPersonId })
  }

  for (const kind of kinds) {
    const mode = delegationModeForResponsibility(kind)
    if (mode === undefined) continue
    const state = currentState(working, teamId, kind)
    if (hasStaffHolder(state)) {
      unchanged += 1
      continue
    }
    const candidate = pickCandidate(strategy, getRankedResponsibilityCandidates(working, teamId, kind, mode))
    if (candidate === undefined) {
      unchanged += 1
      continue
    }
    commit(kind, state, mode, candidate, 'vacancy')
  }

  if (strategy === 'balanceWorkload') {
    for (const kind of kinds) {
      const mode = delegationModeForResponsibility(kind)
      if (mode === undefined) continue
      const state = currentState(working, teamId, kind)
      if (!hasStaffHolder(state)) continue
      const holderId = state.holderStaffId
      if (holderId === undefined || !calculateStaffWorkload(working, holderId).overloaded) continue

      const holderSuitability = currentHolderSuitability(working, teamId, kind, state) ?? 0
      const alternative = getRankedResponsibilityCandidates(working, teamId, kind, mode).find(
        (candidate) => candidate.staffPersonId !== holderId && !candidate.projectedOverloaded && candidate.suitability >= holderSuitability,
      )
      if (alternative === undefined) continue
      commit(kind, state, mode, alternative, 'rebalance')
    }
  }

  return { changes, unchanged, workloadWarnings: changes.filter((change) => change.overloadWarning).length }
}

/**
 * OPTIMIZE: reviews the Team's existing staff assignments and proposes moving one to a strictly
 * better alternative (higher suitability, within capacity). It never fills a vacancy — that is
 * AUTO-ASSIGN's job — so the two actions stay conceptually distinct.
 */
export function planStaffOptimization(world: GameWorld, teamId: TeamId, scope: StaffAssignmentScope = {}): readonly StaffAssignmentChange[] {
  const kinds = RESPONSIBILITY_KINDS.filter((kind) => scope.domain === undefined || staffAssignmentDomainOf(kind) === scope.domain)
  let working = world
  const suggestions: StaffAssignmentChange[] = []

  for (const kind of kinds) {
    const mode = delegationModeForResponsibility(kind)
    if (mode === undefined) continue
    const state = currentState(working, teamId, kind)
    if (!hasStaffHolder(state) || state.holderStaffId === undefined) continue
    const holderId = state.holderStaffId

    const ranked = getRankedResponsibilityCandidates(working, teamId, kind, mode)
    const holderSuitability = ranked.find((candidate) => candidate.staffPersonId === holderId)?.suitability ?? 0
    const holderOverloaded = calculateStaffWorkload(working, holderId).overloaded

    const alternative = ranked.find(
      (candidate) =>
        candidate.staffPersonId !== holderId &&
        candidate.suitability >= holderSuitability + OPTIMIZATION_MINIMUM_GAIN &&
        (holderOverloaded || !candidate.projectedOverloaded),
    )
    if (alternative === undefined) continue

    suggestions.push({
      kind,
      domain: staffAssignmentDomainOf(kind),
      previousMode: state.mode,
      previousHolderStaffId: holderId,
      previousHolderName: holderName(working, holderId),
      previousSuitability: holderSuitability,
      mode,
      holderStaffId: alternative.staffPersonId,
      holderName: alternative.name,
      suitability: alternative.suitability,
      suitabilityGain: alternative.suitability - holderSuitability,
      overloadWarning: alternative.projectedOverloaded,
      reason: 'upgrade',
    })
    working = setTeamResponsibility(working, { teamId, kind, mode, holderStaffId: alternative.staffPersonId })
  }

  return suggestions
}

export interface StaffAssignmentRunResult {
  readonly world: GameWorld
  readonly changes: readonly StaffAssignmentChange[]
}

function applyChanges(world: GameWorld, teamId: TeamId, changes: readonly StaffAssignmentChange[]): GameWorld {
  let updated = world
  for (const change of changes) updated = setTeamResponsibility(updated, { teamId, kind: change.kind, mode: change.mode, holderStaffId: change.holderStaffId })
  return updated
}

/** Applies an AUTO-ASSIGN strategy to `world`, returning the new world plus the applied changes. */
export function runStaffAssignmentStrategy(world: GameWorld, teamId: TeamId, strategy: StaffAssignmentStrategy, scope: StaffAssignmentScope = {}): StaffAssignmentRunResult {
  const plan = planStaffAssignments(world, teamId, strategy, scope)
  return { world: applyChanges(world, teamId, plan.changes), changes: plan.changes }
}

/** Applies the OPTIMIZE suggestions to `world`. */
export function runStaffOptimization(world: GameWorld, teamId: TeamId, scope: StaffAssignmentScope = {}): StaffAssignmentRunResult {
  const suggestions = planStaffOptimization(world, teamId, scope)
  return { world: applyChanges(world, teamId, suggestions), changes: suggestions }
}

/** Reverts one Responsibility to the Head Coach (`userControlled`) — the "Unassign" action. */
export function unassignResponsibility(world: GameWorld, teamId: TeamId, kind: ResponsibilityKind): GameWorld {
  return setTeamResponsibility(world, { teamId, kind, mode: 'userControlled' })
}
