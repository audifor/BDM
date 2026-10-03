import type { PlayerId, StaffPersonId } from '@/domain/ids'
import { getPlayerAge, PLAYER_RATING_FAMILY_KEYS, playerRatingScoutingFamily, ratingKeyFromKnowledgeDimension, type PlayerTruthRatingKey } from '@/domain/player'
import { getPlayerKnowledgeSummary, activeWorkload } from '@/engine/scouting'
import { getScoutingTerritoryCoverage, getScoutingTerritoryAssignments, getScoutingCandidatesForUser, getValidScoutingTerritories, getAvailableScoutingEvaluators } from '@/app/scouting'
import { getUserTeam } from '@/engine/calendar'
import { calculateStaffWorkload, type GameWorld } from '@/domain/world'
import { STAFF_ROLE_LABELS, staffQualityBand } from '@/ui/staffPresentation'
import { findTeamForPlayer, formatGameDateLabel } from '@/ui-ng/applications/player/data/presentationHelpers'
import { formatPercentLabel, knowledgeDimensionLabel, scoutingMissionLabel, scoutingPriorityLabel, scoutingStatusLabel, type ScoutingAssignmentRow, type ScoutingCoverageRow, type ScoutingKnowledgeRow, type ScoutingOppositionRow, type ScoutingReportDetail, type ScoutingReportFinding, type ScoutingReportRow, type ScoutingWorkspaceModel } from '@/ui-ng/applications/scouting/scoutingWorkspaceModel'
import { SCOUTING_TERRITORY_WORKLOAD_COST, type ScoutingTerritory } from '@/domain/scouting'

function playerName(world: GameWorld, playerId: PlayerId): string {
  const player = world.players[playerId]
  return player === undefined ? 'Unknown player' : `${player.firstName} ${player.lastName}`
}

function staffName(world: GameWorld, staffId: string): string {
  const staff = world.staffPeopleById[staffId as StaffPersonId]
  return staff === undefined ? 'Unknown evaluator' : `${staff.identity.firstName} ${staff.identity.lastName}`
}

function staffRoleAtDate(world: GameWorld, staffId: StaffPersonId, date: string): string {
  const history = (world.staffCareerHistoryByStaffId[staffId] ?? []).filter((entry) => entry.date <= date).sort((left, right) => right.date.localeCompare(left.date))
  const latest = history[0]
  if (latest?.kind === 'appointment') return STAFF_ROLE_LABELS[latest.roleId]
  return Object.values(world.teamStaffAssignmentsById).find((item) => item.staffPersonId === staffId)?.role ?? 'Role not recorded'
}

function roleLabel(world: GameWorld, staffId: StaffPersonId, date: string): string {
  const role = staffRoleAtDate(world, staffId, date)
  return STAFF_ROLE_LABELS[role as keyof typeof STAFF_ROLE_LABELS] ?? role
}

function competitionForPlayer(world: GameWorld, playerId: PlayerId): string {
  const team = findTeamForPlayer(world, playerId)
  if (team === undefined) return '—'
  const competition = Object.values(world.competitions).filter((item) => item.participantTeamIds.includes(team.id)).sort((a, b) => a.id.localeCompare(b.id))[0]
  return competition?.name ?? '—'
}

function labelTerritory(world: GameWorld, territory: ScoutingTerritory): string {
  if (territory.kind === 'COUNTRY') return world.countries[territory.countryId]?.name ?? territory.countryId
  return world.competitions[territory.competitionId]?.name ?? territory.competitionId
}

const missionCost: Readonly<Record<string, number>> = { QUICK_LOOK: 1, FULL_REPORT: 4, SKILL_EVALUATION: 2, POTENTIAL_EVALUATION: 2, TACTICAL_FIT: 2, LIVE_GAME: 2 }

