import type { DelegationOutcome, DelegationOutcomeId, ResponsibilityKind } from '@/domain/responsibility'
import type { GameWorld } from '@/domain/world'
import { acceptMedicalRecommendation } from '@/engine/injury/MedicalAdvisory'
import { acceptRecruitingRecommendation } from '@/engine/recruiting/RecruitingAdvisory'
import { acceptTradeRecommendation } from '@/engine/roster/BasketballOperationsAdvisory'

/**
 * `ResponsibilityKind`s that have a canonical, existing acceptance seam an advisory
 * `DelegationOutcome` can be applied through (Wave 4C3 §11). This is the ONLY place that decides
 * "acceptable or view-only" — the Advisory Center UI/presentation must never re-derive this list.
 * Anything not listed here is `notAcceptable`, regardless of `kind`/payload shape.
 */
const MEDICAL_ACCEPTANCE_KINDS = ['returnToPlayRecommendation', 'treatmentRecommendation'] as const
const RECRUITING_ACCEPTANCE_KINDS = ['prospectIdentification', 'recruitEvaluation', 'recruitingPriorities'] as const
const TRADE_ACCEPTANCE_KINDS = ['tradeRecommendation'] as const

export const ACCEPTABLE_RESPONSIBILITY_KINDS: ReadonlySet<ResponsibilityKind> = new Set([
  ...MEDICAL_ACCEPTANCE_KINDS,
  ...RECRUITING_ACCEPTANCE_KINDS,
  ...TRADE_ACCEPTANCE_KINDS,
])

export function hasCanonicalAcceptanceSeam(kind: ResponsibilityKind): boolean {
  return ACCEPTABLE_RESPONSIBILITY_KINDS.has(kind)
}

export type StaffRecommendationCommandFailureReason = 'notFound' | 'alreadyResolved' | 'notAcceptable' | 'underlyingRejected'
export type StaffRecommendationCommandResult = { readonly ok: true; readonly world: GameWorld } | { readonly ok: false; readonly reason: StaffRecommendationCommandFailureReason }

/**
 * Sole canonical Application boundary for a user decision on an advisory `DelegationOutcome`
 * (Wave 4C3 §10-11). Never duplicates a canonical acceptance seam's own validation — it only
 * dispatches to the real seam (Medical/Recruiting/Trade) and, on success, layers the user
 * disposition metadata onto the outcome the seam already returned `applied: true` for. On any
 * failure — not found, already resolved, no acceptance seam, or the underlying seam rejecting a
 * stale recommendation — `world` is returned completely unchanged.
 */
export function acceptStaffRecommendation(world: GameWorld, outcomeId: DelegationOutcomeId): StaffRecommendationCommandResult {
  const outcome = world.delegationOutcomesById[outcomeId]
  if (outcome === undefined) return { ok: false, reason: 'notFound' }
  if (outcome.userDisposition !== undefined) return { ok: false, reason: 'alreadyResolved' }

  if (MEDICAL_ACCEPTANCE_KINDS.includes(outcome.kind as typeof MEDICAL_ACCEPTANCE_KINDS[number])) {
    const result = acceptMedicalRecommendation(world, outcomeId)
    if (!result.ok) return { ok: false, reason: 'underlyingRejected' }
    return { ok: true, world: markAccepted(result.world, outcomeId) }
  }
  if (RECRUITING_ACCEPTANCE_KINDS.includes(outcome.kind as typeof RECRUITING_ACCEPTANCE_KINDS[number])) {
    const result = acceptRecruitingRecommendation(world, outcomeId)
    if (!result.ok) return { ok: false, reason: 'underlyingRejected' }
    return { ok: true, world: markAccepted(result.world, outcomeId) }
  }
  if (TRADE_ACCEPTANCE_KINDS.includes(outcome.kind as typeof TRADE_ACCEPTANCE_KINDS[number])) {
    const result = acceptTradeRecommendation(world, outcomeId)
    if (!result.ok) return { ok: false, reason: 'underlyingRejected' }
    return { ok: true, world: markAccepted(result.world, outcomeId) }
  }
  return { ok: false, reason: 'notAcceptable' }
}

/**
 * Records the outcome's own `userDisposition` as `'dismissed'` (Wave 4C3 §12). Deliberately never
 * touches any other collection: the recommended domain mutation (injury/recruiting/roster/trade/
 * scouting/tactics/draft) may already exist independently of `outcome.applied` (e.g. a scouting
 * assignment created eagerly by its producer) — dismiss is purely a user decision about the
 * advisory record, never a rollback of target-domain side effects.
 */
export function dismissStaffRecommendation(world: GameWorld, outcomeId: DelegationOutcomeId): StaffRecommendationCommandResult {
  const outcome = world.delegationOutcomesById[outcomeId]
  if (outcome === undefined) return { ok: false, reason: 'notFound' }
  if (outcome.userDisposition !== undefined) return { ok: false, reason: 'alreadyResolved' }
  if (outcome.applied) return { ok: false, reason: 'alreadyResolved' }

  const updated: DelegationOutcome = { ...outcome, applied: false, userDisposition: 'dismissed', userDecidedOn: world.currentDate }
  return { ok: true, world: { ...world, delegationOutcomesById: { ...world.delegationOutcomesById, [outcomeId]: updated } } }
}

function markAccepted(world: GameWorld, outcomeId: DelegationOutcomeId): GameWorld {
  const outcome = world.delegationOutcomesById[outcomeId]!
  const updated: DelegationOutcome = { ...outcome, applied: true, userDisposition: 'accepted', userDecidedOn: world.currentDate }
  return { ...world, delegationOutcomesById: { ...world.delegationOutcomesById, [outcomeId]: updated } }
}
