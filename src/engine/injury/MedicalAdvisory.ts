import type { InjuryId, PlayerId, TeamId } from '@/domain/ids'
import { isInjuryActive } from '@/domain/injury'
import { addDays, compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import { createDelegationOutcome, delegationOutcomeIdFromString, type DelegationOutcome, type DelegationOutcomeId } from '@/domain/responsibility'
import { resolveAdvisoryResponsibility, medicalQuality } from '@/engine/staff'
import { hashStringToSeed, SeededRandomSource } from '@/engine/random'
import { updateGameWorld, type GameWorld } from '@/domain/world'

/**
 * Centralized, frozen prototype safety band for a medical adjustment recommendation
 * (docs/STAFF_SYSTEM_V2.md §17) — never duplicated/scattered elsewhere. A medical recommendation
 * can only ever nudge the base injury model within this band; it can never replace
 * `recoveryDaysForSeverity`/`injuryReturnDate`.
 */
export const MIN_MEDICAL_ADJUSTMENT_DAYS = -2
export const MAX_MEDICAL_ADJUSTMENT_DAYS = 5

const MEDICAL_RECOMMENDATION_KINDS = ['returnToPlayRecommendation', 'treatmentRecommendation'] as const
export type MedicalRecommendationKind = typeof MEDICAL_RECOMMENDATION_KINDS[number]

/**
 * For every active injury on `teamId` with a genuine `advisory` holder for
 * `returnToPlayRecommendation`/`treatmentRecommendation`, records a `DelegationOutcome` (never
 * applied automatically). `vacant`, `userControlled` and `organizational` responsibilities never
 * reach this far — `resolveAdvisoryResponsibility` returns `undefined` for every one of those, so
 * no Staff-authored outcome is ever fabricated on their behalf.
 *
 * Exactly-once: the outcome id is stable and derived only from `(responsibilityId, injuryId,
 * kind)` — repeated calls for the same injury/kind never spam duplicate outcomes.
 */
export function progressMedicalAdvisories(world: GameWorld): GameWorld {
  return Object.keys(world.teams).sort().reduce((next, teamId) => progressTeamMedicalAdvisories(next, teamId as TeamId), world)
}

function progressTeamMedicalAdvisories(world: GameWorld, teamId: TeamId): GameWorld {
  const team = world.teams[teamId]
  if (team === undefined) return world
  const activeInjuries = Object.values(world.injuriesById)
    .filter((injury) => team.rosterPlayerIds.includes(injury.playerId) && isInjuryActive(injury, world.currentDate))
    .sort((a, b) => a.id.localeCompare(b.id))
  let next = world
  for (const injury of activeInjuries) for (const kind of MEDICAL_RECOMMENDATION_KINDS) next = recordMedicalRecommendation(next, teamId, injury.id, injury.playerId, kind)
  return next
}

function recordMedicalRecommendation(world: GameWorld, teamId: TeamId, injuryId: InjuryId, playerId: PlayerId, kind: MedicalRecommendationKind): GameWorld {
  const resolution = resolveAdvisoryResponsibility(world, teamId, kind)
  if (resolution === undefined) return world
  const injury = world.injuriesById[injuryId]
  if (injury === undefined) return world

  const outcomeId = delegationOutcomeIdFromString(`delegation-outcome:${resolution.responsibilityId}:${injuryId}:${kind}`)
  if (world.delegationOutcomesById[outcomeId] !== undefined) return world

  const seed = `staff-decision-quality-v1:${resolution.responsibilityId}:${world.currentDate}`
  const qualityScore = medicalQuality(resolution.context, seed)
  const recommendedExtraDays = recommendMedicalAdjustmentDays(resolution.context.personality.values.temperament, outcomeId)

  const outcome = createDelegationOutcome({
    id: outcomeId,
    responsibilityId: resolution.responsibilityId,
    staffId: resolution.staffId,
    decidedOn: world.currentDate,
    kind,
    applied: false,
    qualityScore,
    payload: {
      injuryId,
      playerId,
      baseExpectedReturnDate: injury.expectedReturnDate,
      recommendedExtraDays,
    },
  })
  return { ...world, delegationOutcomesById: { ...world.delegationOutcomesById, [outcomeId]: outcome } }
}

/**
 * Deterministic, bounded, personality-influenced direction: a low-`temperament` (calm,
 * even-keeled) medical professional recommends more caution/margin (higher extra days); a
 * high-`temperament` one recommends less (docs §10.3's "conservative vs aggressive" hook, mapped
 * onto the existing `temperament` dimension since the spec does not add a new one). The seeded
 * jitter term keeps the exact day count reproducible per outcome id without ever exceeding the
 * frozen `[MIN_MEDICAL_ADJUSTMENT_DAYS, MAX_MEDICAL_ADJUSTMENT_DAYS]` band.
 */
function recommendMedicalAdjustmentDays(temperament: number, outcomeId: DelegationOutcomeId): number {
  const conservativeBias = ((50 - temperament) / 50) * MAX_MEDICAL_ADJUSTMENT_DAYS
  const random = new SeededRandomSource(hashStringToSeed(`medical-adjustment-v1:${outcomeId}`))
  const jitter = random.nextFloat(-1, 1)
  const raw = conservativeBias + jitter
  return Math.max(MIN_MEDICAL_ADJUSTMENT_DAYS, Math.min(MAX_MEDICAL_ADJUSTMENT_DAYS, Math.round(raw)))
}

export type AcceptMedicalRecommendationFailureReason = 'notFound' | 'invalidKind' | 'alreadyApplied' | 'injuryNotFound' | 'malformedPayload' | 'outOfBounds'
export type AcceptMedicalRecommendationResult = { readonly ok: true; readonly world: GameWorld } | { readonly ok: false; readonly reason: AcceptMedicalRecommendationFailureReason }

/**
 * Sole canonical application seam for a medical `DelegationOutcome` (docs §17-18). Atomic: either
 * returns a fully updated world (`InjuryRecord.expectedReturnDate` adjusted, outcome marked
 * `applied: true`) or a typed failure with no mutation at all — never a partial update.
 *
 * Critically computes the new return date as `baseExpectedReturnDate + recommendedExtraDays` (the
 * value frozen in the outcome payload at recommendation time), never
 * `currentExpectedReturnDate + recommendedExtraDays` — this is what prevents unbounded stacking
 * when both `returnToPlayRecommendation` and `treatmentRecommendation` exist for the same injury
 * and are each accepted independently.
 */
export function acceptMedicalRecommendation(world: GameWorld, outcomeId: DelegationOutcomeId): AcceptMedicalRecommendationResult {
  const outcome = world.delegationOutcomesById[outcomeId]
  if (outcome === undefined) return { ok: false, reason: 'notFound' }
  if (!MEDICAL_RECOMMENDATION_KINDS.includes(outcome.kind as MedicalRecommendationKind)) return { ok: false, reason: 'invalidKind' }
  if (outcome.applied) return { ok: false, reason: 'alreadyApplied' }

  const { injuryId, playerId, baseExpectedReturnDate, recommendedExtraDays } = outcome.payload
  if (typeof injuryId !== 'string' || typeof playerId !== 'string' || typeof baseExpectedReturnDate !== 'string' || typeof recommendedExtraDays !== 'number' || !Number.isInteger(recommendedExtraDays)) return { ok: false, reason: 'malformedPayload' }
  if (recommendedExtraDays < MIN_MEDICAL_ADJUSTMENT_DAYS || recommendedExtraDays > MAX_MEDICAL_ADJUSTMENT_DAYS) return { ok: false, reason: 'outOfBounds' }

  const injury = world.injuriesById[injuryId as InjuryId]
  if (injury === undefined || injury.playerId !== playerId) return { ok: false, reason: 'injuryNotFound' }

  let baseDate: GameDate
  try { baseDate = parseGameDate(baseExpectedReturnDate) } catch { return { ok: false, reason: 'malformedPayload' } }

  const newReturnDate = addDays(baseDate, recommendedExtraDays)
  if (compareGameDates(newReturnDate, injury.injuredOn) <= 0) return { ok: false, reason: 'outOfBounds' }

  const updatedInjury = { ...injury, expectedReturnDate: newReturnDate }
  const updatedOutcome: DelegationOutcome = { ...outcome, applied: true }
  return {
    ok: true,
    world: updateGameWorld(world, { injuries: [...Object.values(world.injuriesById).filter((item) => item.id !== injury.id), updatedInjury], delegationOutcomes: [...Object.values(world.delegationOutcomesById).filter((item) => item.id !== outcomeId), updatedOutcome] }),
  }
}
