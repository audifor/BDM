import { injuryLifecycleStatus } from '@/domain/injury'
import type { GameWorld } from '@/domain/world'
import { acceptMedicalRecommendation } from './MedicalAdvisory'
import { reviewReturnToPlay } from './ReturnToPlayEngine'

export interface AiMedicalDecisionEvidence {
  readonly teamId: string
  readonly injuryId: string
  readonly action: 'RECOMMENDATION_ACCEPTED' | 'CLEARED_FOR_PLAY'
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

  const due = Object.values(next.injuriesById)
    .filter((injury) => injuryLifecycleStatus(injury, next.currentDate) === 'RTP_REVIEW_DUE')
    .sort((a, b) => a.id.localeCompare(b.id))
  for (const injury of due) {
    const team = Object.values(next.teams).find((candidate) => candidate.rosterPlayerIds.includes(injury.playerId))
    if (team === undefined || team.coachId === next.userCoachId) continue
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