export function buildScoutingWorkspaceModel(world: GameWorld): ScoutingWorkspaceModel | null {
  const team = getUserTeam(world)
  if (team === undefined) return null
  const organizationId = team.organizationId
  const availablePlayerIds = getScoutingCandidatesForUser(world)
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
      evaluatorRoleLabel: roleLabel(world, assignment.evaluatorStaffId, assignment.createdAt),
      sourceLabel: assignment.requestedBy === 'SCOUTING_DEPARTMENT' ? 'Department' : 'Head coach',
      workloadLabel: `${missionCost[assignment.missionType] ?? 0} units`,
      createdLabel: formatGameDateLabel(assignment.createdAt),
      expectedLabel: assignment.expectedCompletionAt === undefined ? null : formatGameDateLabel(assignment.expectedCompletionAt),
    }))
    .sort((left, right) => {
      const statusOrder = { ACTIVE: 0, QUEUED: 1, COMPLETED: 2, CANCELLED: 3 }
      return statusOrder[left.status] - statusOrder[right.status] || left.priority.localeCompare(right.priority) || left.playerName.localeCompare(right.playerName)
    })
  const assignmentsByPlayer = new Map<PlayerId, ScoutingAssignmentRow>()
  for (const row of assignments) if (row.status === 'QUEUED' || row.status === 'ACTIVE') assignmentsByPlayer.set(row.playerId, row)

  const knowledge: ScoutingKnowledgeRow[] = availablePlayerIds.flatMap((playerId) => {
    const player = world.players[playerId]
    if (player === undefined) return []
    const summary = getPlayerKnowledgeSummary(world, organizationId, playerId)
    const stored = world.organizationKnowledge.find((entry) => entry.organizationId === organizationId && entry.subjectPlayerId === playerId)
    const ratingCount = Object.keys(stored?.dimensions ?? {}).filter((dimension) => dimension.startsWith('rating:')).length
    const discovered = Object.values(world.organizationPlayerAwarenessById).some((entry) => entry.organizationId === organizationId && entry.playerId === playerId)
    const knowledgeState: ScoutingKnowledgeRow['knowledgeState'] = ratingCount >= Object.keys(PLAYER_RATING_FAMILY_KEYS).reduce((sum, family) => sum + PLAYER_RATING_FAMILY_KEYS[family as keyof typeof PLAYER_RATING_FAMILY_KEYS].length, 0)
      ? 'DETAILED'
      : ratingCount > 0 ? 'PARTIAL' : summary.knownDomains.length > 0 ? 'QUICK_LOOK' : discovered ? 'DISCOVERED' : 'UNKNOWN'
    const club = findTeamForPlayer(world, playerId)
    const countryName = club === undefined ? '—' : world.countries[club.countryId]?.name ?? club.countryId
    return [{
      playerId,
      name: `${player.firstName} ${player.lastName}`,
      position: player.basketball.primaryPosition,
      clubName: club?.name ?? 'Free agent',
      countryName,
      competitionName: competitionForPlayer(world, playerId),
      age: getPlayerAge(world, playerId),
      isOwnRoster: team.rosterPlayerIds.includes(playerId),
      knowledgeState,
      discovered,
      coverageLabel: summary.knownDomains.length === 0 ? '—' : formatPercentLabel(summary.overallCoverage),
      confidenceLabel: summary.knownDomains.length === 0 ? '—' : formatPercentLabel(summary.overallConfidence),
      freshnessLabel: summary.knownDomains.length === 0 ? '—' : formatPercentLabel(summary.freshness),
      disagreement: summary.disagreement,
      knownDomains: summary.knownDomains,
      knownRatingCount: ratingCount,
      lastAssessedLabel: summary.lastAssessedAt === undefined ? null : formatGameDateLabel(summary.lastAssessedAt),
      activeAssignment: assignmentsByPlayer.get(playerId) ?? null,
      valuationCurrent: null,
      valuationCertainty: null,
      valuationRisk: null,
    }]
  }).sort((left, right) => Number(right.isOwnRoster) - Number(left.isOwnRoster) || left.name.localeCompare(right.name))

  const reports: ScoutingReportRow[] = Object.values(world.evaluatorReportsById)
    .filter((report) => report.organizationId === organizationId)
    .map((report) => {
      const findings = report.findings.map((finding) => ({ dimension: finding.dimension, dimensionLabel: knowledgeDimensionLabel(finding.dimension), evaluationLabel: `${Math.max(1, finding.estimate - finding.uncertainty)}–${Math.min(100, finding.estimate + finding.uncertainty)}` }))
      const evidence = report.evidenceIds.map((id) => world.evidenceById[id]).filter((item) => item !== undefined)
      const confidence = report.findings.reduce((sum, finding) => sum + finding.confidence, 0) / Math.max(1, report.findings.length)
      const uncertainty = report.findings.reduce((sum, finding) => sum + finding.uncertainty, 0) / Math.max(1, report.findings.length)
      const coverage = report.findings.reduce((sum, finding) => sum + finding.coverageContribution, 0) / Math.max(1, report.findings.length)
      return {
        id: report.id,
        playerId: report.subjectPlayerId,
        playerName: playerName(world, report.subjectPlayerId),
        missionLabel: scoutingMissionLabel(report.missionType),
        evaluatorName: staffName(world, report.evaluatorStaffId),
        evaluatorRoleLabel: roleLabel(world, report.evaluatorStaffId, report.createdAt),
        createdLabel: formatGameDateLabel(report.createdAt),
        confidenceLabel: `${Math.round(confidence)}%`,
        uncertaintyLabel: `±${Math.round(uncertainty)}`,
        coverageLabel: `${Math.round(coverage * 100)}%`,
        evidenceSourceLabel: evidence.map((item) => item.source.replaceAll('_', ' ')).join(', ') || 'Evidence unavailable',
        findingCount: report.findings.length,
        tacticalFitLabel: report.tacticalFit === undefined ? null : String(report.tacticalFit),
        findings,
      }
    }).sort((left, right) => right.createdLabel.localeCompare(left.createdLabel) || left.playerName.localeCompare(right.playerName))

  const coverage: ScoutingCoverageRow[] = getScoutingTerritoryAssignments(world, team.id).map((assignment) => {
    const projection = getScoutingTerritoryCoverage(world, organizationId, assignment.territory)
    const workload = calculateStaffWorkload(world, assignment.scoutStaffId)
    return {
      id: assignment.id,
      assignment,
      territoryLabel: labelTerritory(world, assignment.territory),
      territoryTypeLabel: assignment.territory.kind === 'COUNTRY' ? 'Country' : 'Competition',
      scoutName: staffName(world, assignment.scoutStaffId),
      scoutRoleLabel: roleLabel(world, assignment.scoutStaffId, assignment.startedAt),
      coverageLabel: `${Math.round(projection.coverage * 100)}%`,
      knownEligibleLabel: `${projection.knownPlayerCount} / ${projection.eligiblePlayerCount}`,
      workloadLabel: `${activeWorkload(world, assignment.scoutStaffId)} / ${workload.capacityLimit} units`,
    }
  }).sort((a, b) => Number(b.assignment.status === 'ACTIVE') - Number(a.assignment.status === 'ACTIVE') || a.territoryLabel.localeCompare(b.territoryLabel))

  const opposition: ScoutingOppositionRow[] = Object.values(world.oppositionScoutingReportsById)
    .filter((report) => report.teamId === team.id)
    .map((report) => {
      const opponent = world.teams[report.opponentTeamId]
      const game = world.games[report.gameId]
      const outcome = Object.values(world.delegationOutcomesById).find((item) => item.payload.reportId === report.id)
      const role = outcome?.staffRoleIdAtDecision ?? world.staffEmploymentByStaffId[report.authoredByStaffId]?.roleId
      return { id: report.id, opponentName: opponent?.name ?? 'Unknown opponent', gameDateLabel: formatGameDateLabel(game?.date ?? report.generatedOn), qualityScore: report.qualityScore, emphasisLabel: report.recommendedDefensiveEmphasis === undefined ? null : report.recommendedDefensiveEmphasis === 'perimeter' ? 'Perimeter' : 'Interior', paceLabel: report.recommendedPaceAdjustment === undefined ? null : report.recommendedPaceAdjustment > 0 ? `+${report.recommendedPaceAdjustment}` : String(report.recommendedPaceAdjustment), authoredBy: staffName(world, report.authoredByStaffId), authorRoleLabel: role === undefined ? 'Role not recorded' : STAFF_ROLE_LABELS[role], qualityLabel: staffQualityBand(report.qualityScore), flaggedPlayers: report.flaggedPlayerIds.map((id) => ({ playerId: id, name: playerName(world, id) })) }
    }).sort((a, b) => b.gameDateLabel.localeCompare(a.gameDateLabel) || a.opponentName.localeCompare(b.opponentName))

  const eligibleQuickScouts = getAvailableScoutingEvaluators(world, team.id, 'QUICK_LOOK')
  return {
    teamName: team.name,
    organizationLabel: 'Organization knowledge',
    knownSubjectCount: knowledge.filter((row) => row.knownDomains.length > 0).length,
    openAssignmentCount: assignments.filter((row) => row.status === 'QUEUED' || row.status === 'ACTIVE').length,
    reportCount: reports.length,
    oppositionCount: opposition.length,
    territoryCount: coverage.filter((row) => row.assignment.status === 'ACTIVE').length,
    candidateCount: knowledge.length,
    canRequestScouting: eligibleQuickScouts.length > 0,
    requestUnavailableLabel: eligibleQuickScouts.length === 0 ? 'No eligible employed Scout has available capacity.' : null,
    knowledge,
    assignments,
    reports,
    coverage,
    validTerritories: getValidScoutingTerritories(world),
    opposition,
  }
}

