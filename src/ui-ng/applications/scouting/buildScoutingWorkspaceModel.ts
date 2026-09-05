import { organizationIdForTeam, type PlayerId, type StaffPersonId } from '@/domain/ids'
import {
  deriveOrganizationPlayerValuation,
  formatRatingEvaluation,
  getOrganizationRatingEvaluation,
} from '@/domain/intelligence'
import type { GameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { getPlayerKnowledgeSummary } from '@/engine/scouting'
import { findTeamForPlayer, formatGameDateLabel } from '@/ui-ng/applications/player/data/presentationHelpers'
import {
  formatAssessedDate,
  formatPercentLabel,
  KNOWLEDGE_BOARD_DIMENSIONS,
  knowledgeDimensionLabel,
  scoutingMissionLabel,
  scoutingPriorityLabel,
  scoutingStatusLabel,
  type ScoutingAssignmentRow,
  type ScoutingKnowledgeRow,
  type ScoutingOppositionRow,
  type ScoutingReportFinding,
  type ScoutingReportRow,
  type ScoutingWorkspaceModel,
} from '@/ui-ng/applications/scouting/scoutingWorkspaceModel'

function playerName(world: GameWorld, playerId: PlayerId): string {
  const player = world.players[playerId]
  return player === undefined ? 'Unknown player' : `${player.firstName} ${player.lastName}`
}

function staffName(world: GameWorld, staffId: string): string {
  const staff = world.staffPeopleById[staffId as StaffPersonId]
  return staff === undefined ? 'Unknown evaluator' : `${staff.identity.firstName} ${staff.identity.lastName}`
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right)
}

