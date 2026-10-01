import { addDays, compareGameDates, type GameDate } from '@/domain/date'
import { hasPriorRelatedInjury, injuryLifecycleStatus, requiresFitnessTestForSeverity, type FitnessTestRecord, type InjuryRecord, type MedicalActionActor } from '@/domain/injury'
import type { InjuryId } from '@/domain/ids'
import { getCareerFatigueForPlayer, updateGameWorld, type GameWorld } from '@/domain/world'
import { hashStringToSeed, SeededRandomSource } from '@/engine/random'
import { canMedicalActorActForPlayer } from './MedicalActionAccess'

export type ConductFitnessTestResult =
  | { readonly ok: true; readonly world: GameWorld; readonly record: FitnessTestRecord }
  | { readonly ok: false; readonly reason: 'INJURY_NOT_FOUND' | 'TEST_NOT_DUE' | 'NOT_AUTHORIZED' | 'TEST_NOT_REQUIRED' }

export function injuryRequiresFitnessTest(world: GameWorld, injury: InjuryRecord): boolean {
  const hasRelatedHistory = hasPriorRelatedInjury(injury, Object.values(world.injuriesById))
  return requiresFitnessTestForSeverity(injury.severity, hasRelatedHistory)
}

export function hasPassedRequiredFitnessTest(world: GameWorld, injury: InjuryRecord): boolean {
  if (!injuryRequiresFitnessTest(world, injury)) return true
  const latest = [...(injury.fitnessTests ?? [])].sort((a, b) => b.testedOn.localeCompare(a.testedOn) || b.id.localeCompare(a.id))[0]
  const latestSetback = [...(injury.rehabilitationSetbacks ?? [])].sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.id.localeCompare(a.id))[0]
  return latest?.result === 'PASS' && (latestSetback === undefined || compareGameDates(latest.testedOn, latestSetback.occurredOn) > 0)
}

function staffEvidence(world: GameWorld, injury: InjuryRecord): { readonly staffId?: FitnessTestRecord['staffId']; readonly qualityScore?: number } {
  const outcome = Object.values(world.delegationOutcomesById)
    .filter((item) => (item.kind === 'treatmentRecommendation' || item.kind === 'returnToPlayRecommendation') && item.payload.injuryId === injury.id)
    .sort((a, b) => b.decidedOn.localeCompare(a.decidedOn) || a.id.localeCompare(b.id))[0]
  return outcome === undefined ? {} : { staffId: outcome.staffId, qualityScore: outcome.qualityScore }
}

export function evaluateFitnessTest(world: GameWorld, injury: InjuryRecord, testedOn: GameDate, actor: MedicalActionActor): FitnessTestRecord {
  const id = `${injury.id}:fitness:${testedOn}`
  const priorCount = injury.fitnessTests?.length ?? 0
  const seed = hashStringToSeed(`fitness-test-v1:${id}:${priorCount}`)
  const draw = new SeededRandomSource(seed).nextFloat(0, 1)
  const fatiguePenalty = getCareerFatigueForPlayer(world, injury.playerId) / 500
  const recurrencePenalty = injuryRequiresFitnessTest(world, injury) && injury.severity !== 'serious' ? .08 : injury.severity === 'serious' && injuryRequiresFitnessTest(world, injury) ? .05 : 0
  const modeAdjustment = injury.rehabilitation?.mode === 'REST' ? .04 : injury.rehabilitation?.mode === 'ACCELERATED_REHAB' ? -.04 : 0
  const evidence = staffEvidence(world, injury)
  const quality = evidence.qualityScore ?? 50
  const qualityAdjustment = (quality - 50) / 1000
  const basePassChance = injury.severity === 'serious' ? .62 : injury.severity === 'moderate' ? .72 : .84
  const passChance = Math.max(.35, Math.min(.9, basePassChance + modeAdjustment + qualityAdjustment - fatiguePenalty - recurrencePenalty))
  const result = draw < passChance ? 'PASS' : draw < passChance + .18 ? 'BORDERLINE' : 'FAIL'
  return {
    id,
    testedOn,
    result,
    actor,
    ...(evidence.staffId === undefined ? {} : { staffId: evidence.staffId }),
    ...(evidence.qualityScore === undefined ? {} : { qualityScore: evidence.qualityScore }),
  }
}

export function conductFitnessTest(
  world: GameWorld,
  request: { readonly injuryId: InjuryId; readonly actor: MedicalActionActor },
): ConductFitnessTestResult {
  const injury = world.injuriesById[request.injuryId]
  if (injury === undefined) return { ok: false, reason: 'INJURY_NOT_FOUND' }
  if (!injuryRequiresFitnessTest(world, injury)) return { ok: false, reason: 'TEST_NOT_REQUIRED' }
  if (injuryLifecycleStatus(injury, world.currentDate) !== 'RTP_REVIEW_DUE') return { ok: false, reason: 'TEST_NOT_DUE' }
  if (!canMedicalActorActForPlayer(world, injury.playerId, request.actor)) return { ok: false, reason: 'NOT_AUTHORIZED' }
  const existing = (injury.fitnessTests ?? []).find((record) => record.testedOn === world.currentDate)
  if (existing !== undefined) return { ok: true, world, record: existing }
  const record = evaluateFitnessTest(world, injury, world.currentDate, request.actor)
  const tests = [...(injury.fitnessTests ?? []), record]
  const returnToPlay = injury.returnToPlay ?? { reviewDueOn: injury.expectedReturnDate, reviews: [] }
  const nextReviewDueOn = record.result === 'PASS' ? returnToPlay.reviewDueOn : addDays(world.currentDate, 7)
  const updated = { ...injury, fitnessTests: tests, returnToPlay: { ...returnToPlay, reviewDueOn: nextReviewDueOn } }
  return { ok: true, world: updateGameWorld(world, { injuries: [...Object.values(world.injuriesById).filter((item) => item.id !== injury.id), updated] }), record }
}
