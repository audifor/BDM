import { hasCanonicalAcceptanceSeam, responsibilityDefinition, type DelegationOutcome, type DelegationOutcomeId, type ResponsibilityKind } from '@/domain/responsibility'
import type { GameWorld } from '@/domain/world'
import { acceptMedicalRecommendation } from '@/engine/injury/MedicalAdvisory'
import { acceptRecruitingRecommendation } from '@/engine/recruiting/RecruitingAdvisory'
import { acceptTradeRecommendation } from '@/engine/roster/BasketballOperationsAdvisory'
import { emitAdvisoryAcceptedEvent, emitAdvisoryRejectedEvent } from '@/app/staffHumanState/StaffHumanAdvisoryEvents'

/**
 * `ResponsibilityKind`s that have a canonical, existing acceptance seam an advisory
 * `DelegationOutcome` can be applied through (Wave 4C3 §11). This is the ONLY place that decides
 * "acceptable or view-only" — the Advisory Center UI/presentation must never re-derive this list.
 * Anything not listed here is `notAcceptable`, regardless of `kind`/payload shape.
 */
const MEDICAL_ACCEPTANCE_KINDS = ['returnToPlayRecommendation', 'treatmentRecommendation'] as const
const RECRUITING_ACCEPTANCE_KINDS = ['prospectIdentification', 'recruitEvaluation', 'recruitingPriorities'] as const
const TRADE_ACCEPTANCE_KINDS = ['tradeRecommendation'] as const

export { hasCanonicalAcceptanceSeam }

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
    return { ok: true, world: emitAccepted(markAccepted(result.world, outcomeId), outcome) }
  }
  if (RECRUITING_ACCEPTANCE_KINDS.includes(outcome.kind as typeof RECRUITING_ACCEPTANCE_KINDS[number])) {
    const result = acceptRecruitingRecommendation(world, outcomeId)
    if (!result.ok) return { ok: false, reason: 'underlyingRejected' }
    return { ok: true, world: emitAccepted(markAccepted(result.world, outcomeId), outcome) }
  }
  if (TRADE_ACCEPTANCE_KINDS.includes(outcome.kind as typeof TRADE_ACCEPTANCE_KINDS[number])) {
    const result = acceptTradeRecommendation(world, outcomeId)
    if (!result.ok) return { ok: false, reason: 'underlyingRejected' }
    return { ok: true, world: emitAccepted(markAccepted(result.world, outcomeId), outcome) }
  }
  return { ok: false, reason: 'notAcceptable' }
}

/** Wave 5A §16 — a Responsibility with `capacityCost >= 2` is the existing canonical "this matters more" signal (already used to size workload) and is reused here as the IMPORTANT/MEANINGFUL threshold, rather than inventing a second importance scale. */
function isImportantResponsibility(kind: ResponsibilityKind): boolean {
  return responsibilityDefinition(kind).capacityCost >= 2
}

function emitAccepted(world: GameWorld, outcome: DelegationOutcome): GameWorld {
  return emitAdvisoryAcceptedEvent(world, outcome, isImportantResponsibility(outcome.kind))
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
  const dismissedWorld: GameWorld = { ...world, delegationOutcomesById: { ...world.delegationOutcomesById, [outcomeId]: updated } }
  const reacted = emitAdvisoryRejectedEvent(dismissedWorld, outcome, hasCanonicalAcceptanceSeam, isImportantResponsibility(outcome.kind))
  return { ok: true, world: reacted }
}

function markAccepted(world: GameWorld, outcomeId: DelegationOutcomeId): GameWorld {
  const outcome = world.delegationOutcomesById[outcomeId]!
  const updated: DelegationOutcome = { ...outcome, applied: true, userDisposition: 'accepted', userDecidedOn: world.currentDate }
  return { ...world, delegationOutcomesById: { ...world.delegationOutcomesById, [outcomeId]: updated } }
}
