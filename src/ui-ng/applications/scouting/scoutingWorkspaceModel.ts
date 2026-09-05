import type { GameDate } from '@/domain/date'
import type { PlayerId } from '@/domain/ids'
import type { ScoutingMission, ScoutingPriority, ScoutingStatus } from '@/domain/scouting'

export const SCOUTING_WORKSPACE_TABS = ['knowledge', 'assignments', 'reports', 'opposition'] as const
export type ScoutingWorkspaceTabId = (typeof SCOUTING_WORKSPACE_TABS)[number]

export const SCOUTING_TAB_LABELS: Readonly<Record<ScoutingWorkspaceTabId, string>> = {
  knowledge: 'Knowledge',
  assignments: 'Assignments',
  reports: 'Reports',
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
  readonly isOwnRoster: boolean
  readonly coverageLabel: string
  readonly confidenceLabel: string
  readonly freshnessLabel: string
  readonly disagreement: 'LOW' | 'MODERATE' | 'HIGH'
  readonly knownDomains: readonly string[]
  readonly lastAssessedLabel: string | null
  readonly evaluations: readonly ScoutingKnowledgeEvaluation[]
  readonly valuationCurrent: number | null
  readonly valuationCertainty: number | null
  readonly valuationRisk: number | null
  readonly hasOpenQuickLook: boolean
}

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
  readonly createdLabel: string
  readonly tacticalFitLabel: string | null
  readonly findings: readonly ScoutingReportFinding[]
}

export interface ScoutingOppositionRow {
  readonly id: string
  readonly opponentName: string
  readonly gameDateLabel: string
  readonly qualityScore: number
  readonly emphasisLabel: string | null
  readonly paceLabel: string | null
  readonly authoredBy: string
  readonly flaggedPlayers: readonly { readonly playerId: PlayerId; readonly name: string }[]
}

export interface ScoutingWorkspaceModel {
  readonly teamName: string
  readonly organizationLabel: string
  readonly knownSubjectCount: number
  readonly openAssignmentCount: number
  readonly reportCount: number
  readonly oppositionCount: number
  readonly canRequestScouting: boolean
  readonly requestUnavailableLabel: string | null
  readonly knowledge: readonly ScoutingKnowledgeRow[]
  readonly assignments: readonly ScoutingAssignmentRow[]
  readonly reports: readonly ScoutingReportRow[]
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
