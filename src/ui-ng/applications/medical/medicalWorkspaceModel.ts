import type { InjuryId, PlayerId, StaffPersonId, TeamId } from '@/domain/ids'
import type { InjurySeverity } from '@/domain/injury'
import type { MedicalRiskBand } from '@/engine/injury/MedicalRiskAssessment'
import type { StaffPresentationItem } from '@/ui/staffPresentation'

export const MEDICAL_WORKSPACE_TABS = ['overview', 'injured', 'history', 'risk', 'staff'] as const
export type MedicalWorkspaceTabId = (typeof MEDICAL_WORKSPACE_TABS)[number]

export const MEDICAL_TAB_LABELS: Readonly<Record<MedicalWorkspaceTabId, string>> = {
  overview: 'Overview',
  injured: 'Injured',
  history: 'History',
  risk: 'Risk',
  staff: 'Staff',
}

export const INJURY_SEVERITY_LABELS: Readonly<Record<InjurySeverity, string>> = {
  minor: 'Minor',
  moderate: 'Moderate',
  serious: 'Serious',
}

export const MEDICAL_RISK_BAND_LABELS: Readonly<Record<MedicalRiskBand, string>> = {
  low: 'Low',
  elevated: 'Elevated',
  high: 'High',
}

export interface MedicalInjuredRow {
  readonly injuryId: InjuryId
  readonly playerId: PlayerId
  readonly playerName: string
  readonly position: string
  readonly injuryLabel: string
  readonly severity: InjurySeverity
  readonly severityLabel: string
  readonly sourceLabel: string
  readonly injuredOnLabel: string
  readonly expectedReturnLabel: string
  readonly daysRemaining: number
  readonly durationLabel: string
}

export interface MedicalHistoryRow {
  readonly injuryId: InjuryId
  readonly playerId: PlayerId
  readonly playerName: string
  readonly injuryLabel: string
  readonly severityLabel: string
  readonly sourceLabel: string
  readonly injuredOnLabel: string
  readonly expectedReturnLabel: string
  readonly statusLabel: 'Active' | 'Recovered'
  readonly durationLabel: string
}

export interface MedicalRiskRow {
  readonly playerId: PlayerId
  readonly playerName: string
  readonly position: string
  readonly fatigue: number
  readonly fatigueLabel: string
  readonly riskScore: number
  readonly riskBand: MedicalRiskBand
  readonly riskBandLabel: string
  readonly reasons: readonly string[]
  readonly quality: number | null
  readonly available: boolean
}

export interface MedicalStaffRow {
  readonly staffPersonId: StaffPersonId
  readonly name: string
  readonly roleLabel: string
  readonly proficiency: number
  readonly workloadLabel: string
  readonly utilizationLabel: string
  readonly presentation: StaffPresentationItem
}

export interface MedicalWorkspaceModel {
  readonly teamId: TeamId
  readonly teamName: string
  readonly currentDateLabel: string
  readonly rosterCount: number
  readonly availableCount: number
  readonly injuredCount: number
  readonly averageFatigue: number
  readonly highRiskCount: number
  readonly elevatedRiskCount: number
  readonly lowRiskCount: number
  readonly medicalStaffCount: number
  readonly openAdvisoryCount: number
  readonly injured: readonly MedicalInjuredRow[]
  readonly history: readonly MedicalHistoryRow[]
  readonly risk: readonly MedicalRiskRow[]
  readonly staff: readonly MedicalStaffRow[]
}

export function medicalTabLabel(id: MedicalWorkspaceTabId, model: MedicalWorkspaceModel): string {
  if (id === 'injured' && model.injuredCount > 0) {
    return `${MEDICAL_TAB_LABELS[id]} · ${model.injuredCount}`
  }
  if (id === 'risk' && model.highRiskCount > 0) {
    return `${MEDICAL_TAB_LABELS[id]} · ${model.highRiskCount}`
  }
  return MEDICAL_TAB_LABELS[id]
}
