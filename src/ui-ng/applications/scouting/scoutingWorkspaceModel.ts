import type { GameDate } from '@/domain/date'
import type { PlayerId } from '@/domain/ids'
import type { Evidence, ScoutingMission, ScoutingPriority, ScoutingStatus, ScoutingTerritory, ScoutingTerritoryAssignment } from '@/domain/scouting'

export const SCOUTING_WORKSPACE_TABS = ['centre', 'search', 'focuses', 'knowledge', 'assignments', 'reports', 'coverage', 'opposition'] as const
export type ScoutingWorkspaceTabId = (typeof SCOUTING_WORKSPACE_TABS)[number]

export const SCOUTING_TAB_LABELS: Readonly<Record<ScoutingWorkspaceTabId, string>> = {
  centre: 'Centre',
  search: 'Player Search',
  focuses: 'Recruitment Focuses',
  knowledge: 'Knowledge',
  assignments: 'Assignments',
  reports: 'Reports',
  coverage: 'Coverage',
  opposition: 'Opposition',
}

export const KNOWLEDGE_BOARD_DIMENSIONS = [
  'finishing',
  'shooting',
  'creation',
  'perimeterDefense',
  'interiorDefense',
  'rebounding',
  'physical',
] as const

export type KnowledgeBoardDimension = (typeof KNOWLEDGE_BOARD_DIMENSIONS)[number]

export interface ScoutingKnowledgeEvaluation {
  readonly dimension: KnowledgeBoardDimension
  readonly label: string
  readonly evaluationLabel: string
}

export interface ScoutingKnowledgeRow {
  readonly playerId: PlayerId
  readonly name: string
  readonly position: string
  readonly clubName: string
  readonly countryName: string
  readonly competitionName: string
  readonly age: number
  readonly knowledgeState: ScoutingKnowledgeState
  readonly discovered: boolean
  readonly isOwnRoster: boolean
  readonly coverageLabel: string
  readonly confidenceLabel: string
  readonly freshnessLabel: string
  readonly disagreement: 'LOW' | 'MODERATE' | 'HIGH'
  readonly knownDomains: readonly string[]
  readonly lastAssessedLabel: string | null
  readonly knownRatingCount: number
  readonly valuationCurrent: number | null
  readonly valuationCertainty: number | null
  readonly valuationRisk: number | null
  readonly activeAssignment: ScoutingAssignmentRow | null
}

export type ScoutingKnowledgeState = 'UNKNOWN' | 'DISCOVERED' | 'QUICK_LOOK' | 'PARTIAL' | 'DETAILED'

export interface ScoutingAssignmentRow {
  readonly id: string
  readonly playerId: PlayerId
  readonly playerName: string
  readonly missionLabel: string
  readonly status: ScoutingStatus
  readonly statusLabel: string
  readonly priority: ScoutingPriority
  readonly priorityLabel: string
  readonly evaluatorName: string
  readonly evaluatorRoleLabel: string
  readonly sourceLabel: string
  readonly workloadLabel: string
  readonly createdLabel: string
  readonly expectedLabel: string | null
}

export interface ScoutingReportFinding {
  readonly dimension: string
  readonly dimensionLabel: string
  readonly evaluationLabel: string
}

export interface ScoutingReportRow {
  readonly id: string
  readonly playerId: PlayerId
  readonly playerName: string
  readonly missionLabel: string
  readonly evaluatorName: string
  readonly evaluatorRoleLabel: string
  readonly createdLabel: string
  readonly confidenceLabel: string
  readonly uncertaintyLabel: string
  readonly coverageLabel: string
  readonly evidenceSourceLabel: string
  readonly findingCount: number
  readonly tacticalFitLabel: string | null
  readonly findings: readonly ScoutingReportFinding[]
}

export interface ScoutingReportDetail extends ScoutingReportRow {
  readonly evidence: readonly Evidence[]
  readonly families: readonly { readonly id: string; readonly label: string; readonly findings: readonly { readonly key: string; readonly label: string; readonly estimate: number; readonly uncertainty: number; readonly confidence: number }[] }[]
  readonly broadFindings: readonly { readonly label: string; readonly estimate: number; readonly uncertainty: number; readonly confidence: number }[]
  readonly potentialFindings: readonly { readonly label: string; readonly estimate: number; readonly uncertainty: number; readonly confidence: number }[]
}

