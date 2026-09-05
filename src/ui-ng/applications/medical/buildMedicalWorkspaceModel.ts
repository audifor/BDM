import { compareGameDates } from '@/domain/date'
import { formatInjuryKind, isInjuryActive } from '@/domain/injury'
import { getCareerFatigueForPlayer, isPlayerAvailable, type GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { getMedicalRiskAssessments } from '@/engine/injury/MedicalRiskAssessment'
import {
  INJURY_SEVERITY_LABELS,
  MEDICAL_RISK_BAND_LABELS,
  type MedicalHistoryRow,
  type MedicalInjuredRow,
  type MedicalRiskRow,
  type MedicalStaffRow,
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

function injurySourceLabel(world: GameWorld, sourceGameId: string | undefined): string {
  if (sourceGameId === undefined) return '—'
  const game = world.games[sourceGameId as never]
  return game === undefined ? 'Match' : `Match · ${formatGameDateLabel(game.date)}`
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
      sourceLabel: injurySourceLabel(world, injury.sourceGameId),
      injuredOnLabel: formatGameDateLabel(injury.injuredOn),
      expectedReturnLabel: formatGameDateLabel(injury.expectedReturnDate),
      daysRemaining: calendarDaysBetween(world.currentDate, injury.expectedReturnDate),
      durationLabel: formatDurationLabel(calendarDaysBetween(injury.injuredOn, injury.expectedReturnDate)),
    }))

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
      sourceLabel: injurySourceLabel(world, injury.sourceGameId),
      injuredOnLabel: formatGameDateLabel(injury.injuredOn),
      expectedReturnLabel: formatGameDateLabel(injury.expectedReturnDate),
      statusLabel: isInjuryActive(injury, world.currentDate) ? 'Active' : 'Recovered',
      durationLabel: formatDurationLabel(calendarDaysBetween(injury.injuredOn, injury.expectedReturnDate)),
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
    history,
    risk,
    staff,
  }
}