export function buildScoutingWorkspaceModel(world: GameWorld): ScoutingWorkspaceModel | null {
  const team = getUserTeam(world)
  if (team === undefined) return null

  const organizationId = organizationIdForTeam(team.id)
  const ownRoster = new Set(team.rosterPlayerIds)
  const subjectIds = new Set<PlayerId>([
    ...world.organizationKnowledge
      .filter((entry) => entry.organizationId === organizationId)
      .map((entry) => entry.subjectPlayerId),
    ...team.rosterPlayerIds,
  ])

  const canRequestScouting = Object.values(world.teamStaffAssignmentsById).some(
    (assignment) => assignment.teamId === team.id && assignment.role === 'regionalScout',
  )
  const openQuickLookByPlayer = new Set(
    Object.values(world.scoutingAssignmentsById)
      .filter(
        (assignment) =>
          assignment.organizationId === organizationId &&
          assignment.missionType === 'QUICK_LOOK' &&
          (assignment.status === 'QUEUED' || assignment.status === 'ACTIVE'),
      )
      .map((assignment) => assignment.subjectPlayerId),
  )

  const knowledge = [...subjectIds]
    .map((playerId) => {
      const player = world.players[playerId]
      if (player === undefined) return null
      const summary = getPlayerKnowledgeSummary(world, organizationId, playerId)
      const club = findTeamForPlayer(world, playerId)
      const evaluations = KNOWLEDGE_BOARD_DIMENSIONS.map((dimension) => {
        const evaluation = getOrganizationRatingEvaluation({
          organizationId,
          playerId,
          dimension,
          knowledge: world.organizationKnowledge,
          currentDate: world.currentDate,
          publicPosition: player.basketball.primaryPosition,
        })
        return {
          dimension,
          label: knowledgeDimensionLabel(dimension),
          evaluationLabel: formatRatingEvaluation(evaluation),
        }
      })
      const hasKnowledge = summary.knownDomains.length > 0
      const valuation = hasKnowledge
        ? deriveOrganizationPlayerValuation({
            organizationId,
            playerId,
            knowledge: world.organizationKnowledge,
            currentDate: world.currentDate,
            context: 'ROSTER',
            publicPosition: player.basketball.primaryPosition,
            policy: world.organizationEvaluationPoliciesById[organizationId],
          })
        : null
      const row: ScoutingKnowledgeRow = {
        playerId,
        name: `${player.firstName} ${player.lastName}`,
        position: player.basketball.primaryPosition,
        clubName: club?.name ?? 'Free agent',
        isOwnRoster: ownRoster.has(playerId),
        coverageLabel: formatPercentLabel(summary.overallCoverage),
        confidenceLabel: formatPercentLabel(summary.overallConfidence),
        freshnessLabel: formatPercentLabel(summary.freshness),
        disagreement: summary.disagreement,
        knownDomains: summary.knownDomains,
        lastAssessedLabel: formatAssessedDate(summary.lastAssessedAt, formatGameDateLabel),
        evaluations,
        valuationCurrent: valuation?.currentValue ?? null,
        valuationCertainty: valuation?.certainty ?? null,
        valuationRisk: valuation?.risk ?? null,
        hasOpenQuickLook: openQuickLookByPlayer.has(playerId),
      }
      return row
    })
    .filter((row): row is ScoutingKnowledgeRow => row !== null)
    .sort((left, right) => Number(right.isOwnRoster) - Number(left.isOwnRoster) || compareText(left.name, right.name))

  const assignments: ScoutingAssignmentRow[] = Object.values(world.scoutingAssignmentsById)
    .filter((assignment) => assignment.organizationId === organizationId)
    .map((assignment) => ({
      id: assignment.id,
      playerId: assignment.subjectPlayerId,
      playerName: playerName(world, assignment.subjectPlayerId),
      missionLabel: scoutingMissionLabel(assignment.missionType),
      status: assignment.status,
      statusLabel: scoutingStatusLabel(assignment.status),
      priority: assignment.priority,
      priorityLabel: scoutingPriorityLabel(assignment.priority),
      evaluatorName: staffName(world, assignment.evaluatorStaffId),
      createdLabel: formatGameDateLabel(assignment.createdAt),
      expectedLabel: assignment.expectedCompletionAt === undefined ? null : formatGameDateLabel(assignment.expectedCompletionAt),
    }))
    .sort((left, right) => {
      const statusOrder = { ACTIVE: 0, QUEUED: 1, COMPLETED: 2, CANCELLED: 3 }
      return statusOrder[left.status] - statusOrder[right.status] || compareText(left.playerName, right.playerName)
    })

  const reports: ScoutingReportRow[] = Object.values(world.evaluatorReportsById)
    .filter((report) => report.organizationId === organizationId)
    .map((report) => {
      const player = world.players[report.subjectPlayerId]
      const findings: ScoutingReportFinding[] = report.findings.map((finding) => {
        const evaluation = getOrganizationRatingEvaluation({
          organizationId,
          playerId: report.subjectPlayerId,
          dimension: finding.dimension,
          knowledge: world.organizationKnowledge,
          currentDate: world.currentDate,
          publicPosition: player?.basketball.primaryPosition,
        })
        return {
          dimension: finding.dimension,
          dimensionLabel: knowledgeDimensionLabel(finding.dimension),
          evaluationLabel: formatRatingEvaluation(evaluation),
        }
      })
      return {
        id: report.id,
        playerId: report.subjectPlayerId,
        playerName: playerName(world, report.subjectPlayerId),
        missionLabel: scoutingMissionLabel(report.missionType),
        evaluatorName: staffName(world, report.evaluatorStaffId),
        createdLabel: formatGameDateLabel(report.createdAt),
        tacticalFitLabel: report.tacticalFit === undefined ? null : String(report.tacticalFit),
        findings,
      }
    })
    .sort((left, right) => compareText(right.createdLabel, left.createdLabel) || compareText(left.playerName, right.playerName))

  const opposition: ScoutingOppositionRow[] = Object.values(world.oppositionScoutingReportsById)
    .filter((report) => report.teamId === team.id)
    .map((report) => {
      const opponent = world.teams[report.opponentTeamId]
      const game = world.games[report.gameId]
      return {
        id: report.id,
        opponentName: opponent?.name ?? 'Unknown opponent',
        gameDateLabel: game === undefined ? formatGameDateLabel(report.generatedOn) : formatGameDateLabel(game.date),
        qualityScore: report.qualityScore,
        emphasisLabel:
          report.recommendedDefensiveEmphasis === undefined
            ? null
            : report.recommendedDefensiveEmphasis === 'perimeter'
              ? 'Perimeter'
              : 'Interior',
        paceLabel:
          report.recommendedPaceAdjustment === undefined
            ? null
            : report.recommendedPaceAdjustment > 0
              ? `+${report.recommendedPaceAdjustment}`
              : String(report.recommendedPaceAdjustment),
        authoredBy: staffName(world, report.authoredByStaffId),
        flaggedPlayers: report.flaggedPlayerIds.map((playerId) => ({
          playerId,
          name: playerName(world, playerId),
        })),
      }
    })
    .sort((left, right) => compareText(right.gameDateLabel, left.gameDateLabel) || compareText(left.opponentName, right.opponentName))

  return {
    teamName: team.name,
    organizationLabel: 'Organization knowledge',
    knownSubjectCount: knowledge.filter((row) => row.knownDomains.length > 0).length,
    openAssignmentCount: assignments.filter((row) => row.status === 'QUEUED' || row.status === 'ACTIVE').length,
    reportCount: reports.length,
    oppositionCount: opposition.length,
    canRequestScouting,
    requestUnavailableLabel: canRequestScouting ? null : 'No scouting staff assigned to this club',
    knowledge,
    assignments,
    reports,
    opposition,
  }
}
