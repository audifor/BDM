import { isInjuryActive, injuryLifecycleStatus } from '@/domain/injury'
import type { GameWorld } from '@/domain/world'
import { acceptMedicalRecommendation } from './MedicalAdvisory'
import { reviewReturnToPlay } from './ReturnToPlayEngine'
import { conductFitnessTest, hasPassedRequiredFitnessTest, injuryRequiresFitnessTest } from './FitnessTest'
import { chooseAiRehabilitationMode, setRehabilitationPlan } from './Rehabilitation'

export interface AiMedicalDecisionEvidence {
  readonly teamId: string
  readonly injuryId: string
  readonly action: 'RECOMMENDATION_ACCEPTED' | 'REHABILITATION_SELECTED' | 'FITNESS_TEST_PASSED' | 'FITNESS_TEST_DEFERRED' | 'CLEARED_FOR_PLAY'
  readonly sourceId: string
}

/** AI teams resolve Staff advice through the same medical recommendation seam, then review due injuries. */
export function progressAiMedicalLifecycle(world: GameWorld): { readonly world: GameWorld; readonly decisions: readonly AiMedicalDecisionEvidence[] } {
  let next = world
  const decisions: AiMedicalDecisionEvidence[] = []
  const medicalOutcomes = Object.values(next.delegationOutcomesById)
    .filter((outcome) => outcome.kind === 'returnToPlayRecommendation' || outcome.kind === 'treatmentRecommendation')
    .filter((outcome) => !outcome.applied && outcome.userDisposition === undefined)
    .sort((a, b) => a.id.localeCompare(b.id))

  for (const outcome of medicalOutcomes) {
    const responsibility = next.responsibilitiesById[outcome.responsibilityId]
    const team = responsibility === undefined ? undefined : next.teams[responsibility.teamId]
    if (team === undefined || team.coachId === next.userCoachId) continue
    const accepted = acceptMedicalRecommendation(next, outcome.id)
    if (!accepted.ok) continue
    next = accepted.world
    decisions.push({ teamId: team.id, injuryId: String(outcome.payload.injuryId), action: 'RECOMMENDATION_ACCEPTED', sourceId: outcome.id })
  }

  for (const injury of Object.values(next.injuriesById).sort((a, b) => a.id.localeCompare(b.id))) {
    // isInjuryActive also excludes a not-yet-occurred injury (a Game resolved ahead of the clock), whose
    // rehabilitation chronology cannot begin before its injuredOn.
    if (!isInjuryActive(injury, next.currentDate)) continue
    const team = Object.values(next.teams).find((candidate) => candidate.rosterPlayerIds.includes(injury.playerId))
    if (team === undefined || team.coachId === next.userCoachId) continue
    const mode = chooseAiRehabilitationMode(next, injury.id)
    if (mode === undefined || injury.rehabilitation?.mode === mode) continue
    const result = setRehabilitationPlan(next, { injuryId: injury.id, mode, actor: { kind: 'AI', teamId: team.id } })
    if (!result.ok) continue
    next = result.world
    decisions.push({ teamId: team.id, injuryId: injury.id, action: 'REHABILITATION_SELECTED', sourceId: injury.id })
  }

  const due = Object.values(next.injuriesById)
    .filter((injury) => injuryLifecycleStatus(injury, next.currentDate) === 'RTP_REVIEW_DUE')
    .sort((a, b) => a.id.localeCompare(b.id))
  for (const injury of due) {
    const team = Object.values(next.teams).find((candidate) => candidate.rosterPlayerIds.includes(injury.playerId))
    if (team === undefined || team.coachId === next.userCoachId) continue
    if (injuryRequiresFitnessTest(next, injury) && !hasPassedRequiredFitnessTest(next, injury)) {
      const test = conductFitnessTest(next, { injuryId: injury.id, actor: { kind: 'AI', teamId: team.id } })
      if (test.ok) {
        next = test.world
        decisions.push({ teamId: team.id, injuryId: injury.id, action: test.record.result === 'PASS' ? 'FITNESS_TEST_PASSED' : 'FITNESS_TEST_DEFERRED', sourceId: test.record.id })
      }
      if (!test.ok || test.record.result !== 'PASS') continue
    }
    const latestAdvice = Object.values(next.delegationOutcomesById)
      .filter((outcome) => (outcome.kind === 'returnToPlayRecommendation' || outcome.kind === 'treatmentRecommendation') && outcome.payload.injuryId === injury.id)
      .sort((a, b) => b.decidedOn.localeCompare(a.decidedOn) || a.id.localeCompare(b.id))[0]
    const result = reviewReturnToPlay(next, {
      injuryId: injury.id,
      decision: 'CLEAR_FOR_PLAY',
      actor: { kind: 'AI', teamId: team.id },
      ...(latestAdvice === undefined ? {} : { staffId: latestAdvice.staffId, recommendationOutcomeId: latestAdvice.id }),
    })
    if (!result.ok) continue
    next = result.world
    decisions.push({ teamId: team.id, injuryId: injury.id, action: 'CLEARED_FOR_PLAY', sourceId: injury.id })
  }
  return { world: next, decisions }
}