export interface ScoutingCoverageRow {
  readonly id: string
  readonly assignment: ScoutingTerritoryAssignment
  readonly territoryLabel: string
  readonly territoryTypeLabel: string
  readonly scoutName: string
  readonly scoutRoleLabel: string
  readonly coverageLabel: string
  readonly knownEligibleLabel: string
  readonly workloadLabel: string
}

export interface ScoutingOppositionRow {
  readonly id: string
  readonly opponentName: string
  readonly gameDateLabel: string
  readonly qualityScore: number
  readonly emphasisLabel: string | null
  readonly paceLabel: string | null
  readonly authoredBy: string
  readonly authorRoleLabel: string
  readonly qualityLabel: string
  readonly flaggedPlayers: readonly { readonly playerId: PlayerId; readonly name: string }[]
}

export interface ScoutingWorkspaceModel {
  readonly teamName: string
  readonly organizationLabel: string
  readonly knownSubjectCount: number
  readonly openAssignmentCount: number
  readonly reportCount: number
  readonly oppositionCount: number
  readonly territoryCount: number
  readonly candidateCount: number
  readonly canRequestScouting: boolean
  readonly requestUnavailableLabel: string | null
  readonly knowledge: readonly ScoutingKnowledgeRow[]
  readonly assignments: readonly ScoutingAssignmentRow[]
  readonly reports: readonly ScoutingReportRow[]
  readonly coverage: readonly ScoutingCoverageRow[]
  readonly validTerritories: readonly ScoutingTerritory[]
  readonly opposition: readonly ScoutingOppositionRow[]
}

export function scoutingMissionLabel(mission: ScoutingMission): string {
  switch (mission) {
    case 'QUICK_LOOK':
      return 'Quick look'
    case 'FULL_REPORT':
      return 'Full report'
    case 'SKILL_EVALUATION':
      return 'Skill evaluation'
    case 'POTENTIAL_EVALUATION':
      return 'Potential evaluation'
    case 'TACTICAL_FIT':
      return 'Tactical fit'
    case 'LIVE_GAME':
      return 'Live game'
  }
}

export function scoutingStatusLabel(status: ScoutingStatus): string {
  switch (status) {
    case 'QUEUED':
      return 'Queued'
    case 'ACTIVE':
      return 'Active'
    case 'COMPLETED':
      return 'Completed'
    case 'CANCELLED':
      return 'Cancelled'
  }
}

export function scoutingPriorityLabel(priority: ScoutingPriority): string {
  switch (priority) {
    case 'LOW':
      return 'Low'
    case 'NORMAL':
      return 'Normal'
    case 'HIGH':
      return 'High'
    case 'URGENT':
      return 'Urgent'
  }
}

export function knowledgeDimensionLabel(dimension: string): string {
  const labels: Record<string, string> = {
    finishing: 'Finishing',
    shooting: 'Shooting',
    creation: 'Creation',
    perimeterDefense: 'Perimeter def',
    interiorDefense: 'Interior def',
    rebounding: 'Rebounding',
    physical: 'Physical',
    tacticalFit: 'Tactical fit',
    'potential:shooting': 'Pot. shooting',
    'potential:finishing': 'Pot. finishing',
    'potential:creation': 'Pot. creation',
    'potential:passing': 'Pot. passing',
    'potential:defense': 'Pot. defense',
    'potential:rebounding': 'Pot. rebounding',
    'potential:physical': 'Pot. physical',
    'potential:mental': 'Pot. mental',
  }
  return labels[dimension] ?? dimension
}

export function formatPercentLabel(value: number): string {
  return `${Math.round(value * 100)}%`
}

export function formatAssessedDate(date: GameDate | undefined, formatter: (value: string) => string): string | null {
  return date === undefined ? null : formatter(date)
}