export function buildScoutingReportDetail(world: GameWorld, reportId: string): ScoutingReportDetail | undefined {
  const report = world.evaluatorReportsById[reportId]
  if (report === undefined) return undefined
  const summary = buildScoutingWorkspaceModel(world)?.reports.find((row) => row.id === reportId)
  if (summary === undefined) return undefined
  const broadFindings = report.findings.filter((finding) => !finding.dimension.startsWith('rating:') && !finding.dimension.startsWith('potential:')).map((finding) => ({ label: knowledgeDimensionLabel(finding.dimension), estimate: finding.estimate, uncertainty: finding.uncertainty, confidence: finding.confidence }))
  const potentialFindings = report.findings.filter((finding) => finding.dimension.startsWith('potential:')).map((finding) => ({ label: knowledgeDimensionLabel(finding.dimension), estimate: finding.estimate, uncertainty: finding.uncertainty, confidence: finding.confidence }))
  const grouped = new Map<string, { label: string; findings: { key: string; label: string; estimate: number; uncertainty: number; confidence: number }[] }>()
  for (const finding of report.findings.filter((item) => item.dimension.startsWith('rating:'))) {
    const key = ratingKeyFromKnowledgeDimension(finding.dimension)
    if (key === undefined) continue
    const family = playerRatingScoutingFamily(key as PlayerTruthRatingKey)
    if (family === undefined) continue
    const label = family.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (value) => value.toUpperCase())
    const entry = grouped.get(family) ?? { label, findings: [] }
    entry.findings.push({ key, label: knowledgeDimensionLabel(finding.dimension), estimate: finding.estimate, uncertainty: finding.uncertainty, confidence: finding.confidence })
    grouped.set(family, entry)
  }
  return { ...summary, evidence: report.evidenceIds.map((id) => world.evidenceById[id]).filter((item) => item !== undefined), families: [...grouped.entries()].map(([id, item]) => ({ id, ...item })), broadFindings, potentialFindings }
}
