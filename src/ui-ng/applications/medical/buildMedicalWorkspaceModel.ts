import { compareGameDates } from '@/domain/date'
import { formatInjuryKind, hasPriorRelatedInjury, injuryFamilyForKind, injuryLifecycleStatus, isInjuryActive, projectedInjuryReviewDate, type RehabilitationMode } from '@/domain/injury'
import { getCareerFatigueForPlayer, isPlayerAvailable, type GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { getMedicalRiskAssessments } from '@/engine/injury/MedicalRiskAssessment'
import { hasPassedRequiredFitnessTest, injuryRequiresFitnessTest } from '@/engine/injury/FitnessTest'
import { chooseAiRehabilitationMode } from '@/engine/injury/Rehabilitation'
import {
  INJURY_SEVERITY_LABELS,
  MEDICAL_RISK_BAND_LABELS,
  type MedicalHistoryRow,
  type MedicalInjuredRow,
  type MedicalRiskRow,
  type MedicalStaffRow,
  type MedicalReturnToPlayRow,
  type MedicalWorkspaceModel,
} from '@/ui-ng/applications/medical/medicalWorkspaceModel'
import {
  calendarDaysBetween,
  fatigueLoadPresentation,
  formatDurationLabel,
} from '@/ui-ng/applications/player/data/buildPlayerMedicalModel'
import { formatGameDateLabel } from '@/ui-ng/applications/player/data/presentationHelpers'
import { formatStaffPercent } from '@/ui-ng/applications/staff/staffWorkspaceModel'
import { getStaffRecommendationsForTeam } from '@/ui/staffRecommendationPresentation'
import {
  STAFF_ROLE_LABELS,
  WORKLOAD_STATE_LABELS,
  getTeamStaffPresentation,
} from '@/ui/staffPresentation'

function playerName(world: GameWorld, playerId: string): string {
  const player = world.players[playerId as never]
  return player === undefined ? 'Unknown player' : `${player.firstName} ${player.lastName}`
}

function playerPosition(world: GameWorld, playerId: string): string {
  return world.players[playerId as never]?.basketball.primaryPosition ?? '—'
}

function injurySourceLabel(world: GameWorld, injury: import('@/domain/injury').InjuryRecord): string {
  if (injury.source === 'TRAINING') return 'Training'
  if (injury.sourceGameId === undefined) return '—'
  const game = world.games[injury.sourceGameId]
  return game === undefined ? 'Match' : `Match · ${formatGameDateLabel(game.date)}`
}

function rehabConsequence(mode: RehabilitationMode): string {
  return mode === 'REST' ? 'Safest and conservative; may delay review by up to 2 days.'
    : mode === 'ACCELERATED_REHAB' ? 'May bring review forward by up to 2 days; carries a small additional setback chance.'
      : 'Balanced recovery with the baseline review projection.'
}

export function buildMedicalWorkspaceModel(world: GameWorld): MedicalWorkspaceModel | null {
  const team = getUserTeam(world)
  if (team === undefined) return null

  const rosterIds = team.rosterPlayerIds
  const assessments = getMedicalRiskAssessments(world, team.id)
  const injuries = Object.values(world.injuriesById).filter((injury) => rosterIds.includes(injury.playerId))
  const activeInjuries = injuries.filter((injury) => isInjuryActive(injury, world.currentDate))
  const medicalStaff = getTeamStaffPresentation(world, team.id).filter((item) => item.department === 'medical')
  const openAdvisoryCount = getStaffRecommendationsForTeam(world, team.id).filter(
    (item) => item.domain === 'medical' && (item.status === 'PENDING' || item.status === 'INFORMATIONAL'),
  ).length
  const medicalRecommendations = getStaffRecommendationsForTeam(world, team.id).filter(
    (item) => item.domain === 'medical' && (item.status === 'PENDING' || item.status === 'INFORMATIONAL'),
  )

  const injured: readonly MedicalInjuredRow[] = [...activeInjuries]
    .sort(
      (left, right) =>
        compareGameDates(left.injuredOn, right.injuredOn) ||
        left.playerId.localeCompare(right.playerId) ||
        left.id.localeCompare(right.id),
    )
    .map((injury) => ({
      injuryId: injury.id,
      playerId: injury.playerId,
      playerName: playerName(world, injury.playerId),
      position: playerPosition(world, injury.playerId),
      injuryLabel: formatInjuryKind(injury.kind),
      severity: injury.severity,
      severityLabel: INJURY_SEVERITY_LABELS[injury.severity],
      sourceLabel: injurySourceLabel(world, injury),
      injuredOnLabel: formatGameDateLabel(injury.injuredOn),
      expectedReturnLabel: formatGameDateLabel(injury.expectedReturnDate),
      reviewDueLabel: formatGameDateLabel(projectedInjuryReviewDate(injury, world.currentDate)),
      fitnessTestLabel: injuryRequiresFitnessTest(world, injury) ? `Required · ${injury.fitnessTests?.at(-1)?.result ?? 'not yet tested'}` : 'Not required',
      clearedOnLabel: injury.returnToPlay?.clearedOn === undefined ? null : formatGameDateLabel(injury.returnToPlay.clearedOn),
      daysRemaining: calendarDaysBetween(world.currentDate, projectedInjuryReviewDate(injury, world.currentDate)),
      durationLabel: formatDurationLabel(calendarDaysBetween(injury.injuredOn, injury.expectedReturnDate)),
      lifecycleStatus: injuryLifecycleStatus(injury, world.currentDate) === 'RTP_REVIEW_DUE' ? 'RETURN-TO-PLAY REVIEW' : 'RECOVERING',
      fatigue: getCareerFatigueForPlayer(world, injury.playerId),
      rehabilitationMode: injury.rehabilitation?.mode ?? 'STANDARD_REHAB',
      suggestedRehabilitationMode: chooseAiRehabilitationMode(world, injury.id) ?? 'STANDARD_REHAB',
      rehabilitationConsequence: rehabConsequence(injury.rehabilitation?.mode ?? 'STANDARD_REHAB'),
      canChangeRehabilitation: injuryLifecycleStatus(injury, world.currentDate) === 'RECOVERING',
      rehabilitationHistory: (injury.rehabilitation?.history ?? []).map((change) => `${change.changedOn}: ${change.mode.replaceAll('_', ' ')} (${change.actor.kind === 'USER' ? 'User' : 'AI'})`),
      reviewHistory: (injury.returnToPlay?.reviews ?? []).map((review) => ({
        dateLabel: formatGameDateLabel(review.reviewedOn),
        decision: review.decision === 'CLEAR_FOR_PLAY' ? 'CLEAR FOR PLAY' : 'CONTINUE RECOVERY',
        actorLabel: review.actor.kind === 'USER' ? 'User' : 'AI',
      })),
    }))

  const returnToPlayReviews: readonly MedicalReturnToPlayRow[] = [...activeInjuries]
    .filter((injury) => injuryLifecycleStatus(injury, world.currentDate) === 'RTP_REVIEW_DUE')
    .map((injury) => {
      const recommendation = medicalRecommendations.find((item) => {
        const outcome = world.delegationOutcomesById[item.outcomeId]
        return outcome?.payload.injuryId === injury.id
      })
      return {
        injuryId: injury.id,
        playerId: injury.playerId,
        playerName: playerName(world, injury.playerId),
        injuryLabel: formatInjuryKind(injury.kind),
        injuredOnLabel: formatGameDateLabel(injury.injuredOn),
        expectedReturnLabel: formatGameDateLabel(injury.expectedReturnDate),
        reviewDueLabel: formatGameDateLabel(projectedInjuryReviewDate(injury, world.currentDate)),
        fatigue: getCareerFatigueForPlayer(world, injury.playerId),
        fitnessTestRequired: injuryRequiresFitnessTest(world, injury),
        fitnessTestResult: injury.fitnessTests?.at(-1)?.result ?? null,
        canClear: hasPassedRequiredFitnessTest(world, injury),
        reviewHistory: (injury.returnToPlay?.reviews ?? []).map((review) => ({
          dateLabel: formatGameDateLabel(review.reviewedOn),
          decision: review.decision === 'CLEAR_FOR_PLAY' ? 'CLEAR FOR PLAY' : 'CONTINUE RECOVERY',
          actorLabel: review.actor.kind === 'USER' ? 'User' : 'AI',
        })),
        ...(recommendation === undefined ? {} : {
          recommendationOutcomeId: recommendation.outcomeId,
          staffName: recommendation.staffName,
          staffQuality: recommendation.qualityScore,
          recommendationSummary: recommendation.summary,
        }),
      }
    })

  const history: readonly MedicalHistoryRow[] = [...injuries]
    .sort(
      (left, right) =>
        compareGameDates(right.injuredOn, left.injuredOn) ||
        left.playerId.localeCompare(right.playerId) ||
        left.id.localeCompare(right.id),
    )
    .map((injury) => ({
      injuryId: injury.id,
      playerId: injury.playerId,
      playerName: playerName(world, injury.playerId),
      injuryLabel: formatInjuryKind(injury.kind),
      severityLabel: INJURY_SEVERITY_LABELS[injury.severity],
      sourceLabel: injurySourceLabel(world, injury),
      injuredOnLabel: formatGameDateLabel(injury.injuredOn),
      expectedReturnLabel: formatGameDateLabel(injury.expectedReturnDate),
      clearedOnLabel: injury.returnToPlay?.clearedOn === undefined ? null : formatGameDateLabel(injury.returnToPlay.clearedOn),
      statusLabel: injuryLifecycleStatus(injury, world.currentDate) === 'RECOVERING' ? 'RECOVERING' : injuryLifecycleStatus(injury, world.currentDate) === 'RTP_REVIEW_DUE' ? 'RETURN-TO-PLAY REVIEW' : 'CLEARED',
      durationLabel: formatDurationLabel(calendarDaysBetween(injury.injuredOn, injury.expectedReturnDate)),
      familyLabel: injuryFamilyForKind(injury.kind).replaceAll('_', ' '),
      recurrenceLabel: hasPriorRelatedInjury(injury, Object.values(world.injuriesById)) ? 'RELATED / RECURRENT' : 'First recorded in this family',
      rehabSummary: injury.rehabilitation?.mode.replaceAll('_', ' ') ?? 'STANDARD REHAB',
      setbackSummary: (injury.rehabilitationSetbacks ?? []).map((item) => `${formatGameDateLabel(item.occurredOn)} · ${item.daysAdded} days added`).join('; ') || 'None',
      fitnessTestSummary: (injury.fitnessTests ?? []).map((test) => `${formatGameDateLabel(test.testedOn)} · ${test.result}`).join('; ') || (injuryRequiresFitnessTest(world, injury) ? 'Required; not recorded' : 'Not required'),
      clearanceLabel: injury.returnToPlay?.clearedOn === undefined ? 'Not cleared' : formatGameDateLabel(injury.returnToPlay.clearedOn),
    }))

  const risk: readonly MedicalRiskRow[] = assessments.map((assessment) => {
    const fatigue = getCareerFatigueForPlayer(world, assessment.playerId)
    return {
      playerId: assessment.playerId,
      playerName: playerName(world, assessment.playerId),
      position: playerPosition(world, assessment.playerId),
      fatigue,
      fatigueLabel: fatigueLoadPresentation(fatigue).loadLabel,
      riskScore: assessment.riskScore,
      riskBand: assessment.riskBand,
      riskBandLabel: MEDICAL_RISK_BAND_LABELS[assessment.riskBand],
      reasons: assessment.reasons,
      quality: assessment.quality ?? null,
      available: isPlayerAvailable(world, assessment.playerId),
    }
  })

  const staff: readonly MedicalStaffRow[] = medicalStaff.map((item) => ({
    staffPersonId: item.staffPersonId,
    name: item.name,
    roleLabel: STAFF_ROLE_LABELS[item.role],
    proficiency: item.roleProficiency,
    workloadLabel: WORKLOAD_STATE_LABELS[item.workloadState],
    utilizationLabel: formatStaffPercent(item.utilization),
    presentation: item,
  }))

  const fatigueTotal = rosterIds.reduce((sum, playerId) => sum + getCareerFatigueForPlayer(world, playerId), 0)

  return {
    teamId: team.id,
    teamName: team.name,
    currentDateLabel: formatGameDateLabel(world.currentDate),
    rosterCount: rosterIds.length,
    availableCount: rosterIds.filter((playerId) => isPlayerAvailable(world, playerId)).length,
    injuredCount: injured.length,
    averageFatigue: rosterIds.length === 0 ? 0 : Math.round(fatigueTotal / rosterIds.length),
    highRiskCount: risk.filter((row) => row.riskBand === 'high').length,
    elevatedRiskCount: risk.filter((row) => row.riskBand === 'elevated').length,
    lowRiskCount: risk.filter((row) => row.riskBand === 'low').length,
    medicalStaffCount: staff.length,
    openAdvisoryCount,
    injured,
    returnToPlayReviews,
    history,
    risk,
    staff,
  }
}
